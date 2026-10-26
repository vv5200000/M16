// P12 归档结语分类器（方案 A：确定性关键词规则）。
// 契约：只投 A/B/C 定罪分，不反推 MBTI；每段 ≤1；复述锚词不计分；
//       同段冲突记 0；弃权/中性/无法区分记 0（零误报优先，接受欠计）。
// 输出不含相似度、向量或任何 MBTI 字段。

import { normalize, trigrams, overlapRatio, truncateChars, mulberry32, hashSeed } from './text.mjs';
import { findOccurrences } from './matcher.mjs';
import { FROZEN } from './config.mjs';

const NEGATORS = ['不是', '并非', '没有', '不会', '绝不', '未曾', '谈不上', '算不上', '不'];

function buildEntries(wordlists) {
  const entries = [];
  for (const [prototype, groups] of Object.entries(wordlists)) {
    for (const polarity of ['pos', 'neg', 'abstain']) {
      for (const word of groups[polarity] ?? []) {
        const surface = normalize(word);
        if (!surface) continue;
        entries.push({
          key: `${prototype}|${polarity}`,
          prototype,
          polarity,
          surface,
          length: surface.length,
          term: word,
        });
      }
    }
  }
  return entries;
}

function isNegated(text, index) {
  for (const negator of NEGATORS) {
    const start = index - negator.length;
    if (start >= 0 && text.slice(start, index) === negator) return true;
  }
  return false;
}

function stripAnchors(text, anchors) {
  let out = text;
  for (const anchor of anchors) {
    if (!anchor) continue;
    out = out.split(anchor).join('');
  }
  return out;
}

