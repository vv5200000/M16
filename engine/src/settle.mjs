// 定罪结算：冻结算法，逐字实现（契约 §一.1 / 主线 §三.4 / 产品裁决 C1–C2）。
//   S_p = P4–P11 累计分
//   T_p = S_p + P12 有效分_p   （每段 ≤1，全拍 ≤3）
//   argmax(T) 唯一 → 该原型定罪；并列 → "未形成单一指向"
// 不设人为分差门槛 N；不得用呈现顺序破并列。
//
// 批次 3 · 2A（D-B3-2，人类 seq=266）：灰度通道 = 记分/审计照常、定罪结算旁路。
// live 为默认行为；shadow 仅抹掉"生效"部分，计算值由 session.diagnostics() 提供给运维/数据。

import { FROZEN } from './config.mjs';

const UNRESOLVED_COPY = '你的路径未收束到单一原型。';

export const SETTLEMENT_MODES = Object.freeze(['live', 'shadow']);

function assertScore(value, label, max) {
  if (!Number.isInteger(value) || value < 0 || value > max) {
    throw new Error(`${label} 必须是 0–${max} 的整数：收到 ${String(value)}`);
  }
  return value;
}

export function settleConviction({ conviction, p12, config } = {}) {
  const maxTotal = config?.p12?.maxPointsTotal ?? FROZEN.p12MaxPointsTotal;
  const perSegment = config?.p12?.maxPointsPerSegment ?? FROZEN.p12MaxPointsPerSegment;

  const s = {};
  const p12s = {};
  const t = {};
  let p12Total = 0;

  for (const prototype of FROZEN.prototypes) {
    s[prototype] = assertScore(conviction?.[prototype] ?? 0, `conviction.${prototype}`, Number.MAX_SAFE_INTEGER);
    p12s[prototype] = assertScore(p12?.[prototype] ?? 0, `p12.${prototype}`, maxTotal);
    p12Total += p12s[prototype];
    t[prototype] = s[prototype] + p12s[prototype];
  }

  if (p12Total > maxTotal) {
    throw new Error(`P12 有效分合计 ${p12Total} 超过全拍上限 ${maxTotal}（每段 ≤${perSegment}）`);
  }

  const maxT = Math.max(...FROZEN.prototypes.map((prototype) => t[prototype]));
  const winners = FROZEN.prototypes.filter((prototype) => t[prototype] === maxT);
  const unresolved = winners.length !== 1;

  return {
    s,
    p12: p12s,
    t,
    maxT,
    winners,
    outcome: unresolved ? 'unresolved' : 'convicted',
    prototype: unresolved ? null : winners[0],
    tieState: unresolved ? 'unresolved' : 'single',
    // 呈现规格（产品裁决 C1）：并列 = 等权并列展示，无排序、无高亮、无百分比。
    display: unresolved
      ? { mode: 'unresolved', prototypes: winners, equalWeight: true, showPercentages: false, copy: UNRESOLVED_COPY }
      : { mode: 'single', prototypes: winners, equalWeight: false, showPercentages: false, copy: '' },
  };
}

export { UNRESOLVED_COPY };

/**
 * 灰度旁路包装（批次 3 · 2A，D-B3-2）。
 * live：原样返回结算结果（现行行为，零改动）。
 * shadow：只返回"旁路壳"——无原型、无分值、无读者文案；真实计算值走 session.diagnostics().shadowSettlement。
 * 旁路壳刻意不返回 s/p12/t/maxT，避免读者侧消费方从分值自行 argmax 出原型。
 */
export function toEffectiveSettlement(result, mode = 'live') {
  if (mode === 'live') return result;
  if (mode !== 'shadow') {
    throw new Error(`settlement.mode 只能是 ${SETTLEMENT_MODES.join(' / ')}：收到 ${String(mode)}`);
  }
  return {
    outcome: 'bypassed',
    prototype: null,
    tieState: 'bypassed',
    winners: [],
    display: {
      mode: 'bypassed',
      prototypes: [],
      equalWeight: false,
      showPercentages: false,
      // 灰度期结局走集成方既有剧本路径；引擎不新增读者可见文案，也不输出并列/测量提示。
      copy: '',
    },
  };
}
