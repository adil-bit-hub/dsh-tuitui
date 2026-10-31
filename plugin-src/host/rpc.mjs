/**
 * 设置页 ⇄ 宿主 RPC 通道。
 *
 * DSH 0.2.1 起，`connection.rpc.handle()` 会把路由注册到 Connection 服务
 * 自身的 provider 上下文，第三方插件拿不到带 `webServer` 的 owner，激活时
 * 直接报 `cannot get property "webServer" without inject`。因此这里改为在
 * 宿主 Web 服务器上注册自己的 prefix 路由，并用 `connection.admit(req)`
 * 复用与内置 `/api` 完全相同的准入检查（Host/Origin 围栏 + 已认证会话）。
 *
 * 浏览器端契约：POST `<channel>/<endpoint>`，请求/响应都是 JSON，
 * 响应恒为 `{ ok: true, value }` 或 `{ ok: false, error: { code, message } }`。
 */

export const TUITUI_RPC_CHANNEL = '/tuitui';

export const TUITUI_ENDPOINTS = Object.freeze({
  status: 'connection.status',
  bind: 'bot.bind',
  enableBot: 'bot.enable',
  disableBot: 'bot.disable',
  deleteBot: 'bot.delete',
  getSecurity: 'security.get',
  setSecurity: 'security.set',
});

const ENDPOINTS = Object.freeze(Object.values(TUITUI_ENDPOINTS));
const MAX_BODY_BYTES = 1_024 * 1_024;
const JSON_HEADERS = Object.freeze({
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
});
const FORBIDDEN_PUBLIC_KEYS = new Set([
  'appSecret', 'secret', 'secretRef', 'token', 'tokenRef',
]);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, allowed) {
  return isRecord(value) && Object.keys(value).every((key) => allowed.includes(key));
}

function validBotId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

function validAppId(value) {
  return typeof value === 'string' && /^\d{1,64}$/.test(value);
}

function validAppSecret(value) {
  return typeof value === 'string' && value.trim().length >= 8 && value.length <= 512;
}

function validAdminAccount(value) {
  return typeof value === 'string' && value.trim().length >= 1
    && value.trim().length <= 64 && !/\s/.test(value.trim());
}

function validSecurityPayload(payload) {
  if (!exactKeys(payload, ['adminAccounts', 'nonAdmin'])) {
    return 'security.set 需要 adminAccounts 与 nonAdmin 字段。';
  }
  if (!Array.isArray(payload.adminAccounts) || payload.adminAccounts.length > 64) {
    return '管理员列表需为数组且不超过 64 个账号。';
  }
  for (const account of payload.adminAccounts) {
    if (!validAdminAccount(account)) return '管理员账号需为 1-64 个字符且不含空白。';
  }
  if (!exactKeys(payload.nonAdmin, ['chat'])) {
    return 'nonAdmin 仅支持 chat 字段。';
  }
  if (typeof payload.nonAdmin.chat !== 'boolean') {
    return 'nonAdmin.chat 需为布尔值。';
  }
  return null;
}

function payloadFailure(endpoint, payload) {
  if (!isRecord(payload)) return '请求体必须是对象。';
  if (endpoint === TUITUI_ENDPOINTS.status) {
    return exactKeys(payload, []) ? null : 'connection.status 不接受任何字段。';
  }
  if (endpoint === TUITUI_ENDPOINTS.getSecurity) {
    return exactKeys(payload, []) ? null : 'security.get 不接受任何字段。';
  }
  if (endpoint === TUITUI_ENDPOINTS.setSecurity) {
    return validSecurityPayload(payload);
  }
  if (endpoint === TUITUI_ENDPOINTS.bind) {
    if (!exactKeys(payload, ['appId', 'appSecret'])) return 'bot.bind 需要 appId 与 appSecret。';
    if (!validAppId(payload.appId)) return 'App ID 应为数字（推推开放平台机器人 appid）。';
    if (!validAppSecret(payload.appSecret)) return 'App Secret 长度需在 8-512 个字符之间。';
    return null;
  }
  if (endpoint === TUITUI_ENDPOINTS.enableBot || endpoint === TUITUI_ENDPOINTS.disableBot) {
    return exactKeys(payload, ['botId']) && validBotId(payload.botId)
      ? null : '该操作需要 botId。';
  }
  if (endpoint === TUITUI_ENDPOINTS.deleteBot) {
    return exactKeys(payload, ['botId', 'confirm']) && validBotId(payload.botId) && payload.confirm === true
      ? null : 'bot.delete 需要 botId 和 confirm=true。';
  }
  return '未知的推推机器人端点。';
}

function sanitizePublic(value) {
  if (Array.isArray(value)) return value.map(sanitizePublic);
  if (!isRecord(value)) return value;
  const safe = {};
  for (const [key, child] of Object.entries(value)) {
    if (!FORBIDDEN_PUBLIC_KEYS.has(key)) safe[key] = sanitizePublic(child);
  }
  return safe;
}

function operationError(error) {
  if (error?.code === 'invalid-credentials') {
    return { code: 'invalid-credentials', message: error.message };
  }
  if (error instanceof TypeError) {
    return { code: 'bad-request', message: error.message };
  }
  return { code: 'tuitui-operation-failed', message: error?.message ?? '推推机器人操作失败，请稍后重试。' };
}

