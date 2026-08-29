import * as React from 'react';

import { installTuituiStyles } from './styles.js';

const h = React.createElement;

export const name = 'tuitui-settings';
export const inject = ['slots', 'connection'];

const RPC_CHANNEL = '/tuitui';
const POLL_INTERVAL_MS = 4_000;

const STATE_LABELS = Object.freeze({
  connected: '已连接',
  connecting: '连接中',
  stopped: '已停止',
  offline: '离线',
  error: '连接异常',
});

function formatTime(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function errorMessage(error) {
  return error?.message ?? error?.error?.message ?? (typeof error === 'string' ? error : '操作失败，请稍后重试。');
}

function StateBadge({ state }) {
  return h('span', { className: `dtui-badge dtui-badge${(state ?? 'offline').replace(/^\w/, (c) => c.toUpperCase())}` },
    STATE_LABELS[state] ?? state);
}

function BotCard({ bot, busy, onEnable, onDisable, onDelete }) {
  const stats = bot.stats ?? {};
  const deleting = busy === `delete:${bot.botId}`;
  const [confirming, setConfirming] = React.useState(false);
  React.useEffect(() => {
    if (!confirming) return undefined;
    const timer = setTimeout(() => setConfirming(false), 4_000);
    return () => clearTimeout(timer);
  }, [confirming]);

  return h('div', { className: 'dtui-card' },
    h('div', { className: 'dtui-botHead' },
      h('div', { className: 'dtui-botName' },
        h('strong', null, bot.bot?.name ?? bot.botId),
        h('span', { className: 'dtui-sub' },
          `${bot.bot?.account ? `${bot.bot.account} · ` : ''}App ID ${bot.bot?.appIdMasked ?? bot.botId}`)),
      h(StateBadge, { state: bot.state })),
    h('p', { className: 'dtui-health' }, bot.health?.summary ?? ''),
    bot.error?.message ? h('div', { className: 'dtui-msg dtui-msgError' }, bot.error.message) : null,
    h('div', { className: 'dtui-meta' },
      h('div', { className: 'dtui-metaItem' },
        h('div', { className: 'k' }, '已接收 / 已回复'),
        h('div', { className: 'v' }, `${stats.messagesReceived ?? 0} / ${stats.messagesReplied ?? 0}`)),
      h('div', { className: 'dtui-metaItem' },
        h('div', { className: 'k' }, '最近发言人'),
        h('div', { className: 'v' }, stats.lastSenderName
          ? `${stats.lastSenderName}${stats.lastSenderAccount && stats.lastSenderAccount !== stats.lastSenderName
            ? `（${stats.lastSenderAccount}）` : ''}`
          : '—')),
      h('div', { className: 'dtui-metaItem' },
        h('div', { className: 'k' }, '最近消息'),
        h('div', { className: 'v' }, formatTime(stats.lastMessageAt))),
      h('div', { className: 'dtui-metaItem' },
        h('div', { className: 'k' }, '最近连接'),
        h('div', { className: 'v' }, formatTime(bot.health?.lastConnectedAt)))),
    h('div', { className: 'dtui-actions' },
      bot.enabled
        ? h('button', {
          type: 'button',
          className: 'dtui-btn dtui-btnOutline',
          disabled: busy !== null,
          onClick: () => onDisable(bot.botId),
        }, busy === `disable:${bot.botId}` ? '停止中…' : '停止')
        : h('button', {
          type: 'button',
          className: 'dtui-btn dtui-btnPrimary',
          disabled: busy !== null,
          onClick: () => onEnable(bot.botId),
        }, busy === `enable:${bot.botId}` ? '启用中…' : '启用'),
      bot.enabled ? h('button', {
        type: 'button',
        className: 'dtui-btn dtui-btnOutline',
        disabled: busy !== null || bot.state === 'connecting',
        onClick: () => onEnable(bot.botId),
      }, busy === `enable:${bot.botId}` ? '连接中…' : '重新连接') : null,
      h('button', {
        type: 'button',
        className: 'dtui-btn dtui-btnDanger',
        disabled: busy !== null,
        onClick: () => {
          if (!confirming) {
            setConfirming(true);
            return;
          }
          setConfirming(false);
          onDelete(bot.botId);
        },
      }, deleting ? '删除中…' : confirming ? '确认删除？' : '删除')));
}

function SecurityPanel({ security, busy, onSave }) {
  const savedAccounts = security?.adminAccounts ?? [];
  const savedNonAdmin = {
    chat: security?.nonAdmin?.chat ?? true,
  };
  const [accounts, setAccounts] = React.useState(savedAccounts);
  const [draft, setDraft] = React.useState('');
  const [nonAdmin, setNonAdmin] = React.useState(savedNonAdmin);
  const saving = busy === 'security';

  const addAccount = () => {
    const account = draft.trim();
    if (!account || /\s/.test(account)) return;
    if (!accounts.includes(account)) setAccounts([...accounts, account]);
    setDraft('');
  };

  const dirty = JSON.stringify({ adminAccounts: accounts, nonAdmin })
    !== JSON.stringify({ adminAccounts: savedAccounts, nonAdmin: savedNonAdmin });

  return h('div', { className: 'dtui-card' },
    h('div', { className: 'dtui-botHead' },
      h('div', { className: 'dtui-botName' },
        h('strong', null, '安全与管理员'),
        h('span', { className: 'dtui-sub' }, '在推推里发送 /whoami 可查看自己的账号'))),
    h('p', { className: 'dtui-health' },
      '/shell、/exec、/run 等 shell 级指令仅限管理员使用；其余能力可按下方开关控制是否向非管理员开放。'),
    h('div', { className: 'dtui-formRow' },
      h('label', null, '管理员账号列表'),
      accounts.length > 0
        ? h('div', { className: 'dtui-chips' }, accounts.map((account) => h('span', {
          key: account,
          className: 'dtui-chip',
        }, account, h('button', {
          type: 'button',
          className: 'dtui-chipX',
          'aria-label': `移除 ${account}`,
          onClick: () => setAccounts(accounts.filter((item) => item !== account)),
        }, '×'))))
        : h('p', { className: 'dtui-empty' }, '尚未设置管理员，所有 shell 级指令都会被拒绝。'),
      h('div', { className: 'dtui-chipInput' },
        h('input', {
          className: 'dtui-input',
          value: draft,
          placeholder: '输入推推账号（支持账号或 UID）',
          autoComplete: 'off',
          onChange: (event) => setDraft(event.target.value),
          onKeyDown: (event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              addAccount();
            }
          },
        }),
        h('button', {
          type: 'button',
          className: 'dtui-btn dtui-btnOutline',
          disabled: !draft.trim() || /\s/.test(draft.trim()),
          onClick: addAccount,
        }, '添加'))),
    h('div', { className: 'dtui-formRow' },
      h('label', null, '非管理员权限'),
      h('label', { className: 'dtui-check' },
        h('input', {
          type: 'checkbox',
          checked: nonAdmin.chat,
          onChange: (event) => setNonAdmin({ ...nonAdmin, chat: event.target.checked }),
        }),
        '允许普通对话（转交 Harness agent）'),
      h('span', { className: 'dtui-hint' }, 'shell 级指令不支持向非管理员授权；取消勾选后非管理员将无法与机器人对话。')),
    h('div', { className: 'dtui-actions' },
      h('button', {
        type: 'button',
        className: 'dtui-btn dtui-btnPrimary',
        disabled: busy !== null || !dirty,
        onClick: () => onSave({ adminAccounts: accounts, nonAdmin }),
      }, saving ? '保存中…' : '保存安全设置')));
}

