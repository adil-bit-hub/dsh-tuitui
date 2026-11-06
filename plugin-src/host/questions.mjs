/**
 * 推推频道里的「人工提问」中转。
 *
 * 背景：从推推发起的 Harness 会话里，模型如果调用 `ask_user_question`
 * （或触发需要授权的审批弹窗），DSH 默认把问题卡片弹在 Web 界面上。
 * 而提问的人此时在推推里，看不到那个弹窗，整轮对话就一直挂起，
 * 这个推推会话也就被堵死了。
 *
 * 做法：插件在宿主侧挂一个 `user-questions/request` /
 * `approval/request` 的 waterfall 监听。只要是本插件创建的会话（按
 * Harness sessionId 识别），就把问题连同选项一起发回推推，等用户
 * 下一条文字消息作答；其他会话原样交给 `next()`，不影响 DSH 界面。
 *
 * 回答格式（`ask_user_question` 的答案批）：
 *   { answers: [{ id, selected: string[], custom?: string }] }
 * 空 selected 且无 custom 表示用户跳过。
 */

/** 默认等待用户作答的时间：15 分钟。 */
export const DEFAULT_QUESTION_TIMEOUT_MS = 15 * 60_000;

/** 判定「跳过 / 取消」的回复。 */
const SKIP_PATTERN = /^(?:0|跳过|略过|不用了|算了|取消|cancel|skip)$/i;

const NUMBER_PATTERN = /^\d+$/;

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function abortedError() {
  const error = new Error('提问在推推里等待时被取消');
  error.code = 'ASK_ABORTED';
  return error;
}

function sessionIdOf(agent) {
  return cleanText(agent?.session?.id);
}

/**
 * 把一条问题排成推推里可读的文本。
 * @param {object} question - `ask_user_question` 的问题项。
 * @param {{ index?: number, total?: number }} [position]
 * @returns {string}
 */
export function formatQuestion(question, position = {}) {
  const lines = [];
  const { index, total } = position;
  const counter = typeof index === 'number' && typeof total === 'number' && total > 1
    ? `（${index}/${total}）`
    : '';
  const header = cleanText(question?.header);
  lines.push(`❓ 需要你确认${counter}${header ? `【${header}】` : ''}`);
  lines.push(cleanText(question?.question) || '（问题内容为空）');
  const detail = cleanText(question?.detail);
  if (detail) lines.push(detail);

  const options = Array.isArray(question?.options) ? question.options : [];
  if (options.length > 0) {
    lines.push('');
    options.forEach((option, i) => {
      const label = cleanText(option?.label) || `选项 ${i + 1}`;
      const description = cleanText(option?.description);
      lines.push(`${i + 1}. ${label}${description ? `（${description}）` : ''}`);
    });
    lines.push('');
    lines.push(question?.multiSelect === true
      ? '回复序号即可，多选用逗号分隔（例如 1,3）；也可以直接输入你的回答。'
      : '回复序号或选项文字，也可以直接输入你的回答。');
    lines.push('回复 0 表示跳过这个问题。');
  } else {
    lines.push('');
    lines.push('请直接回复你的回答；回复 0 表示跳过。');
  }
  return lines.join('\n');
}

/**
 * 把一条审批请求排成推推里可读的文本。
 * @param {{ toolName?: string, reason?: string }} request
 * @returns {string}
 */
export function formatApproval(request) {
  const toolName = cleanText(request?.toolName) || '某些操作';
  const reason = cleanText(request?.reason);
  return [
    '🔐 需要你授权',
    `工具：${toolName}${reason ? `\n原因：${reason}` : ''}`,
    '',
    '1. 允许一次',
    '2. 拒绝',
    '',
    '回复 1 允许，回复 2 拒绝；回复 0 视为拒绝。',
  ].join('\n');
}

/**
 * 把一条用户回复解析成答案项。
 *
 * - 纯数字：按选项序号选择（多选用逗号/空格分隔）；
 * - 与选项文字一致：视为选中该项；
 * - 其他文字：作为自定义回答（custom）。
 *
 * @param {string} text - 用户在推推里的回复。
 * @param {{ options?: Array<{ label?: string }>, multiSelect?: boolean }} question
 * @returns {{ selected: string[], custom?: string }}
 */
