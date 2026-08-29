window.__ModuleLoader__.load({
  id: "dsh-tuitui",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// plugin-src/client/index.js
var index_exports = {};
__export(index_exports, {
  TuituiSettingsTab: () => TuituiSettingsTab,
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(index_exports);
var React = __toESM(require("react"), 1);

// plugin-src/client/styles.js
var TUITUI_STYLE_ID = "dsh-tuitui-settings";
var CSS = String.raw`
.dtui-page {
  --dtui-blue: var(--dsw-alias-state-business-primary, #3370ff);
  --dtui-blue-soft: color-mix(in srgb, var(--dtui-blue) 9%, transparent);
  width: 100%;
  max-width: 860px;
  padding: 2px 0 30px;
  color: var(--dsw-alias-label-primary, #1f2329);
  box-sizing: border-box;
}
.dtui-page *, .dtui-page *::before, .dtui-page *::after { box-sizing: border-box; }
.dtui-title { margin: 0 0 8px; }
.dtui-title p { margin: 0; color: var(--dsw-alias-label-secondary, #646a73); font-size: 13px; line-height: 20px; }
.dtui-card { border: 1px solid var(--dsw-alias-border-l2, #e5e6eb); border-radius: 14px; background: var(--dsw-alias-bg-layer-1, #fff); box-shadow: 0 1px 2px rgb(31 35 41 / 3%); padding: 20px; margin-top: 16px; }
.dtui-formRow { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
.dtui-formRow label { font-size: 13px; font-weight: 560; color: var(--dsw-alias-label-primary, #1f2329); }
.dtui-formRow .dtui-hint { font-size: 12px; color: var(--dsw-alias-label-tertiary, #8f959e); }
.dtui-input { width: 100%; max-width: 420px; min-height: 36px; padding: 0 12px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 8px; font: inherit; font-size: 13px; color: inherit; background: var(--dsw-alias-bg-layer-1, #fff); outline: none; transition: border-color .15s ease, box-shadow .15s ease; }
.dtui-input:focus { border-color: var(--dtui-blue); box-shadow: 0 0 0 2px color-mix(in srgb, var(--dtui-blue) 18%, transparent); }
.dtui-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin-top: 4px; }
.dtui-btn { min-height: 34px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 0 14px; border-radius: 8px; font: inherit; font-size: 13px; font-weight: 560; cursor: pointer; transition: border-color .15s ease, background .15s ease, opacity .15s ease; border: 1px solid transparent; }
.dtui-btn:disabled { opacity: .55; cursor: not-allowed; }
.dtui-btnPrimary { border-color: var(--dtui-blue); background: var(--dtui-blue); color: #fff; }
.dtui-btnPrimary:hover:not(:disabled) { background: color-mix(in srgb, var(--dtui-blue) 88%, #000); }
.dtui-btnOutline { border-color: var(--dsw-alias-border-l2, #86909c); background: var(--dsw-alias-bg-layer-1, #fff); color: var(--dsw-alias-label-primary, #1f2329); }
.dtui-btnOutline:hover:not(:disabled) { border-color: #4e5969; background: var(--dsw-alias-interactive-bg-hover, #f7f8fa); }
.dtui-btnDanger { border-color: #f54a45; background: #fff; color: #f54a45; }
.dtui-btnDanger:hover:not(:disabled) { background: color-mix(in srgb, #f54a45 8%, #fff); }
.dtui-msg { margin-top: 12px; padding: 10px 12px; border-radius: 8px; font-size: 13px; line-height: 19px; white-space: pre-wrap; }
.dtui-msgError { background: color-mix(in srgb, #f54a45 8%, transparent); color: #d4380d; border: 1px solid color-mix(in srgb, #f54a45 26%, transparent); }
.dtui-msgInfo { background: var(--dtui-blue-soft); color: var(--dtui-blue); border: 1px solid color-mix(in srgb, var(--dtui-blue) 22%, transparent); }
.dtui-botHead { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.dtui-botName { display: flex; align-items: center; gap: 10px; min-width: 0; }
.dtui-botName strong { font-size: 15px; font-weight: 680; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dtui-botName .dtui-sub { font-size: 12px; color: var(--dsw-alias-label-tertiary, #8f959e); }
.dtui-badge { flex: none; display: inline-flex; align-items: center; gap: 6px; min-height: 24px; padding: 0 10px; border-radius: 999px; font-size: 12px; font-weight: 560; }
.dtui-badge::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
.dtui-badgeConnected { background: color-mix(in srgb, #34c759 12%, transparent); color: #1f9d4d; }
.dtui-badgeConnecting { background: color-mix(in srgb, #f7b500 14%, transparent); color: #b8860b; }
.dtui-badgeStopped { background: var(--dsw-alias-bg-module-platform, #f2f3f5); color: var(--dsw-alias-label-secondary, #646a73); }
.dtui-badgeOffline, .dtui-badgeError { background: color-mix(in srgb, #f54a45 10%, transparent); color: #d4380d; }
.dtui-meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-top: 16px; }
.dtui-metaItem { border: 1px solid var(--dsw-alias-border-l2, #eef0f3); border-radius: 10px; padding: 10px 12px; background: var(--dsw-alias-bg-layer-2, #fafbfc); }
.dtui-metaItem .k { font-size: 12px; color: var(--dsw-alias-label-tertiary, #8f959e); }
.dtui-metaItem .v { margin-top: 2px; font-size: 14px; font-weight: 620; }
.dtui-health { margin-top: 12px; font-size: 13px; color: var(--dsw-alias-label-secondary, #646a73); }
.dtui-empty { padding: 8px 0 2px; font-size: 13px; color: var(--dsw-alias-label-tertiary, #8f959e); }
.dtui-chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 2px 0 10px; }
.dtui-chip { display: inline-flex; align-items: center; gap: 6px; min-height: 26px; padding: 0 8px 0 12px; border-radius: 999px; font-size: 12.5px; font-weight: 560; background: var(--dtui-blue-soft); color: var(--dtui-blue); border: 1px solid color-mix(in srgb, var(--dtui-blue) 22%, transparent); }
.dtui-chipX { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; padding: 0; border: none; border-radius: 50%; background: transparent; color: inherit; font-size: 13px; line-height: 1; cursor: pointer; }
.dtui-chipX:hover { background: color-mix(in srgb, var(--dtui-blue) 16%, transparent); }
.dtui-chipInput { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.dtui-chipInput .dtui-input { flex: 1 1 240px; max-width: 360px; }
.dtui-check { display: flex; align-items: center; gap: 8px; margin: 6px 0; font-size: 13px; color: var(--dsw-alias-label-primary, #1f2329); cursor: pointer; }
.dtui-check input[type='checkbox'] { width: 16px; height: 16px; accent-color: var(--dtui-blue); cursor: pointer; }
.dtui-formRow .dtui-hint { display: block; margin-top: 4px; }
`;
function installTuituiStyles() {
  if (typeof document === "undefined") return () => {
  };
  const existing = document.getElementById(TUITUI_STYLE_ID);
  if (existing) return () => {
  };
  const style = document.createElement("style");
  style.id = TUITUI_STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
  return () => {
    document.getElementById(TUITUI_STYLE_ID)?.remove();
  };
}

// plugin-src/client/index.js
var h = React.createElement;
var name = "tuitui-settings";
var inject = ["slots", "connection"];
var RPC_CHANNEL = "/tuitui";
var POLL_INTERVAL_MS = 4e3;
var STATE_LABELS = Object.freeze({
  connected: "\u5DF2\u8FDE\u63A5",
  connecting: "\u8FDE\u63A5\u4E2D",
  stopped: "\u5DF2\u505C\u6B62",
  offline: "\u79BB\u7EBF",
  error: "\u8FDE\u63A5\u5F02\u5E38"
});
function formatTime(iso) {
  if (!iso) return "\u2014";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "\u2014" : date.toLocaleString();
}
function errorMessage(error) {
  return error?.message ?? error?.error?.message ?? (typeof error === "string" ? error : "\u64CD\u4F5C\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002");
}
function StateBadge({ state }) {
  return h(
    "span",
    { className: `dtui-badge dtui-badge${(state ?? "offline").replace(/^\w/, (c) => c.toUpperCase())}` },
    STATE_LABELS[state] ?? state
  );
}
function BotCard({ bot, busy, onEnable, onDisable, onDelete }) {
  const stats = bot.stats ?? {};
  const deleting = busy === `delete:${bot.botId}`;
  const [confirming, setConfirming] = React.useState(false);
  React.useEffect(() => {
    if (!confirming) return void 0;
    const timer = setTimeout(() => setConfirming(false), 4e3);
    return () => clearTimeout(timer);
  }, [confirming]);
  return h(
    "div",
    { className: "dtui-card" },
    h(
      "div",
      { className: "dtui-botHead" },
      h(
        "div",
        { className: "dtui-botName" },
        h("strong", null, bot.bot?.name ?? bot.botId),
        h(
          "span",
          { className: "dtui-sub" },
          `${bot.bot?.account ? `${bot.bot.account} \xB7 ` : ""}App ID ${bot.bot?.appIdMasked ?? bot.botId}`
        )
      ),
      h(StateBadge, { state: bot.state })
    ),
    h("p", { className: "dtui-health" }, bot.health?.summary ?? ""),
    bot.error?.message ? h("div", { className: "dtui-msg dtui-msgError" }, bot.error.message) : null,
    h(
      "div",
      { className: "dtui-meta" },
      h(
        "div",
        { className: "dtui-metaItem" },
        h("div", { className: "k" }, "\u5DF2\u63A5\u6536 / \u5DF2\u56DE\u590D"),
        h("div", { className: "v" }, `${stats.messagesReceived ?? 0} / ${stats.messagesReplied ?? 0}`)
      ),
      h(
        "div",
        { className: "dtui-metaItem" },
        h("div", { className: "k" }, "\u6700\u8FD1\u53D1\u8A00\u4EBA"),
        h("div", { className: "v" }, stats.lastSenderName ? `${stats.lastSenderName}${stats.lastSenderAccount && stats.lastSenderAccount !== stats.lastSenderName ? `\uFF08${stats.lastSenderAccount}\uFF09` : ""}` : "\u2014")
      ),
      h(
        "div",
        { className: "dtui-metaItem" },
        h("div", { className: "k" }, "\u6700\u8FD1\u6D88\u606F"),
        h("div", { className: "v" }, formatTime(stats.lastMessageAt))
      ),
      h(
        "div",
        { className: "dtui-metaItem" },
        h("div", { className: "k" }, "\u6700\u8FD1\u8FDE\u63A5"),
        h("div", { className: "v" }, formatTime(bot.health?.lastConnectedAt))
      )
    ),
    h(
      "div",
      { className: "dtui-actions" },
      bot.enabled ? h("button", {
        type: "button",
        className: "dtui-btn dtui-btnOutline",
        disabled: busy !== null,
        onClick: () => onDisable(bot.botId)
      }, busy === `disable:${bot.botId}` ? "\u505C\u6B62\u4E2D\u2026" : "\u505C\u6B62") : h("button", {
        type: "button",
        className: "dtui-btn dtui-btnPrimary",
        disabled: busy !== null,
        onClick: () => onEnable(bot.botId)
      }, busy === `enable:${bot.botId}` ? "\u542F\u7528\u4E2D\u2026" : "\u542F\u7528"),
      bot.enabled ? h("button", {
        type: "button",
        className: "dtui-btn dtui-btnOutline",
        disabled: busy !== null || bot.state === "connecting",
        onClick: () => onEnable(bot.botId)
      }, busy === `enable:${bot.botId}` ? "\u8FDE\u63A5\u4E2D\u2026" : "\u91CD\u65B0\u8FDE\u63A5") : null,
      h("button", {
        type: "button",
        className: "dtui-btn dtui-btnDanger",
        disabled: busy !== null,
        onClick: () => {
          if (!confirming) {
            setConfirming(true);
            return;
          }
          setConfirming(false);
          onDelete(bot.botId);
        }
      }, deleting ? "\u5220\u9664\u4E2D\u2026" : confirming ? "\u786E\u8BA4\u5220\u9664\uFF1F" : "\u5220\u9664")
    )
  );
}
function SecurityPanel({ security, busy, onSave }) {
  const savedAccounts = security?.adminAccounts ?? [];
  const savedNonAdmin = {
    chat: security?.nonAdmin?.chat ?? true
  };
  const [accounts, setAccounts] = React.useState(savedAccounts);
  const [draft, setDraft] = React.useState("");
  const [nonAdmin, setNonAdmin] = React.useState(savedNonAdmin);
  const saving = busy === "security";
  const addAccount = () => {
    const account = draft.trim();
    if (!account || /\s/.test(account)) return;
    if (!accounts.includes(account)) setAccounts([...accounts, account]);
    setDraft("");
  };
  const dirty = JSON.stringify({ adminAccounts: accounts, nonAdmin }) !== JSON.stringify({ adminAccounts: savedAccounts, nonAdmin: savedNonAdmin });
  return h(
    "div",
    { className: "dtui-card" },
    h(
      "div",
      { className: "dtui-botHead" },
      h(
        "div",
        { className: "dtui-botName" },
        h("strong", null, "\u5B89\u5168\u4E0E\u7BA1\u7406\u5458"),
        h("span", { className: "dtui-sub" }, "\u5728\u63A8\u63A8\u91CC\u53D1\u9001 /whoami \u53EF\u67E5\u770B\u81EA\u5DF1\u7684\u8D26\u53F7")
      )
    ),
    h(
      "p",
      { className: "dtui-health" },
      "/shell\u3001/exec\u3001/run \u7B49 shell \u7EA7\u6307\u4EE4\u4EC5\u9650\u7BA1\u7406\u5458\u4F7F\u7528\uFF1B\u5176\u4F59\u80FD\u529B\u53EF\u6309\u4E0B\u65B9\u5F00\u5173\u63A7\u5236\u662F\u5426\u5411\u975E\u7BA1\u7406\u5458\u5F00\u653E\u3002"
    ),
    h(
      "div",
      { className: "dtui-formRow" },
      h("label", null, "\u7BA1\u7406\u5458\u8D26\u53F7\u5217\u8868"),
      accounts.length > 0 ? h("div", { className: "dtui-chips" }, accounts.map((account) => h("span", {
        key: account,
        className: "dtui-chip"
      }, account, h("button", {
        type: "button",
        className: "dtui-chipX",
        "aria-label": `\u79FB\u9664 ${account}`,
        onClick: () => setAccounts(accounts.filter((item) => item !== account))
      }, "\xD7")))) : h("p", { className: "dtui-empty" }, "\u5C1A\u672A\u8BBE\u7F6E\u7BA1\u7406\u5458\uFF0C\u6240\u6709 shell \u7EA7\u6307\u4EE4\u90FD\u4F1A\u88AB\u62D2\u7EDD\u3002"),
      h(
        "div",
        { className: "dtui-chipInput" },
        h("input", {
          className: "dtui-input",
          value: draft,
          placeholder: "\u8F93\u5165\u63A8\u63A8\u8D26\u53F7\uFF08\u652F\u6301\u8D26\u53F7\u6216 UID\uFF09",
          autoComplete: "off",
          onChange: (event) => setDraft(event.target.value),
          onKeyDown: (event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addAccount();
            }
          }
        }),
        h("button", {
          type: "button",
          className: "dtui-btn dtui-btnOutline",
          disabled: !draft.trim() || /\s/.test(draft.trim()),
          onClick: addAccount
        }, "\u6DFB\u52A0")
      )
    ),
    h(
      "div",
      { className: "dtui-formRow" },
      h("label", null, "\u975E\u7BA1\u7406\u5458\u6743\u9650"),
      h(
        "label",
        { className: "dtui-check" },
        h("input", {
          type: "checkbox",
          checked: nonAdmin.chat,
          onChange: (event) => setNonAdmin({ ...nonAdmin, chat: event.target.checked })
        }),
        "\u5141\u8BB8\u666E\u901A\u5BF9\u8BDD\uFF08\u8F6C\u4EA4 Harness agent\uFF09"
      ),
      h("span", { className: "dtui-hint" }, "shell \u7EA7\u6307\u4EE4\u4E0D\u652F\u6301\u5411\u975E\u7BA1\u7406\u5458\u6388\u6743\uFF1B\u53D6\u6D88\u52FE\u9009\u540E\u975E\u7BA1\u7406\u5458\u5C06\u65E0\u6CD5\u4E0E\u673A\u5668\u4EBA\u5BF9\u8BDD\u3002")
    ),
    h(
      "div",
      { className: "dtui-actions" },
      h("button", {
        type: "button",
        className: "dtui-btn dtui-btnPrimary",
        disabled: busy !== null || !dirty,
        onClick: () => onSave({ adminAccounts: accounts, nonAdmin })
      }, saving ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58\u5B89\u5168\u8BBE\u7F6E")
    )
  );
}
function BindForm({ busy, onBind }) {
  const [appId, setAppId] = React.useState("");
  const [appSecret, setAppSecret] = React.useState("");
  const binding = busy === "bind";
  return h(
    "div",
    { className: "dtui-card" },
    h(
      "div",
      { className: "dtui-formRow" },
      h("label", { htmlFor: "dtui-appid" }, "App ID"),
      h("input", {
        id: "dtui-appid",
        className: "dtui-input",
        value: appId,
        placeholder: "\u63A8\u63A8\u5F00\u653E\u5E73\u53F0\u673A\u5668\u4EBA appid\uFF08\u7EAF\u6570\u5B57\uFF09",
        autoComplete: "off",
        onChange: (event) => setAppId(event.target.value.trim())
      })
    ),
    h(
      "div",
      { className: "dtui-formRow" },
      h("label", { htmlFor: "dtui-secret" }, "App Secret"),
      h("input", {
        id: "dtui-secret",
        className: "dtui-input",
        type: "password",
        value: appSecret,
        placeholder: "\u63A8\u63A8\u5F00\u653E\u5E73\u53F0\u673A\u5668\u4EBA secret",
        autoComplete: "new-password",
        onChange: (event) => setAppSecret(event.target.value)
      }),
      h("span", { className: "dtui-hint" }, "Secret \u53EA\u63D0\u4EA4\u7ED9\u672C\u673A Harness Host \u5E76\u5199\u5165\u53D7\u4FDD\u62A4\u7684\u51ED\u636E\u5B58\u50A8\uFF0C\u4E0D\u4F1A\u56DE\u4F20\u7ED9\u6D4F\u89C8\u5668\u3002")
    ),
    h(
      "div",
      { className: "dtui-actions" },
      h("button", {
        type: "button",
        className: "dtui-btn dtui-btnPrimary",
        disabled: binding || !appId || !appSecret,
        onClick: () => onBind(appId, appSecret)
      }, binding ? "\u6821\u9A8C\u5E76\u63A5\u5165\u4E2D\u2026" : "\u63A5\u5165\u673A\u5668\u4EBA")
    )
  );
}
function TuituiSettingsTab({ rpcCall }) {
  const [status, setStatus] = React.useState(null);
  const [loaded, setLoaded] = React.useState(false);
  const [busy, setBusy] = React.useState(null);
  const [notice, setNotice] = React.useState(null);
  const [adding, setAdding] = React.useState(false);
  const refresh = React.useCallback(async () => {
    try {
      const value = await rpcCall("connection.status", {});
      setStatus(value);
    } catch (error) {
      setNotice({ kind: "error", text: `\u65E0\u6CD5\u83B7\u53D6\u673A\u5668\u4EBA\u72B6\u6001\uFF1A${errorMessage(error)}` });
    } finally {
      setLoaded(true);
    }
  }, [rpcCall]);
  React.useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
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
      setNotice({ kind: "error", text: errorMessage(error) });
      await refresh();
      return false;
    } finally {
      setBusy(null);
    }
  }, [rpcCall, refresh]);
  const bots = status?.bots ?? [];
  const showForm = bots.length === 0 || adding;
  const handleBind = async (appId, appSecret) => {
    const ok = await run("bind", "bot.bind", { appId, appSecret });
    if (ok) {
      setAdding(false);
      setNotice({ kind: "info", text: "\u63A8\u63A8\u673A\u5668\u4EBA\u5DF2\u63A5\u5165\u3002\u73B0\u5728\u53EF\u4EE5\u76F4\u63A5\u5728\u63A8\u63A8\u91CC\u7ED9\u673A\u5668\u4EBA\u53D1\u6D88\u606F\u4E86\u3002" });
    }
  };
  const handleEnable = (botId) => run(`enable:${botId}`, "bot.enable", { botId });
  const handleDisable = (botId) => run(`disable:${botId}`, "bot.disable", { botId });
  const handleDelete = async (botId) => {
    const ok = await run(`delete:${botId}`, "bot.delete", { botId, confirm: true });
    if (ok) setNotice({ kind: "info", text: "\u63A8\u63A8\u673A\u5668\u4EBA\u5DF2\u5220\u9664\uFF0C\u51ED\u636E\u4E0E\u4F1A\u8BDD\u72B6\u6001\u5DF2\u6E05\u7406\u3002" });
  };
  const handleSaveSecurity = async (securityPayload) => {
    const ok = await run("security", "security.set", securityPayload);
    if (ok) setNotice({ kind: "info", text: "\u5B89\u5168\u8BBE\u7F6E\u5DF2\u66F4\u65B0\uFF0C\u5BF9\u540E\u7EED\u63A8\u63A8\u6D88\u606F\u7ACB\u5373\u751F\u6548\u3002" });
  };
  return h(
    "section",
    { className: "dtui-page", "aria-label": "\u63A8\u63A8\u673A\u5668\u4EBA\u8BBE\u7F6E" },
    h(
      "header",
      { className: "dtui-title" },
      h("p", null, "\u628A 360 \u63A8\u63A8\u673A\u5668\u4EBA\u63A5\u5165 DeepSeek Harness\uFF1A\u79C1\u804A\u76F4\u63A5\u56DE\u590D\uFF0C\u7FA4\u804A\u5728 @\u673A\u5668\u4EBA \u540E\u56DE\u590D\uFF1B\u56DE\u7B54\u7531 Harness agent \u751F\u6210\uFF0C\u6A21\u578B\u4E0E\u5DE5\u5177\u8DDF\u968F Harness \u914D\u7F6E\u3002\u53D1\u9001 /new \u53EF\u5F00\u542F\u65B0\u4F1A\u8BDD\uFF1B/shell \u7B49\u7BA1\u7406\u5458\u6307\u4EE4\u4EC5\u9650\u7BA1\u7406\u5458\u8D26\u53F7\u5217\u8868\u5185\u7684\u7528\u6237\u4F7F\u7528\u3002")
    ),
    !loaded ? h("div", { className: "dtui-card dtui-empty" }, "\u6B63\u5728\u52A0\u8F7D\u673A\u5668\u4EBA\u72B6\u6001\u2026") : null,
    bots.map((bot) => h(BotCard, {
      key: bot.botId,
      bot,
      busy,
      onEnable: handleEnable,
      onDisable: handleDisable,
      onDelete: handleDelete
    })),
    loaded && status ? h(SecurityPanel, {
      key: JSON.stringify(status.security ?? {}),
      security: status.security,
      busy,
      onSave: handleSaveSecurity
    }) : null,
    showForm ? h(BindForm, { busy, onBind: handleBind }) : h(
      "div",
      { className: "dtui-actions", style: { marginTop: 16 } },
      h("button", {
        type: "button",
        className: "dtui-btn dtui-btnOutline",
        disabled: busy !== null,
        onClick: () => setAdding(true)
      }, "\u63A5\u5165\u53E6\u4E00\u4E2A\u673A\u5668\u4EBA")
    ),
    adding && bots.length > 0 ? h(
      "div",
      { className: "dtui-actions", style: { marginTop: 8 } },
      h("button", {
        type: "button",
        className: "dtui-btn dtui-btnOutline",
        disabled: busy !== null,
        onClick: () => setAdding(false)
      }, "\u53D6\u6D88")
    ) : null,
    notice ? h("div", {
      className: notice.kind === "error" ? "dtui-msg dtui-msgError" : "dtui-msg dtui-msgInfo"
    }, notice.text) : null
  );
}
function apply(ctx) {
  ctx.effect(() => installTuituiStyles(), "tuitui-settings: install styles");
  const rpcCall = (endpoint, payload, signal) => ctx.connection.rpc.call(RPC_CHANNEL, endpoint, payload, signal);
  ctx.slots.inject("settings.plugins.tab", () => ctx.slots.register({
    name: "settings.plugins.tab",
    id: "tuitui",
    order: 25,
    label: "\u63A8\u63A8\u673A\u5668\u4EBA",
    inject: () => ({ rpcCall })
  }, TuituiSettingsTab));
}

    return module.exports;
  }
});
