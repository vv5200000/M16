// 冻结契约的引擎侧配置。所有"待裁项"以 pending 清单显式暴露，禁止静默生效。

export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

/** 冻结算法中不可配置的常量（契约 §一/§三/§二）。改动必须走契约变更流程。 */
export const FROZEN = Object.freeze({
  prototypes: Object.freeze(['A', 'B', 'C']),
  p12MaxPointsPerSegment: 1,
  p12MaxPointsTotal: 3,
  excludedFromSn: Object.freeze(['P4']),
});

/**
 * 尚未定案、但引擎已有配置位的事项。
 * 出现即代表"当前按默认值运行"，不是已裁定值。
 */
export const PENDING_ARBITRATIONS = Object.freeze([
  {
    id: 'P06.TF.weight',
    scope: 'dimension',
    beat: 'P6',
    axis: 'TF',
    activeDefault: 1,
    owner: '项目',
    source: 'shared/P06_苏晚素材包_v1.md §三 待裁项②',
    note: '主嫌疑入口是否配更高权重；单层 +1 冻结口径下先按 1 预留。',
  },
  {
    id: 'P2.ORDER.SN_MAPPING',
    scope: 'perception',
    beat: 'P2',
    activeDefault: null,
    owner: '数据/产品',
    source: 'cases/第17条主故事线_v1.md 节拍表 P2 行',
    note: 'P2"先看哪件托付"记为 S/N，但全项目文档未给表/合同/陪护的 S/N 归属；引擎不臆造，事件记 scoring_pending。',
  },
  {
    id: 'P12.WORDLIST',
    scope: 'p12',
    activeDefault: 'seed_v0',
    owner: '数据',
    source: 'P12 方案 A §4.1 词表红线',
    note: '正/负/弃权词表终版由数据定稿；当前为可测种子表。',
  },
  {
    id: 'P5.JP.WORDFACE',
    scope: 'decision',
    beat: 'P5',
    axis: 'JP',
    activeDefault: 'derived_v0',
    owner: '产品',
    source: '项目 seq=173 裁-分叉词表 → 产品确认终表',
    note: 'P05 trust/doubt 词面（doubt 优先进引擎 precedence，否定词面暂归 B）；终表未回前按派生词面运行。',
  },
]);

const DEFAULT_ANCHORS = ['规矩', '账', '枪', '划痕', '口供', '了结'];

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertIntegerWeight(value, path) {
  if (!Number.isInteger(value) || value < 0) {
    throw new ConfigError(`${path} 必须是非负整数（F5 单层口径，禁小数/弱分档）：收到 ${String(value)}`);
  }
  return value;
}

function assertNumberInRange(value, min, max, path) {
  if (typeof value !== 'number' || Number.isNaN(value) || value < min || value > max) {
    throw new ConfigError(`${path} 必须是 [${min}, ${max}] 内的数字：收到 ${String(value)}`);
  }
  return value;
}

function deepFreeze(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const value of Object.values(obj)) deepFreeze(value);
  }
  return obj;
}

export const DEFAULT_CONFIG = {
  version: 'v1',
  conviction: { defaultWeight: 1, weights: {} },
  dimension: { defaultWeight: 1, weights: {} },
  perception: {
    excludedBeats: [...FROZEN.excludedFromSn],
    // R3（项目 seq=187 采纳）：计分去重键 = C-ID，只计首次有效探索。
    crossBeatPolicy: 'first_exploration_per_cid',
    maxHitsPerInput: 1,
  },
  decision: {
    // 项目 seq=173 裁定：forced（超窗强制归档）不是读者的有效首次选择，不占用 first-decision-wins。
    forcedConsumesFirstDecision: false,
  },
  // 批次 3 · 2A（D-B3-2）：灰度旁路。live = 现行行为；shadow = 记分/审计照常、定罪结算不生效。
  settlement: { mode: 'live' },
  p12: {
    echoTau: 0.6,
    marginDelta: 1,
    maxPointsPerSegment: FROZEN.p12MaxPointsPerSegment,
    maxPointsTotal: FROZEN.p12MaxPointsTotal,
    maxInputChars: 120,
    overLimitPolicy: 'zero',
    allowResubmit: true,
    anchorWords: [...DEFAULT_ANCHORS],
  },
  trigger: {
    deepMounts: ['P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10'],
    requireSn: true,
    requireP5Jp: true,
    requireTfFrom: ['P6', 'P10'],
    requireEiFrom: ['P11'],
  },
};

function mergeSection(defaults, overrides, path) {
  if (overrides === undefined) return { ...defaults };
  if (!isPlainObject(overrides)) throw new ConfigError(`${path} 必须是对象`);
  const out = { ...defaults, ...overrides };
  if ('weights' in defaults) {
    if (!isPlainObject(out.weights)) throw new ConfigError(`${path}.weights 必须是对象`);
  }
  return out;
}

/**
 * 合并并校验配置。未列出的项沿用冻结默认值。
 * @returns {Readonly<object>} 冻结后的配置，附 pending 清单
 */
