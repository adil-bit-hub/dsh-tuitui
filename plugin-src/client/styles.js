export const TUITUI_STYLE_ID = 'dsh-tuitui-settings';

const CSS = String.raw`
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

export function installTuituiStyles() {
  if (typeof document === 'undefined') return () => {};
  const existing = document.getElementById(TUITUI_STYLE_ID);
  if (existing) return () => {};
  const style = document.createElement('style');
  style.id = TUITUI_STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
  return () => {
    document.getElementById(TUITUI_STYLE_ID)?.remove();
  };
}