function BindForm({ busy, onBind }) {
  const [appId, setAppId] = React.useState('');
  const [appSecret, setAppSecret] = React.useState('');
  const binding = busy === 'bind';
  return h('div', { className: 'dtui-card' },
    h('div', { className: 'dtui-formRow' },
      h('label', { htmlFor: 'dtui-appid' }, 'App ID'),
      h('input', {
        id: 'dtui-appid',
        className: 'dtui-input',
        value: appId,
        placeholder: '推推开放平台机器人 appid（纯数字）',
        autoComplete: 'off',
        onChange: (event) => setAppId(event.target.value.trim()),
      })),
    h('div', { className: 'dtui-formRow' },
      h('label', { htmlFor: 'dtui-secret' }, 'App Secret'),
      h('input', {
        id: 'dtui-secret',
        className: 'dtui-input',
        type: 'password',
        value: appSecret,
        placeholder: '推推开放平台机器人 secret',
        autoComplete: 'new-password',
        onChange: (event) => setAppSecret(event.target.value),
      }),
      h('span', { className: 'dtui-hint' }, 'Secret 只提交给本机 Harness Host 并写入受保护的凭据存储，不会回传给浏览器。')),
    h('div', { className: 'dtui-actions' },
      h('button', {
        type: 'button',
        className: 'dtui-btn dtui-btnPrimary',
        disabled: binding || !appId || !appSecret,
        onClick: () => onBind(appId, appSecret),
      }, binding ? '校验并接入中…' : '接入机器人')));
}

