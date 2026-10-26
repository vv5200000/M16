// P12 触发校验（主线 L48 + 产品裁决 C4）：
//   ① 深挂载材料 P4–P10 全部打开过；
//   ② 感知层已采到 S/N（P1 等拍关键词探索，非 P4 二选）；
//   ③ P5 的 J/P 至少一次有效选择（P4 的 J/P 不能顶替）；
//   ④ P6 或 P10 的 T/F 至少一次有效选择；
//   ⑤ P11 的 E/I 至少一次有效选择。
// 浅挂材料不阻塞。

export const INSUFFICIENT_MESSAGE = '材料不足，至少还需完成一项关键判断';

function axisTotal(decision, beat, axis, poles) {
  const bucket = decision?.byBeat?.[beat]?.[axis];
  if (!bucket) return 0;
  return poles.reduce((sum, pole) => sum + (bucket[pole] ?? 0), 0);
}

export function evaluateTrigger({ opened, perception, decision, config }) {
  const openedSet = new Set(opened ?? []);
  const missing = [];

  const deepMissing = (config.trigger.deepMounts ?? []).filter((beat) => !openedSet.has(beat));
  if (deepMissing.length > 0) missing.push({ code: 'MISSING_DEEP_MOUNT', beats: deepMissing });

  if (config.trigger.requireSn && (perception?.total ?? 0) < 1) {
    missing.push({ code: 'MISSING_SN', beats: ['P1'] });
  }
  if (config.trigger.requireP5Jp && axisTotal(decision, 'P5', 'JP', ['J', 'P']) < 1) {
    missing.push({ code: 'MISSING_P5_JP', beats: ['P5'] });
  }
  const tfBeats = config.trigger.requireTfFrom ?? [];
  const tfTotal = tfBeats.reduce((sum, beat) => sum + axisTotal(decision, beat, 'TF', ['T', 'F']), 0);
  if (tfTotal < 1) missing.push({ code: 'MISSING_TF', beats: tfBeats });

  const eiBeats = config.trigger.requireEiFrom ?? [];
  const eiTotal = eiBeats.reduce((sum, beat) => sum + axisTotal(decision, beat, 'EI', ['E', 'I']), 0);
  if (eiTotal < 1) missing.push({ code: 'MISSING_EI', beats: eiBeats });

  const ok = missing.length === 0;
  return { ok, missing, message: ok ? '' : INSUFFICIENT_MESSAGE };
}
