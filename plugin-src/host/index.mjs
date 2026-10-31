import { unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import { TuituiBotController } from './controller.mjs';
import { HarnessClient } from './harness-client.mjs';
import { DEFAULT_MEMBER_PRESET_ID, registerMemberPreset } from './preset.mjs';
import { installTuituiRpc } from './rpc.mjs';
import { TuituiRuntime } from './runtime.mjs';
import { TuituiConfigStore, TuituiStateStore } from './stores.mjs';

export const name = 'dsh-tuitui';
export const inject = ['connection', 'credentials', 'webServer', 'sessionController'];

const DEFAULT_RETRY_DELAYS_MS = Object.freeze([1_000, 3_000, 5_000, 10_000, 30_000]);

function pluginPaths(config) {
  const dshHome = resolve(config.dshHome ?? process.env.DSH_HOME ?? join(homedir(), '.dsh'));
  const root = resolve(config.dataDir ?? join(dshHome, 'integrations', 'dsh-tuitui'));
  return {
    config: resolve(config.configPath ?? join(root, 'config.json')),
    bots: resolve(config.botsDir ?? join(root, 'bots')),
  };
}

/** 轻量巡检：确保已启用的机器人保持连接，失败按退避重试。 */
function createSupervisor({ controller, logger, healthyIntervalMs = 15_000, retryDelaysMs, staleConnectionRefreshMs = 30 * 60_000 }) {
  const retryDelays = Array.isArray(retryDelaysMs) && retryDelaysMs.length > 0
    ? retryDelaysMs : [...DEFAULT_RETRY_DELAYS_MS];
  let closed = false;
  let timer = null;
  let running = null;
  let retryIndex = 0;

  const schedule = (delayMs) => {
    if (closed) return;
    timer = setTimeout(() => {
      timer = null;
      void run();
    }, delayMs);
    timer.unref?.();
  };

  async function run() {
    if (closed || running) return;
    const operation = reconcile();
    running = operation;
    try {
      await operation;
    } finally {
      if (running === operation) running = null;
    }
  }

  async function reconcile() {
    try {
      const status = await controller.initialize();
      if (closed) return;
      await controller.refreshStaleConnections({ idleMs: staleConnectionRefreshMs });
      if (closed) return;
      const { configured, connected, stopped } = status.totals;
      if (connected + stopped < configured) {
        const delay = retryDelays[Math.min(retryIndex, retryDelays.length - 1)];
        retryIndex += 1;
        logger.warn?.(`[dsh-tuitui] ${connected}/${configured} bots connected; retrying in ${delay}ms`);
        schedule(delay);
        return;
      }
      retryIndex = 0;
      schedule(healthyIntervalMs);
    } catch (error) {
      if (closed) return;
      const delay = retryDelays[Math.min(retryIndex, retryDelays.length - 1)];
      retryIndex += 1;
      logger.warn?.(`[dsh-tuitui] reconciliation failed; retrying in ${delay}ms:`, error?.message ?? error);
      schedule(delay);
    }
  }

  return {
    start() {
      schedule(0);
      return this;
    },
    async close() {
      if (closed) return;
      closed = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      await running?.catch(() => undefined);
    },
  };
}

export async function apply(ctx, config = {}) {
  if (!ctx?.credentials) throw new TypeError('dsh-tuitui 需要 ctx.credentials');
  if (!ctx?.webServer) throw new TypeError('dsh-tuitui 需要 ctx.webServer');

  const logger = typeof ctx.logger === 'function' ? ctx.logger('dsh-tuitui') : (ctx.logger ?? console);
  const paths = pluginPaths(config);
  const configStore = await new TuituiConfigStore(paths.config).load();
  const stateStores = new Map();
  const statePath = (botId) => resolve(paths.bots, botId, 'state.json');
  const stateFor = async (botId) => {
    let state = stateStores.get(botId);
    if (!state) {
      state = await new TuituiStateStore(statePath(botId)).load();
      stateStores.set(botId, state);
    }
    return state;
  };

  const workspacePath = resolve(config.workspace ?? process.cwd());
  const memberPresetId = config.memberAgentPreset ?? DEFAULT_MEMBER_PRESET_ID;
  const memberPreset = registerMemberPreset(ctx, {
    id: memberPresetId,
    name: config.memberPresetName,
    description: config.memberPresetDescription,
    logger,
  });
  const ensureMemberPreset = () => memberPreset.wait(config.memberPresetWaitMs ?? 15_000);

  const harness = new HarnessClient({
    sessionController: ctx.sessionController,
    workspace: workspacePath,
    agentPreset: config.agentPreset ?? 'standard',
    memberAgentPreset: memberPresetId,
    subscribeSessionEvents: (listener) => ctx.on('session/event', (session, event) => listener(session, event), { global: true }),
  });

  const controller = new TuituiBotController({
    credentials: ctx.credentials,
    configStore,
    logger,
    createRuntime: async ({ botId, config: botConfig, secret }) => new TuituiRuntime({
      config: botConfig,
      appSecret: secret,
      harness,
      state: await stateFor(botId),
      logger: {
        error: (...args) => logger.error?.(`[${botId}]`, ...args),
        warn: (...args) => logger.warn?.(`[${botId}]`, ...args),
        info: (...args) => logger.info?.(`[${botId}]`, ...args),
        debug: (...args) => logger.debug?.(`[${botId}]`, ...args),
      },
      replyTimeoutMs: config.replyTimeoutMs ?? 600_000,
      connectTimeoutMs: config.connectTimeoutMs ?? 30_000,
      getSecurity: () => configStore.getSecurity(),
      workspace: workspacePath,
      shellTimeoutMs: config.shellTimeoutMs ?? 120_000,
      adminPreset: config.agentPreset ?? 'standard',
      memberPreset: memberPresetId,
      ensureMemberPreset,
    }),
    deleteState: async ({ botId }) => {
      const state = stateStores.get(botId);
      stateStores.delete(botId);
      if (state && typeof state.remove === 'function') return state.remove();
      try {
        await unlink(statePath(botId));
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    },
  });

  const supervisor = createSupervisor({
    controller,
    logger,
    healthyIntervalMs: config.healthyIntervalMs,
    retryDelaysMs: config.retryDelaysMs,
    staleConnectionRefreshMs: config.staleConnectionRefreshMs ?? 30 * 60_000,
  }).start();

  const disposeRpc = installTuituiRpc(ctx, controller, logger);

  ctx.effect(() => async () => {
    await supervisor.close();
    await controller.close();
  }, 'dsh-tuitui: 停止推推机器人连接');

  return disposeRpc;
}