export function createTuituiRpcHandler(controller) {
  for (const method of ['status', 'bind', 'enableBot', 'disableBot', 'deleteBot', 'getSecurity', 'setSecurity']) {
    if (typeof controller?.[method] !== 'function') {
      throw new TypeError(`推推机器人控制器不完整，缺少 ${method}`);
    }
  }
  return async (endpoint, payload, signal) => {
    if (signal?.aborted) {
      return { ok: false, error: { code: 'cancelled', message: '请求已取消。' } };
    }
    if (!ENDPOINTS.includes(endpoint)) {
      return { ok: false, error: { code: 'bad-request', message: '未知的推推机器人端点。' } };
    }
    const invalid = payloadFailure(endpoint, payload);
    if (invalid) return { ok: false, error: { code: 'bad-request', message: invalid } };
    try {
      let value;
      if (endpoint === TUITUI_ENDPOINTS.status) value = await controller.status();
      else if (endpoint === TUITUI_ENDPOINTS.bind) {
        value = await controller.bind({ appId: payload.appId, appSecret: payload.appSecret });
      } else if (endpoint === TUITUI_ENDPOINTS.enableBot) {
        value = await controller.enableBot(payload.botId);
      } else if (endpoint === TUITUI_ENDPOINTS.disableBot) {
        value = await controller.disableBot(payload.botId);
      } else if (endpoint === TUITUI_ENDPOINTS.getSecurity) {
        value = { security: controller.getSecurity() };
      } else if (endpoint === TUITUI_ENDPOINTS.setSecurity) {
        value = await controller.setSecurity({
          adminAccounts: payload.adminAccounts,
          nonAdmin: payload.nonAdmin,
        });
      } else {
        value = await controller.deleteBot(payload.botId);
      }
      return signal?.aborted
        ? { ok: false, error: { code: 'cancelled', message: '请求已取消。' } }
        : { ok: true, value: sanitizePublic(value) };
    } catch (error) {
      return signal?.aborted
        ? { ok: false, error: { code: 'cancelled', message: '请求已取消。' } }
        : { ok: false, error: operationError(error) };
    }
  };
}

function sendJson(res, status, body) {
  res.writeHead(status, JSON_HEADERS);
  res.end(JSON.stringify(body));
}

async function readJsonBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.byteLength;
    if (total > MAX_BODY_BYTES) {
      const error = new Error('请求体过大。');
      error.code = 'too-large';
      throw error;
    }
    chunks.push(chunk);
  }
  if (total === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('请求体不是合法的 JSON。');
    error.code = 'invalid-json';
    throw error;
  }
}

function endpointFromPath(pathname) {
  if (!pathname.startsWith(`${TUITUI_RPC_CHANNEL}/`)) return '';
  const endpoint = pathname.slice(TUITUI_RPC_CHANNEL.length + 1);
  if (!endpoint || endpoint.includes('/')) return '';
  return endpoint;
}

/**
 * 组装一个 node:http 处理器：准入检查 → 端点解析 → 调用 → JSON 响应。
 * @param {object} connection - 提供 admit() 的 Connection 服务。
 * @param {(endpoint: string, payload: object) => Promise<object>} rpc - RPC 处理器。
 */
export function createTuituiHttpHandler(connection, rpc, logger = console) {
  return async function handler(req, res) {
    let admission;
    try {
      admission = connection.admit(req);
    } catch (error) {
      logger.warn?.('[dsh-tuitui] 设置页路由准入检查失败:', error);
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('admission failed');
      return;
    }
    if (admission?.rejection !== undefined) {
      res.writeHead(admission.rejection, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(admission.rejection === 401 ? 'unauthorized' : 'forbidden');
      return;
    }

    const pathname = new URL(req.url ?? '/', 'http://dsh.internal').pathname;
    const endpoint = endpointFromPath(pathname);
    if (req.method !== 'POST' || endpoint === '') {
      res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8', allow: 'POST' });
      res.end('method not allowed');
      return;
    }

    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (error) {
      sendJson(res, 400, { ok: false, error: { code: error?.code ?? 'bad-request', message: error?.message ?? '请求无效。' } });
      return;
    }

    const result = await rpc(endpoint, payload);
    sendJson(res, 200, result);
  };
}

/**
 * 在宿主 webServer 上安装设置页路由；返回 disposer。
 * @param {object} ctx - 插件上下文（需要 connection 与 webServer）。
 * @param {object} controller - 推推机器人控制器。
 * @param {object} [logger] - 日志器。
 */
export function installTuituiRpc(ctx, controller, logger = console) {
  if (!ctx?.webServer || typeof ctx.webServer.register !== 'function') {
    throw new TypeError('需要 DSH Host webServer 服务');
  }
  if (!ctx?.connection || typeof ctx.connection.admit !== 'function') {
    throw new TypeError('需要 DSH Host Connection 服务');
  }
  const rpc = createTuituiRpcHandler(controller);
  const handler = createTuituiHttpHandler(ctx.connection, rpc, logger);
  return ctx.effect(
    () => ctx.webServer.register({ kind: 'prefix', path: TUITUI_RPC_CHANNEL, handler }),
    'dsh-tuitui: 设置页 RPC 路由',
  );
}
