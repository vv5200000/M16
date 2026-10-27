// 会话引擎：唯一对外入口。双轨（定罪 A/B/C × MBTI 四维）在 API 层就分离，
// 不存在"从 P12 反推 MBTI"或"从决策点反推 S/N"的通道。

import { resolveConfig } from './config.mjs';
import { createPerceptionTrack } from './perception.mjs';
import { createDecisionTrack } from './decision.mjs';
import { createP12Track } from './p12.mjs';
import { evaluateTrigger, INSUFFICIENT_MESSAGE } from './trigger.mjs';
import { settleConviction, toEffectiveSettlement } from './settle.mjs';
import { BEATS, DEEP_MOUNTS, DECISION_FORKS, PERCEPTION_WORDLISTS } from '../data/beats.mjs';
import { P12_DATA } from '../data/p12.mjs';

const DEEP_MOUNT_SET = new Set(DEEP_MOUNTS);
const BEAT_IDS = new Set(BEATS.map((beat) => beat.id));

export function createSession({ config, data, seed = 'default', sessionId = null } = {}) {
  const cfg = resolveConfig(config);
  const perceptionWordlists = data?.perceptionWordlists ?? PERCEPTION_WORDLISTS;
  const decisionForks = data?.decisionForks ?? DECISION_FORKS;
  const p12Data = data?.p12 ?? P12_DATA;

  const opened = new Set();
  const perception = createPerceptionTrack({ config: cfg, wordlists: perceptionWordlists });
  const decision = createDecisionTrack({ config: cfg, forks: decisionForks });
  let p12 = null;

  function archiveGuard() {
    return p12 !== null;
  }

  function openMaterial(beat) {
    if (!BEAT_IDS.has(beat)) return { ok: false, reason: 'unknown_beat', beat };
    const alreadyOpen = opened.has(beat);
    opened.add(beat);
    return { ok: true, beat, deepMount: DEEP_MOUNT_SET.has(beat), alreadyOpen };
  }

  function explore({ beat, input, probe = false } = {}) {
    if (archiveGuard()) return { scored: false, reason: 'archive_started', beat };
    return perception.record({ beat, input, probe });
  }

  function chooseOrder({ beat = 'P2', optionId } = {}) {
    if (archiveGuard()) return { scored: false, reason: 'archive_started', beat };
    return perception.recordOrder({ beat, optionId });
  }

  function choose({ beat, input, forced = false } = {}) {
    if (archiveGuard()) return { scored: false, reason: 'archive_started', beat };
    return decision.choose({ beat, input, forced });
  }

  function canEnterArchive() {
    return evaluateTrigger({
      opened: [...opened],
      perception: perception.summary(),
      decision: decision.summary(),
      config: cfg,
    });
  }

  function beginArchive({ seed: p12Seed } = {}) {
    if (p12) {
      return { ok: true, alreadyStarted: true, presentedOrder: [...p12.presentedOrder], seed: p12.seed };
    }
    const gate = canEnterArchive();
    if (!gate.ok) {
      return { ok: false, reason: 'trigger_not_met', missing: gate.missing, message: INSUFFICIENT_MESSAGE };
    }
    const effectiveSeed = p12Seed ?? seed;
    p12 = createP12Track({ config: cfg, data: p12Data, seed: effectiveSeed });
    return { ok: true, alreadyStarted: false, presentedOrder: [...p12.presentedOrder], seed: effectiveSeed };
  }

  function fillSegment({ segmentId, input } = {}) {
    if (!p12) {
      return { segmentId: segmentId ?? null, prototype: null, points: 0, reason: 'archive_not_started', hits: [], truncated: false, inputLength: 0 };
    }
    return p12.submit({ segmentId, input });
  }

  /** 冻结结算的纯计算；live/shadow 共用同一份数值，差异只在"是否生效"。 */
  function computeSettlement() {
    const decisionSummary = decision.summary();
    return settleConviction({
      conviction: decisionSummary.conviction,
      p12: p12 ? p12.points() : { A: 0, B: 0, C: 0 },
      config: cfg,
    });
  }

  function settle() {
    // 批次 3 · 2A：live 原样生效；shadow 返回旁路壳（无原型/无分值/无读者文案）。
    const effective = toEffectiveSettlement(computeSettlement(), cfg.settlement.mode);
    return { ...effective, archiveComplete: p12 ? p12.isComplete() : false };
  }

  /** 灰度期运维/数据通道：真实计算值，不写生产留档、不含原文与任何 MBTI 字段。 */
  function shadowSettlementSnapshot() {
    const shadow = computeSettlement();
    return {
      s: { ...shadow.s },
      p12: { ...shadow.p12 },
      t: { ...shadow.t },
      maxT: shadow.maxT,
      winners: [...shadow.winners],
      outcome: shadow.outcome,
      prototype: shadow.prototype,
      tieState: shadow.tieState,
    };
  }

  function dimensionScores() {
    const p = perception.summary();
    const d = decision.summary();
    return {
      SN: { S: p.S, N: p.N, total: p.total, sampled: p.sampled },
      TF: { T: d.axes.TF.T, F: d.axes.TF.F, total: d.axes.TF.total, sampled: d.axes.TF.sampled },
      EI: { E: d.axes.EI.E, I: d.axes.EI.I, total: d.axes.EI.total, sampled: d.axes.EI.sampled },
      JP: { J: d.axes.JP.J, P: d.axes.JP.P, total: d.axes.JP.total, sampled: d.axes.JP.sampled },
      pending: [...new Set([...p.pending, ...cfg.pending.map((item) => item.id)])],
      source: { SN: 'perception.keyword', TF: 'decision.fork', EI: 'decision.fork', JP: 'decision.fork' },
    };
  }

  /**
   * 生产留档（口径 B，D3）：字段集严格等于
   * {段ID, 是否计分, 终采原型, tie_state, presented_order/种子} + 结算结论。
   * 不含原文、不含连续分值、不含任何 MBTI 字段。
   */
  function exportSettlementRecord() {
    const result = settle();
    return {
      schema: 'm16.settlement.v1',
      sessionId,
      archiveComplete: result.archiveComplete,
      conviction: {
        outcome: result.outcome,
        prototype: result.prototype,
        tieState: result.tieState,
        tiedPrototypes: result.outcome === 'unresolved' ? [...result.winners] : [],
      },
      p12: p12
        ? {
            presentedOrder: [...p12.presentedOrder],
            seed: p12.seed,
            segments: p12.segmentRecords().map((segment) => ({
              segmentId: segment.segmentId,
              scored: segment.scored,
              prototype: segment.prototype,
              tieState: segment.tieState,
            })),
          }
        : null,
    };
  }

  /** QA / 数据监控用，不进入生产留档；不含读者原文。 */
  function diagnostics() {
    return {
      configVersion: cfg.version,
      settlementMode: cfg.settlement.mode,
      pendingArbitrations: cfg.pending.map((item) => ({ ...item })),
      openedBeats: [...opened],
      perception: perception.summary(),
      decision: decision.summary(),
      // 灰度期只在此通道暴露真实计算值：联调方负责攒数，引擎不将其写入生产留档。
      ...(cfg.settlement.mode === 'shadow' ? { shadowSettlement: shadowSettlementSnapshot() } : {}),
      p12: p12
        ? {
            seed: p12.seed,
            presentedOrder: [...p12.presentedOrder],
            submittedCount: p12.submittedCount(),
            segments: p12.presentedOrder.map((segmentId) => ({ segmentId, attempts: p12.attempts(segmentId) })),
          }
        : null,
      notice: 'diagnostics 仅含命中词面与机器码，不含读者原文；不得写入生产留档。',
    };
  }

  return {
    openMaterial,
    explore,
    chooseOrder,
    choose,
    canEnterArchive,
    beginArchive,
    fillSegment,
    settle,
    dimensionScores,
    exportSettlementRecord,
    diagnostics,
    config: () => cfg,
  };
}
