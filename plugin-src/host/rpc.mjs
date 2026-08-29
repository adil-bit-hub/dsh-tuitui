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
const FORBIDDEN_PUBLIC_KEYS = new Set([
  'appSecret', 'secret', 'secretRef', 'token', 'tokenRef',
]);

const RPC_AUTHORITIES = new Set(['loopback', 'trusted-host']);

export function resolveRpcAuthority(value) {
  if (value === undefined) return 'loopback';
  if (RPC_AUTHORITIES.has(value)) return value;
  throw new TypeError('dsh-tuitui rpcAuthority 只能是 "loopback" 或 "trusted-host"');
}

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

export function installTuituiRpc(ctx, controller, authority) {
  if (!ctx?.connection?.rpc || typeof ctx.connection.rpc.handle !== 'function') {
    throw new TypeError('需要 DSH Host Connection RPC 服务');
  }
  return ctx.connection.rpc.handle(
    TUITUI_RPC_CHANNEL,
    createTuituiRpcHandler(controller),
    { authority: resolveRpcAuthority(authority) },
  );
}