export function parseReply(text, question = {}) {
  const raw = cleanText(text);
  const options = Array.isArray(question?.options) ? question.options : [];
  const labels = options.map((option, i) => cleanText(option?.label) || `选项 ${i + 1}`);
  if (!raw || SKIP_PATTERN.test(raw)) return { selected: [] };

  const tokens = raw.split(/[,，、\s]+/).filter(Boolean);
  if (labels.length > 0 && tokens.length > 0 && tokens.every((token) => NUMBER_PATTERN.test(token))) {
    const indexes = tokens.map(Number);
    if (indexes.every((value) => value >= 1 && value <= labels.length)) {
      const picked = [...new Set(indexes.map((value) => labels[value - 1]))];
      if (question?.multiSelect === true) return { selected: picked };
      return { selected: [picked[0]] };
    }
  }

  const matched = labels.find((label) => label === raw)
    ?? labels.find((label) => label.toLowerCase() === raw.toLowerCase());
  if (matched !== undefined) return { selected: [matched] };

  return { selected: [], custom: raw };
}

/**
 * 推推会话里的提问中转。
 *
 * 每个 Harness sessionId 绑定一个「把文本发到哪个推推会话」的通道；
 * 每轮提问按会话（`kind:conversationId`）排队等待用户作答。
 */
export class TuituiQuestionRelay {
  #bindings = new Map();
  #pending = new Map();
  #logger;
  #timeoutMs;
  #closed = false;

  /**
   * @param {{ logger?: object, timeoutMs?: number }} [options]
   */
  constructor({ logger = console, timeoutMs = DEFAULT_QUESTION_TIMEOUT_MS } = {}) {
    this.#logger = logger;
    this.#timeoutMs = Number.isSafeInteger(timeoutMs) && timeoutMs > 0
      ? timeoutMs
      : DEFAULT_QUESTION_TIMEOUT_MS;
  }

  get timeoutMs() {
    return this.#timeoutMs;
  }

