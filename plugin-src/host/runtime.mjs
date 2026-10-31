import { TuituiBotClient } from '@qihoo/tuitui-bot-sdk';

import { createTuituiBridgeStatus, TuituiHarnessBridge } from './bridge.mjs';

function timeoutError() {
  const error = new Error('推推 WebSocket 未在超时时间内连接成功');
  error.code = 'connect-timeout';
  return error;
}

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function createTuituiRuntimeStatus() {
  return {
    startedAt: null,
    ready: false,
    connectionState: 'idle',
    harnessReachable: false,
    lastCheckedAt: null,
    lastConnectedAt: null,
    lastError: null,
    ...createTuituiBridgeStatus(),
  };
}

/**
 * 单个推推机器人的运行实例：持有 TuituiBotClient 事件订阅，
 * 把 SINGLE_CHAT / GROUP_CHAT 事件转交给 TuituiHarnessBridge。
 * SDK 内部负责断线重连；stop() 才会永久停止订阅。
 */
export class TuituiRuntime {
  #config;
  #appSecret;
  #harness;
  #state;
  #logger;
  #replyTimeoutMs;
  #connectTimeoutMs;
  #createClient;
  #getSecurity;
  #workspace;
  #shellTimeoutMs;
  #adminPreset;
  #memberPreset;
  #ensureMemberPreset;
  #status = createTuituiRuntimeStatus();
  #client = null;
  #bridge = null;
  #subscription = null;
  #starting = null;

  constructor({
    config,
    appSecret,
    harness,
    state,
    logger = console,
    replyTimeoutMs = 600_000,
    connectTimeoutMs = 30_000,
    getSecurity = () => ({}),
    workspace,
    shellTimeoutMs = 120_000,
    adminPreset,
    memberPreset,
    ensureMemberPreset,
    createClient = (appId, appSecret) => new TuituiBotClient(appId, appSecret),
  }) {
    if (!config || !appSecret || !harness || !state) {
      throw new TypeError('TuituiRuntime requires config, app secret, Harness, and state');
    }
    this.#config = config;
    this.#appSecret = appSecret;
    this.#harness = harness;
    this.#state = state;
    this.#logger = logger;
    this.#replyTimeoutMs = replyTimeoutMs;
    this.#connectTimeoutMs = connectTimeoutMs;
    this.#getSecurity = getSecurity;
    this.#workspace = workspace;
    this.#shellTimeoutMs = shellTimeoutMs;
    this.#adminPreset = adminPreset;
    this.#memberPreset = memberPreset;
    this.#ensureMemberPreset = ensureMemberPreset;
    this.#createClient = createClient;
  }

  get status() {
    return structuredClone(this.#status);
  }

  async start() {
    if (this.#status.ready && this.#subscription) return this.status;
    if (this.#starting) return this.#starting;
    this.#starting = this.#start().finally(() => {
      this.#starting = null;
    });
    return this.#starting;
  }

  async #start() {
    await this.stop();
    this.#status.startedAt = new Date().toISOString();
    this.#status.connectionState = 'connecting';
    this.#status.lastError = null;
    // 插件与 Harness 同进程，sessionController 已由依赖注入保证可用。
    this.#status.harnessReachable = true;

    const client = this.#createClient(this.#config.appId, this.#appSecret);
    if (!client?.event || !client?.im || !client?.to) {
      throw new TypeError('推推客户端工厂返回了无效实例');
    }
    this.#client = client;
    this.#bridge = new TuituiHarnessBridge({
      bot: {
        sendText: (target, text) => client.im.sendText({ to: target, text }).then(() => undefined),
      },
      harness: this.#harness,
      state: this.#state,
      status: this.#status,
      logger: this.#logger,
      replyTimeoutMs: this.#replyTimeoutMs,
      getSecurity: this.#getSecurity,
      workspace: this.#workspace,
      shellTimeoutMs: this.#shellTimeoutMs,
      adminPreset: this.#adminPreset,
      memberPreset: this.#memberPreset,
      ensureMemberPreset: this.#ensureMemberPreset,
    });

    let readyResolve;
    let readyReject;
    const ready = new Promise((resolve, reject) => {
      readyResolve = resolve;
      readyReject = reject;
    });
    const markConnected = () => {
      const now = Date.now();
      this.#status.ready = true;
      this.#status.connectionState = 'connected';
      this.#status.lastCheckedAt = now;
      this.#status.lastConnectedAt = now;
      this.#status.lastError = null;
      readyResolve();
    };

    this.#subscription = client.event.subscribe({
      onConnected: markConnected,
      onEvent: (body) => this.#onEvent(body),
      onDisconnected: (reason) => {
        this.#logger.warn?.(`[dsh-tuitui] bot ${this.#config.botId} disconnected (SDK 自动重连中):`, reason?.message ?? reason);
      },
      onError: (error) => {
        this.#status.lastError = error?.message ?? String(error);
        if (!this.#status.ready) readyReject(error);
        else this.#logger.warn?.(`[dsh-tuitui] bot ${this.#config.botId} connection error:`, error);
      },
    });

    let timer;
    try {
      await Promise.race([
        ready,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(timeoutError()), this.#connectTimeoutMs);
        }),
      ]);
      return this.status;
    } catch (error) {
      this.#status.ready = false;
      this.#status.connectionState = 'failed';
      this.#status.lastError = error?.message ?? String(error);
      await this.stop();
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  #onEvent(body) {
    const eventName = body?.event;
    if (eventName !== this.#client.event.SINGLE_CHAT && eventName !== this.#client.event.GROUP_CHAT) return;
    const isGroup = eventName === this.#client.event.GROUP_CHAT;
    let content = '';
    try {
      content = this.#client.event.renderMessageBody(body.data);
    } catch (error) {
      this.#logger.warn?.('[dsh-tuitui] failed to render message body:', error);
    }
    const messageId = typeof body?.data?.msgid === 'string' && body.data.msgid
      ? body.data.msgid
      : `${body.cid}:${body.timestamp ?? Date.now()}`;
    // 发送人身份：账号/uid 来自事件顶层，昵称兼容多种字段命名。
    const senderName = cleanString(body.user_name ?? body.nick_name ?? body.nickname
      ?? body.data?.user_name ?? body.data?.nick_name);
    this.#bridge?.accept({
      messageId,
      conversationId: body.cid,
      kind: isGroup ? 'group' : 'direct',
      senderId: body.user_account || body.uid,
      senderUid: body.uid,
      senderName,
      senderIsBot: body.user_is_bot === true,
      addressed: isGroup ? body?.data?.at_me === true : true,
      content,
      replyTarget: isGroup
        ? this.#client.to.group(body.group_id)
        : this.#client.to.account(body.user_account),
    });
  }

  async stop() {
    const subscription = this.#subscription;
    const bridge = this.#bridge;
    this.#subscription = null;
    this.#client = null;
    this.#bridge = null;
    try {
      subscription?.unsubscribe();
    } catch (error) {
      this.#logger.warn?.(`[dsh-tuitui] bot ${this.#config.botId} failed to unsubscribe cleanly:`, error);
    }
    await bridge?.waitForIdle();
    this.#status.ready = false;
    this.#status.connectionState = 'idle';
    return this.status;
  }
}
