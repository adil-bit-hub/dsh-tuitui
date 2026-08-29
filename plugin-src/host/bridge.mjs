import {
  canUseCapability,
  isTuituiAdmin,
  normalizeSecurity,
  senderDisplayName,
  senderRole,
} from './policy.mjs';
import { runShellCommand } from './shell.mjs';

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function createTuituiBridgeStatus() {
  return {
    messagesReceived: 0,
    messagesReplied: 0,
    messagesRejected: 0,
    lastMessageAt: null,
    lastReplyAt: null,
    lastRejectedAt: null,
    lastSenderName: null,
    lastSenderAccount: null,
    lastError: null,
  };
}

const SHELL_COMMAND_PATTERN = /^\s*\/(?:shell|exec|run)\s+([\s\S]+)$/i;
const SHELL_COMMAND_BARE = /^\s*\/(?:shell|exec|run)\s*$/i;

/**
 * 把推推入站消息转发给 Harness agent，并把回答发回推推。
 * bot 接口：{ sendText(target, text) }，target 为推推 ToTarget。
 * 安全策略通过 getSecurity() 逐条消息实时读取，设置页修改后立即生效。
 */
export class TuituiHarnessBridge {
  #bot;
  #harness;
  #state;
  #status;
  #logger;
  #replyTimeoutMs;
  #getSecurity;
  #workspace;
  #shellTimeoutMs;
  #queues = new Map();

  constructor({
    bot,
    harness,
    state,
    status = createTuituiBridgeStatus(),
    logger = console,
    replyTimeoutMs = 600_000,
    getSecurity = () => undefined,
    workspace,
    shellTimeoutMs = 120_000,
  }) {
    if (!bot || typeof bot.sendText !== 'function') throw new TypeError('A bot client is required');
    if (!harness || !state) throw new TypeError('Harness client and state store are required');
    this.#bot = bot;
    this.#harness = harness;
    this.#state = state;
    this.#status = status;
    this.#logger = logger;
    this.#replyTimeoutMs = replyTimeoutMs;
    this.#getSecurity = getSecurity;
    this.#workspace = workspace;
    this.#shellTimeoutMs = shellTimeoutMs;
  }

