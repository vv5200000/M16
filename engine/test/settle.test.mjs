import test from 'node:test';
import assert from 'node:assert/strict';
import { settleConviction, UNRESOLVED_COPY } from '../src/settle.mjs';
import { resolveConfig } from '../src/config.mjs';

const config = resolveConfig();
const zero = { A: 0, B: 0, C: 0 };

test('AC-2 唯一 argmax → 该原型定罪', () => {
  const r = settleConviction({ conviction: { A: 3, B: 1, C: 1 }, p12: zero, config });
  assert.equal(r.outcome, 'convicted');
  assert.equal(r.prototype, 'A');
  assert.equal(r.tieState, 'single');
  assert.deepEqual(r.winners, ['A']);
  assert.deepEqual(r.t, { A: 3, B: 1, C: 1 });
});

test('AC-3 P12 加法项可翻转 ≤3 分差（分差 1，P12 +2）', () => {
  const r = settleConviction({ conviction: { A: 2, B: 1, C: 0 }, p12: { A: 0, B: 2, C: 0 }, config });
  assert.equal(r.s.B, 1);
  assert.equal(r.p12.B, 2);
  assert.equal(r.t.B, 3);
  assert.equal(r.prototype, 'B');
});

test('AC-3 分差 >3 时 P12 只能补强，不能翻转', () => {
  const r = settleConviction({ conviction: { A: 5, B: 1, C: 0 }, p12: { A: 0, B: 3, C: 0 }, config });
  assert.equal(r.t.A, 5);
  assert.equal(r.t.B, 4);
  assert.equal(r.prototype, 'A');
});

test('AC-2 P12 后仍并列 → 未形成单一指向（等权、无百分比）', () => {
  const r = settleConviction({ conviction: { A: 2, B: 1, C: 0 }, p12: { A: 0, B: 1, C: 0 }, config });
  assert.equal(r.outcome, 'unresolved');
  assert.equal(r.prototype, null);
  assert.equal(r.tieState, 'unresolved');
  assert.deepEqual(r.winners, ['A', 'B']);
  assert.equal(r.display.copy, UNRESOLVED_COPY);
  assert.equal(r.display.equalWeight, true);
  assert.equal(r.display.showPercentages, false);
});

test('AC-2 全 0 三向并列 → unresolved，不得用呈现顺序定罪', () => {
  const r = settleConviction({ conviction: zero, p12: zero, config });
  assert.equal(r.outcome, 'unresolved');
  assert.deepEqual(r.winners, ['A', 'B', 'C']);
  assert.equal(r.maxT, 0);
});

test('AC-3 P12 全拍上限 3：合计 4 直接拒绝', () => {
  assert.throws(
    () => settleConviction({ conviction: { A: 0, B: 0, C: 0 }, p12: { A: 2, B: 2, C: 0 }, config }),
    /超过全拍上限/,
  );
});

test('AC-3 非整数分值拒绝（F5 单层口径）', () => {
  assert.throws(
    () => settleConviction({ conviction: { A: 0.5, B: 0, C: 0 }, p12: zero, config }),
    /整数/,
  );
});

test('只读输入不被改写', () => {
  const conviction = { A: 1, B: 2, C: 0 };
  const p12 = { A: 0, B: 1, C: 0 };
  settleConviction({ conviction, p12, config });
  assert.deepEqual(conviction, { A: 1, B: 2, C: 0 });
  assert.deepEqual(p12, { A: 0, B: 1, C: 0 });
});
