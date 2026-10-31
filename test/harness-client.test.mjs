import assert from 'node:assert/strict';
import test from 'node:test';

import { HarnessClient, HarnessReplyTracker } from '../plugin-src/host/harness-client.mjs';

test('tracker 只在目标 turn 内收集 assistant 文本', () => {
  const tracker = new HarnessReplyTracker({ requestId: 'r-1' });
  // 上一轮的遗留事件
  assert.equal(tracker.consume({ seq: 0, type: 'assistant/message', data: { turn: 0, message: { content: [{ type: 'text', text: '旧回答' }] } } }), null);
  tracker.consume({ seq: 1, type: 'turn/start', data: { turn: 0 } });
  tracker.consume({ seq: 2, type: 'user/message', data: { source: { rpcId: 'other' } } });
  // 目标 turn
  assert.equal(tracker.consume({ seq: 3, type: 'turn/start', data: { turn: 1 } }), null);
  tracker.consume({ seq: 4, type: 'user/message', data: { source: { rpcId: 'r-1' } } });
  const update = tracker.consume({
    seq: 5,
    type: 'assistant/message',
    data: { turn: 1, message: { content: [{ type: 'reasoning', text: '思考' }, { type: 'text', text: '最终回答' }] } },
  });
  assert.deepEqual(update, { type: 'text', text: '最终回答' });
  assert.equal(tracker.consume({ seq: 6, type: 'tool/call', data: { turn: 1, name: 'pwsh' } }).type, 'tool');
  assert.equal(tracker.finished, false);
  assert.equal(tracker.consume({ seq: 7, type: 'turn/end', data: { turn: 1, reason: { kind: 'stop' } } }), null);
  assert.equal(tracker.finished, true);
  assert.equal(tracker.answer, '最终回答');
});

test('tracker 忽略重复序号与早于目标的 turn/end', () => {
  const tracker = new HarnessReplyTracker({ requestId: 'r-2' });
  tracker.consume({ seq: 10, type: 'turn/start', data: { turn: 3 } });
  tracker.consume({ seq: 11, type: 'user/message', data: { source: { rpcId: 'r-2' } } });
  tracker.consume({ seq: 12, type: 'turn/end', data: { turn: 2, reason: null } });
  assert.equal(tracker.finished, false);
  tracker.consume({ seq: 13, type: 'turn/end', data: { turn: 3, reason: null } });
  assert.equal(tracker.finished, true);
});

class FakeSessionController {
  prompts = [];
  createCalls = [];
  promptError = null;

  async create(request) {
    this.createCalls.push(request);
    return { sessionId: 'session-1', agentPreset: request.agentPreset };
  }

  async prompt(request) {
    if (this.promptError) throw this.promptError;
    this.prompts.push(request);
  }

  async projections() {
    return { asOfSeq: 0, values: {} };
  }
}

function makeClient({ controller = new FakeSessionController() } = {}) {
  const listeners = new Set();
  const client = new HarnessClient({
    sessionController: controller,
    workspace: 'D:/tmp/workspace',
    agentPreset: 'standard',
    memberAgentPreset: 'tuitui-member',
    subscribeSessionEvents: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
  const emit = (session, event) => {
    for (const listener of listeners) listener(session, event);
  };
  return { client, controller, emit, listeners };
}

const waitFor = async (predicate, timeoutMs = 5_000) => {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('waitFor timed out');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

test('ask 提交提问并在 turn/end 后返回最终文本', async () => {
  const { client, controller, emit } = makeClient();
  const pending = client.ask('session-1', '你好', { timeoutMs: 5_000 });
  await waitFor(() => controller.prompts.length === 1);

  const request = controller.prompts[0];
  assert.equal(request.sessionId, 'session-1');
  assert.equal(request.mode, 'queue');
  assert.equal(request.content[0].text, '你好');
  assert.ok(request.requestId);

  emit({ id: 'other' }, { seq: 1, type: 'turn/start', data: { turn: 1 } });
  emit({ id: 'session-1' }, { seq: 1, type: 'turn/start', data: { turn: 4 } });
  emit({ id: 'session-1' }, { seq: 2, type: 'user/message', data: { source: { rpcId: request.requestId } } });
  emit({ id: 'session-1' }, { seq: 3, type: 'assistant/message', data: { turn: 4, message: { content: [{ type: 'text', text: '你好，我是助手。' }] } } });
  emit({ id: 'session-1' }, { seq: 4, type: 'turn/end', data: { turn: 4, reason: { kind: 'stop' } } });

  assert.equal(await pending, '你好，我是助手。');
});

test('ask 在会话不存在时抛出 session-not-found 供上层重建', async () => {
  const controller = new FakeSessionController();
  const missing = Object.assign(new Error('session "x" not found'), { code: 'session/not-found' });
  controller.promptError = missing;
  const { client } = makeClient({ controller });
  await assert.rejects(client.ask('x', 'hi', { timeoutMs: 2_000 }), (error) => {
    assert.equal(error.code, 'session-not-found');
    assert.equal(error.name, 'HarnessSessionMissingError');
    return true;
  });
});

test('ask 在超时后报错', async () => {
  const { client, controller, emit } = makeClient();
  const pending = client.ask('session-1', '慢问题', { timeoutMs: 400 });
  await waitFor(() => controller.prompts.length === 1);
  emit({ id: 'session-1' }, { seq: 1, type: 'turn/start', data: { turn: 1 } });
  await assert.rejects(pending, /超时/);
});

test('ask 在 turn 结束但没有文本时报错并带上结束原因', async () => {
  const { client, controller, emit } = makeClient();
  const pending = client.ask('session-1', '空回答', { timeoutMs: 5_000 });
  await waitFor(() => controller.prompts.length === 1);
  const request = controller.prompts[0];
  emit({ id: 'session-1' }, { seq: 1, type: 'turn/start', data: { turn: 2 } });
  emit({ id: 'session-1' }, { seq: 2, type: 'user/message', data: { source: { rpcId: request.requestId } } });
  emit({ id: 'session-1' }, { seq: 3, type: 'turn/end', data: { turn: 2, reason: { kind: 'error' } } });
  await assert.rejects(pending, /没有返回文本/);
});

test('createSession 使用请求的预设，默认回落到管理员预设', async () => {
  const { client, controller } = makeClient();
  assert.equal(await client.createSession('tuitui-member'), 'session-1');
  assert.equal(controller.createCalls[0].agentPreset, 'tuitui-member');
  assert.equal(controller.createCalls[0].cwd, 'D:/tmp/workspace');
  await client.createSession();
  assert.equal(controller.createCalls[1].agentPreset, 'standard');
});
