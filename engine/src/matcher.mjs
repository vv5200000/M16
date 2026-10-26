// G6 四规则 + 契约 §四.1「一次输入只计一次命中」的匹配器。
// 规则：① 单条单映射；② 最长匹配优先；③ 异维多命中判 0 并记日志；
//      ④ 严格前缀异维必须消歧（消源优先 = 最长匹配天然消解严格前缀）；
//      §四.1 最长命中后禁止子串回溯叠计——一次输入只产出 1 个命中。

import { normalize } from './text.mjs';

export class LexiconError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LexiconError';
  }
}

/**
 * 构建词条索引。
 * @param {Array<{id:string, term:string, synonyms?:string[], [key:string]:any}>} rows
 * @param {'dimension'|'option'} grouping 歧义判定的分组键：感知层按维度，决策层按选项
 * @param {string} groupField 行内用于分组判歧义的字段名（dimension / optionId）
 */
export function buildLexicon(rows, { groupField = 'dimension' } = {}) {
  const entries = [];
  const seen = new Set();
  for (const row of rows) {
    if (!row || typeof row.term !== 'string') throw new LexiconError('词条缺少 term');
    if (!row[groupField]) throw new LexiconError(`词条 ${row.term} 缺少 ${groupField}（单条单映射）`);
    if (groupField === 'dimension' && row.dimension !== 'S' && row.dimension !== 'N') {
      throw new LexiconError(`映射列必须是严格 S|N 枚举：${row.term} → ${String(row.dimension)}`);
    }
    const surfaces = [row.term, ...(row.synonyms ?? [])];
    for (const raw of surfaces) {
      const surface = normalize(raw);
      if (!surface) continue;
      const dedupeKey = `${row.id}::${surface}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      entries.push({
        rowId: row.id,
        key: row[groupField],
        surface,
        length: surface.length,
        term: row.term,
        payload: row,
      });
    }
  }
  return Object.freeze(entries);
}

/** 找出文本中所有 surface 出现位置（含重叠，供审计）。 */
export function findOccurrences(normalizedText, entries) {
  const hits = [];
  if (!normalizedText) return hits;
  for (const entry of entries) {
    let index = normalizedText.indexOf(entry.surface);
    while (index !== -1) {
      hits.push({ ...entry, index, end: index + entry.surface.length });
      index = normalizedText.indexOf(entry.surface, index + 1);
    }
  }
  return hits;
}

/**
 * 单次最长匹配。
 * @returns {{matched:boolean, ambiguous?:boolean, reason:string, chosen:object|null, candidates:object[], maxLength:number}}
 */
export function longestMatch(normalizedText, entries, { precedenceOf } = {}) {
  const hits = findOccurrences(normalizedText, entries);
  if (hits.length === 0) {
    return { matched: false, ambiguous: false, reason: 'no_match', chosen: null, candidates: [], maxLength: 0 };
  }

  const rank = (hit) => precedenceOf?.(hit) ?? 0;
  let bestPrecedence = -Infinity;
  for (const hit of hits) bestPrecedence = Math.max(bestPrecedence, rank(hit));
  const topPrecedence = hits.filter((hit) => rank(hit) === bestPrecedence);

  let maxLength = 0;
  for (const hit of topPrecedence) maxLength = Math.max(maxLength, hit.length);
  const top = topPrecedence.filter((hit) => hit.length === maxLength);

  const keys = new Set(top.map((hit) => hit.key));
  const candidates = hits
    .slice()
    .sort((a, b) => rank(b) - rank(a) || b.length - a.length || a.index - b.index)
    .map((hit) => ({
      surface: hit.surface,
      key: hit.key,
      rowId: hit.rowId,
      length: hit.length,
      index: hit.index,
      precedence: rank(hit),
    }));

  if (keys.size > 1) {
    // G6③：异维（或异选项）等长多命中 → 判 0 并记日志
    return { matched: true, ambiguous: true, reason: 'cross_key_ambiguous', chosen: null, candidates, maxLength };
  }
  return { matched: true, ambiguous: false, reason: 'hit', chosen: top[0], candidates, maxLength };
}

/**
 * 逐原型取"最长正/负命中"（P12 用）。每个原型每个极性最多 1 个命中，
 * 不做子串回溯叠计；同时保留全部候选供审计（不落原文）。
 */
export function matchByGroup(normalizedText, entries) {
  const hits = findOccurrences(normalizedText, entries);
  const best = new Map();
  for (const hit of hits) {
    const groupKey = hit.key;
    const current = best.get(groupKey);
    if (!current || hit.length > current.length) best.set(groupKey, hit);
  }
  return { hits, best };
}
