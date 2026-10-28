import test from 'node:test';
import assert from 'node:assert/strict';
import { createDecisionTrack } from '../src/decision.mjs';
import { resolveConfig } from '../src/config.mjs';
import { DECISION_FORKS } from '../data/beats.mjs';

function track(overrides, forks = DECISION_FORKS) {
  return createDecisionTrack({ config: resolveConfig(overrides), forks });
}

test('P4 定罪流向 A→C / B→B 且计 J/P', () => {
  const a = track();
  const ra = a.choose({ beat: 'P4', input: '信他' });
  assert.equal(ra.optionId, 'A');
  assert.equal(ra.pole, 'J');
  assert.equal(ra.conviction, 'C');
  assert.equal(ra.convictionWeight, 1);
  assert.equal(ra.dimensionWeight, 1);

  const b = track();
  const rb = b.choose({ beat: 'P4', input: '要求复查磨损' });
  assert.equal(rb.optionId, 'B');
  assert.equal(rb.pole, 'P');
  assert.equal(rb.conviction, 'B');
  assert.deepEqual(b.summary().conviction, { A: 0, B: 1, C: 0 });
  assert.equal(b.summary().axes.JP.P, 1);
});

test('P5 定罪流向 A→0 / B→B', () => {
  const a = track();
  const ra = a.choose({ beat: 'P5', input: '按字条锁定窗口' });
  assert.equal(ra.optionId, 'A');
  assert.equal(ra.conviction, null);
  assert.equal(ra.convictionWeight, 0);
  assert.deepEqual(a.summary().conviction, { A: 0, B: 0, C: 0 });
  assert.equal(a.summary().axes.JP.J, 1);

  const b = track();
  const rb = b.choose({ beat: 'P5', input: '怀疑表被动过' });
  assert.equal(rb.optionId, 'B');
  assert.equal(rb.conviction, 'B');
  assert.deepEqual(b.summary().conviction, { A: 0, B: 1, C: 0 });
});

test('P5 doubt 优先：同句双词面命中按 precedence 选 doubt', () => {
  const t = track();
  const r = t.choose({ beat: 'P5', input: '签了字但我怀疑表被动过' });
  assert.equal(r.optionId, 'B');
  assert.equal(r.pole, 'P');
  assert.equal(t.summary().axes.JP.P, 1);
  assert.equal(t.summary().axes.JP.J, 0);
});

test('P6 首个 T/F 采样位：追账→T/B，问丈夫→F/A', () => {
  const t1 = track();
  const r1 = t1.choose({ beat: 'P6', input: '先追账' });
  assert.equal(r1.optionId, 'A');
  assert.equal(r1.pole, 'T');
  assert.equal(r1.conviction, 'B');
  assert.deepEqual(t1.summary().axes.TF, { T: 1, F: 0, total: 1, sampled: true });

  const t2 = track();
  const r2 = t2.choose({ beat: 'P6', input: '问她丈夫的事' });
  assert.equal(r2.optionId, 'B');
  assert.equal(r2.pole, 'F');
  assert.equal(r2.conviction, 'A');
  assert.equal(t2.summary().axes.TF.F, 1);
});

test('P7–P9 分叉只带定罪流向，不产生任何 MBTI 维度分', () => {
  const t = track();
  const r = t.choose({ beat: 'P7', input: '要钥匙' });
  assert.equal(r.axis, null);
  assert.equal(r.conviction, 'A');
  const s = t.summary();
  assert.deepEqual(s.conviction, { A: 1, B: 0, C: 0 });
  assert.equal(s.axes.TF.total, 0);
  assert.equal(s.axes.EI.total, 0);
  assert.equal(s.axes.JP.total, 0);
  // 连维度分桶都不建立：P7 不产生任何 MBTI 维度痕迹
  assert.equal(s.byBeat.P7, undefined);
});

test('P10 T/F 与 P11 E/I 采样', () => {
  const t = track();
  assert.equal(t.choose({ beat: 'P10', input: '问他信谁' }).pole, 'F');
  assert.equal(t.choose({ beat: 'P11', input: '回到枪案' }).pole, 'I');
  const s = t.summary();
  assert.equal(s.axes.TF.F, 1);
  assert.equal(s.axes.EI.I, 1);
  // P11 定罪流向为"—"，只采 E/I 不落定罪分
  assert.deepEqual(s.conviction, { A: 0, B: 1, C: 0 });
});

test('first-decision-wins：改选不覆写已记分，fork_typed 恒记审计', () => {
  const t = track();
  const first = t.choose({ beat: 'P4', input: '复查' });
  assert.equal(first.forkEffective, true);
  const second = t.choose({ beat: 'P4', input: '信他' });
  assert.equal(second.scored, false);
  assert.equal(second.reason, 'first_decision_wins');
  assert.equal(second.forkTyped, 'J');
  assert.equal(second.forkEffective, false);
  assert.equal(second.recordedChoice, 'B');

  const s = t.summary();
  assert.equal(s.axes.JP.P, 1);
  assert.equal(s.axes.JP.J, 0);
  assert.deepEqual(s.conviction, { A: 0, B: 1, C: 0 });
  assert.equal(s.decidedForks['P4.JP'], 'B');
  assert.deepEqual(
    s.audit.filter((entry) => entry.forkId === 'P4.JP').map((entry) => [entry.forkTyped, entry.forkEffective]),
    [['P', true], ['J', false]],
  );
});

