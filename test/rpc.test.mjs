import assert from 'node:assert/strict';
import test from 'node:test';

import { createTuituiRpcHandler, TUITUI_ENDPOINTS } from '../plugin-src/host/rpc.mjs';

function makeController(overrides = {}) {
  return {
    async status() {
      return {
        schemaVersion: 2,
        bots: [{
          botId: '123',
          bot: { appIdMasked: '12**23', secretRef: 'DSH_TUITUI_BOT_SECRET_123' },
          stats: { messagesReceived: 1, lastSenderRole: 'member' },
        }],
      };
    },
    async bind(payload) {
      return { bound: payload.appId };
    },
    async enableBot(botId) {
      return { enabled: botId };
    },
    async disableBot(botId) {
      return { disabled: botId };
    },
    async deleteBot(botId) {
      return { deleted: botId };
    },
    getSecurity() {
      return { adminAccounts: ['alice'], nonAdmin: { chat: true } };
    },
    async setSecurity(security) {
      return { security };
    },
    ...overrides,
  };
}

test('status 返回状态且剔除敏感字段', async () => {
  const handler = createTuituiRpcHandler(makeController());
  const result = await handler(TUITUI_ENDPOINTS.status, {});
  assert.equal(result.ok, true);
  const text = JSON.stringify(result.value);
  assert.doesNotMatch(text, /secretRef|appSecret/);
  assert.match(text, /12\*\*23/);
});

test('未知端点被拒绝', async () => {
  const handler = createTuituiRpcHandler(makeController());
  const result = await handler('bot.nope', {});
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'bad-request');
});

test('bot.bind 校验 App ID 与 App Secret', async () => {
  const handler = createTuituiRpcHandler(makeController());
  const badId = await handler(TUITUI_ENDPOINTS.bind, { appId: 'abc', appSecret: 'x'.repeat(16) });
  assert.equal(badId.ok, false);
  const shortSecret = await handler(TUITUI_ENDPOINTS.bind, { appId: '123456', appSecret: 'short' });
  assert.equal(shortSecret.ok, false);
  const extra = await handler(TUITUI_ENDPOINTS.bind, { appId: '123456', appSecret: 'x'.repeat(16), admin: true });
  assert.equal(extra.ok, false);
  const ok = await handler(TUITUI_ENDPOINTS.bind, { appId: '123456', appSecret: 'x'.repeat(16) });
  assert.equal(ok.ok, true);
});

test('bot.delete 需要 confirm=true', async () => {
  const handler = createTuituiRpcHandler(makeController());
  const missing = await handler(TUITUI_ENDPOINTS.deleteBot, { botId: '123' });
  assert.equal(missing.ok, false);
  const ok = await handler(TUITUI_ENDPOINTS.deleteBot, { botId: '123', confirm: true });
  assert.equal(ok.ok, true);
});

test('security.set 校验字段与类型', async () => {
  const handler = createTuituiRpcHandler(makeController());
  const bad = await handler(TUITUI_ENDPOINTS.setSecurity, { adminAccounts: 'alice', nonAdmin: { chat: true } });
  assert.equal(bad.ok, false);
  const ok = await handler(TUITUI_ENDPOINTS.setSecurity, {
    adminAccounts: ['alice'],
    nonAdmin: { chat: false },
  });
  assert.equal(ok.ok, true);
});

test('控制器抛错时返回结构化错误', async () => {
  const handler = createTuituiRpcHandler(makeController({
    async bind() {
      const error = new Error('推推凭据无效');
      error.code = 'invalid-credentials';
      throw error;
    },
  }));
  const result = await handler(TUITUI_ENDPOINTS.bind, { appId: '123456', appSecret: 'x'.repeat(16) });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'invalid-credentials');
});
