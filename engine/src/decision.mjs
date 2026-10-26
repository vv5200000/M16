// 决策层轨道：T/F、E/I、J/P 只能来自隐性分叉行为；同一分叉 first-decision-wins。
// forced（超窗强制归档）不采样、不占 first-decision-wins（项目 seq=173 裁定）。
// P7–P9 的分叉只携带定罪流向，不产生任何 MBTI 维度分。

import { normalize } from './text.mjs';
import { longestMatch } from './matcher.mjs';

const AXES = Object.freeze({ TF: ['T', 'F'], EI: ['E', 'I'], JP: ['J', 'P'] });

function buildForkEntries(fork) {
  const entries = [];
  for (const option of fork.options) {
    for (const word of option.words ?? []) {
      const surface = normalize(word);
      if (!surface) continue;
      entries.push({
        rowId: option.id,
        key: option.id,
        surface,
        length: surface.length,
        term: word,
        payload: option,
      });
    }
  }
  return entries;
}

export function createDecisionTrack({ config, forks }) {
  const byBeat = new Map();
  for (const fork of forks ?? []) {
    if (!fork.beat || !fork.id) throw new Error('分叉定义缺少 beat/id');
    if (fork.axis && !AXES[fork.axis]) throw new Error(`未知维度：${fork.axis}`);
    for (const option of fork.options) {
      if (option.pole && fork.axis && !AXES[fork.axis].includes(option.pole)) {
        throw new Error(`选项 ${fork.id}.${option.id} 的 pole 与维度不符：${option.pole}`);
      }
    }
    const prepared = { ...fork, entries: buildForkEntries(fork) };
    if (!byBeat.has(fork.beat)) byBeat.set(fork.beat, []);
    byBeat.get(fork.beat).push(prepared);
  }

  const decisions = new Map(); // forkId -> optionId
  const conviction = { A: 0, B: 0, C: 0 };
  const axes = { TF: { T: 0, F: 0 }, EI: { E: 0, I: 0 }, JP: { J: 0, P: 0 } };
  const byBeatAxis = new Map();
  const records = [];
  const logs = [];

  function bumpAxis(beat, axis, pole, weight) {
    axes[axis][pole] += weight;
    if (!byBeatAxis.has(beat)) byBeatAxis.set(beat, { TF: { T: 0, F: 0 }, EI: { E: 0, I: 0 }, JP: { J: 0, P: 0 } });
    byBeatAxis.get(beat)[axis][pole] += weight;
  }

  /**
   * 读者的一次自由输入 → 隐性分叉判定。
   * @param {{beat:string, input:string, forced?:boolean}} event
   */
  function choose({ beat, input, forced = false } = {}) {
    const forkList = byBeat.get(beat);
    if (!forkList || forkList.length === 0) {
      return { scored: false, reason: 'no_fork', forkTyped: null, forkEffective: false };
    }
    const fork = forkList[0];

    if (forced) {
      // 强制归档：叙事线性推进，不采样、不占 first-decision-wins。
      records.push({
        beat,
        forkId: fork.id,
        axis: fork.axis ?? null,
        optionId: null,
        forkTyped: 'forced',
        forkEffective: false,
        reason: 'forced_timeout',
        inputLength: normalize(input).length,
      });
      return { scored: false, reason: 'forced_timeout', forkTyped: 'forced', forkEffective: false, axis: fork.axis ?? null };
    }

    const text = normalize(input);
    if (!text) {
      return { scored: false, reason: 'empty_input', forkTyped: null, forkEffective: false };
    }

    const match = longestMatch(text, fork.entries, {
      precedenceOf: (hit) => hit.payload?.precedence ?? 0,
    });

    if (!match.matched) {
      records.push({
        beat, forkId: fork.id, axis: fork.axis ?? null, optionId: null,
        forkTyped: 'none', forkEffective: false, reason: 'no_decision_match', inputLength: text.length,
      });
      return { scored: false, reason: 'no_decision_match', forkTyped: 'none', forkEffective: false, axis: fork.axis ?? null };
    }
    if (match.ambiguous) {
      // 互斥词面同时命中且优先级相同 → 不采分（项目 seq=173 裁-分叉词表"互斥重问不采分"）
      logs.push({
        code: 'fork_ambiguous',
        beat,
        forkId: fork.id,
        candidates: match.candidates.map((c) => ({ surface: c.surface, optionId: c.key })),
      });
      records.push({
        beat, forkId: fork.id, axis: fork.axis ?? null, optionId: null,
        forkTyped: 'ambiguous', forkEffective: false, reason: 'ambiguous_no_sample', inputLength: text.length,
      });
      return { scored: false, reason: 'ambiguous_no_sample', forkTyped: 'ambiguous', forkEffective: false, axis: fork.axis ?? null };
    }

    const option = match.chosen.payload;
    const prior = decisions.get(fork.id);
    if (prior && prior !== option.id) {
      // first-decision-wins：改选不覆写，但 fork_typed 恒记审计
      records.push({
        beat, forkId: fork.id, axis: fork.axis ?? null, optionId: option.id,
        forkTyped: option.pole ?? option.id, forkEffective: false,
        reason: 'first_decision_wins', inputLength: text.length,
      });
      return {
        scored: false,
        reason: 'first_decision_wins',
        forkTyped: option.pole ?? option.id,
        forkEffective: false,
        axis: fork.axis ?? null,
        recordedChoice: prior,
      };
    }
    if (prior === option.id) {
      // 同一选择重复提交：幂等，不重复计分
      records.push({
        beat, forkId: fork.id, axis: fork.axis ?? null, optionId: option.id,
        forkTyped: option.pole ?? option.id, forkEffective: false,
        reason: 'duplicate_choice', inputLength: text.length,
      });
      return {
        scored: false, reason: 'duplicate_choice',
        forkTyped: option.pole ?? option.id, forkEffective: false, axis: fork.axis ?? null,
      };
    }

    decisions.set(fork.id, option.id);

    const dimensionWeight = fork.axis ? config.dimensionWeight(beat, fork.axis) : 0;
    const convictionWeight = option.conviction ? config.convictionWeight(beat, option.id) : 0;

    if (fork.axis && option.pole) bumpAxis(beat, fork.axis, option.pole, dimensionWeight);
    if (option.conviction) conviction[option.conviction] += convictionWeight;

    records.push({
      beat, forkId: fork.id, axis: fork.axis ?? null, optionId: option.id,
      forkTyped: option.pole ?? option.id, forkEffective: true,
      reason: 'hit', inputLength: text.length,
    });

    return {
      scored: true,
      reason: 'hit',
      optionId: option.id,
      axis: fork.axis ?? null,
      pole: option.pole ?? null,
      conviction: option.conviction ?? null,
      dimensionWeight,
      convictionWeight,
      forkTyped: option.pole ?? option.id,
      forkEffective: true,
    };
  }

  function byBeatAxisTotal(beat, axis) {
    const bucket = byBeatAxis.get(beat)?.[axis];
    if (!bucket) return 0;
    return Object.values(bucket).reduce((sum, value) => sum + value, 0);
  }

  function summary() {
    const out = {};
    for (const [axis, poles] of Object.entries(AXES)) {
      const counts = { ...axes[axis] };
      const total = poles.reduce((sum, pole) => sum + (counts[pole] ?? 0), 0);
      out[axis] = { ...counts, total, sampled: total > 0 };
    }
    const forksOut = {};
    for (const [forkId, optionId] of decisions.entries()) forksOut[forkId] = optionId;
    const byBeat = {};
    for (const [beat, counts] of byBeatAxis.entries()) {
      byBeat[beat] = JSON.parse(JSON.stringify(counts));
    }
    return {
      axes: out,
      byBeat,
      conviction: { ...conviction },
      decidedForks: forksOut,
      audit: records.map((entry) => ({ ...entry })),
      logs: logs.map((entry) => ({ ...entry })),
    };
  }

  return { choose, summary, byBeatAxisTotal, decidedForks: () => [...decisions.keys()] };
}
