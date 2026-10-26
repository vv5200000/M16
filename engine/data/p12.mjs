// P12 三段式归档结语数据。
// 词表红线（P12 方案 A §4.1）：pos 只允许案件实体词/动作词/关系词；禁人格形容词；
// 提示语锚词（规矩/账/枪/划痕/口供/了结）权重固定 0，只作复述判定用。
// status=seed_v0：可测种子表，终版由数据定稿（pending: P12.WORDLIST）。

export const P12_STEMS = Object.freeze([
  { id: 'A', text: '他守了一辈子规矩，最后却……', prototype_label: '情绪背叛收束' },
  { id: 'B', text: '账，总要在某人那里了结……', prototype_label: '冷算布局收束' },
  { id: 'C', text: '那把老枪，身上的划痕比口供更早说话……', prototype_label: '冲动误杀收束' },
]);

/** 提示语锚词：命中不产生任何分，只用于剥掉复述部分。与 config.p12.anchorWords 保持一致。 */
export const P12_ANCHORS = Object.freeze(['规矩', '账', '枪', '划痕', '口供', '了结']);

export const P12_WORDLISTS = Object.freeze({
  A: {
    pos: ['护着', '护她', '护他', '瞒', '瞒着', '背叛', '被背叛', '对不起', '心疼', '顶罪', '替她', '为她', '舍不得', '守着', '心软', '绝望', '情杀', '恨她', '恨他'],
    neg: ['布局', '算计', '安排', '计划', '冷算', '借刀', '时间差'],
    abstain: [],
  },
  B: {
    pos: ['安排', '算计', '布局', '计划', '时间差', '借刀', '灭口', '分钱', '中间人', '转手', '中转', '三步', '账目', '资金', '筹码', '收尾', '提前', '借枪'],
    neg: ['护着', '失手', '走火', '慌了', '意外', '冲动'],
    abstain: [],
  },
  C: {
    pos: ['失手', '走火', '喝多', '慌了', '意外', '冲动', '争执', '扭打', '推搡', '夺枪', '误杀', '没想', '收拾现场'],
    neg: ['安排', '计划', '布局', '提前', '算计'],
    abstain: [],
  },
  abstain: {
    pos: [],
    neg: [],
    abstain: ['不知道', '说不清', '没想法', '空白', '不确定', '说不好', '忘了', '没想过', '不清楚'],
  },
});

export const P12_DATA = Object.freeze({
  status: 'seed_v0',
  stems: P12_STEMS,
  anchors: P12_ANCHORS,
  wordlists: P12_WORDLISTS,
});
