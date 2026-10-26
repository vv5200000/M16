// 感知层轨道：S/N 只来自关键词探索。P4 整拍排除（O1 口径②，契约 §二.3）。
// 跨拍同词按 R1–R6（项目 seq=187 采纳）：cid → mapping 全局唯一（R1/R2），
// 计分去重键 = cid（R3）：同一 cid 只在首次有效探索计 1 分，后续返回文本、记 dedup_hit。
// P2"先看哪件托付"是唯一"决策形态采 S/N"例外，但其 S/N 归属未定案，
// 因此引擎只记事件、不落分（pending: P2.ORDER.SN_MAPPING）。

import { buildLexicon, longestMatch } from './matcher.mjs';
import { normalize, hashSeed } from './text.mjs';

const CID_PATTERN = /^C-[A-Z]{1,12}-\d{2}$/;
const MAX_CIDS_PER_SURFACE = 3; // R4 上限

class PerceptionDataError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PerceptionDataError';
  }
}

/** 归一化词面貌似重复面的展示口径（与 matcher 一致）。 */
function surfacesOf(row) {
  return [row.term, ...(row.synonyms ?? [])].map(normalize).filter(Boolean);
}

/**
 * 构建 cid_registry / word_index / beat_pool（规则 §五.1）。
 * 结构性违规直接拒绝（缺 cid、同 cid 异映射、同词面 >3 个 cid）；
 * X6 类同词面异映射记入 conflicts 列表（运行期判 0，待数据修订）。
 */
function buildRegistry(wordlists) {
  const cidRegistry = new Map(); // cid -> { cid, mapping, beats:Set, rows:[] }
  const wordIndex = new Map(); // surface -> { cids:Set, mappings:Set, rows:[] }
  const conflicts = [];

  for (const [beat, rows] of Object.entries(wordlists ?? {})) {
    for (const row of rows ?? []) {
      if (!CID_PATTERN.test(row.cid ?? '')) {
        throw new PerceptionDataError(`词条 ${row.term} 缺少合法 C-ID（R2）：${String(row.cid)}`);
      }
      if (!cidRegistry.has(row.cid)) {
        cidRegistry.set(row.cid, { cid: row.cid, mapping: row.dimension, beats: new Set(), rows: [] });
      }
      const cidEntry = cidRegistry.get(row.cid);
      if (cidEntry.mapping !== row.dimension) {
        throw new PerceptionDataError(
          `C-ID ${row.cid} 映射不一致（R2）：已有 ${cidEntry.mapping}，${row.id} 是 ${row.dimension}`,
        );
      }
      cidEntry.beats.add(beat);
      cidEntry.rows.push({ id: row.id, beat });

      for (const surface of surfacesOf(row)) {
        if (!wordIndex.has(surface)) {
          wordIndex.set(surface, { surface, cids: new Set(), mappings: new Set(), rows: [] });
        }
        const indexEntry = wordIndex.get(surface);
        indexEntry.cids.add(row.cid);
        indexEntry.mappings.add(row.dimension);
        indexEntry.rows.push({ id: row.id, beat, cid: row.cid, dimension: row.dimension });
      }
    }
  }

  for (const indexEntry of wordIndex.values()) {
    if (indexEntry.cids.size > MAX_CIDS_PER_SURFACE) {
      throw new PerceptionDataError(
        `词面「${indexEntry.surface}」绑定 ${indexEntry.cids.size} 个 C-ID，超过 R4 上限 ${MAX_CIDS_PER_SURFACE}`,
      );
    }
    if (indexEntry.mappings.size > 1) {
      conflicts.push({
        code: 'X6_cross_mapping_conflict',
        surface: indexEntry.surface,
        mappings: [...indexEntry.mappings],
        rows: indexEntry.rows.map((row) => ({ ...row })),
      });
    }
  }

  return { cidRegistry, wordIndex, conflicts };
}

