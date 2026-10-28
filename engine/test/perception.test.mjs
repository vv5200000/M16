import test from 'node:test';
import assert from 'node:assert/strict';
import { createPerceptionTrack } from '../src/perception.mjs';
import { resolveConfig } from '../src/config.mjs';
import { PERCEPTION_WORDLISTS } from '../data/beats.mjs';

function track(overrides) {
  return createPerceptionTrack({ config: resolveConfig(overrides), wordlists: PERCEPTION_WORDLISTS });
}

test('S/N 只来自感知层关键词：P1 关键词命中最长匹配行', () => {
  const t = track();
  const r = t.record({ beat: 'P1', input: '死亡报告' });
  assert.equal(r.scored, true);
  assert.equal(r.dimension, 'S');
  assert.equal(r.rowId, 'P1.死亡报告');
  assert.equal(r.weight, 1);
  const s = t.summary();
  assert.equal(s.total, 1);
  assert.equal(s.S, 1);
  assert.equal(s.N, 0);
});

test('P3 关键词可落 N', () => {
  const t = track();
  const r = t.record({ beat: 'P3', input: '收件人是谁' });
  assert.equal(r.scored, true);
  assert.equal(r.dimension, 'N');
  assert.equal(t.summary().N, 1);
});

test('O1 口径②：P4 整拍不进 S/N 轨，词面命中也不落分', () => {
  const t = track();
  const r = t.record({ beat: 'P4', input: '膛线' });
  assert.equal(r.scored, false);
  assert.equal(r.reason, 'beat_excluded_from_sn');
  assert.equal(r.sampleAdded, false);
  const s = t.summary();
  assert.equal(s.total, 0);
  assert.equal(s.sampled, false);
});

test('P4 probe（chips 返回块）不落任何采样计数', () => {
  const t = track();
  const r = t.record({ beat: 'P4', input: '膛线', probe: true });
  assert.equal(r.scored, false);
  assert.equal(r.reason, 'probe_no_sample');
  assert.equal(r.sampleAdded, false);
  assert.equal(t.summary().total, 0);
});

test('§四.1 一次输入只计一次命中（最长匹配后禁止子串回溯叠计）', () => {
  const t = track();
  const r = t.record({ beat: 'P1', input: '死亡报告和规矩表都在' });
  assert.equal(r.scored, true);
  assert.equal(t.summary().total, 1);
});

test('G6③ 异维等长多命中判 0 并记日志（合成词表·能力守卫）', () => {
  const t = createPerceptionTrack({
    config: resolveConfig(),
    wordlists: {
      P2: [
        { id: 'P2.陪护', term: '陪护', synonyms: ['陈望'], dimension: 'S', cid: 'C-CARE-01' },
        { id: 'P2.陈望', term: '陈望', synonyms: ['名字'], dimension: 'N', cid: 'C-NAME-01' },
      ],
    },
  });
  const r = t.record({ beat: 'P2', input: '陈望' });
  assert.equal(r.scored, false);
  assert.equal(r.reason, 'cross_dimension_ambiguous');
  const s = t.summary();
  assert.equal(s.total, 0);
  assert.equal(s.logs.length, 1);
  assert.equal(s.logs[0].code, 'cross_dimension_ambiguous');
  assert.equal(s.logs[0].beat, 'P2');
  assert.deepEqual(
    [...new Set(s.logs[0].candidates.map((c) => c.dimension))].sort(),
    ['N', 'S'],
  );
});

test('X6-7 清串回归：P02「陈望」判 N（C-NAME-01），X6 清单为空', () => {
  const t = track();
  assert.deepEqual(t.summary().cidConflicts, []);
  const r = t.record({ beat: 'P2', input: '陈望' });
  assert.equal(r.scored, true);
  assert.equal(r.dimension, 'N');
  assert.equal(r.rowId, 'P2.陈望');
  assert.equal(r.cid, 'C-NAME-01');
  const s = t.record({ beat: 'P2', input: '摘录' });
  assert.equal(s.scored, true);
  assert.equal(s.dimension, 'S');
  assert.equal(s.cid, 'C-CARE-01');
});

test('无命中 / 空输入 / 无词库 均不落分', () => {
  const t = track();
  assert.equal(t.record({ beat: 'P1', input: '随便看看' }).reason, 'no_match');
  assert.equal(t.record({ beat: 'P1', input: '   ' }).reason, 'empty_input');
  assert.equal(t.record({ beat: 'P12', input: '规矩' }).reason, 'no_wordlist');
  assert.equal(t.summary().total, 0);
});

test('P2 顺序信号映射未定案 → 记事件不落分（pending 暴露）', () => {
  const t = track();
  const r = t.recordOrder({ beat: 'P2', optionId: '表' });
  assert.equal(r.scored, false);
  assert.equal(r.reason, 'mapping_pending');
  const s = t.summary();
  assert.equal(s.total, 0);
  assert.ok(s.pending.includes('P2.ORDER.SN_MAPPING'));
});

test('R3 跨拍同词按 C-ID 去重：P2/P5 托付只计首次', () => {
  const t = track();
  const first = t.record({ beat: 'P2', input: '托付' });
  assert.equal(first.scored, true);
  assert.equal(first.cid, 'C-TRUST-01');
  assert.equal(first.dedupReason, 'first');

  const second = t.record({ beat: 'P5', input: '托付' });
  assert.equal(second.scored, false);
  assert.equal(second.reason, 'dedup_hit');
  assert.equal(second.cid, 'C-TRUST-01');
  assert.equal(second.sampleAdded, false);
  assert.equal(t.summary().total, 1);
  assert.deepEqual(t.summary().scoredCids, ['C-TRUST-01']);
  assert.equal(t.summary().dedup.hits, 1);
});

test('遗留口径 count_all 可显式开启（不合规，仅对照）', () => {
  const t = track({ perception: { crossBeatPolicy: 'count_all' } });
  assert.equal(t.record({ beat: 'P2', input: '托付' }).scored, true);
  assert.equal(t.record({ beat: 'P5', input: '托付' }).scored, true);
  assert.equal(t.summary().total, 2);
});

test('维度权重配置位可覆盖默认 +1（整数）', () => {
  const t = track({ dimension: { weights: { P1: { S: 2 } } } });
  const r = t.record({ beat: 'P1', input: '死亡报告' });
  assert.equal(r.weight, 2);
  assert.equal(t.summary().S, 2);
});

test('summary 按拍分组且只读快照', () => {
  const t = track();
  t.record({ beat: 'P1', input: '死亡报告' });
  t.record({ beat: 'P1', input: '第五行' });
  const s = t.summary();
  assert.deepEqual(s.byBeat.P1, { S: 1, N: 1 });
  s.byBeat.P1.S = 99;
  assert.equal(t.summary().byBeat.P1.S, 1);
});
