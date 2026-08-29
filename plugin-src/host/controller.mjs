import { TuituiBotClient } from '@qihoo/tuitui-bot-sdk';

import { normalizeSecurity } from './policy.mjs';

function cleanString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function safeError(code, message) {
  return Object.freeze({ code, message });
}

function maskAppId(appId) {
  const text = String(appId ?? '');
  if (text.length <= 4) return text;
  return `${text.slice(0, 2)}****${text.slice(-2)}`;
}

export function deriveTuituiIdentity(appId) {
  return {
    botId: String(appId),
    secretRef: `DSH_TUITUI_BOT_SECRET_${appId}`,
  };
}

/** 用凭据调用推推开放接口，校验有效性并取回机器人身份。 */
export async function probeTuituiCredentials(appId, appSecret, { createClient } = {}) {
  const factory = createClient ?? ((id, secret) => new TuituiBotClient(id, secret));
  try {
    const info = await factory(appId, appSecret).property.info();
    if (!info?.name || !info?.uid) {
      throw new Error('推推返回了无效的机器人信息');
    }
    return { name: info.name, uid: String(info.uid), account: cleanString(info.account) };
  } catch (error) {
    const failure = new Error('推推凭据无效或开放接口不可达，请检查 App ID 与 App Secret。');
    failure.code = 'invalid-credentials';
    failure.cause = error;
    throw failure;
  }
}

export class TuituiBotController {
  #credentials;
  #configStore;
  #createRuntime;
  #deleteState;
  #logger;
  #runtimes = new Map();
  #errors = new Map();
  #transitions = new Map();
  #revision = 0;
  #closed = false;

  constructor({
    credentials,
    configStore,
    createRuntime,
    deleteState = async () => {},
    logger = console,
  }) {
    if (!credentials || typeof credentials.resolve !== 'function'
      || typeof credentials.set !== 'function' || typeof credentials.unset !== 'function') {
      throw new TypeError('推推机器人需要 DSH 凭据服务');
    }
    if (!configStore || typeof configStore.list !== 'function'
      || typeof configStore.save !== 'function' || typeof configStore.remove !== 'function') {
      throw new TypeError('推推机器人需要配置存储');
    }
    if (typeof createRuntime !== 'function') {
      throw new TypeError('推推机器人需要运行时工厂');
    }
    this.#credentials = credentials;
    this.#configStore = configStore;
    this.#createRuntime = createRuntime;
    this.#deleteState = deleteState;
    this.#logger = logger;
  }

