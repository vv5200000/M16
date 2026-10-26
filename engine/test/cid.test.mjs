import test from 'node:test';
import assert from 'node:assert/strict';
import { createPerceptionTrack } from '../src/perception.mjs';
import { resolveConfig } from '../src/config.mjs';
import { PERCEPTION_WORDLISTS } from '../data/beats.mjs';

function track(wordlists) {
  return createPerceptionTrack({ config: resolveConfig(), wordlists });
}

test('规则 §五.6 回归③：P02 问「手表」→ P05 再问「手表」→ 第二次 scored=false', () => {
  const t = track(PERCEPTION_WORDLISTS);
  const first = t.record({ beat: 'P2', input: '手表' });
  assert.equal(first.scored, true);
  assert.equal(first.cid, 'C-WATCH-01');

  const second = t.record({ beat: 'P5', input: '手表' });
  assert.equal(second.scored, false);
  assert.equal(second.reason, 'dedup_hit');
  assert.equal(second.cid, 'C-WATCH-01');
  assert.equal(t.summary().total, 1);
});

test('规则 §五.6 回归②：P06 问「账本」→ P08 再问「账本」→ 两次都计分（不同 C-ID）', () => {
  // C-ACC 编号按数据 seq=193 台账：04=刀疤那本账（C6「一本」合并，私账=账本同 C-ID 同义）；05 已撤销不复用。
  const t = track({
    P6: [{ id: 'P6.苏晚账本', term: '账本', synonyms: ['锁起来的账本'], dimension: 'S', cid: 'C-ACC-01' }],
    P8: [{ id: 'P8.刀疤那本账', term: '账本', synonyms: ['私账', '鞋垫里的账'], dimension: 'S', cid: 'C-ACC-04' }],
  });

  const p6 = t.record({ beat: 'P6', input: '账本' });
  assert.equal(p6.scored, true);
  assert.equal(p6.cid, 'C-ACC-01');

  const p8 = t.record({ beat: 'P8', input: '账本' });
  assert.equal(p8.scored, true);
  assert.equal(p8.cid, 'C-ACC-04');
  assert.equal(t.summary().total, 2);
  assert.deepEqual(t.summary().scoredCids.sort(), ['C-ACC-01', 'C-ACC-04']);

  // §五.3 同词异指按拍解析，记 alias_resolve
  const aliasLogs = t.summary().logs.filter((entry) => entry.code === 'alias_resolve');
  assert.equal(aliasLogs.length, 2);
  assert.deepEqual(aliasLogs[0].candidates.sort(), ['C-ACC-01', 'C-ACC-04']);
  assert.equal(aliasLogs[0].cid, 'C-ACC-01');
  assert.equal(aliasLogs[1].cid, 'C-ACC-04');
});

test('规则 §五.6 回归①：最长命中优先，禁子串回溯叠计', () => {
  const t = track({
    P6: [
      { id: 'P6.编号', term: '编号', dimension: 'S', cid: 'C-NUM-01' },
      { id: 'P6.老账户', term: '老账户的编号', dimension: 'N', cid: 'C-OLD-01' },
    ],
  });
  const r = t.record({ beat: 'P6', input: '老账户的编号' });
  assert.equal(r.dimension, 'N');
  assert.equal(r.cid, 'C-OLD-01');
  assert.equal(t.summary().total, 1);

  // 单独输入「编号」仍可命中 S 行（只说明不叠计，不是屏蔽）
  const single = t.record({ beat: 'P6', input: '编号' });
  assert.equal(single.dimension, 'S');
  assert.equal(single.cid, 'C-NUM-01');
});

test('§五.4：P4 命中不落分且不写 scored_cids，后续拍同 C-ID 仍可首计', () => {
  const t = track({
    P4: [{ id: 'P4.钥匙', term: '钥匙', dimension: 'S', cid: 'C-KEY-01' }],
    P7: [{ id: 'P7.钥匙', term: '钥匙', dimension: 'S', cid: 'C-KEY-01' }],
  });
  assert.equal(t.record({ beat: 'P4', input: '钥匙' }).reason, 'beat_excluded_from_sn');
  assert.deepEqual(t.summary().scoredCids, []);

  const p7 = t.record({ beat: 'P7', input: '钥匙' });
  assert.equal(p7.scored, true);
  assert.equal(p7.dedupReason, 'first');
});

