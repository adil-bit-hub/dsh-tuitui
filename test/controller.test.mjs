import assert from 'node:assert/strict';
import test from 'node:test';

import { TuituiBotController } from '../plugin-src/host/controller.mjs';
import { normalizeSecurity } from '../plugin-src/host/policy.mjs';

function makeController({ runtimes = [], connectedAt = new Date().toISOString(), lastEventAt = null } = {}) {
  const created = [];
  const config = {
    botId: '123456',
    appId: '123456',
    secretRef: 'DSH_TUITUI_BOT_SECRET_123456',
    name: 'eee',
    account: 'bot-test',
    enabled: true,
    createdAt: new Date().toISOString(),
  };
  const controller = new TuituiBotController({
    credentials: {
      async resolve() {
        return { value: 'a'.repeat(32) };
      },
      async set() {},
      async unset() {},
    },
    configStore: {
      list: () => [config],
      get: () => config,
      async save() {},
      async remove() {},
      getSecurity: () => normalizeSecurity({ adminAccounts: ['alice'] }),
      async setSecurity() {},
    },
    createRuntime: async () => {
      const runtime = {
        started: false,
        status: {
          ready: true,
          connectionState: 'connected',
          harnessReachable: true,
          lastConnectedAt: connectedAt,
          lastEventAt,
          startedAt: connectedAt,
          messagesReceived: 0,
        },
        async start() {
          this.started = true;
          return this.status;
        },
        async stop() {
          this.started = false;
        },
      };
      runtimes.push(runtime);
      created.push(runtime);
      return runtime;
    },
    logger: { info() {}, warn() {}, error() {}, debug() {} },
  });
  return { controller, created, config };
}

test('已连接但从未收到事件且超过空闲阈值时重建连接', async () => {
  const old = new Date(Date.now() - 60 * 60_000).toISOString();
  const { controller, created } = makeController({ connectedAt: old });
  await controller.initialize();
  assert.equal(created.length, 1);

  const rebuilt = await controller.refreshStaleConnections({ idleMs: 30 * 60_000 });
  assert.deepEqual(rebuilt, ['123456']);
  assert.equal(created.length, 2);
});

test('连接刚建立未超过阈值时不重建', async () => {
  const { controller, created } = makeController({ connectedAt: new Date().toISOString() });
  await controller.initialize();
  const rebuilt = await controller.refreshStaleConnections({ idleMs: 30 * 60_000 });
  assert.deepEqual(rebuilt, []);
  assert.equal(created.length, 1);
});

test('已经收到过事件的连接不会被当成僵死连接', async () => {
  const old = new Date(Date.now() - 60 * 60_000).toISOString();
  const { controller, created } = makeController({
    connectedAt: old,
    lastEventAt: new Date(Date.now() - 60_000).toISOString(),
  });
  await controller.initialize();
  const rebuilt = await controller.refreshStaleConnections({ idleMs: 30 * 60_000 });
  assert.deepEqual(rebuilt, []);
  assert.equal(created.length, 1);
});

test('disconnect 后运行时不再被视为已连接', async () => {
  const { controller, created } = makeController();
  await controller.initialize();
  assert.equal(controller.status().bots[0].connected, true);

  // 模拟 SDK 的 onDisconnected：运行时把 ready 置 false。
  created[0].status.ready = false;
  created[0].status.connectionState = 'disconnected';
  const status = controller.status();
  assert.equal(status.bots[0].connected, false);
  assert.notEqual(status.bots[0].state, 'connected');
});
