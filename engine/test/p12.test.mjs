import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySegment, createP12Track, presentationOrder } from '../src/p12.mjs';
import { resolveConfig } from '../src/config.mjs';
import { P12_DATA } from '../data/p12.mjs';

function classify(input, { segmentId = 'A', overrides } = {}) {
  return classifySegment({
    segmentId,
    input,
    stems: P12_DATA.stems,
    wordlists: P12_DATA.wordlists,
    anchors: P12_DATA.anchors,
    config: resolveConfig(overrides),
  });
}

function track({ seed = 'seed-1', overrides } = {}) {
  return createP12Track({ config: resolveConfig(overrides), data: P12_DATA, seed });
}

// —— 命中矩阵（A/B/C × 正/负/弃权/复述/冲突）——

test('A 正向命中 → A +1', () => {
  const r = classify('他替她顶罪了');
  assert.equal(r.prototype, 'A');
  assert.equal(r.points, 1);
  assert.equal(r.reason, 'hit');
});

test('B 正向命中 → B +1', () => {
  const r = classify('他提前安排了这一切');
  assert.equal(r.prototype, 'B');
  assert.equal(r.points, 1);
});

test('C 正向命中 → C +1', () => {
  const r = classify('两个人争执之后失手');
  assert.equal(r.prototype, 'C');
  assert.equal(r.points, 1);
});

test('否定负向词面不翻成正向（零误报优先）', () => {
  const r = classify('不是护着');
  assert.equal(r.points, 0);
  assert.equal(r.prototype, null);
  assert.equal(r.reason, 'no_signal');
});

test('否定正向词面 → 该原型负向，不计正向', () => {
  const r = classify('这不是失手');
  assert.equal(r.points, 0);
  assert.equal(r.prototype, null);
  assert.equal(r.reason, 'no_signal');
});

test('否定 B 正向词面 → 同样不产生正向信号', () => {
  const r = classify('没有提前安排');
  assert.equal(r.points, 0);
  assert.equal(r.prototype, null);
  assert.equal(r.reason, 'no_signal');
});

test('全句复述（无残留信息）→ echo 0 分', () => {
  const r = classify('他守了一辈子规矩，最后却');
  assert.equal(r.points, 0);
  assert.equal(r.prototype, null);
  assert.equal(r.reason, 'echo');
});

test('仅锚词 → echo 0 分', () => {
  const r = classify('账枪划痕口供了结规矩');
  assert.equal(r.points, 0);
  assert.equal(r.reason, 'echo');
});

test('锚词 + 真实信号：剥锚后仍按信号计分（不因复述连带判 0）', () => {
  const r = classify('规矩之外，他替她瞒了');
  assert.equal(r.prototype, 'A');
  assert.equal(r.points, 1);
});

test('双原型正向等强 → conflict 0 分', () => {
  const r = classify('布局了然后失手');
  assert.equal(r.points, 0);
  assert.equal(r.prototype, null);
  assert.equal(r.reason, 'conflict');
});

test('弃权词面 → abstain 0 分', () => {
  const r = classify('说不清');
  assert.equal(r.points, 0);
  assert.equal(r.reason, 'abstain');
});

test('空输入 / 纯空白 → empty 0 分', () => {
  assert.equal(classify('').reason, 'empty');
  assert.equal(classify('   ').reason, 'empty');
  assert.equal(classify(null).reason, 'empty');
});

test('C3 硬上限 120 字：120 字仍分类，121 字截断并判 0（overLimitPolicy=zero）', () => {
  const atLimit = classify('他替她顶罪' + '啊'.repeat(115));
  assert.equal(atLimit.inputLength, 120);
  assert.equal(atLimit.truncated, false);
  assert.equal(atLimit.prototype, 'A');

  const over = classify('啊'.repeat(121));
  assert.equal(over.reason, 'over_limit');
  assert.equal(over.truncated, true);
  assert.equal(over.points, 0);
});

test('overLimitPolicy=truncate_only 时超长仅截断不直接判 0', () => {
  const r = classify('他替她顶罪' + '啊'.repeat(120), { overrides: { p12: { overLimitPolicy: 'truncate_only' } } });
  assert.equal(r.truncated, true);
  assert.equal(r.prototype, 'A');
});

// —— 轨道：每段 ≤1 / 全拍 ≤3 / 呈现顺序 ——

test('每段只留一条有效结果；同一原型可跨段累加，全拍 ≤3', () => {
  const t = track();
  t.submit({ segmentId: 'A', input: '他替她顶罪' });
  t.submit({ segmentId: 'B', input: '他提前安排' });
  t.submit({ segmentId: 'C', input: '他替她瞒着' });
  assert.deepEqual(t.points(), { A: 2, B: 1, C: 0 });
  assert.equal(t.isComplete(), true);
});

test('重提同段为替换（每段仍 ≤1），attempts 记录', () => {
  const t = track();
  const first = t.submit({ segmentId: 'A', input: '他提前安排' });
  assert.equal(first.prototype, 'B');
  const second = t.submit({ segmentId: 'A', input: '他替她顶罪' });
  assert.equal(second.prototype, 'A');
  assert.equal(t.attempts('A'), 2);
  assert.deepEqual(t.points(), { A: 1, B: 0, C: 0 });
});

test('allowResubmit=false 时该段锁定，返回既有结果', () => {
  const t = track({ overrides: { p12: { allowResubmit: false } } });
  t.submit({ segmentId: 'A', input: '他提前安排' });
  const again = t.submit({ segmentId: 'A', input: '他替她顶罪' });
  assert.equal(again.reason, 'segment_locked');
  assert.equal(again.prototype, 'B');
  assert.equal(t.attempts('A'), 1);
});

test('未知段落拒绝提交', () => {
  const t = track();
  const r = t.submit({ segmentId: 'D', input: '他替她顶罪' });
  assert.equal(r.reason, 'unknown_segment');
  assert.equal(t.submittedCount(), 0);
});

test('呈现顺序由 seed 决定：同 seed 稳定、是排列、不同 seed 可给出不同顺序', () => {
  assert.deepEqual(presentationOrder('s1'), presentationOrder('s1'));
  const order = presentationOrder('s1');
  assert.deepEqual([...order].sort(), ['A', 'B', 'C']);

  const orders = new Set();
  for (let i = 0; i < 20; i += 1) orders.add(presentationOrder(`seed-${i}`).join(''));
  assert.ok(orders.size > 1, '呈现顺序不应与 seed 无关');
});

test('segmentRecords 按呈现顺序输出，且只含契约字段', () => {
  const t = track({ seed: 'seed-x' });
  t.submit({ segmentId: 'A', input: '他替她顶罪' });
  t.submit({ segmentId: 'B', input: '说不清' });
  const records = t.segmentRecords();
  assert.deepEqual(records.map((r) => r.segmentId), t.presentedOrder);
  for (const record of records) {
    assert.deepEqual(Object.keys(record).sort(), ['prototype', 'scored', 'segmentId', 'tieState']);
  }
  const a = records.find((r) => r.segmentId === 'A');
  assert.deepEqual(a, { segmentId: 'A', scored: true, prototype: 'A', tieState: 'single' });
  const b = records.find((r) => r.segmentId === 'B');
  assert.deepEqual(b, { segmentId: 'B', scored: false, prototype: null, tieState: 'none' });
});
