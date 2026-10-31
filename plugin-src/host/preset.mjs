/**
 * 推推 member 账户的受限 agent 预设。
 *
 * 需求：非管理员账户一律是 member，只能在「初始状态」下运行 —— 没有任何内置工具、
 * 技能或终端能力，只能做问答，不能执行任何操作。
 *
 * 做法：通过 `agentPresets` 服务动态注册一个只挂 `dsh-persona` 的预设。
 * 预设的 `plugins` 列表里没有任何 tool-* / skill-* 行，因此会话拿不到工具；
 * persona 使用 `complete: true`，让系统提示词只剩这段「无工具」声明。
 *
 * 该预设是 `session.create({ agentPreset })` 的取值来源，图形界面里也会出现在
 * agent 预设清单中（可显式选用，但默认不会影响其他会话）。
 */

/** 受限预设的默认 id。 */
export const DEFAULT_MEMBER_PRESET_ID = 'tuitui-member';

/** 成员会话的系统提示词：明确无工具、只能问答。 */
export const MEMBER_PERSONA_PREFIX = [
  '你是在 360 推推（Tuitui）里为普通成员提供问答的助手。',
  '当前是「成员（member）」模式：你没有任何工具、技能或终端权限，',
  '不能读取或写入文件、执行命令、访问网络、调用外部系统，也不能代替用户执行任何操作。',
  '你只能依据自身知识回答问题，必要时给出思路、步骤或建议。',
  '当用户要求你直接执行某事时，简短说明你无法执行，并建议其联系机器人管理员。',
  '回答使用简体中文，简洁准确、可以直接阅读。',
].join('');

/**
 * 组装受限预设的定义（即 `@deepseek-ai/dsh-agent-preset` 的 config）。
 * @param {{ id?: string, name?: string, description?: string, order?: number }} [options]
 */
export function createMemberPresetDefinition(options = {}) {
  return {
    id: options.id ?? DEFAULT_MEMBER_PRESET_ID,
    name: options.name ?? '推推成员（仅问答）',
    description: options.description ?? '推推非管理员账户使用：无工具、无技能，只能问答。',
    order: options.order ?? 50,
    plugins: [
      {
        id: 'persona',
        name: '@deepseek-ai/dsh-persona',
        config: {
          prefix: MEMBER_PERSONA_PREFIX,
          complete: true,
          includeRuntimeContext: false,
        },
      },
      {
        // 屏蔽 dsh-base 等基座注册的全部全局工具（如 working_directory），
        // member 会话因此真正做到「零工具、仅问答」。
        id: 'member-tool-guard',
        name: 'dsh-tuitui/member-guard',
      },
    ],
  };
}

/**
 * 在宿主上注册受限预设；宿主没有 `agentPresets` 服务时保持 pending（成员会话将被拒绝，
 * 而不是回退到带工具的预设）。
 *
 * @param {object} ctx - 插件上下文。
 * @param {{ id?: string, name?: string, description?: string, logger?: object }} [options]
 * @returns {{ id: string, isReady: () => boolean, wait: (timeoutMs?: number) => Promise<boolean> }}
 */
export function registerMemberPreset(ctx, options = {}) {
  const id = options.id ?? DEFAULT_MEMBER_PRESET_ID;
  const logger = options.logger ?? console;
  let state = 'pending';
  let notify = null;
  const settled = new Promise((resolve) => {
    notify = resolve;
  });
  const settle = (value) => {
    if (state !== 'pending') return;
    state = value ? 'ready' : 'failed';
    notify(value);
  };

  const injectInto = ['agentPresets'];
  ctx.inject(injectInto, (scope) => {
    scope.effect(() => {
      let disposed = false;
      let unregister = null;
      const definition = createMemberPresetDefinition({ id, name: options.name, description: options.description });
      Promise.resolve()
        .then(() => scope.agentPresets.register(definition))
        .then((release) => {
          if (disposed) {
            void release?.();
            return;
          }
          unregister = release;
          settle(true);
        })
        .catch((error) => {
          // 同名预设已存在（例如用户在 profile 里显式声明）时直接复用。
          if (String(error?.message ?? '').startsWith('Duplicate agent preset')) {
            settle(true);
            return;
          }
          logger.error?.(`[dsh-tuitui] 成员受限预设 ${id} 注册失败:`, error);
          settle(false);
        });
      return () => {
        disposed = true;
        if (!unregister) return undefined;
        const release = unregister;
        unregister = null;
        return release();
      };
    }, `dsh-tuitui: 注册成员受限预设 ${id}`);
  });

  return {
    id,
    isReady: () => state === 'ready',
    /**
     * 等待注册结果；宿主没有该服务或注册失败时返回 false。
     * @param {number} [timeoutMs]
     */
    async wait(timeoutMs = 15_000) {
      if (state === 'ready') return true;
      if (state === 'failed') return false;
      let timer = null;
      const timeout = new Promise((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs);
        timer.unref?.();
      });
      try {
        return await Promise.race([settled, timeout]);
      } finally {
        if (timer !== null) clearTimeout(timer);
      }
    },
  };
}