  /** 启动所有已启用的机器人（重复调用安全，用于健康巡检）。 */
  async initialize() {
    if (this.#closed) return this.status();
    for (const config of this.#configStore.list()) {
      if (config.enabled === false) continue;
      await this.#withBotTransition(config.botId, async () => {
        if (this.#closed || this.#runtimes.get(config.botId)?.status?.ready) return;
        const secret = await this.#resolveSecret(config.secretRef);
        if (!secret) {
          this.#errors.set(config.botId, safeError(
            'missing-secret',
            '推推机器人凭据缺失，请删除后重新接入。',
          ));
          return;
        }
        try {
          await this.#startRuntime(config, secret);
          this.#errors.delete(config.botId);
        } catch (error) {
          this.#errors.set(config.botId, safeError(
            'connection-failed',
            '推推连接未就绪，插件会自动重试。',
          ));
          this.#logger.warn?.(`[dsh-tuitui] bot ${config.botId} failed to initialize:`, error);
        } finally {
          this.#touch();
        }
      });
    }
    return this.status();
  }

  /** 校验凭据并接入机器人（接入即启用）。 */
  async bind({ appId, appSecret } = {}) {
    if (this.#closed) throw new Error('推推机器人控制器已关闭');
    const normalizedAppId = cleanString(appId);
    const normalizedSecret = cleanString(appSecret);
    if (!normalizedAppId || !normalizedSecret) throw new TypeError('推推 App ID 与 App Secret 为必填项');

    const identityInfo = await probeTuituiCredentials(normalizedAppId, normalizedSecret);
    const identity = deriveTuituiIdentity(normalizedAppId);

    return this.#withBotTransition(identity.botId, async () => {
      if (this.#closed) throw new Error('推推机器人控制器已关闭');
      const previousConfig = this.#configStore.get(identity.botId);
      const previousSecret = await this.#credentials.resolve(identity.secretRef).catch(() => undefined);
      const config = {
        botId: identity.botId,
        appId: normalizedAppId,
        secretRef: identity.secretRef,
        name: identityInfo.name,
        account: identityInfo.account,
        uid: identityInfo.uid,
        enabled: true,
        createdAt: previousConfig?.createdAt ?? new Date().toISOString(),
        connectedAt: new Date().toISOString(),
      };
      await this.#credentials.set(identity.secretRef, normalizedSecret);
      try {
        await this.#configStore.save(config);
      } catch (error) {
        await this.#restoreSecret(identity.secretRef, previousSecret);
        throw error;
      }
      try {
        await this.#startRuntime(config, normalizedSecret);
        this.#errors.delete(identity.botId);
      } catch (error) {
        this.#errors.set(identity.botId, safeError(
          'connection-failed',
          '推推机器人已接入，消息连接暂未就绪，插件会自动重试。',
        ));
        this.#logger.warn?.(`[dsh-tuitui] bot ${identity.botId} connection failed after bind:`, error);
      }
      this.#touch();
      return this.status();
    });
  }

  /** 启用：恢复消息连接（凭据与会话映射保留）。 */
  async enableBot(botId) {
    const config = this.#configStore.get(botId);
    if (!config) throw new Error('未知的推推机器人');
    return this.#withBotTransition(botId, async () => {
      if (config.enabled !== true) {
        await this.#configStore.save({ ...config, enabled: true });
      }
      const secret = await this.#resolveSecret(config.secretRef);
      if (!secret) throw new Error('推推机器人凭据缺失，请删除后重新接入。');
      try {
        await this.#startRuntime({ ...config, enabled: true }, secret);
        this.#errors.delete(botId);
      } catch (error) {
        this.#errors.set(botId, safeError('connection-failed', '推推连接未就绪，请稍后重试。'));
        throw error;
      } finally {
        this.#touch();
      }
      return this.status();
    });
  }

  /** 停止：断开消息连接，但保留凭据，可随时再启用。 */
  async disableBot(botId) {
    const config = this.#configStore.get(botId);
    if (!config) throw new Error('未知的推推机器人');
    return this.#withBotTransition(botId, async () => {
      await this.#stopRuntime(botId);
      await this.#configStore.save({ ...config, enabled: false });
      this.#errors.delete(botId);
      this.#touch();
      return this.status();
    });
  }

  /** 删除：停止连接并移除凭据与会话状态。 */
  async deleteBot(botId) {
    const config = this.#configStore.get(botId);
    if (!config) throw new Error('未知的推推机器人');
    return this.#withBotTransition(botId, async () => {
      const previous = await this.#credentials.resolve(config.secretRef).catch(() => undefined);
      await this.#stopRuntime(botId);
      try {
        await this.#credentials.unset(config.secretRef);
        await this.#configStore.remove(botId);
      } catch (error) {
        if (previous?.value) {
          await this.#credentials.set(config.secretRef, previous.value).catch(() => undefined);
          await this.#startRuntime(config, previous.value).catch(() => undefined);
        }
        throw new Error('无法安全移除推推机器人，请稍后重试。', { cause: error });
      }
      await this.#deleteState({ botId, config }).catch((error) => {
        this.#logger.warn?.(`[dsh-tuitui] bot ${botId} state cleanup failed:`, error);
      });
      this.#errors.delete(botId);
      this.#touch();
      return this.status();
    });
  }

  /** 读取当前安全策略（管理员账号列表 + 非管理员能力开关）。 */
  getSecurity() {
    return this.#configStore.getSecurity();
  }

  /** 更新安全策略，立即落盘并对后续消息生效。 */
  async setSecurity(security) {
    if (this.#closed) throw new Error('推推机器人控制器已关闭');
    const normalized = normalizeSecurity(security);
    await this.#configStore.setSecurity(normalized);
    this.#touch();
    return this.status();
  }

  status() {
    const bots = this.#configStore.list().map((config) => {
      const runtimeStatus = this.#runtimes.get(config.botId)?.status ?? null;
      const enabled = config.enabled !== false;
      const connected = enabled && runtimeStatus?.ready === true
        && runtimeStatus.connectionState === 'connected'
        && runtimeStatus.harnessReachable === true;
      const state = !enabled ? 'stopped'
        : connected ? 'connected'
          : runtimeStatus?.connectionState === 'connecting' ? 'connecting'
            : this.#errors.has(config.botId) || runtimeStatus?.connectionState === 'failed'
              ? 'error' : 'offline';
      return {
        botId: config.botId,
        state,
        connected,
        enabled,
        configured: true,
        bot: {
          name: config.name,
          account: config.account,
          appIdMasked: maskAppId(config.appId),
        },
        health: {
          status: connected ? 'healthy' : state === 'error' ? 'error' : state === 'stopped' ? 'stopped' : 'offline',
          summary: connected ? '推推机器人运行正常'
            : state === 'stopped' ? '推推机器人已停止，可随时启用'
              : state === 'error' ? '推推连接未就绪，插件会自动重试'
                : '推推机器人当前离线',
          lastCheckedAt: runtimeStatus?.lastCheckedAt ?? null,
          lastConnectedAt: runtimeStatus?.lastConnectedAt ?? null,
        },
        stats: {
          messagesReceived: runtimeStatus?.messagesReceived ?? 0,
          messagesReplied: runtimeStatus?.messagesReplied ?? 0,
          messagesRejected: runtimeStatus?.messagesRejected ?? 0,
          lastMessageAt: runtimeStatus?.lastMessageAt ?? null,
          lastReplyAt: runtimeStatus?.lastReplyAt ?? null,
          lastSenderName: runtimeStatus?.lastSenderName ?? null,
          lastSenderAccount: runtimeStatus?.lastSenderAccount ?? null,
        },
        error: structuredClone(this.#errors.get(config.botId) ?? null),
      };
    });
    const connectedCount = bots.filter((bot) => bot.connected).length;
    return {
      schemaVersion: 2,
      revision: this.#revision,
      security: this.#configStore.getSecurity(),
      state: bots.length === 0 ? 'disconnected'
        : connectedCount === bots.length ? 'connected'
          : connectedCount > 0 ? 'degraded' : bots.every((bot) => bot.state === 'stopped') ? 'stopped' : 'offline',
      bots,
      totals: {
        configured: bots.length,
        connected: connectedCount,
        stopped: bots.filter((bot) => bot.state === 'stopped').length,
      },
    };
  }

  async close() {
    if (this.#closed) return;
    this.#closed = true;
    await Promise.allSettled([...this.#transitions.values()]);
    await Promise.allSettled([...this.#runtimes.keys()].map((botId) => this.#stopRuntime(botId)));
  }

  async #startRuntime(config, secret) {
    if (this.#closed) throw new Error('推推机器人控制器已关闭');
    await this.#stopRuntime(config.botId);
    if (this.#closed) throw new Error('推推机器人控制器已关闭');
    const runtime = await this.#createRuntime({ botId: config.botId, config, secret });
    if (!runtime || typeof runtime.start !== 'function' || typeof runtime.stop !== 'function') {
      throw new TypeError('运行时工厂返回了无效的推推运行时');
    }
    this.#runtimes.set(config.botId, runtime);
    try {
      await runtime.start();
    } catch (error) {
      await runtime.stop().catch(() => undefined);
      this.#runtimes.delete(config.botId);
      throw error;
    }
  }

  async #stopRuntime(botId) {
    const runtime = this.#runtimes.get(botId);
    this.#runtimes.delete(botId);
    await runtime?.stop().catch((error) => {
      this.#logger.warn?.(`[dsh-tuitui] bot ${botId} failed to stop cleanly:`, error);
    });
  }

  async #resolveSecret(ref) {
    const result = await this.#credentials.resolve(ref).catch(() => undefined);
    return cleanString(result?.value);
  }

  async #restoreSecret(ref, previous) {
    if (previous?.value) await this.#credentials.set(ref, previous.value).catch(() => undefined);
    else await this.#credentials.unset(ref).catch(() => undefined);
  }

  #withBotTransition(botId, operation) {
    const previous = this.#transitions.get(botId) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    const settled = current.finally(() => {
      if (this.#transitions.get(botId) === settled) this.#transitions.delete(botId);
    });
    this.#transitions.set(botId, settled);
    return settled;
  }

  #touch() {
    this.#revision += 1;
  }
}
