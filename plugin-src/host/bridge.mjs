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
    messagesAcknowledged: 0,
    lastMessageAt: null,
    lastReplyAt: null,
    lastRejectedAt: null,
    lastSenderName: null,
    lastSenderAccount: null,
    lastSenderRole: null,
    lastError: null,
  };
}

const SHELL_COMMAND_PATTERN = /^\s*\/(?:shell|exec|run)\s+([\s\S]+)$/i;
const SHELL_COMMAND_BARE = /^\s*\/(?:shell|exec|run)\s*$/i;
/** 等待提问回答期间仍可安全执行的会话指令：会先取消提问，再正常处理。 */
const SAFE_COMMAND_PATTERN = /^\s*\/(?:new|status|help|whoami)\b/i;

/**
 * 把推推入站消息转发给 Harness agent，并把回答发回推推。
 * bot 接口：{ sendText(target, text) }，target 为推推 ToTarget。
 * 安全策略通过 getSecurity() 逐条消息实时读取，设置页修改后立即生效。
 *
 * 角色分流：管理员（manager）使用完整 agent 预设（可带工具、技能）；
 * 非管理员（member）使用受限预设（无工具、无技能，只能问答），
 * 且 /shell 等操作类指令永远只对管理员开放。
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
  #adminPreset;
  #memberPreset;
  #ensureMemberPreset;
  #questions;
  #ackEmoji;
  #botId;
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
    adminPreset,
    memberPreset,
    ensureMemberPreset = async () => true,
    questions = null,
    ackEmoji = '收到',
    botId = '',
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
    this.#adminPreset = adminPreset ?? harness.agentPreset ?? 'standard';
    this.#memberPreset = memberPreset ?? harness.memberAgentPreset ?? 'tuitui-member';
    this.#ensureMemberPreset = ensureMemberPreset;
    this.#questions = questions;
    this.#ackEmoji = typeof ackEmoji === 'string' ? ackEmoji.trim() : '';
    this.#botId = cleanText(botId);
  }

  get status() {
    return structuredClone(this.#status);
  }

  accept(message) {
    const conversationId = cleanText(message?.conversationId);
    const kind = message?.kind === 'group' ? 'group' : 'direct';
    const key = `${kind}:${conversationId}`;
    const full = { ...message, kind, conversationId };
    const text = cleanText(message?.content);

    // 待答问题的回复必须插队处理：此时同一会话的队列正卡在
    // harness.ask() 上等这一刻的回答，排到队尾会死锁。
    if (this.#questions?.hasPending(key) && text && this.#questions.canAccept(key, message?.senderId)) {
      if (SAFE_COMMAND_PATTERN.test(text)) {
        this.#questions.cancel(key, '用户在等待回答时发送了会话指令');
      } else {
        return this.#answerPending(full, key, text).then((consumed) => (
          consumed ? undefined : this.#enqueue(full, key)
        ));
      }
    }
    return this.#enqueue(full, key);
  }

  #enqueue(message, key) {
    const previous = this.#queues.get(key) ?? Promise.resolve();
    const current = previous
      .catch(() => undefined)
      .then(() => this.#process(message))
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
    const role = senderRole(isAdmin);

    this.#status.messagesReceived += 1;
    this.#status.lastMessageAt = new Date().toISOString();
    this.#status.lastSenderName = senderName || senderId;
    this.#status.lastSenderAccount = senderId;
    this.#status.lastSenderRole = role;
    this.#logger.info?.(`[dsh-tuitui] message from ${senderLabel}${isAdmin ? ' (管理员)' : ' (member)'}`);

    if (message.kind === 'group' && message.addressed !== true) {
      this.#status.messagesRejected += 1;
      this.#status.lastRejectedAt = new Date().toISOString();
      return;
    }

    const target = message.replyTarget;
    const text = cleanText(message.content);
    try {
      // 先回一个 emoji 表示「收到」，让提问的人立刻有反馈；
      // 失败（平台不支持该表情等）不影响后续处理。
      await this.#ack(target, message.platformMessageId);

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
          `权限：${isAdmin ? '管理员（manager）' : '成员（member，仅问答）'}`,
        ].join('\n'));
        await this.#state.markSeen(messageId);
        return;
      }
      if (command === '/help') {
        await this.#bot.sendText(target, [
          '推推机器人已连接 DeepSeek Harness。',
          '',
          '直接发送文字即可继续当前会话。',
          '机器人需要你确认时，会在这里列出选项：回复序号或文字即可继续（回复 0 跳过）。',
          '/new  开启一个全新会话',
          '/status  检查连接状态',
          '/whoami  查看我的身份信息',
          '/help  显示本帮助',
          '',
          isAdmin
            ? '你是管理员：可执行 /shell <命令> 等操作类指令。'
            : '你是成员（member）：只能问答，无法调用工具、技能或执行任何操作。',
          '管理员指令：',
          '  /shell <命令>  在本机执行 shell 命令（仅管理员）',
        ].join('\n'));
        await this.#state.markSeen(messageId);
        return;
      }
      if (command === '/status') {
        await this.#bot.sendText(target, `推推机器人与 DeepSeek Harness 连接正常。\n当前身份：${senderLabel}（${isAdmin ? '管理员' : '成员/member'}）`);
        await this.#state.markSeen(messageId);
        return;
      }
      // 会话按「会话 + 角色」隔离：管理员与成员各自拥有独立上下文，
      // 避免成员复用管理员的（带工具）会话。旧版本键（无角色）一并清理。
      if (command === '/new') {
        const roleKeys = [
          `${message.kind}:${message.conversationId}:manager`,
          `${message.kind}:${message.conversationId}:member`,
          `${message.kind}:${message.conversationId}`,
        ];
        this.#questions?.unbindSessions(roleKeys.map((roleKey) => this.#state.sessionFor(roleKey)));
        await this.#state.clearSessions(roleKeys);
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

      // 4) 成员必须使用「无工具、无技能」的受限预设；预设未就绪时拒绝服务，
      //    绝不回退到管理员预设，避免成员获得操作能力。
      if (!isAdmin) {
        const ready = await this.#ensureMemberPreset();
        if (!ready) {
          this.#status.messagesRejected += 1;
          this.#status.lastRejectedAt = new Date().toISOString();
          await this.#bot.sendText(target, '成员问答模式尚未就绪（受限预设未加载），请稍后重试或联系管理员。');
          await this.#state.markSeen(messageId);
          return;
        }
      }

      // 5) 交给 Harness 生成回复；提问以「账号(角色)：内容」呈现，记录发送人身份
      const conversationKey = `${message.kind}:${message.conversationId}:${role}`;
      const preset = isAdmin ? this.#adminPreset : this.#memberPreset;
      const senderIdentity = senderId || senderName || String(message.senderUid ?? '') || 'unknown';
      const prompt = `${senderIdentity}(${role})：${text}`;

      // 会话可能已被删除/归档：自动重建一次再重试，避免长期失效。
      // （不做逐条存在的探测，避免长会话每次消息都扫描日志。）
      let answer = null;
      for (let attempt = 0; attempt < 2 && answer === null; attempt += 1) {
        let sessionId = this.#state.sessionFor(conversationKey);
        if (!sessionId) {
          sessionId = await this.#harness.createSession(preset);
          await this.#state.setSession(conversationKey, sessionId);
        }
        // 登记「Harness 会话 → 推推会话」通道：模型在中途调用
        // ask_user_question / 审批时，questionRelay 会把问题发回推推等回复。
        this.#questions?.bindSession(sessionId, {
          conversationKey: `${message.kind}:${message.conversationId}`,
          senderId,
          label: senderLabel,
          botId: this.#botId,
          send: (replyText) => this.#bot.sendText(target, replyText),
        });
        try {
          answer = await this.#harness.ask(sessionId, prompt, {
            timeoutMs: this.#replyTimeoutMs,
            // 提问还没答完时不要判定整轮超时：等待时长由 questionRelay 控制。
            extendWhile: () => this.#questions?.isBusy(sessionId) === true,
          });
        } catch (error) {
          if (error?.code !== 'session-not-found' || attempt > 0) throw error;
          this.#questions?.unbindSession(sessionId);
          await this.#state.clearSession(conversationKey);
        }
      }

      // 6) 普通文本回复
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

  /**
   * 给用户消息回一个 emoji（「收到」），失败只记调试日志。
   * @param {object} target - 推推 ToTarget。
   * @param {string} platformMessageId - 推推消息 id；没有它就无法挂表情。
   */
  async #ack(target, platformMessageId) {
    const emoji = this.#ackEmoji;
    const messageId = cleanText(platformMessageId);
    if (!emoji || !messageId || typeof this.#bot.react !== 'function') return;
    try {
      await this.#bot.react(target, messageId, emoji);
      this.#status.messagesAcknowledged += 1;
    } catch (error) {
      this.#logger.debug?.('[dsh-tuitui] failed to add the receipt emoji:', error?.message ?? error);
    }
  }

  /**
   * 把一条推推消息当作待答问题的回答处理（不进入会话队列、不转发给模型）。
   * @param {object} message - 已归一化的入站消息（含 kind/conversationId）。
   * @param {string} key - `${kind}:${conversationId}`
   * @param {string} text
   * @returns {Promise<boolean>} 是否被当作回答消费掉了
   */
  async #answerPending(message, key, text) {
    const messageId = cleanText(message.messageId);
    const senderId = cleanText(message.senderId);
    if (!messageId || !senderId || message.senderIsBot === true) return true;
    if (this.#state.hasSeen(messageId)) return true;

    const target = message.replyTarget;
    try {
      await this.#ack(target, message.platformMessageId);
      if (!this.#questions?.respond(key, text, { senderId })) {
        // 等待中的问题刚刚被取消/超时：这条消息按普通消息继续处理。
        this.#logger.warn?.('[dsh-tuitui] pending question disappeared before the reply arrived');
        return false;
      }
      await this.#state.markSeen(messageId);
      this.#status.messagesReceived += 1;
      this.#status.lastMessageAt = new Date().toISOString();
      this.#status.lastSenderName = cleanText(message.senderName) || senderId;
      this.#status.lastSenderAccount = senderId;
      return true;
    } catch (error) {
      this.#status.lastError = error?.message ?? String(error);
      this.#logger.error?.('[dsh-tuitui] failed to relay a question reply:', error);
      return true;
    }
  }
}