export function resolveConfig(overrides = {}) {
  if (!isPlainObject(overrides)) throw new ConfigError('config 必须是对象');

  const config = {
    version: overrides.version ?? DEFAULT_CONFIG.version,
    conviction: mergeSection(DEFAULT_CONFIG.conviction, overrides.conviction, 'conviction'),
    dimension: mergeSection(DEFAULT_CONFIG.dimension, overrides.dimension, 'dimension'),
    perception: mergeSection(DEFAULT_CONFIG.perception, overrides.perception, 'perception'),
    decision: mergeSection(DEFAULT_CONFIG.decision, overrides.decision, 'decision'),
    settlement: mergeSection(DEFAULT_CONFIG.settlement, overrides.settlement, 'settlement'),
    p12: mergeSection(DEFAULT_CONFIG.p12, overrides.p12, 'p12'),
    trigger: mergeSection(DEFAULT_CONFIG.trigger, overrides.trigger, 'trigger'),
  };

  assertIntegerWeight(config.conviction.defaultWeight, 'conviction.defaultWeight');
  assertIntegerWeight(config.dimension.defaultWeight, 'dimension.defaultWeight');

  for (const [beat, weights] of Object.entries(config.conviction.weights)) {
    if (!isPlainObject(weights)) throw new ConfigError(`conviction.weights.${beat} 必须是对象`);
    for (const [optionId, value] of Object.entries(weights)) {
      assertIntegerWeight(value, `conviction.weights.${beat}.${optionId}`);
    }
  }
  for (const [beat, weights] of Object.entries(config.dimension.weights)) {
    if (!isPlainObject(weights)) throw new ConfigError(`dimension.weights.${beat} 必须是对象`);
    for (const [axis, value] of Object.entries(weights)) {
      assertIntegerWeight(value, `dimension.weights.${beat}.${axis}`);
    }
  }

  // O1 口径②（契约 §二.3）：P4 整拍不进 S/N 轨，不可通过配置移除。
  if (!config.perception.excludedBeats.includes('P4')) {
    throw new ConfigError('perception.excludedBeats 必须包含 P4（契约 §二.3 O1 口径②，冻结项）');
  }
  if (!['first_exploration_per_cid', 'count_all'].includes(config.perception.crossBeatPolicy)) {
    throw new ConfigError(
      'perception.crossBeatPolicy 只能是 first_exploration_per_cid（R3，默认）或 count_all（遗留口径，不合规）',
    );
  }
  if (![1, 'per_row'].includes(config.perception.maxHitsPerInput)) {
    throw new ConfigError("perception.maxHitsPerInput 只能是 1 或 'per_row'（契约 §四.1）");
  }

  // 批次 3 · 2A（D-B3-2）：灰度旁路为显式开关，默认 live 保持现行行为。
  if (!['live', 'shadow'].includes(config.settlement.mode)) {
    throw new ConfigError(
      "settlement.mode 只能是 'live'（默认，定罪生效）或 'shadow'（灰度旁路：记分/审计照常，定罪结算不生效）",
    );
  }

  if (config.p12.maxPointsPerSegment !== FROZEN.p12MaxPointsPerSegment) {
    throw new ConfigError('p12.maxPointsPerSegment 冻结为 1');
  }
  if (config.p12.maxPointsTotal !== FROZEN.p12MaxPointsTotal) {
    throw new ConfigError('p12.maxPointsTotal 冻结为 3');
  }
  assertNumberInRange(config.p12.echoTau, 0, 1, 'p12.echoTau');
  assertNumberInRange(config.p12.marginDelta, 0, 10, 'p12.marginDelta');
  if (!Number.isInteger(config.p12.maxInputChars) || config.p12.maxInputChars < 1) {
    throw new ConfigError('p12.maxInputChars 必须是正整数');
  }
  if (!['zero', 'truncate_only'].includes(config.p12.overLimitPolicy)) {
    throw new ConfigError("p12.overLimitPolicy 只能是 'zero' 或 'truncate_only'");
  }
  if (!Array.isArray(config.p12.anchorWords)) {
    throw new ConfigError('p12.anchorWords 必须是数组');
  }
  if (!Array.isArray(config.trigger.deepMounts) || config.trigger.deepMounts.length === 0) {
    throw new ConfigError('trigger.deepMounts 必须是非空数组');
  }

  Object.defineProperty(config, 'pending', {
    value: Object.freeze(PENDING_ARBITRATIONS.map((item) => Object.freeze({ ...item }))),
    enumerable: false,
  });
  Object.defineProperty(config, 'convictionWeight', {
    value: (beat, optionId) => config.conviction.weights?.[beat]?.[optionId] ?? config.conviction.defaultWeight,
    enumerable: false,
  });
  Object.defineProperty(config, 'dimensionWeight', {
    value: (beat, axis) => config.dimension.weights?.[beat]?.[axis] ?? config.dimension.defaultWeight,
    enumerable: false,
  });
  Object.defineProperty(config, 'isExcludedFromSn', {
    value: (beat) => config.perception.excludedBeats.includes(beat),
    enumerable: false,
  });

  return deepFreeze(config);
}
