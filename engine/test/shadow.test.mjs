import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../src/session.mjs';
import { resolveConfig, ConfigError } from '../src/config.mjs';
import { UNRESOLVED_COPY, toEffectiveSettlement } from '../src/settle.mjs';

// 批次 3 · 2A（D-B3-2）：灰度通道 = 记分/审计照常、定罪结算旁路。
// 本文件覆盖规格 AC-1…AC-6；默认 live 的既有行为由其他测试文件继续守护。

const DEEP = ['P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10'];

function buildSession({ mode, seed = 'seed-1', sessionId = 'sess-shadow' } = {}) {
  const config = mode ? { settlement: { mode } } : {};
  const s = createSession({ config, sessionId, seed });
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

function buildTieSession(mode) {
  const s = createSession({
    config: mode ? { settlement: { mode } } : {},
    sessionId: 'sess-tie',
    seed: 'seed-tie',
  });
  for (const beat of DEEP) s.openMaterial(beat);
  s.explore({ beat: 'P1', input: '死亡报告' });
  s.choose({ beat: 'P5', input: '怀疑表被动过' }); // B +1
  s.choose({ beat: 'P6', input: '问她丈夫的事' }); // A +1
  s.choose({ beat: 'P11', input: '回到枪案' });
  s.beginArchive();
  s.fillSegment({ segmentId: 'A', input: '他替她顶罪' }); // A +1
  s.fillSegment({ segmentId: 'B', input: '他提前安排' }); // B +1
  s.fillSegment({ segmentId: 'C', input: '说不清' });
  return s;
}

test('AC-1 灰度记分/审计照常：维度分与审计与 live 一致，计算值可从运维通道攒取', () => {
  const live = buildSession({ mode: 'live' });
  const shadow = buildSession({ mode: 'shadow' });

  assert.deepEqual(shadow.dimensionScores(), live.dimensionScores());

  const liveDiag = live.diagnostics();
  const shadowDiag = shadow.diagnostics();
  assert.equal(liveDiag.settlementMode, 'live');
  assert.equal(shadowDiag.settlementMode, 'shadow');
  assert.equal('shadowSettlement' in liveDiag, false);
  assert.deepEqual(shadowDiag.perception, liveDiag.perception);
  assert.deepEqual(shadowDiag.decision, liveDiag.decision);
  assert.deepEqual(shadowDiag.openedBeats, liveDiag.openedBeats);
  assert.deepEqual(shadowDiag.p12.segments, liveDiag.p12.segments);

  const liveResult = live.settle();
  assert.equal(liveResult.prototype, 'B');
  assert.deepEqual(liveResult.t, { A: 1, B: 3, C: 1 });
  assert.deepEqual(shadowDiag.shadowSettlement, {
    s: liveResult.s,
    p12: liveResult.p12,
    t: liveResult.t,
    maxT: liveResult.maxT,
    winners: liveResult.winners,
    outcome: liveResult.outcome,
    prototype: liveResult.prototype,
    tieState: liveResult.tieState,
  });
});

test('AC-2 灰度旁路：settle() 无原型/无分值/无读者文案', () => {
  const shadow = buildSession({ mode: 'shadow' });
  const result = shadow.settle();

  assert.equal(result.outcome, 'bypassed');
  assert.equal(result.prototype, null);
  assert.equal(result.tieState, 'bypassed');
  assert.deepEqual(result.winners, []);
  assert.deepEqual(result.display, {
    mode: 'bypassed',
    prototypes: [],
    equalWeight: false,
    showPercentages: false,
    copy: '',
  });
  for (const key of ['s', 'p12', 't', 'maxT']) {
    assert.equal(key in result, false, `旁路结果不应含 ${key}`);
  }
  assert.equal(result.archiveComplete, true);

  const json = JSON.stringify(result);
  assert.doesNotMatch(json, /"prototype":"[ABC]"/);
  assert.doesNotMatch(json, /重玩/);
});

test('AC-3 生产留档 schema 冻结：灰度只改取值，不改字段集，P12 段记录照常', () => {
  const live = buildSession({ mode: 'live' });
  const shadow = buildSession({ mode: 'shadow' });
  const liveRecord = live.exportSettlementRecord();
  const record = shadow.exportSettlementRecord();

  assert.deepEqual(Object.keys(record).sort(), Object.keys(liveRecord).sort());
  assert.deepEqual(Object.keys(record.conviction).sort(), Object.keys(liveRecord.conviction).sort());
  assert.deepEqual(record.conviction, {
    outcome: 'bypassed',
    prototype: null,
    tieState: 'bypassed',
    tiedPrototypes: [],
  });
  assert.deepEqual(record.p12, liveRecord.p12);
  for (const segment of record.p12.segments) {
    assert.deepEqual(Object.keys(segment).sort(), ['prototype', 'scored', 'segmentId', 'tieState']);
  }

  const json = JSON.stringify(record);
  for (const raw of ['怀疑表被动过', '追账', '回到枪案', '死亡报告', '他替她顶罪', '他提前安排', '失手']) {
    assert.equal(json.includes(raw), false, `留档不应包含读者原文：${raw}`);
  }
  assert.doesNotMatch(json, /"TF"|"EI"|"JP"|"SN"|mbti|similarity|vector|shadowSettlement|maxT/);
});

test('AC-4 默认 live 兼容；shadow 可配置；非法 mode 拒绝', () => {
  const s = buildSession();
  const result = s.settle();
  assert.equal(result.outcome, 'convicted');
  assert.equal(result.prototype, 'B');
  assert.deepEqual(Object.keys(result).sort(), [
    'archiveComplete', 'display', 'maxT', 'outcome', 'p12', 'prototype', 's', 't', 'tieState', 'winners',
  ]);
  assert.equal(resolveConfig().settlement.mode, 'live');

  assert.equal(resolveConfig({ settlement: { mode: 'shadow' } }).settlement.mode, 'shadow');
  assert.throws(() => resolveConfig({ settlement: { mode: 'gray' } }), ConfigError);
  assert.throws(() => resolveConfig({ settlement: { mode: 'gray' } }), /settlement\.mode/);
  assert.throws(() => createSession({ config: { settlement: { mode: 'on' } } }), /settlement\.mode/);
  assert.throws(() => toEffectiveSettlement({}, 'gray'), /settlement\.mode/);
});

test('AC-5 1A：live 并列文案不动；灰度任何面不输出并列/测量提示', () => {
  const liveTie = buildTieSession('live');
  const liveResult = liveTie.settle();
  assert.equal(liveResult.outcome, 'unresolved');
  assert.equal(liveResult.tieState, 'unresolved');
  assert.equal(liveResult.display.copy, UNRESOLVED_COPY);
  assert.deepEqual(liveResult.winners, ['A', 'B']);
  assert.equal(JSON.stringify(liveResult).includes('重玩'), false);

  const shadowTie = buildTieSession('shadow');
  const shadowResult = shadowTie.settle();
  assert.equal(shadowResult.outcome, 'bypassed');
  assert.equal(shadowResult.display.copy, '');
  const json = JSON.stringify(shadowResult);
  assert.equal(json.includes(UNRESOLVED_COPY), false);
  assert.equal(json.includes('重玩'), false);

  // 记分照常：运维通道仍能看到真实并列结论，供灰度攒数。
  const shadowSettlement = shadowTie.diagnostics().shadowSettlement;
  assert.equal(shadowSettlement.outcome, 'unresolved');
  assert.deepEqual(shadowSettlement.winners, ['A', 'B']);
});

test('AC-2 边界：未进归档的灰度会话同样旁路；settlement 覆盖非对象被拒', () => {
  const s = createSession({ config: { settlement: { mode: 'shadow' } }, sessionId: 'sess-partial' });
  s.explore({ beat: 'P1', input: '死亡报告' });
  s.choose({ beat: 'P6', input: '追账' }); // 决策层已有定罪流向，但未开归档
  const result = s.settle();
  assert.equal(result.outcome, 'bypassed');
  assert.equal(result.archiveComplete, false);
  assert.equal(result.prototype, null);
  assert.equal('t' in result, false);
  assert.throws(() => resolveConfig({ settlement: 'shadow' }), /settlement 必须是对象/);
});

test('AC-6 隔离与确定性：灰度不串轨，呈现顺序不参与结算', () => {
  const a = buildSession({ mode: 'shadow', seed: 'seed-1' });
  const b = buildSession({ mode: 'shadow', seed: 'seed-2' });

  const scores = a.dimensionScores();
  assert.deepEqual(Object.keys(scores).sort(), ['EI', 'JP', 'SN', 'TF', 'pending', 'source']);
  assert.doesNotMatch(JSON.stringify(scores), /conviction|prototype|tieState|终采/);

  const shadowSettlement = a.diagnostics().shadowSettlement;
  assert.doesNotMatch(JSON.stringify(shadowSettlement), /"TF"|"EI"|"JP"|"SN"|axes|mbti/i);
  assert.deepEqual(a.diagnostics().shadowSettlement, b.diagnostics().shadowSettlement);

  const record = a.exportSettlementRecord();
  assert.equal('shadowSettlement' in record, false);
  assert.equal('shadow' in record, false);
});
