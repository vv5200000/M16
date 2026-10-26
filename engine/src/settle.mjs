// 定罪结算：冻结算法，逐字实现（契约 §一.1 / 主线 §三.4 / 产品裁决 C1–C2）。
//   S_p = P4–P11 累计分
//   T_p = S_p + P12 有效分_p   （每段 ≤1，全拍 ≤3）
//   argmax(T) 唯一 → 该原型定罪；并列 → "未形成单一指向"
// 不设人为分差门槛 N；不得用呈现顺序破并列。

import { FROZEN } from './config.mjs';

const UNRESOLVED_COPY = '你的路径未收束到单一原型。';

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