  /**
   * 绑定一个推推会话对应的 Harness 会话。
   * @param {string} sessionId
   * @param {{ conversationKey: string, send: (text: string) => Promise<void>, senderId?: string, label?: string }} binding
   */
  bindSession(sessionId, binding = {}) {
    const id = cleanText(sessionId);
    if (!id || typeof binding?.send !== 'function' || !cleanText(binding?.conversationKey)) return false;
    this.#bindings.set(id, {
      conversationKey: cleanText(binding.conversationKey),
      send: binding.send,
      senderId: cleanText(binding.senderId),
      label: cleanText(binding.label),
      botId: cleanText(binding.botId),
    });
    return true;
  }

  /** 解绑一个 Harness 会话（会话被删除或 /new 时调用）。 */
  unbindSession(sessionId) {
    const id = cleanText(sessionId);
    if (!id) return;
    this.#bindings.delete(id);
  }

  /** 批量解绑。 */
  unbindSessions(sessionIds) {
    for (const id of sessionIds ?? []) this.unbindSession(id);
  }

  /** 机器人停止时解绑它名下的全部会话。 */
  unbindBot(botId) {
    const id = cleanText(botId);
    if (!id) return;
    for (const [sessionId, binding] of [...this.#bindings]) {
      if (binding.botId === id) this.#bindings.delete(sessionId);
    }
  }

  /** 机器人停止时放弃它名下等待中的提问，避免整轮一直挂着。 */
  cancelBot(botId, reason = '推推机器人已停止') {
    const id = cleanText(botId);
    if (!id) return;
    for (const pending of [...this.#pending.values()]) {
      if (pending.botId !== id) continue;
      pending.reject(Object.assign(new Error(reason), { code: 'ASK_ABORTED' }));
    }
  }

  /** 该会话当前是否有待作答的问题。 */
  hasPending(conversationKey) {
    return this.#pending.has(cleanText(conversationKey));
  }

  /**
   * 判断一条入站消息是否可以当作待答问题的回答。
   * 只接受与该轮提问同一位发送者，避免群聊里被其他人的消息顶掉。
   */
  canAccept(conversationKey, senderId) {
    const pending = this.#pending.get(cleanText(conversationKey));
    if (!pending) return false;
    const expected = pending.senderId;
    if (!expected) return true;
    return !cleanText(senderId) || cleanText(senderId) === expected;
  }

  /**
   * 该 Harness 会话当前是否正有提问在推推里等回复。
   * 用于在等待期间延长整轮回复的超时，避免问题还没答完、整轮先超时。
   */
  isBusy(sessionId) {
    const binding = this.#bindings.get(cleanText(sessionId));
    return binding ? this.#pending.has(binding.conversationKey) : false;
  }

  /**
   * 放弃某个会话里等待中的提问（例如用户改发会话指令）。
   * @param {string} conversationKey
   * @param {string} [reason]
   * @returns {boolean}
   */
  cancel(conversationKey, reason = '问题被用户取消') {
    const pending = this.#pending.get(cleanText(conversationKey));
    if (!pending) return false;
    pending.reject(Object.assign(new Error(reason), { code: 'ASK_ABORTED' }));
    return true;
  }

  /**
   * 把用户的推推回复交给等待中的问题。
   * @param {string} conversationKey - `${kind}:${conversationId}`
   * @param {string} text
   * @param {{ senderId?: string }} [meta]
   * @returns {boolean} 是否有等待中的问题被这条回复解决
   */
  respond(conversationKey, text, meta = {}) {
    const key = cleanText(conversationKey);
    const pending = this.#pending.get(key);
    if (!pending) return false;
    if (!this.canAccept(key, meta.senderId)) return false;
    pending.settle(parseReply(text, pending.question));
    return true;
  }

  /**
   * `user-questions/request` waterfall 监听。
   * @param {object} request - 宿主 `ctx.userQuestions.ask()` 的请求。
   * @param {() => Promise<object>} next
   * @returns {Promise<object>}
   */
  async handleQuestion(request, next) {
    const binding = this.#bindingFor(request?.agent);
    if (!binding || this.#closed) return next();
    const questions = Array.isArray(request?.questions) ? request.questions : [];
    if (questions.length === 0) return next();

    const answers = [];
    let abandoned = false;
    for (let i = 0; i < questions.length; i += 1) {
      const question = questions[i];
      const id = cleanText(question?.id) || `q${i + 1}`;
      if (abandoned) {
        answers.push({ id, selected: [] });
        continue;
      }
      const answer = await this.#askOne(binding, question, { index: i + 1, total: questions.length }, request?.signal);
      if (answer.abandoned === true) {
        abandoned = true;
        answers.push({ id, selected: [] });
        continue;
      }
      answers.push({ id, ...answer.value });
    }
    return { answers };
  }

  /**
   * `approval/request` waterfall 监听：把授权弹窗搬到推推。
   * @param {{ agent?: object, toolName?: string, reason?: string, signal?: AbortSignal }} request
   * @param {() => Promise<string>} next
   * @returns {Promise<'allowed-once'|'rejected'|'cancelled'|'unavailable'>}
   */
  async handleApproval(request, next) {
    const binding = this.#bindingFor(request?.agent);
    if (!binding || this.#closed) return next();

    const question = {
      options: [{ label: '允许一次' }, { label: '拒绝' }],
      multiSelect: false,
    };
    const result = await this.#askOne(binding, question, {}, request?.signal, formatApproval(request));
    if (result.abandoned === true) return 'cancelled';
    const label = result.value?.selected?.[0];
    if (label === '允许一次') return 'allowed-once';
    return 'rejected';
  }

  /** 关闭中转：清空绑定与等待中的问题。 */
  close() {
    if (this.#closed) return;
    this.#closed = true;
    for (const pending of this.#pending.values()) pending.reject(abortedError());
    this.#pending.clear();
    this.#bindings.clear();
  }

  #bindingFor(agent) {
    const id = sessionIdOf(agent);
    return id ? this.#bindings.get(id) ?? null : null;
  }

  /**
   * 发送一条问题并等待回复。
   * @returns {Promise<{ value: { selected: string[], custom?: string }, abandoned?: boolean }>}
   */
  async #askOne(binding, question, position, signal, text = null) {
    if (signal?.aborted) throw abortedError();
    const conversationKey = binding.conversationKey;
    if (this.#pending.has(conversationKey)) {
      throw new Error('该推推会话已有待回答的问题，请先处理它');
    }
    const body = text ?? formatQuestion(question, position);

    const answer = new Promise((resolve, reject) => {
      let timer = null;
      let settled = false;
      const cleanup = () => {
        if (settled) return false;
        settled = true;
        if (timer !== null) clearTimeout(timer);
        timer = null;
        this.#pending.delete(conversationKey);
        signal?.removeEventListener('abort', onAbort);
        return true;
      };
      const settle = (value) => {
        if (!cleanup()) return;
        resolve({ value });
      };
      const abandon = (reason) => {
        if (!cleanup()) return;
        this.#logger.warn?.(`[dsh-tuitui] 提问等待结束：${reason}`);
        binding.send('问题等待超时，已按「跳过」处理。').catch(() => undefined);
        resolve({ value: { selected: [] }, abandoned: true });
      };
      const onAbort = () => {
        if (!cleanup()) return;
        reject(abortedError());
      };

      // 先登记等待，再发消息：避免发送与登记之间到达的回复被当成新提问。
      this.#pending.set(conversationKey, {
        question,
        senderId: binding.senderId,
        botId: binding.botId,
        settle,
        reject: (error) => {
          if (!cleanup()) return;
          reject(error);
        },
      });
      signal?.addEventListener('abort', onAbort, { once: true });
      timer = setTimeout(() => abandon('超时未收到推推回复'), this.#timeoutMs);
    });

    try {
      await binding.send(body);
    } catch (error) {
      const pending = this.#pending.get(conversationKey);
      pending?.reject(error);
      throw error;
    }
    return await answer;
  }
}