import { randomUUID } from 'node:crypto';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * DSH 0.2.1 起会话事件模型：
 * - 持久事件通过 `session/event` 全局事件流推送（turn/start、user/message、
 *   assistant/message、tool/call、tool/result、turn/end）；
 * - 不再有 `assistant/chunk` 持久事件，实时 token 走 `agent/assistant-stream`。
 * 推推只需要最终答复，所以这里基于持久事件跟踪一轮对话的结束。
 */

function assistantMessageText(event) {
  return (event?.data?.message?.content ?? [])
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('\n')
    .trim();
}

/** 跟踪一次提问对应的 turn：从 user/message 的 source.rpcId 定位，直到 turn/end。 */
export class HarnessReplyTracker {
  #requestId;
  #lastSeq;
  #openTurn = null;
  #targetTurn = null;
  #stepText = new Map();
  #latestText = '';
  #finished = false;
  #reason = null;

  constructor({ requestId }) {
    this.#requestId = requestId;
    this.#lastSeq = -1;
  }

  get finished() {
    return this.#finished;
  }

  get answer() {
    return this.#latestText.trim();
  }

  get reason() {
    return this.#reason;
  }

  /**
   * 消费一条持久会话事件。
   * @param {object} event - `session/event` 的 event 载荷（{ seq, type, data }）。
   * @returns {{ type: string, text?: string, name?: string } | null} 供进度展示的更新。
   */
  consume(event) {
    if (!event || typeof event.type !== 'string') return null;
    const seq = event.seq ?? -1;
    if (seq <= this.#lastSeq) return null;
    this.#lastSeq = seq;

    if (event.type === 'turn/start') {
      this.#openTurn = event.data?.turn ?? null;
      return null;
    }

    if (event.type === 'user/message') {
      if (event.data?.source?.rpcId === this.#requestId) this.#targetTurn = this.#openTurn;
      return null;
    }
    if (this.#targetTurn === null) return null;

    if (event.type === 'turn/end') {
      if (event.data?.turn !== this.#targetTurn) return null;
      this.#finished = true;
      this.#reason = event.data?.reason ?? null;
      this.#openTurn = null;
      return null;
    }

    if (event.type === 'assistant/message') {
      const text = assistantMessageText(event);
      if (text && text !== this.#latestText) {
        this.#latestText = text;
        return { type: 'text', text };
      }
      return null;
    }

    if (event.type === 'tool/call') return { type: 'tool', name: event.data?.name ?? '工具' };
    if (event.type === 'tool/result') return { type: 'status', text: '正在整理结果…' };
    return null;
  }
}

export class HarnessRpcError extends Error {
  constructor(code, message) {
    super(message ?? code);
    this.name = 'HarnessRpcError';
    this.code = code ?? 'internal';
  }
}

/** 会话已不存在（被删除或归档），调用方应新建会话。 */
export class HarnessSessionMissingError extends Error {
  constructor(sessionId) {
    super(`Harness 会话不存在：${sessionId}`);
    this.name = 'HarnessSessionMissingError';
    this.code = 'session-not-found';
  }
}

function normalizeError(error) {
  if (error?.name === 'HarnessSessionMissingError') return error;
  if (error?.code === 'session/not-found') return new HarnessSessionMissingError(error?.message ?? '');
  return error;
}

/**
 * 通过宿主进程内的 `sessionController` 服务驱动 Harness 会话。
 *
 * 不再使用 HTTP `/api`：0.2.1 起 `/api` 只接受已认证浏览器 Peer，
 * 第三方插件进程内没有会话票据；直接调用服务也更稳，
 * 不需要 `dshBin` 托管进程或端口探测。
 */
export class HarnessClient {
  #sessionController;
  #workspace;
  #agentPreset;
  #memberAgentPreset;
  #subscribeSessionEvents;

  constructor({
    sessionController,
    workspace,
    agentPreset = 'standard',
    memberAgentPreset = 'tuitui-member',
    subscribeSessionEvents,
  }) {
    if (!sessionController || typeof sessionController.create !== 'function') {
      throw new TypeError('dsh-tuitui 需要 DSH sessionController 服务');
    }
    if (typeof subscribeSessionEvents !== 'function') {
      throw new TypeError('dsh-tuitui 需要订阅 session/event 的能力');
    }
    this.#sessionController = sessionController;
    this.#workspace = workspace;
    this.#agentPreset = agentPreset;
    this.#memberAgentPreset = memberAgentPreset;
    this.#subscribeSessionEvents = subscribeSessionEvents;
  }

  /** 管理员会话使用的 agent 预设。 */
  get agentPreset() {
    return this.#agentPreset;
  }

  /** 非管理员（member）会话使用的受限预设：没有任何工具与技能。 */
  get memberAgentPreset() {
    return this.#memberAgentPreset;
  }

  /**
   * 新建 Harness 会话。
   * @param {string} [preset] - agent 预设 id；缺省用管理员预设。
   */
  async createSession(preset) {
    const agentPreset = typeof preset === 'string' && preset.trim() ? preset.trim() : this.#agentPreset;
    const created = await this.#sessionController.create({
      cwd: this.#workspace,
      agentPreset,
    });
    return created.sessionId;
  }

  /** 判断会话是否仍然存在（被删除/归档的会话不再可用）。 */
  async sessionExists(sessionId) {
    try {
      const value = await this.#sessionController.projections({ sessionId });
      return value !== null && value !== undefined;
    } catch (error) {
      if (error?.code === 'session/not-found') return false;
      throw normalizeError(error);
    }
  }

  /**
   * 提交一次提问并等待该轮答复。
   * @param {string} sessionId - 目标会话。
   * @param {string} text - 提问内容。
   * @param {{ timeoutMs?: number, onUpdate?: (update: object) => void,
   *   extendWhile?: () => boolean }} [options] -
   *   `extendWhile` 返回 true 时，超时判定顺延一个完整窗口（用于提问正在
   *   推推里等用户回答，避免整轮先超时）。
   * @returns {Promise<string>} assistant 最终文本。
   */
  async ask(sessionId, text, options = {}) {
    const timeoutMs = options.timeoutMs ?? 600_000;
    const onUpdate = typeof options.onUpdate === 'function' ? options.onUpdate : null;
    const requestId = `tuitui-${randomUUID()}`;
    const tracker = new HarnessReplyTracker({ requestId });

    const dispose = this.#subscribeSessionEvents((session, event) => {
      if (!session || session.id !== sessionId) return;
      let update;
      try {
        update = tracker.consume(event);
      } catch {
        return;
      }
      if (update && onUpdate) {
        try {
          onUpdate(update);
        } catch {
          // 进度回调失败不影响主流程
        }
      }
    });

    const abort = new AbortController();
    try {
      try {
        await this.#sessionController.prompt({
          sessionId,
          mode: 'queue',
          requestId,
          content: [{ type: 'text', text }],
          clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }, abort.signal);
      } catch (error) {
        throw normalizeError(error);
      }

      let deadline = Date.now() + timeoutMs;
      // 事件由订阅推送、同步写入 tracker，这里只等待它完成（200ms 粒度）。
      while (!tracker.finished) {
        if (Date.now() >= deadline) {
          let extended = false;
          try {
            extended = typeof options.extendWhile === 'function' && options.extendWhile() === true;
          } catch {
            extended = false;
          }
          if (extended) {
            // 提问还在推推里等用户回复：顺延整个窗口，等回答后再计时。
            deadline = Date.now() + timeoutMs;
          } else {
            throw new Error(`Harness 回复超时（${Math.round(timeoutMs / 1_000)} 秒）`);
          }
        }
        await sleep(200);
      }

      if (!tracker.answer) {
        throw new Error(
          `Harness 本轮没有返回文本${tracker.reason ? `（turn/end: ${JSON.stringify(tracker.reason)}）` : ''}`,
        );
      }
      return tracker.answer;
    } finally {
      abort.abort();
      try {
        dispose?.();
      } catch {
        // 忽略取消订阅失败
      }
    }
  }
}