/** 呈现顺序：seed 驱动，仅改变顺序，不改变段 ID 或计分。 */
export function presentationOrder(seed, segmentIds = ['A', 'B', 'C']) {
  const ids = [...segmentIds];
  const rand = mulberry32(hashSeed(seed));
  for (let i = ids.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}

/**
 * 单段分类（纯函数）。
 * @returns {{segmentId:string, prototype:string|null, points:0|1, reason:string, hits:Array, truncated:boolean, inputLength:number}}
 */
export function classifySegment({ segmentId, input, stems, wordlists, anchors, config }) {
  const entries = buildEntries(wordlists);
  const stemGrams = new Set();
  for (const stem of stems) {
    for (const gram of trigrams(normalize(stem.text))) stemGrams.add(gram);
  }
  return classifyWithEntries({ segmentId, input, stems, stemGrams, entries, anchors, config });
}

function classifyWithEntries({ segmentId, input, stemGrams, entries, anchors, config }) {
  const raw = input === null || input === undefined ? '' : String(input);
  const inputLength = Array.from(raw).length;
  const { value: clipped, truncated } = truncateChars(raw, config.p12.maxInputChars);

  if (truncated && config.p12.overLimitPolicy === 'zero') {
    return { segmentId, prototype: null, points: 0, reason: 'over_limit', hits: [], truncated: true, inputLength };
  }

  const text = normalize(clipped);
  if (!text) {
    return { segmentId, prototype: null, points: 0, reason: 'empty', hits: [], truncated, inputLength };
  }

  const occurrences = findOccurrences(text, entries);
  const best = new Map(); // `${prototype}|${polarity}` -> hit
  const abstainHits = [];
  const hits = [];

  for (const hit of occurrences) {
    if (hit.polarity === 'abstain') {
      abstainHits.push(hit);
      continue;
    }
    const negated = isNegated(text, hit.index);
    if (negated && hit.polarity === 'neg') {
      // 零误报优先：把"某一原型的负向词"再否定，不翻成该原型的正向信号。
      continue;
    }
    const polarity = negated ? 'neg' : hit.polarity;
    const key = `${hit.prototype}|${polarity}`;
    const current = best.get(key);
    if (!current || hit.length > current.length) best.set(key, hit);
    hits.push({ prototype: hit.prototype, polarity, term: hit.term, flipped: negated });
  }

  if (abstainHits.length > 0) {
    return { segmentId, prototype: null, points: 0, reason: 'abstain', hits: [], truncated, inputLength };
  }

  const prototypeIds = [...new Set(entries.map((entry) => entry.prototype))].filter((id) => id !== 'abstain');
  const scores = {};
  const posPrototypes = [];
  for (const prototype of prototypeIds) {
    const pos = best.get(`${prototype}|pos`);
    const neg = best.get(`${prototype}|neg`);
    scores[prototype] = (pos ? 1 : 0) - (neg ? 1 : 0);
    if (pos) posPrototypes.push(prototype);
  }

  const residual = stripAnchors(text, anchors);
  const echoRatio = overlapRatio(trigrams(residual), stemGrams);

  if (posPrototypes.length === 0) {
    const reason = residual.length === 0 || echoRatio >= config.p12.echoTau ? 'echo' : 'no_signal';
    return { segmentId, prototype: null, points: 0, reason, hits: [], truncated, inputLength };
  }

  if (posPrototypes.length >= 2) {
    const ranked = posPrototypes
      .map((prototype) => ({ prototype, score: scores[prototype] }))
      .sort((a, b) => b.score - a.score);
    if (ranked[0].score - ranked[1].score < config.p12.marginDelta) {
      return {
        segmentId,
        prototype: null,
        points: 0,
        reason: 'conflict',
        hits: hits.map((entry) => ({ ...entry })),
        truncated,
        inputLength,
      };
    }
  }

  const winner = posPrototypes
    .map((prototype) => ({ prototype, score: scores[prototype] }))
    .sort((a, b) => b.score - a.score || a.prototype.localeCompare(b.prototype))[0];

  if (winner.score < 1) {
    return { segmentId, prototype: null, points: 0, reason: 'no_signal', hits: [], truncated, inputLength };
  }

  return {
    segmentId,
    prototype: winner.prototype,
    points: 1,
    reason: 'hit',
    hits: hits.filter((entry) => entry.prototype === winner.prototype),
    truncated,
    inputLength,
  };
}

/**
 * P12 轨道：呈现顺序 + 三段提交 + 每段 ≤1 / 全拍 ≤3。
 */
export function createP12Track({ config, data, seed }) {
  const stems = data?.stems ?? [];
  const wordlists = data?.wordlists ?? {};
  const anchors = (config.p12.anchorWords ?? []).map(normalize).filter(Boolean);
  const entries = buildEntries(wordlists);
  const stemGrams = new Set();
  for (const stem of stems) {
    for (const gram of trigrams(normalize(stem.text))) stemGrams.add(gram);
  }
  const segmentIds = stems.map((stem) => stem.id);
  const presentedOrder = presentationOrder(seed, segmentIds);
  const segments = new Map();

  function submit({ segmentId, input } = {}) {
    if (!segmentIds.includes(segmentId)) {
      return { segmentId: segmentId ?? null, prototype: null, points: 0, reason: 'unknown_segment', hits: [], truncated: false, inputLength: 0 };
    }
    const existing = segments.get(segmentId);
    if (existing && !config.p12.allowResubmit) {
      return { ...existing.effective, reason: 'segment_locked' };
    }
    const result = classifyWithEntries({ segmentId, input, stemGrams, entries, anchors, config });
    segments.set(segmentId, {
      attempts: (existing?.attempts ?? 0) + 1,
      effective: result,
    });
    return result;
  }

  function points() {
    // 每段 ≤1（一个段落一条有效结果）→ 同一原型可跨段累加；全拍 ≤3 为硬上限。
    const out = {};
    for (const prototype of FROZEN.prototypes) out[prototype] = 0;
    let total = 0;
    for (const { effective } of segments.values()) {
      if (effective.points !== 1 || !effective.prototype) continue;
      out[effective.prototype] = (out[effective.prototype] ?? 0) + 1;
      total += 1;
    }
    if (total > config.p12.maxPointsTotal) {
      throw new Error(`P12 有效分合计 ${total} 超过全拍上限 ${config.p12.maxPointsTotal}`);
    }
    return out;
  }

  function segmentRecords() {
    return presentedOrder.map((segmentId) => {
      const entry = segments.get(segmentId);
      const effective = entry?.effective;
      return {
        segmentId,
        scored: effective?.points === 1,
        prototype: effective?.points === 1 ? effective.prototype : null,
        tieState: effective?.points === 1 ? 'single' : 'none',
      };
    });
  }

  function isComplete() {
    return segmentIds.every((id) => segments.has(id));
  }

  return {
    seed,
    presentedOrder,
    submit,
    points,
    segmentRecords,
    isComplete,
    attempts: (segmentId) => segments.get(segmentId)?.attempts ?? 0,
    submittedCount: () => segments.size,
  };
}