test('同一选择重复提交幂等，不重复计分', () => {
  const t = track();
  t.choose({ beat: 'P4', input: '复查' });
  const again = t.choose({ beat: 'P4', input: '核对' });
  assert.equal(again.scored, false);
  assert.equal(again.reason, 'duplicate_choice');
  assert.equal(t.summary().axes.JP.P, 1);
});

test('seq=173：forced 不采样、不占 first-decision-wins，重进后可补采', () => {
  const t = track();
  const forced = t.choose({ beat: 'P5', forced: true });
  assert.equal(forced.scored, false);
  assert.equal(forced.reason, 'forced_timeout');
  assert.equal(forced.forkTyped, 'forced');
  assert.equal(forced.forkEffective, false);
  assert.equal(t.summary().axes.JP.total, 0);
  assert.equal(t.decidedForks().length, 0);

  const records = t.summary().audit;
  assert.equal(records.length, 1);
  assert.equal(records[0].forkTyped, 'forced');
  assert.equal(records[0].forkEffective, false);
  assert.equal(records[0].optionId, null);

  // 重进 P05 后的第一次有效落笔仍可计分采 J/P
  const reentry = t.choose({ beat: 'P5', input: '怀疑表被动过' });
  assert.equal(reentry.scored, true);
  assert.equal(reentry.forkEffective, true);
  assert.equal(t.summary().axes.JP.P, 1);
  assert.deepEqual(t.summary().conviction, { A: 0, B: 1, C: 0 });
  assert.equal(t.decidedForks().length, 1);
});

test('未命中不算一次有效选择，不占用 first-decision-wins', () => {
  const t = track();
  const miss = t.choose({ beat: 'P6', input: '随便说说' });
  assert.equal(miss.reason, 'no_decision_match');
  assert.equal(miss.forkTyped, 'none');
  assert.equal(miss.forkEffective, false);
  assert.equal(t.summary().axes.TF.total, 0);

  const hit = t.choose({ beat: 'P6', input: '追账' });
  assert.equal(hit.scored, true);
  assert.equal(t.summary().axes.TF.T, 1);
});

test('互斥词面等优先级同时命中 → 不采分并记日志', () => {
  const forks = [{
    id: 'X.LINK',
    beat: 'PX',
    axis: null,
    options: [
      { id: 'A', conviction: 'A', words: ['甲甲', '丙丙'] },
      { id: 'B', conviction: 'B', words: ['乙乙', '丁丁'] },
    ],
  }];
  const t = track({}, forks);
  const r = t.choose({ beat: 'PX', input: '甲甲乙乙' });
  assert.equal(r.scored, false);
  assert.equal(r.reason, 'ambiguous_no_sample');
  assert.equal(r.forkTyped, 'ambiguous');
  assert.equal(t.summary().axes.JP.total, 0);
  assert.deepEqual(t.summary().conviction, { A: 0, B: 0, C: 0 });
  assert.equal(t.summary().logs[0].code, 'fork_ambiguous');
  assert.equal(t.decidedForks().length, 0);

  // 不占用 first-decision-wins：后续明确选择仍可计分
  assert.equal(t.choose({ beat: 'PX', input: '丙丙' }).scored, true);
});

test('无分叉的拍不采决策层信号', () => {
  const t = track();
  assert.equal(t.choose({ beat: 'P1', input: '规矩' }).reason, 'no_fork');
  assert.equal(t.summary().axes.JP.total, 0);
});

test('权重配置位：P06 T/F 与定罪分值可按拍覆盖（整数）', () => {
  const t = track({
    dimension: { weights: { P6: { TF: 2 } } },
    conviction: { weights: { P6: { A: 3 } } },
  });
  const r = t.choose({ beat: 'P6', input: '追账' });
  assert.equal(r.dimensionWeight, 2);
  assert.equal(r.convictionWeight, 3);
  assert.equal(t.summary().axes.TF.T, 2);
  assert.deepEqual(t.summary().conviction, { A: 0, B: 3, C: 0 });
});

test('非法分叉定义在构建期拒绝', () => {
  assert.throws(
    () => createDecisionTrack({
      config: resolveConfig(),
      forks: [{ id: 'Y', beat: 'PY', axis: 'XX', options: [{ id: 'A', words: ['词'] }] }],
    }),
    /未知维度/,
  );
  assert.throws(
    () => createDecisionTrack({
      config: resolveConfig(),
      forks: [{ id: 'Y', beat: 'PY', axis: 'JP', options: [{ id: 'A', pole: 'T', words: ['词'] }] }],
    }),
    /pole 与维度不符/,
  );
});
