/**
 * 推推 member 会话的「无工具」限制插件。
 *
 * 该插件只挂在 `tuitui-member` 预设里：预设绑定到某个 member 会话时，
 * 在 agent 作用域内把全部全局工具屏蔽掉（`tools.restrict({ allow: [] })`），
 * 因此即使宿主基座（dsh-base）注册了 `working_directory` 这类全局工具，
 * member 会话的模型也看不到、调不到任何工具。
 *
 * 管理员会话不挂这个插件，保持完整能力。
 */

export const name = 'dsh-tuitui-member-guard';

export const inject = ['tools'];

export function apply(ctx) {
  // 空 allow 掩码 = 保留零个全局工具；作用域内注册的工具不受影响（预设里也没有）。
  ctx.effect(() => ctx.tools.restrict({ allow: [] }), 'dsh-tuitui: member 会话禁用全部工具');
}
