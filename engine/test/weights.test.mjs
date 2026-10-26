import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveConfig, ConfigError, DEFAULT_CONFIG, PENDING_ARBITRATIONS } from '../src/config.mjs';
import { createSession } from '../src/session.mjs';

test('冻结默认值：单层普通权重 +1，P12 每段 1 / 全拍 3，P4 排除', () => {
  const config = resolveConfig();
  assert.equal(config.conviction.defaultWeight, 1);
  assert.equal(config.dimension.defaultWeight, 1);
  assert.deepEqual(config.perception.excludedBeats, ['P4']);
  assert.equal(config.p12.maxPointsPerSegment, 1);
  assert.equal(config.p12.maxPointsTotal, 3);
  assert.equal(config.p12.maxInputChars, 120);
  assert.equal(config.p12.overLimitPolicy, 'zero');
  assert.equal(config.decision.forcedConsumesFirstDecision, false);
  assert.deepEqual(config.trigger.requireTfFrom, ['P6', 'P10']);
  assert.deepEqual(config.trigger.deepMounts, ['P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10']);
});

test('F5：弱流向与普通流向同为 +1（P4 A→C / P5 B→B / P10 B→B 弱）', () => {
  const s = createSession({ config: {} });
  assert.equal(s.choose({ beat: 'P4', input: '信他' }).convictionWeight, 1);
  assert.equal(s.choose({ beat: 'P5', input: '怀疑表被动过' }).convictionWeight, 1);
  assert.equal(s.choose({ beat: 'P10', input: '问他信谁' }).convictionWeight, 1);
  assert.equal(s.choose({ beat: 'P8', input: '逼他交出账本' }).convictionWeight, 1);
  assert.equal(s.choose({ beat: 'P9', input: '问鞋' }).convictionWeight, 1);
});

test('四维单层：每个分叉的维度权重默认 1', () => {
  const s = createSession({ config: {} });
  assert.equal(s.choose({ beat: 'P4', input: '复查' }).dimensionWeight, 1);
  assert.equal(s.choose({ beat: 'P5', input: '怀疑表被动过' }).dimensionWeight, 1);
  assert.equal(s.choose({ beat: 'P6', input: '追账' }).dimensionWeight, 1);
  assert.equal(s.choose({ beat: 'P11', input: '回到枪案' }).dimensionWeight, 1);
});

test('P06 权重待裁项：默认按 1 运行，但可配置位覆盖（整数）', () => {
  const plain = createSession({ config: {} });
  plain.choose({ beat: 'P6', input: '追账' });
  assert.equal(plain.dimensionScores().TF.T, 1);
  assert.equal(plain.diagnostics().decision.conviction.B, 1);

  const bumped = createSession({
    config: {
      dimension: { weights: { P6: { TF: 2 } } },
      conviction: { weights: { P6: { A: 3 } } },
    },
  });
  bumped.choose({ beat: 'P6', input: '追账' });
  assert.equal(bumped.dimensionScores().TF.T, 2);
  assert.equal(bumped.diagnostics().decision.conviction.B, 3);
});

test('待裁项显式暴露，不静默生效', () => {
  const config = resolveConfig();
  const ids = config.pending.map((item) => item.id);
  assert.deepEqual(ids, PENDING_ARBITRATIONS.map((item) => item.id));
  for (const expected of ['P06.TF.weight', 'P2.ORDER.SN_MAPPING', 'P12.WORDLIST', 'P5.JP.WORDFACE']) {
    assert.ok(ids.includes(expected), `缺少待裁项：${expected}`);
  }
  const p06 = config.pending.find((item) => item.id === 'P06.TF.weight');
  assert.equal(p06.activeDefault, 1);
  assert.equal(p06.owner, '项目');

  assert.equal(Object.isFrozen(config.pending), true);
  assert.throws(() => {
    config.pending[0].note = '被改写';
  }, TypeError);
  assert.notEqual(resolveConfig().pending[0].note, '被改写');
});

test('F5：拒绝小数 / 负数 / 非整数权重', () => {
  assert.throws(() => resolveConfig({ conviction: { defaultWeight: 1.5 } }), ConfigError);
  assert.throws(() => resolveConfig({ dimension: { defaultWeight: -1 } }), ConfigError);
  assert.throws(() => resolveConfig({ conviction: { weights: { P6: { A: 2.5 } } } }), ConfigError);
  assert.throws(() => resolveConfig({ dimension: { weights: { P6: { TF: '2' } } } }), ConfigError);
  assert.doesNotThrow(() => resolveConfig({ dimension: { weights: { P6: { TF: 2 } } } }));
});

test('P4 排除是冻结项，配置无法移除', () => {
  assert.throws(() => resolveConfig({ perception: { excludedBeats: [] } }), ConfigError);
  assert.throws(() => resolveConfig({ perception: { excludedBeats: ['P5'] } }), ConfigError);
});

test('P12 上限冻结：每段 1 / 全拍 3 不可配置', () => {
  assert.throws(() => resolveConfig({ p12: { maxPointsPerSegment: 2 } }), ConfigError);
  assert.throws(() => resolveConfig({ p12: { maxPointsTotal: 4 } }), ConfigError);
  assert.throws(() => resolveConfig({ p12: { maxInputChars: 0 } }), ConfigError);
});

test('未知枚举值在构建期拒绝', () => {
  assert.throws(() => resolveConfig({ perception: { crossBeatPolicy: 'latest' } }), ConfigError);
  assert.throws(() => resolveConfig({ perception: { maxHitsPerInput: 3 } }), ConfigError);
  assert.throws(() => resolveConfig({ p12: { overLimitPolicy: 'ignore' } }), ConfigError);
  assert.throws(() => resolveConfig({ trigger: { deepMounts: [] } }), ConfigError);
});

test('配置解析结果不可变，默认配置不被污染', () => {
  const config = resolveConfig();
  assert.equal(Object.isFrozen(config), true);
  assert.equal(Object.isFrozen(config.p12), true);
  assert.equal(Object.isFrozen(config.dimension.weights), true);
  assert.throws(() => {
    config.dimension.defaultWeight = 5;
  }, TypeError);
  assert.throws(() => {
    config.dimension.weights.P6 = { TF: 9 };
  }, TypeError);
  assert.equal(resolveConfig().dimension.defaultWeight, 1);
  assert.deepEqual(DEFAULT_CONFIG.dimension.weights, {});
});
