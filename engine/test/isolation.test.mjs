import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../src/session.mjs';

const DEEP = ['P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10'];

function fullSession({ seed = 'seed-1', config = {} } = {}) {
  const s = createSession({ config, sessionId: 'sess-1', seed });
  for (const beat of DEEP) s.openMaterial(beat);
  s.explore({ beat: 'P1', input: '死亡报告' });
  s.choose({ beat: 'P5', input: '怀疑表被动过' });
  s.choose({ beat: 'P6', input: '追账' });
  s.choose({ beat: 'P11', input: '回到枪案' });
  s.beginArchive();
  s.fillSegment({ segmentId: 'A', input: '他替她顶罪' });
  s.fillSegment({ segmentId: 'B', input: '他提前安排' });
  s.fillSegment({ segmentId: 'C', input: '失手' });
  return s;
}

test('双轨：MBTI 维度分不暴露任何定罪字段', () => {
  const s = fullSession();
  const scores = s.dimensionScores();
  assert.deepEqual(Object.keys(scores).sort(), ['EI', 'JP', 'SN', 'TF', 'pending', 'source']);
  assert.deepEqual(scores.SN, { S: 1, N: 0, total: 1, sampled: true });
  assert.deepEqual(scores.TF, { T: 1, F: 0, total: 1, sampled: true });
  assert.deepEqual(scores.EI, { E: 0, I: 1, total: 1, sampled: true });
  assert.deepEqual(scores.JP, { J: 0, P: 1, total: 1, sampled: true });
  assert.equal(scores.source.SN, 'perception.keyword');
  assert.equal(scores.source.TF, 'decision.fork');

  const json = JSON.stringify(scores);
  assert.doesNotMatch(json, /conviction|prototype|tieState|终采/);
});

test('双轨：结算结果不暴露任何 MBTI 维度分', () => {
  const s = fullSession();
  const result = s.settle();
  assert.deepEqual(result.t, { A: 1, B: 3, C: 1 });
  assert.equal(result.prototype, 'B');

  const json = JSON.stringify(result);
  assert.doesNotMatch(json, /"TF"|"EI"|"JP"|"SN"|"axes"/);
});

test('P12 归档输入只改定罪终采，不改任何 MBTI 维度分', () => {
  const s = createSession({ config: {}, sessionId: 'sess-2' });
  for (const beat of DEEP) s.openMaterial(beat);
  s.explore({ beat: 'P1', input: '死亡报告' });
  s.choose({ beat: 'P5', input: '怀疑表被动过' });
  s.choose({ beat: 'P6', input: '追账' });
  s.choose({ beat: 'P11', input: '回到枪案' });
  s.beginArchive();

  const before = s.dimensionScores();
  s.fillSegment({ segmentId: 'A', input: '他提前布局算计' });
  s.fillSegment({ segmentId: 'B', input: '他失手走火' });
  s.fillSegment({ segmentId: 'C', input: '他说不清' });
  assert.deepEqual(s.dimensionScores(), before);
});

test('感知层输入不产生任何决策层维度分', () => {
  const s = createSession({ config: {}, sessionId: 'sess-3' });
  s.explore({ beat: 'P1', input: '死亡报告' });
  s.explore({ beat: 'P2', input: '托付' });
  s.explore({ beat: 'P5', input: '托付' }); // R3 同 C-ID → dedup_hit，不落分
  const scores = s.dimensionScores();
  assert.equal(scores.SN.total, 2);
  assert.equal(scores.TF.total, 0);
  assert.equal(scores.EI.total, 0);
  assert.equal(scores.JP.total, 0);
});

test('决策层输入不产生任何 S/N 分', () => {
  const s = createSession({ config: {}, sessionId: 'sess-4' });
  s.choose({ beat: 'P5', input: '怀疑表被动过' });
  s.choose({ beat: 'P6', input: '追账' });
  s.choose({ beat: 'P11', input: '回到枪案' });
  const scores = s.dimensionScores();
  assert.equal(scores.SN.total, 0);
  assert.equal(scores.TF.total, 1);
  assert.equal(scores.EI.total, 1);
  assert.equal(scores.JP.total, 1);
});

