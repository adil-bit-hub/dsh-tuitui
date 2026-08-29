/**
 * 推推机器人安全策略：管理员账号列表 + 非管理员能力开关。
 * 策略保存在插件配置存储中（~/.dsh/integrations/dsh-tuitui/config.json），
 * 可在 Harness 设置页实时修改，消息处理时逐条读取最新值。
 *
 * 能力说明：
 * - shell：执行 /shell 等 shell 级指令，永远仅限管理员；
 * - chat ：普通对话（转交 Harness agent），可配置是否向非管理员开放。
 */

/** 非管理员可配置的能力（shell 不在此列，始终仅管理员可用）。 */
export const NON_ADMIN_CAPABILITIES = Object.freeze(['chat']);

export const DEFAULT_SECURITY = Object.freeze({
  adminAccounts: Object.freeze([]),
  nonAdmin: Object.freeze({ chat: true }),
});

/** 归一化外部传入的安全策略，丢弃非法项；非法输入返回默认策略。 */
export function normalizeSecurity(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};

  const seen = new Set();
  const adminAccounts = [];
  for (const entry of Array.isArray(source.adminAccounts) ? source.adminAccounts : []) {
    if (typeof entry !== 'string') continue;
    const account = entry.trim();
    if (!account || account.length > 64 || /\s/.test(account) || seen.has(account)) continue;
    seen.add(account);
    adminAccounts.push(account);
  }

  const nonAdminSource = source.nonAdmin && typeof source.nonAdmin === 'object' && !Array.isArray(source.nonAdmin)
    ? source.nonAdmin
    : null;
  const nonAdmin = {};
  for (const capability of NON_ADMIN_CAPABILITIES) {
    nonAdmin[capability] = nonAdminSource === null
      ? DEFAULT_SECURITY.nonAdmin[capability]
      : nonAdminSource[capability] === true;
  }

  return { adminAccounts, nonAdmin };
}

/**
 * 判断发送人是否为管理员。优先按推推账号（user_account）精确匹配，
 * 配置里填 uid 时也能命中。
 */
export function isTuituiAdmin(security, { account, uid } = {}) {
  const admins = security?.adminAccounts ?? [];
  return admins.some((entry) => (account && entry === account) || (uid && entry === String(uid)));
}

/** 判断某身份是否允许使用某项能力。管理员放行一切；shell 对非管理员永远拒绝。 */
export function canUseCapability(security, capability, isAdmin) {
  if (isAdmin) return true;
  if (capability === 'shell') return false;
  return security?.nonAdmin?.[capability] === true;
}

/** 呈现于 Harness 会话消息中的角色标签：管理员为 manager，普通用户为 member。 */
export function senderRole(isAdmin) {
  return isAdmin ? 'manager' : 'member';
}

/** 组装发送人的展示名称：优先昵称，其次账号，最后 uid。 */
export function senderDisplayName({ senderName, senderId, senderUid } = {}) {
  const name = typeof senderName === 'string' ? senderName.trim() : '';
  const account = typeof senderId === 'string' ? senderId.trim() : '';
  if (name && account && name !== account) return `${name}（${account}）`;
  if (name) return name;
  if (account) return account;
  const uid = senderUid === undefined || senderUid === null ? '' : String(senderUid).trim();
  return uid || '未知用户';
}