export function TuituiSettingsTab({ rpcCall }) {
  const [status, setStatus] = React.useState(null);
  const [loaded, setLoaded] = React.useState(false);
  const [busy, setBusy] = React.useState(null);
  const [notice, setNotice] = React.useState(null);
  const [adding, setAdding] = React.useState(false);

  const refresh = React.useCallback(async () => {
    try {
      const value = await rpcCall('connection.status', {});
      setStatus(value);
    } catch (error) {
      setNotice({ kind: 'error', text: `无法获取机器人状态：${errorMessage(error)}` });
    } finally {
      setLoaded(true);
    }
  }, [rpcCall]);

  React.useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const run = React.useCallback(async (action, endpoint, payload) => {
    setBusy(action);
    setNotice(null);
    try {
      const value = await rpcCall(endpoint, payload);
      setStatus(value);
      return true;
    } catch (error) {
      setNotice({ kind: 'error', text: errorMessage(error) });
      await refresh();
      return false;
    } finally {
      setBusy(null);
    }
  }, [rpcCall, refresh]);

  const bots = status?.bots ?? [];
  const showForm = bots.length === 0 || adding;

  const handleBind = async (appId, appSecret) => {
    const ok = await run('bind', 'bot.bind', { appId, appSecret });
    if (ok) {
      setAdding(false);
      setNotice({ kind: 'info', text: '推推机器人已接入。现在可以直接在推推里给机器人发消息了。' });
    }
  };
  const handleEnable = (botId) => run(`enable:${botId}`, 'bot.enable', { botId });
  const handleDisable = (botId) => run(`disable:${botId}`, 'bot.disable', { botId });
  const handleDelete = async (botId) => {
    const ok = await run(`delete:${botId}`, 'bot.delete', { botId, confirm: true });
    if (ok) setNotice({ kind: 'info', text: '推推机器人已删除，凭据与会话状态已清理。' });
  };
  const handleSaveSecurity = async (securityPayload) => {
    const ok = await run('security', 'security.set', securityPayload);
    if (ok) setNotice({ kind: 'info', text: '安全设置已更新，对后续推推消息立即生效。' });
  };

  return h('section', { className: 'dtui-page', 'aria-label': '推推机器人设置' },
    h('header', { className: 'dtui-title' },
      h('p', null, '把 360 推推机器人接入 DeepSeek Harness：私聊直接回复，群聊在 @机器人 后回复；回答由 Harness agent 生成，模型与工具跟随 Harness 配置。发送 /new 可开启新会话；/shell 等管理员指令仅限管理员账号列表内的用户使用。')),
    !loaded ? h('div', { className: 'dtui-card dtui-empty' }, '正在加载机器人状态…') : null,
    bots.map((bot) => h(BotCard, {
      key: bot.botId,
      bot,
      busy,
      onEnable: handleEnable,
      onDisable: handleDisable,
      onDelete: handleDelete,
    })),
    loaded && status ? h(SecurityPanel, {
      key: JSON.stringify(status.security ?? {}),
      security: status.security,
      busy,
      onSave: handleSaveSecurity,
    }) : null,
    showForm
      ? h(BindForm, { busy, onBind: handleBind })
      : h('div', { className: 'dtui-actions', style: { marginTop: 16 } },
        h('button', {
          type: 'button',
          className: 'dtui-btn dtui-btnOutline',
          disabled: busy !== null,
          onClick: () => setAdding(true),
        }, '接入另一个机器人')),
    adding && bots.length > 0 ? h('div', { className: 'dtui-actions', style: { marginTop: 8 } },
      h('button', {
        type: 'button',
        className: 'dtui-btn dtui-btnOutline',
        disabled: busy !== null,
        onClick: () => setAdding(false),
      }, '取消')) : null,
    notice ? h('div', {
      className: notice.kind === 'error' ? 'dtui-msg dtui-msgError' : 'dtui-msg dtui-msgInfo',
    }, notice.text) : null);
}

export function apply(ctx) {
  ctx.effect(() => installTuituiStyles(), 'tuitui-settings: install styles');

  const rpcCall = (endpoint, payload, signal) =>
    ctx.connection.rpc.call(RPC_CHANNEL, endpoint, payload, signal);

  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab',
    id: 'tuitui',
    order: 25,
    label: '推推机器人',
    inject: () => ({ rpcCall }),
  }, TuituiSettingsTab));
}