test('生产留档字段集严格等于契约口径（口径 B）', () => {
  const s = fullSession();
  const record = s.exportSettlementRecord();

  assert.deepEqual(Object.keys(record).sort(), ['archiveComplete', 'conviction', 'p12', 'schema', 'sessionId']);
  assert.equal(record.schema, 'm16.settlement.v1');
  assert.equal(record.sessionId, 'sess-1');
  assert.equal(record.archiveComplete, true);

  assert.deepEqual(Object.keys(record.conviction).sort(), ['outcome', 'prototype', 'tieState', 'tiedPrototypes']);
  assert.equal(record.conviction.outcome, 'convicted');
  assert.equal(record.conviction.prototype, 'B');
  assert.deepEqual(record.conviction.tiedPrototypes, []);

  assert.deepEqual(Object.keys(record.p12).sort(), ['presentedOrder', 'seed', 'segments']);
  assert.equal(record.p12.seed, 'seed-1');
  assert.deepEqual(record.p12.presentedOrder, record.p12.segments.map((segment) => segment.segmentId));
  for (const segment of record.p12.segments) {
    assert.deepEqual(Object.keys(segment).sort(), ['prototype', 'scored', 'segmentId', 'tieState']);
  }
  assert.deepEqual(
    record.p12.segments.map((segment) => [segment.segmentId, segment.scored, segment.prototype, segment.tieState]),
    [['A', true, 'A', 'single'], ['B', true, 'B', 'single'], ['C', true, 'C', 'single']]
      .sort((a, b) => record.p12.presentedOrder.indexOf(a[0]) - record.p12.presentedOrder.indexOf(b[0])),
  );
});

test('生产留档不含原文 / 连续分值 / MBTI / 相似度', () => {
  const s = fullSession();
  const json = JSON.stringify(s.exportSettlementRecord());
  for (const raw of ['怀疑表被动过', '追账', '回到枪案', '死亡报告', '他替她顶罪', '他提前安排']) {
    assert.equal(json.includes(raw), false, `留档不应包含读者原文：${raw}`);
  }
  assert.doesNotMatch(json, /"TF"|"EI"|"JP"|"SN"|"mbti"|"similarity"|"vector"|"score"/);
});

test('并列时留档给出 tiedPrototypes，且不泄露连续分', () => {
  const s = createSession({ config: {}, sessionId: 'sess-5', seed: 'seed-5' });
  for (const beat of DEEP) s.openMaterial(beat);
  s.explore({ beat: 'P1', input: '死亡报告' });
  s.choose({ beat: 'P5', input: '怀疑表被动过' }); // B +1
  s.choose({ beat: 'P6', input: '问她丈夫的事' }); // A +1
  s.choose({ beat: 'P11', input: '回到枪案' });
  s.beginArchive();
  s.fillSegment({ segmentId: 'A', input: '他替她顶罪' });
  s.fillSegment({ segmentId: 'B', input: '他提前安排' });
  s.fillSegment({ segmentId: 'C', input: '说不清' });

  const record = s.exportSettlementRecord();
  // S: A1 B1 C0；P12: A1 B1 → T: A2 B2 → 并列
  assert.equal(record.conviction.outcome, 'unresolved');
  assert.equal(record.conviction.prototype, null);
  assert.equal(record.conviction.tieState, 'unresolved');
  assert.deepEqual(record.conviction.tiedPrototypes, ['A', 'B']);

  const json = JSON.stringify(record);
  assert.equal(json.includes('maxT'), false);
  assert.equal(json.includes('display'), false);
  assert.equal('s' in record, false);
  assert.equal('t' in record, false);
  assert.equal('s' in record.conviction, false);
  assert.equal('t' in record.conviction, false);
});

test('呈现顺序不参与结算：同输入不同 seed 结局一致', () => {
  const s1 = fullSession({ seed: 'seed-1' });
  const s2 = fullSession({ seed: 'seed-2' });
  const r1 = s1.settle();
  const r2 = s2.settle();
  assert.equal(r1.prototype, r2.prototype);
  assert.deepEqual(r1.t, r2.t);
  assert.deepEqual(r1.p12, r2.p12);
});

test('会话对外只暴露契约方法，不直接暴露内部轨道对象', () => {
  const s = createSession({ config: {} });
  assert.deepEqual(Object.keys(s).sort(), [
    'beginArchive', 'canEnterArchive', 'choose', 'chooseOrder', 'config', 'diagnostics',
    'dimensionScores', 'explore', 'exportSettlementRecord', 'fillSegment', 'openMaterial', 'settle',
  ]);
});

test('diagnostics 不含读者原文（P12 段文本 / 分叉原文均不落）', () => {
  const s = fullSession();
  const json = JSON.stringify(s.diagnostics());
  assert.equal(json.includes('他替她顶罪'), false);
  assert.equal(json.includes('怀疑表被动过'), false);
  assert.equal(json.includes('追账'), false);
  assert.match(json, /diagnostics 仅含命中词面与机器码/);
});