  get status() {
    return structuredClone(this.#status);
  }

  accept(message) {
    const conversationId = cleanText(message?.conversationId);
    const kind = message?.kind === 'group' ? 'group' : 'direct';
    const key = `${kind}:${conversationId}`;
    const previous = this.#queues.get(key) ?? Promise.resolve();
    const current = previous
      .catch(() => undefined)
      .then(() => this.#process({ ...message, kind, conversationId }))
      .finally(() => {
        if (this.#queues.get(key) === current) this.#queues.delete(key);
      });
    this.#queues.set(key, current);
    return current;
  }

  async waitForIdle() {
    await Promise.allSettled([...this.#queues.values()]);
  }

  async #process(message) {
    const messageId = cleanText(message.messageId);
    const senderId = cleanText(message.senderId);
    if (!messageId || !senderId || !message.conversationId || message.senderIsBot === true) return;
    if (this.#state.hasSeen(messageId)) return;

    // 发送人身份识别：昵称 + 账号 + 管理员判定，随每条消息实时解析。
    const senderName = cleanText(message.senderName);
    const senderLabel = senderDisplayName({ senderName, senderId, senderUid: message.senderUid });
    const security = this.#currentSecurity();
    const isAdmin = isTuituiAdmin(security, { account: senderId, uid: message.senderUid });

    this.#status.messagesReceived += 1;
    this.#status.lastMessageAt = new Date().toISOString();
    this.#status.lastSenderName = senderName || senderId;
    this.#status.lastSenderAccount = senderId;
    this.#logger.info?.(`[dsh-tuitui] message from ${senderLabel}${isAdmin ? ' (管理员)' : ''}`);

    if (message.kind === 'group' && message.addressed !== true) {
      this.#status.messagesRejected += 1;
      this.#status.lastRejectedAt = new Date().toISOString();
      return;
    }

    const target = message.replyTarget;
    const text = cleanText(message.content);
    try {
      if (!text) {
        await this.#bot.sendText(target, '目前只支持文字消息。');
        await this.#state.markSeen(messageId);
        return;
      }

      // 1) shell 级指令（/shell、/exec、/run），永远仅限管理员
      if (SHELL_COMMAND_BARE.test(text)) {
        await this.#bot.sendText(target, `用法：/shell <命令>\n示例：/shell dir${isAdmin ? '' : `\n注意：该指令仅限管理员，当前身份：${senderLabel}。`}`);
        await this.#state.markSeen(messageId);
        return;
      }
      const shellMatch = SHELL_COMMAND_PATTERN.exec(text);
      if (shellMatch) {
        if (!canUseCapability(security, 'shell', isAdmin)) {
          await this.#deny(target, '「/shell」是管理员专属指令', senderLabel);
          await this.#state.markSeen(messageId);
          return;
        }
        const commandLine = shellMatch[1].trim();
        await this.#bot.sendText(target, `正在执行 shell 指令，请稍候…\n$ ${commandLine}`);
        const result = await runShellCommand(commandLine, {
          cwd: this.#workspace,
          timeoutMs: this.#shellTimeoutMs,
        });
        await this.#bot.sendText(target, result.text);
        await this.#state.markSeen(messageId);
        this.#status.messagesReplied += 1;
        this.#status.lastReplyAt = new Date().toISOString();
        return;
      }

      // 2) 会话管理指令（对所有人开放）
      const command = text.toLowerCase();
      if (command === '/whoami') {
        await this.#bot.sendText(target, [
          '你的推推身份：',
          `昵称：${senderName || '（未提供）'}`,
          `账号：${senderId}`,
          `UID：${message.senderUid ?? '（未知）'}`,
          `权限：${isAdmin ? '管理员' : '普通用户'}`,
        ].join('\n'));
        await this.#state.markSeen(messageId);
        return;
      }
      if (command === '/help') {
        await this.#bot.sendText(target, [
          '推推机器人已连接 DeepSeek Harness。',
          '',
          '直接发送文字即可继续当前会话。',
          '/new  开启一个全新会话',
          '/status  检查连接状态',
          '/whoami  查看我的身份信息',
          '/help  显示本帮助',
          '',
          '管理员指令：',
          '  /shell <命令>  在本机执行 shell 命令',
        ].join('\n'));
        await this.#state.markSeen(messageId);
        return;
      }
      if (command === '/status') {
        await this.#harness.ensureRunning();
        await this.#bot.sendText(target, `推推机器人与 DeepSeek Harness 连接正常。\n当前身份：${senderLabel}${isAdmin ? '（管理员）' : ''}`);
        await this.#state.markSeen(messageId);
        return;
      }
      const conversationKey = `${message.kind}:${message.conversationId}`;
      if (command === '/new') {
        await this.#state.clearSession(conversationKey);
        await this.#bot.sendText(target, '已开启新会话。请发送你的问题。');
        await this.#state.markSeen(messageId);
        return;
      }

      // 3) 普通对话，受 chat 能力开关控制
      if (!canUseCapability(security, 'chat', isAdmin)) {
        await this.#deny(target, '当前机器人对话仅向管理员开放', senderLabel);
        await this.#state.markSeen(messageId);
        return;
      }

      // 4) 交给 Harness 生成回复；提问以「账号(角色)：内容」呈现，记录发送人身份
      let sessionId = this.#state.sessionFor(conversationKey);
      if (!sessionId || !(await this.#harness.sessionExists(sessionId))) {
        sessionId = await this.#harness.createSession();
        await this.#state.setSession(conversationKey, sessionId);
      }

      const senderIdentity = senderId || senderName || String(message.senderUid ?? '') || 'unknown';
      const prompt = `${senderIdentity}(${senderRole(isAdmin)})：${text}`;
      const answer = await this.#harness.ask(sessionId, prompt, {
        timeoutMs: this.#replyTimeoutMs,
      });

      // 5) 普通文本回复
      await this.#bot.sendText(target, answer);
      await this.#state.markSeen(messageId);
      this.#status.messagesReplied += 1;
      this.#status.lastReplyAt = new Date().toISOString();
      this.#status.lastError = null;
    } catch (error) {
      this.#status.lastError = error?.message ?? String(error);
      this.#logger.error?.('[dsh-tuitui] failed to process a message:', error);
      try {
        await this.#bot.sendText(target, '消息处理失败，请稍后重试。');
        await this.#state.markSeen(messageId);
      } catch (sendError) {
        this.#logger.error?.('[dsh-tuitui] failed to send the safe error reply:', sendError);
      }
    }
  }

  /** 逐条消息实时读取最新安全策略，读取失败时退回默认策略。 */
  #currentSecurity() {
    try {
      return normalizeSecurity(this.#getSecurity?.());
    } catch (error) {
      this.#logger.warn?.('[dsh-tuitui] failed to read security policy, using defaults:', error);
      return normalizeSecurity(undefined);
    }
  }

  async #deny(target, reason, senderLabel) {
    this.#status.messagesRejected += 1;
    this.#status.lastRejectedAt = new Date().toISOString();
    await this.#bot.sendText(target, `${reason}。\n当前身份：${senderLabel}。如需权限，请联系管理员在 Harness 设置页将你加入管理员列表。`);
  }
}
