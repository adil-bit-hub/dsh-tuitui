import assert from 'node:assert/strict';
import test from 'node:test';

import { TuituiHarnessBridge } from '../plugin-src/host/bridge.mjs';
import { normalizeSecurity } from '../plugin-src/host/policy.mjs';

class FakeState {
  sessions = new Map();
  seen = new Set();

  hasSeen(id) {
    return this.seen.has(id);
  }

  markSeen(id) {
    this.seen.add(id);
  }

  sessionFor(key) {
    return this.sessions.get(key) ?? null;
  }

  setSession(key, id) {
    this.sessions.set(key, id);
  }

  clearSession(key) {
    this.sessions.delete(key);
  }

  clearSessions(keys) {
    for (const key of keys) this.sessions.delete(key);
  }
}

class FakeHarness {
  created = [];
  prompts = [];
  existing = new Set();
  agentPreset = 'standard';
  memberAgentPreset = 'tuitui-member';
  promptError = null;

  async createSession(preset) {
    const id = `session-${this.created.length + 1}`;
    this.created.push({ id, preset });
    this.existing.add(id);
    return id;
  }

  async sessionExists(id) {
    return this.existing.has(id);
  }

  async ask(sessionId, text) {
    if (this.promptError) throw this.promptError;
    this.prompts.push({ sessionId, text });
    return '这是回答。';
  }
}

class FakeBot {
  sent = [];

  async sendText(target, text) {
    this.sent.push({ target, text });
  }
}

function makeBridge({ security = normalizeSecurity(undefined), memberReady = true, harness = new FakeHarness() } = {}) {
  const bot = new FakeBot();
  const state = new FakeState();
  const bridge = new TuituiHarnessBridge({
    bot,
    harness,
    state,
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    getSecurity: () => security,
    workspace: process.cwd(),
    adminPreset: 'standard',
    memberPreset: 'tuitui-member',
    ensureMemberPreset: async () => memberReady,
  });
  return { bridge, bot, state, harness };
}

let counter = 0;
function message(overrides = {}) {
  counter += 1;
  return {
    messageId: `m-${counter}`,
    conversationId: 'cid-1',
    kind: 'direct',
    senderId: 'alice',
    senderUid: 1001,
    senderName: 'Alice',
    senderIsBot: false,
    addressed: true,
    content: '你好',
    replyTarget: { kind: 'account', account: 'alice' },
    ...overrides,
  };
}

test('管理员使用完整预设，提问标记为 manager', async () => {
  const { bridge, bot, harness } = makeBridge({ security: normalizeSecurity({ adminAccounts: ['alice'] }) });
  await bridge.accept(message());
  assert.deepEqual(harness.created, [{ id: 'session-1', preset: 'standard' }]);
  assert.match(harness.prompts[0].text, /^alice\(manager\)：你好$/);
  assert.equal(bot.sent.at(-1).text, '这是回答。');
});

test('非管理员使用受限预设，提问标记为 member', async () => {
  const { bridge, bot, harness } = makeBridge({ security: normalizeSecurity({ adminAccounts: ['boss'] }) });
  await bridge.accept(message());
  assert.deepEqual(harness.created, [{ id: 'session-1', preset: 'tuitui-member' }]);
  assert.match(harness.prompts[0].text, /^alice\(member\)：你好$/);
  assert.equal(bot.sent.at(-1).text, '这是回答。');
});

test('同一会话里管理员与成员各自独立上下文', async () => {
  const { bridge, harness } = makeBridge({ security: normalizeSecurity({ adminAccounts: ['alice'] }) });
  await bridge.accept(message({ senderId: 'alice' }));
  await bridge.accept(message({ senderId: 'bob', senderUid: 2002, senderName: 'Bob' }));
  assert.equal(harness.created.length, 2);
  assert.equal(harness.created[0].preset, 'standard');
  assert.equal(harness.created[1].preset, 'tuitui-member');
});

test('成员请求 /shell 被拒绝，且不会创建会话', async () => {
  const { bridge, bot, harness } = makeBridge();
  await bridge.accept(message({ content: '/shell dir' }));
  assert.equal(harness.created.length, 0);
  assert.match(bot.sent.at(-1).text, /管理员专属指令/);
});

test('管理员可以执行 /shell', async () => {
  const { bridge, bot, harness } = makeBridge({ security: normalizeSecurity({ adminAccounts: ['alice'] }) });
  await bridge.accept(message({ content: '/shell echo tuitui-ok' }));
  assert.equal(harness.created.length, 0);
  assert.match(bot.sent[0].text, /正在执行 shell 指令/);
  assert.match(bot.sent.at(-1).text, /tuitui-ok/);
});

test('成员问答开关关闭时拒绝并说明原因', async () => {
  const { bridge, bot, harness } = makeBridge({
    security: normalizeSecurity({ adminAccounts: [], nonAdmin: { chat: false } }),
  });
  await bridge.accept(message());
  assert.equal(harness.created.length, 0);
  assert.match(bot.sent.at(-1).text, /仅向管理员开放/);
});

test('受限预设未就绪时成员被拒绝，绝不回退到管理员预设', async () => {
  const { bridge, bot, harness } = makeBridge({ memberReady: false });
  await bridge.accept(message());
  assert.equal(harness.created.length, 0);
  assert.match(bot.sent.at(-1).text, /成员问答模式尚未就绪/);
});

test('/whoami 区分管理员与成员角色', async () => {
  const admin = makeBridge({ security: normalizeSecurity({ adminAccounts: ['alice'] }) });
  await admin.bridge.accept(message({ content: '/whoami' }));
  assert.match(admin.bot.sent.at(-1).text, /管理员（manager）/);

  const member = makeBridge();
  await member.bridge.accept(message({ content: '/whoami' }));
  assert.match(member.bot.sent.at(-1).text, /成员（member，仅问答）/);
});

test('/new 同时清理管理员与成员的会话映射', async () => {
  const { bridge, state, harness } = makeBridge({ security: normalizeSecurity({ adminAccounts: ['alice'] }) });
  await bridge.accept(message({ senderId: 'alice' }));
  await bridge.accept(message({ senderId: 'bob', senderUid: 2002, senderName: 'Bob' }));
  assert.equal(state.sessions.size, 2);

  await bridge.accept(message({ senderId: 'alice', content: '/new' }));
  assert.equal(state.sessions.size, 0);

  await bridge.accept(message({ senderId: 'alice', content: '再来一次' }));
  assert.equal(harness.created.length, 3);
});

test('会话已失效时自动重建一次', async () => {
  const { bridge, harness } = makeBridge();
  await bridge.accept(message());
  const stale = harness.created[0].id;

  harness.ask = async (sessionId) => {
    if (sessionId === stale) {
      const error = new Error('session gone');
      error.code = 'session-not-found';
      throw error;
    }
    harness.prompts.push({ sessionId });
    return '重建后的回答。';
  };

  await bridge.accept(message({ content: '继续' }));
  assert.equal(harness.created.length, 2);
  assert.notEqual(harness.created[1].id, stale);
  assert.equal(harness.prompts.at(-1).sessionId, harness.created[1].id);
});

test('群聊未 @机器人 时不回复', async () => {
  const { bridge, bot, harness } = makeBridge();
  await bridge.accept(message({ kind: 'group', addressed: false }));
  assert.equal(bot.sent.length, 0);
  assert.equal(harness.created.length, 0);
});

test('机器人自己发的消息被忽略', async () => {
  const { bridge, bot, harness } = makeBridge();
  await bridge.accept(message({ senderIsBot: true }));
  assert.equal(bot.sent.length, 0);
  assert.equal(harness.created.length, 0);
});
