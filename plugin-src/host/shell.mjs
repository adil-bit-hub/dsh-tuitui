import { exec } from 'node:child_process';

/** 回传给推推的输出长度上限，避免超出单条消息限制。 */
const MAX_OUTPUT_CHARS = 3_500;
const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_BUFFER_BYTES = 8 * 1024 * 1024;

function truncate(text) {
  if (text.length <= MAX_OUTPUT_CHARS) return text;
  const dropped = text.length - MAX_OUTPUT_CHARS;
  return `…（输出过长，已省略中间 ${dropped} 个字符）…\n${text.slice(-MAX_OUTPUT_CHARS)}`;
}

/**
 * 在会话工作区目录执行一条 shell 指令。
 *
 * 安全边界：本模块是有意保留的 shell 级能力，功能即执行管理员输入的完整命令，
 * 因此必须使用 shell 语义（exec）而非 argv 形式。调用方（bridge）已通过安全策略
 * 保证只有管理员账号列表内的推推用户才能触发本模块，非管理员请求会被直接拒绝。
 * Windows 下由 cmd.exe 承载，其他平台走 /bin/sh，与系统终端行为一致。
 * 返回 { ok, text }，text 为可直接发送的格式化结果。
 */
export function runShellCommand(command, { cwd, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const trimmed = typeof command === 'string' ? command.trim() : '';
  if (!trimmed) {
    return Promise.resolve({ ok: false, text: '用法：/shell <命令>' });
  }

  return new Promise((resolve) => {
    const startedAt = Date.now();
    exec(trimmed, {
      cwd,
      timeout: timeoutMs,
      maxBuffer: MAX_BUFFER_BYTES,
      windowsHide: true,
    }, (error, stdout, stderr) => {
      const elapsedMs = Date.now() - startedAt;
      const timedOut = Boolean(error?.killed) || error?.code === 'ERR_CHILD_PROCESS_TIMEOUT';
      const exitCode = error ? (typeof error.code === 'number' ? error.code : 1) : 0;

      const sections = [`$ ${trimmed}`];
      if (timedOut) sections.push(`[超时] 指令在 ${Math.round(timeoutMs / 1_000)} 秒内未完成，已强制终止。`);
      const out = String(stdout ?? '').trimEnd();
      const err = String(stderr ?? '').trimEnd();
      if (out) sections.push(out);
      if (err) sections.push(`[stderr]\n${err}`);
      if (!out && !err && !timedOut) sections.push('（无输出）');
      sections.push(`[退出码 ${exitCode} · 耗时 ${(elapsedMs / 1_000).toFixed(1)}s]`);

      resolve({
        ok: exitCode === 0 && !timedOut,
        text: truncate(sections.join('\n')),
      });
    });
  });
}