export function createPerceptionTrack({ config, wordlists }) {
  const lexicons = new Map();
  for (const [beat, rows] of Object.entries(wordlists ?? {})) {
    lexicons.set(beat, buildLexicon(rows));
  }
  const { cidRegistry, wordIndex, conflicts: buildConflicts } = buildRegistry(wordlists);

  const samples = [];
  const byBeat = new Map();
  const surfaceHistory = new Map(); // surface -> [{beat, dimension, cid}]
  const scoredCids = new Set(); // R3：会话级首次计分集合
  const pending = new Set();
  const logs = [];

  function bumpBeat(beat, dimension, weight) {
    if (!byBeat.has(beat)) byBeat.set(beat, { S: 0, N: 0 });
    byBeat.get(beat)[dimension] += weight;
  }

  function log(entry) {
    logs.push(entry);
  }

  /**
   * 记录一次关键词探索。
   * @param {{beat:string, input:string, probe?:boolean}} event
   * probe=true 只取返回文本块（如 P4 的 chips 面），不落任何采样计数。
   */
  function record({ beat, input, probe = false, source = 'keyword' } = {}) {
    if (!beat) return { scored: false, reason: 'missing_beat' };

    if (probe) {
      return { scored: false, reason: 'probe_no_sample', beat, dimension: null, sampleAdded: false };
    }
    if (config.isExcludedFromSn(beat)) {
      // P4 正常返回文本块（体验不变），但绝不落 S/N 分，且不写 scored_cids（不占首计位）。
      return { scored: false, reason: 'beat_excluded_from_sn', beat, dimension: null, sampleAdded: false };
    }
    const lexicon = lexicons.get(beat);
    if (!lexicon) {
      return { scored: false, reason: 'no_wordlist', beat, dimension: null, sampleAdded: false };
    }

    const text = normalize(input);
    if (!text) return { scored: false, reason: 'empty_input', beat, dimension: null, sampleAdded: false };

    const match = longestMatch(text, lexicon);
    if (!match.matched) {
      return { scored: false, reason: 'no_match', beat, dimension: null, sampleAdded: false };
    }
    if (match.ambiguous) {
      // G6③：异维多命中判 0 并记日志
      log({
        code: 'cross_dimension_ambiguous',
        beat,
        crossDim: true,
        dedupReason: 'cross_dim',
        inputLength: text.length,
        inputHash: hashSeed(text),
        candidates: match.candidates.map((c) => ({ surface: c.surface, dimension: c.key, rowId: c.rowId, cid: c.payload?.cid ?? null })),
      });
      return { scored: false, reason: 'cross_dimension_ambiguous', beat, dimension: null, sampleAdded: false };
    }

    const { chosen } = match;
    const row = chosen.payload;
    const cid = row.cid;

    // §五.3 同词异指：同词面绑定多 C-ID 时按当前拍解析（拍内 lexicon 天然解析），记 alias_resolve。
    const indexEntry = wordIndex.get(chosen.surface);
    const aliasResolved = indexEntry && indexEntry.cids.size > 1;
    if (aliasResolved) {
      log({
        code: 'alias_resolve',
        beat,
        matchedRow: chosen.rowId,
        cid,
        mapping: chosen.key,
        candidates: [...indexEntry.cids],
        inputLength: text.length,
      });
    }

    if (row.l3 === false) {
      // L3 不计分（如 P06「窗口」共享 C-WIN-01，X7）：返回文本、不落分、不占首计位。
      log({
        code: 'l3_not_scored',
        beat,
        matchedRow: chosen.rowId,
        cid,
        mapping: chosen.key,
        scored: false,
        dedupReason: 'l3_not_scored',
        crossDim: false,
        inputLength: text.length,
        inputHash: hashSeed(text),
      });
      return {
        scored: false, reason: 'l3_not_scored', beat, dimension: chosen.key,
        rowId: chosen.rowId, cid, dedupReason: 'l3_not_scored', sampleAdded: false,
      };
    }

    if (config.perception.crossBeatPolicy === 'first_exploration_per_cid' && scoredCids.has(cid)) {
      // R3：同一 cid 跨拍重复命中 → 返回文本但不落分，记 dedup_hit。
      log({
        code: 'dedup_hit',
        beat,
        matchedRow: chosen.rowId,
        cid,
        mapping: chosen.key,
        scored: false,
        dedupReason: 'dedup_hit',
        crossDim: false,
        inputLength: text.length,
        inputHash: hashSeed(text),
      });
      return {
        scored: false, reason: 'dedup_hit', beat, dimension: chosen.key,
        rowId: chosen.rowId, cid, dedupReason: 'dedup_hit', sampleAdded: false,
      };
    }

    const weight = config.dimensionWeight(beat, chosen.key);
    samples.push({
      beat,
      dimension: chosen.key,
      rowId: chosen.rowId,
      cid,
      surface: chosen.surface,
      weight,
      source,
    });
    scoredCids.add(cid);
    bumpBeat(beat, chosen.key, weight);
    if (!surfaceHistory.has(chosen.surface)) surfaceHistory.set(chosen.surface, []);
    surfaceHistory.get(chosen.surface).push({ beat, dimension: chosen.key, cid });

    log({
      code: 'scored',
      beat,
      matchedRow: chosen.rowId,
      cid,
      mapping: chosen.key,
      scored: weight > 0,
      dedupReason: weight > 0 ? 'first' : 'zero_weight',
      crossDim: false,
      inputLength: text.length,
      inputHash: hashSeed(text),
    });

    return {
      scored: weight > 0,
      reason: weight > 0 ? 'hit' : 'zero_weight',
      beat,
      dimension: chosen.key,
      rowId: chosen.rowId,
      cid,
      dedupReason: weight > 0 ? 'first' : 'zero_weight',
      weight,
      sampleAdded: true,
    };
  }

  /** P2 顺序信号：契约称计 S/N，但映射未定案 → 只记事件。 */
  function recordOrder({ beat, optionId } = {}) {
    pending.add('P2.ORDER.SN_MAPPING');
    log({ code: 'order_signal_pending_mapping', beat, optionId: optionId ?? null });
    return { scored: false, reason: 'mapping_pending', beat, dimension: null, sampleAdded: false };
  }

  function summary() {
    let total = 0;
    let weightedS = 0;
    let weightedN = 0;
    for (const sample of samples) {
      total += 1;
      if (sample.dimension === 'S') weightedS += sample.weight;
      if (sample.dimension === 'N') weightedN += sample.weight;
    }
    const conflicts = [];
    for (const [surface, entries] of surfaceHistory.entries()) {
      const dims = new Set(entries.map((entry) => entry.dimension));
      if (dims.size > 1) {
        conflicts.push({
          surface,
          dimensions: [...dims],
          beats: [...new Set(entries.map((entry) => entry.beat))],
          cids: [...new Set(entries.map((entry) => entry.cid))],
        });
      }
    }
    const byBeatOut = {};
    for (const [beat, counts] of byBeat.entries()) byBeatOut[beat] = { ...counts };
    const dedup = { hits: 0, l3: 0, first: 0 };
    for (const entry of logs) {
      if (entry.code === 'dedup_hit') dedup.hits += 1;
      if (entry.code === 'l3_not_scored') dedup.l3 += 1;
      if (entry.code === 'scored' && entry.dedupReason === 'first') dedup.first += 1;
    }
    return {
      total,
      S: weightedS,
      N: weightedN,
      weightedS,
      weightedN,
      sampled: total > 0,
      byBeat: byBeatOut,
      scoredCids: [...scoredCids],
      dedup,
      conflicts,
      cidConflicts: buildConflicts.map((conflict) => ({ ...conflict })),
      pending: [...pending],
      logs: logs.map((entry) => ({ ...entry })),
    };
  }

  return {
    record,
    recordOrder,
    summary,
    hasLexicon: (beat) => lexicons.has(beat),
    cidRegistry: () => new Map(cidRegistry),
  };
}