test('l3:false 行命中返回文本但不计分、不占首计位（P06「窗口」口径）', () => {
  const t = track({
    P5: [{ id: 'P5.两小时', term: '两小时', dimension: 'N', cid: 'C-WIN-01' }],
    P6: [{ id: 'P6.窗口', term: '窗口', synonyms: ['时间窗'], dimension: 'N', cid: 'C-WIN-01', l3: false }],
  });
  const first = t.record({ beat: 'P5', input: '两小时' });
  assert.equal(first.scored, true);

  const l3 = t.record({ beat: 'P6', input: '窗口' });
  assert.equal(l3.scored, false);
  assert.equal(l3.reason, 'l3_not_scored');
  assert.equal(l3.dedupReason, 'l3_not_scored');
  assert.equal(t.summary().total, 1);

  // 反向：先问 P06 窗口（L3 不计分）→ 不占位，P05 两小时仍首计
  const t2 = track({
    P5: [{ id: 'P5.两小时', term: '两小时', dimension: 'N', cid: 'C-WIN-01' }],
    P6: [{ id: 'P6.窗口', term: '窗口', dimension: 'N', cid: 'C-WIN-01', l3: false }],
  });
  t2.record({ beat: 'P6', input: '窗口' });
  assert.deepEqual(t2.summary().scoredCids, []);
  assert.equal(t2.record({ beat: 'P5', input: '两小时' }).scored, true);
});

test('X6 冲突（同词面异映射）在构建期登记，运行期判 0 并记日志', () => {
  const t = track({
    P2: [
      { id: 'P2.陪护', term: '陪护', synonyms: ['陈望'], dimension: 'S', cid: 'C-CARE-01' },
      { id: 'P2.陈望', term: '陈望', synonyms: ['名字'], dimension: 'N', cid: 'C-NAME-01' },
    ],
  });
  const conflicts = t.summary().cidConflicts;
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].code, 'X6_cross_mapping_conflict');
  assert.equal(conflicts[0].surface, '陈望');
  assert.deepEqual(conflicts[0].mappings.sort(), ['N', 'S']);

  const r = t.record({ beat: 'P2', input: '陈望' });
  assert.equal(r.scored, false);
  assert.equal(r.reason, 'cross_dimension_ambiguous');
  assert.equal(t.summary().logs[0].crossDim, true);
  assert.equal(t.summary().logs[0].dedupReason, 'cross_dim');
});

test('X6 已消解验证：P01 规矩表不再持有「规矩」，P02 保持 N', () => {
  const t = track(PERCEPTION_WORDLISTS);
  assert.equal(t.record({ beat: 'P1', input: '规矩' }).reason, 'no_match');
  const p1 = t.record({ beat: 'P1', input: '猎庄规矩' });
  assert.equal(p1.scored, true);
  assert.equal(p1.cid, 'C-RULE-01');
  const p2 = t.record({ beat: 'P2', input: '规矩' });
  assert.equal(p2.scored, true);
  assert.equal(p2.cid, 'C-RULE-02');

  const cidConflicts = t.summary().cidConflicts.map((conflict) => conflict.surface);
  assert.deepEqual(cidConflicts, ['陈望'], '规矩不应再出现在 X6 清单中');
});

test('结构性违规拒绝构建：缺 C-ID / 同 cid 异映射 / 同词面 >3 个 cid（R2/R4）', () => {
  assert.throws(
    () => track({ P1: [{ id: 'P1.x', term: '词', dimension: 'S' }] }),
    /缺少合法 C-ID/,
  );
  assert.throws(
    () => track({
      P1: [{ id: 'P1.a', term: '甲', dimension: 'S', cid: 'C-X-01' }],
      P2: [{ id: 'P2.b', term: '乙', dimension: 'N', cid: 'C-X-01' }],
    }),
    /映射不一致/,
  );
  assert.throws(
    () => track({
      P1: [
        { id: 'P1.a', term: '账本', dimension: 'S', cid: 'C-A-01' },
        { id: 'P1.b', term: '账本', dimension: 'S', cid: 'C-B-01' },
        { id: 'P1.c', term: '账本', dimension: 'S', cid: 'C-C-01' },
        { id: 'P1.d', term: '账本', dimension: 'S', cid: 'C-D-01' },
      ],
    }),
    /超过 R4 上限/,
  );
});

test('cid_registry 暴露 cid → 映射 / 拍集，供快照与 lint 对账', () => {
  const t = track(PERCEPTION_WORDLISTS);
  const registry = t.cidRegistry();
  const watch = registry.get('C-WATCH-01');
  assert.equal(watch.mapping, 'S');
  assert.deepEqual([...watch.beats].sort(), ['P2', 'P5']);
  const trust = registry.get('C-TRUST-01');
  assert.equal(trust.mapping, 'N');
  assert.deepEqual([...trust.beats].sort(), ['P2', 'P5']);
  assert.equal(registry.get('C-TIME-01').mapping, 'S');
});