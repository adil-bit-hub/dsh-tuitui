import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatApproval,
  formatQuestion,
  parseReply,
  TuituiQuestionRelay,
} from '../plugin-src/host/questions.mjs';

const logger = { info() {}, warn() {}, error() {}, debug() {} };

function makeRelay(options = {}) {
  return new TuituiQuestionRelay({ logger, timeoutMs: 5_000, ...options });
}

function makeBinding(sent, overrides = {}) {
  return {
    conversationKey: 'direct:c1',
    senderId: 'alice',
    label: 'Alice',
    send: async (text) => {
      sent.push(text);
    },
    ...overrides,
  };
}

function questionRequest(questions, { sessionId = 's1', signal } = {}) {
  return {
    agent: { id: 'agent-1', session: { id: sessionId } },
    questions,
    signal: signal ?? new AbortController().signal,
  };
}

const waitFor = async (predicate, timeoutMs = 2_000) => {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('waitFor timed out');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

test('formatQuestion 列出标题、选项与作答提示', () => {
  const text = formatQuestion({
    id: 'q1',
    header: '确认',
    question: '要删除这些文件吗？',
    options: [{ label: '是', description: '删除三个文件' }, { label: '否' }],
  }, { index: 1, total: 2 });
  assert.match(text, /需要你确认（1\/2）【确认】/);
  assert.match(text, /要删除这些文件吗？/);
  assert.match(text, /1\. 是（删除三个文件）/);
  assert.match(text, /2\. 否/);
  assert.match(text, /回复序号或选项文字/);
  assert.match(text, /回复 0 表示跳过/);
  assert.match(text, /多选用逗号分隔|回复序号/);
});

test('formatApproval 给出「允许一次 / 拒绝」两个选项', () => {
  const text = formatApproval({ toolName: 'bash', reason: '需要写入工作区' });
  assert.match(text, /需要你授权/);
  assert.match(text, /工具：bash/);
  assert.match(text, /原因：需要写入工作区/);
  assert.match(text, /1\. 允许一次/);
  assert.match(text, /2\. 拒绝/);
});

test('parseReply 支持序号、多选、选项文字、自定义与跳过', () => {
  const single = { options: [{ label: '允许' }, { label: '拒绝' }] };
  assert.deepEqual(parseReply('1', single), { selected: ['允许'] });
  assert.deepEqual(parseReply('拒绝', single), { selected: ['拒绝'] });
  assert.deepEqual(parseReply('我看还是先别动', single), {
    selected: [],
    custom: '我看还是先别动',
  });
  assert.deepEqual(parseReply('0', single), { selected: [] });
  assert.deepEqual(parseReply('跳过', single), { selected: [] });

  const multi = { options: [{ label: 'A' }, { label: 'B' }, { label: 'C' }], multiSelect: true };
  assert.deepEqual(parseReply('1,3', multi), { selected: ['A', 'C'] });
  assert.deepEqual(parseReply('1 2', multi), { selected: ['A', 'B'] });
});

test('中转把问题发到推推，并用用户回复作答', async () => {
  const relay = makeRelay();
  const sent = [];
  relay.bindSession('s1', makeBinding(sent));

  const pending = relay.handleQuestion(questionRequest([{
    id: 'q1',
    question: '继续吗？',
    options: [{ label: '继续' }, { label: '停止' }],
  }]), async () => ({ answers: [] }));

  await waitFor(() => sent.length === 1);
  assert.match(sent[0], /继续吗？/);
  assert.equal(relay.hasPending('direct:c1'), true);

  assert.equal(relay.respond('direct:c1', '1', { senderId: 'alice' }), true);
  assert.deepEqual(await pending, { answers: [{ id: 'q1', selected: ['继续'] }] });
  assert.equal(relay.hasPending('direct:c1'), false);
});

test('中转忽略非本插件会话，交还 DSH 原生回答器', async () => {
  const relay = makeRelay();
  const sent = [];
  relay.bindSession('other-session', makeBinding(sent));
  let nextCalls = 0;
  const result = await relay.handleQuestion(
    questionRequest([{ id: 'q1', question: '在吗？' }], { sessionId: 'unbound' }),
    async () => {
      nextCalls += 1;
      return { answers: [{ id: 'q1', selected: [] }] };
    },
  );
  assert.equal(nextCalls, 1);
  assert.deepEqual(result, { answers: [{ id: 'q1', selected: [] }] });
  assert.equal(sent.length, 0);
});

test('群聊里只接受提问人的回复', async () => {
  const relay = makeRelay();
  const sent = [];
  relay.bindSession('s1', makeBinding(sent, { conversationKey: 'group:g1' }));
  const pending = relay.handleQuestion(
    questionRequest([{ id: 'q1', question: '是否发布？', options: [{ label: '发布' }, { label: '不发' }] }]),
    async () => ({ answers: [] }),
  );
  await waitFor(() => sent.length === 1);

  assert.equal(relay.respond('group:g1', '1', { senderId: 'bob' }), false);
  assert.equal(relay.hasPending('group:g1'), true);
  assert.equal(relay.respond('group:g1', '发布', { senderId: 'alice' }), true);
  assert.deepEqual(await pending, { answers: [{ id: 'q1', selected: ['发布'] }] });
});

test('多个问题时逐个询问，全部答完才返回', async () => {
  const relay = makeRelay();
  const sent = [];
  relay.bindSession('s1', makeBinding(sent));
  const pending = relay.handleQuestion(questionRequest([
    { id: 'q1', question: '第一个问题', options: [{ label: 'A' }] },
    { id: 'q2', question: '第二个问题' },
  ]), async () => ({ answers: [] }));

  await waitFor(() => sent.length === 1);
  assert.match(sent[0], /第一个问题/);
  assert.equal(relay.respond('direct:c1', '1', { senderId: 'alice' }), true);
  await waitFor(() => sent.length === 2);
  assert.match(sent[1], /第二个问题/);
  assert.equal(relay.respond('direct:c1', '自定义答案', { senderId: 'alice' }), true);
  assert.deepEqual(await pending, {
    answers: [
      { id: 'q1', selected: ['A'] },
      { id: 'q2', selected: [], custom: '自定义答案' },
    ],
  });
});

test('等待超时按跳过处理，并提示用户', async () => {
  const relay = makeRelay({ timeoutMs: 40 });
  const sent = [];
  relay.bindSession('s1', makeBinding(sent));
  const result = await relay.handleQuestion(
    questionRequest([{ id: 'q1', question: '还在吗？', options: [{ label: '在' }] }]),
    async () => ({ answers: [] }),
  );
  assert.deepEqual(result, { answers: [{ id: 'q1', selected: [] }] });
  assert.equal(sent.length, 2);
  assert.match(sent[1], /超时/);
});

test('批准请求按回复映射为 allowed-once / rejected', async () => {
  const relay = makeRelay();
  const sent = [];
  relay.bindSession('s1', makeBinding(sent));

  const allowed = relay.handleApproval(
    { agent: { session: { id: 's1' } }, toolName: 'bash', reason: '需要写文件' },
    async () => 'unavailable',
  );
  await waitFor(() => sent.length === 1);
  relay.respond('direct:c1', '1', { senderId: 'alice' });
  assert.equal(await allowed, 'allowed-once');

  const rejected = relay.handleApproval(
    { agent: { session: { id: 's1' } }, toolName: 'bash' },
    async () => 'unavailable',
  );
  await waitFor(() => sent.length === 2);
  relay.respond('direct:c1', '2', { senderId: 'alice' });
  assert.equal(await rejected, 'rejected');
});

test('取消等待会拒绝提问并解开挂起', async () => {
  const relay = makeRelay();
  const sent = [];
  relay.bindSession('s1', makeBinding(sent));
  const pending = relay.handleQuestion(
    questionRequest([{ id: 'q1', question: '还在吗？' }]),
    async () => ({ answers: [] }),
  );
  await waitFor(() => sent.length === 1);
  assert.equal(relay.cancel('direct:c1', '用户改发了指令'), true);
  await assert.rejects(pending, /改发/);
  assert.equal(relay.hasPending('direct:c1'), false);
});

test('解绑后不再接管该会话的提问', async () => {
  const relay = makeRelay();
  const sent = [];
  relay.bindSession('s1', makeBinding(sent));
  relay.unbindSession('s1');
  let nextCalls = 0;
  await relay.handleQuestion(
    questionRequest([{ id: 'q1', question: '在吗？' }]),
    async () => {
      nextCalls += 1;
      return { answers: [{ id: 'q1', selected: [] }] };
    },
  );
  assert.equal(nextCalls, 1);
  assert.equal(sent.length, 0);
});