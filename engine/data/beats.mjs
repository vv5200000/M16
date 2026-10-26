// 节拍流转数据（批次 2）。
// 事实源：cases/第17条主故事线_v1.md 节拍表 L22–L33 + 主线 §三 + cases/案件契约_v1.md §五。
// 定罪流向记法统一为 "选项 A → X；选项 B → Y"，与主线表 "C/B 弱" 的书写顺序一致（F5：弱=叙事注，权重一律 +1）。

export const BEATS = Object.freeze([
  { id: 'P1', name: '档案箱', deepMount: false, sn: 'perception', decision: null, conviction: null },
  { id: 'P2', name: '死者', deepMount: false, sn: 'perception+order', decision: 'order', conviction: null },
  { id: 'P3', name: '邀请函', deepMount: false, sn: null, decision: null, conviction: null },
  { id: 'P4', name: '凶器链', deepMount: true, sn: 'excluded', decision: 'P4.JP', conviction: 'A→C / B→B' },
  { id: 'P5', name: '时间窗', deepMount: true, sn: 'perception', decision: 'P5.JP', conviction: 'A→0 / B→B' },
  { id: 'P6', name: '第一份材料', deepMount: true, sn: 'perception', decision: 'P6.TF', conviction: 'A→B / B→A' },
  { id: 'P7', name: '第二份材料', deepMount: true, sn: 'perception', decision: 'P7.LINK', conviction: 'A→A / B→B' },
  { id: 'P8', name: '第三份材料', deepMount: true, sn: 'perception', decision: 'P8.LINK', conviction: 'A→C / B→B' },
  { id: 'P9', name: '档案暗格', deepMount: true, sn: 'perception', decision: 'P9.LINK', conviction: 'A→B / B→A' },
  { id: 'P10', name: '深水区', deepMount: true, sn: 'perception', decision: 'P10.TF', conviction: 'A→A / B→B' },
  { id: 'P11', name: '暗线浮现', deepMount: false, sn: 'perception', decision: 'P11.EI', conviction: '—' },
  { id: 'P12', name: '归档', deepMount: false, sn: null, decision: null, conviction: 'A/B/C 终采' },
]);

export const DEEP_MOUNTS = Object.freeze(['P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10']);

/**
 * 感知层词库（S/N）。
 * P1–P3：仓库 cases/第17条主故事线_正文_v1/P0x_*.md 词库表（4 列版；P01 规矩表行已按 X6 修正）。
 * P4：仓库 P04_凶器链.md 词库表 12 词 = S8/N4 —— 冻结契约 §二.3 O1 口径②，整拍不进 S/N 轨；
 *     保留于此仅供 chips / 词表 / P12 词表源，引擎按 excludedBeats 拒采（不写 scored_cids）。
 * P5：仓库 P05_时间窗.md 词库表 10 词 = S5/N5。
 *
 * 跨拍同词（R1–R6 全局规则，项目 seq=187 采纳）：
 * - 每行必带 `cid`（R2），cid → mapping 全局唯一；
 * - 计分去重键 = cid（R3）：同一 cid 跨拍只在首次有效探索计 1 分，后续记 `dedup_hit`；
 * - `l3: false` = 该行 L3 不计分（仍返回文本），如 P06「窗口」共享 C-WIN-01；
 * - 同一词面跨 cid 仅限同映射且 ≤3（R4，如裸「账本」P06/P08）；
 * - 同义串跨 cid 复用即 X6/R5 冲突，运行期判 0 并登记（P02「陈望」现存一条）。
 */
export const PERCEPTION_WORDLISTS = Object.freeze({
  P1: [
    { id: 'P1.死亡报告', term: '死亡报告', synonyms: ['报告', '死因', '枪'], dimension: 'S', cid: 'C-DEATH-01' },
    { id: 'P1.规矩表', term: '规矩表', synonyms: ['猎庄规矩', '规则'], dimension: 'S', cid: 'C-RULE-01' },
    { id: 'P1.第五行', term: '第五行', synonyms: ['新增行', '新规矩', '墨色'], dimension: 'N', cid: 'C-LINE-01' },
    { id: 'P1.樟木箱', term: '樟木箱', synonyms: ['箱子', '档案箱', '锁扣'], dimension: 'N', cid: 'C-BOX-01' },
    { id: 'P1.录音带', term: '录音带', synonyms: ['磁带', '空带'], dimension: 'N', cid: 'C-TAPE-01' },
    { id: 'P1.照片', term: '照片', synonyms: ['手'], dimension: 'S', cid: 'C-PHOTO-01' },
    { id: 'P1.空缺', term: '空缺', synonyms: ['弹道', '待补', '不齐'], dimension: 'N', cid: 'C-GAP-01' },
    { id: 'P1.时间', term: '时间', synonyms: ['八月', '夜晚'], dimension: 'S', cid: 'C-TIME-01' },
  ],
  P2: [
    { id: 'P2.生平', term: '生平', synonyms: ['小传', '庄伯年', '庄主'], dimension: 'S', cid: 'C-BIO-01' },
    // X6 冲突登记（待数据修）：'陈望' 同时是 P2.陪护（S 同义）与 P2.陈望（N 关键词），同一映射面不可能。
    // G6③：异维等长多命中 → 判 0 并记日志，引擎不自行选边；summary().cidConflicts 同步登记。
    { id: 'P2.表', term: '表', synonyms: ['手表', '老何', '表壳', '夹层'], dimension: 'S', cid: 'C-WATCH-01' },
    { id: 'P2.合同', term: '合同', synonyms: ['陆况', '继承', '无继承'], dimension: 'S', cid: 'C-CONTRACT-01' },
    { id: 'P2.陪护', term: '陪护', synonyms: ['顾言', '摘录', '陈望'], dimension: 'S', cid: 'C-CARE-01' },
    { id: 'P2.托付', term: '托付', synonyms: ['安排', '后事', '三个人'], dimension: 'N', cid: 'C-TRUST-01' },
    { id: 'P2.陈望', term: '陈望', synonyms: ['名字', '念名'], dimension: 'N', cid: 'C-NAME-01' },
    { id: 'P2.儿子', term: '儿子', synonyms: ['省城', '独子'], dimension: 'N', cid: 'C-SON-01' },
    { id: 'P2.规矩', term: '规矩', synonyms: ['说一不二', '四十年'], dimension: 'N', cid: 'C-RULE-02' },
  ],
  P3: [
    { id: 'P3.寄出记录', term: '寄出记录', synonyms: ['邀请', '复印件', '邮戳'], dimension: 'S', cid: 'C-MAIL-01' },
    { id: 'P3.秋后聚齐', term: '秋后聚齐', synonyms: ['邀请函', '内容'], dimension: 'S', cid: 'C-SUMMON-01' },
    { id: 'P3.带上账', term: '带上账', synonyms: ['补充', '小字'], dimension: 'N', cid: 'C-ASK-01' },
    { id: 'P3.七月新规', term: '七月新规', synonyms: ['新规', '第五条', '不得离开'], dimension: 'N', cid: 'C-NEWRULE-01' },
    { id: 'P3.邮戳', term: '邮戳', synonyms: ['时间', '七月'], dimension: 'S', cid: 'C-POST-01' },
    { id: 'P3.收件人', term: '收件人', synonyms: ['谁', '名单'], dimension: 'N', cid: 'C-LIST-01' },
  ],
  P4: [
    { id: 'P4.膛线', term: '膛线', synonyms: ['来复线', '线的深浅'], dimension: 'S', cid: 'C-BARREL-01' },
    { id: 'P4.磨损', term: '磨损', synonyms: ['扳机磨损', '开过多少发'], dimension: 'S', cid: 'C-WEAR-01' },
    { id: 'P4.登记簿', term: '登记簿', synonyms: ['出借本', '台账', '借出记录', '一借一还'], dimension: 'S', cid: 'C-LOG-01' },
    { id: 'P4.钥匙', term: '钥匙', synonyms: ['柜子的锁'], dimension: 'S', cid: 'C-KEY-01' },
    { id: 'P4.八月', term: '八月', synonyms: ['八月中'], dimension: 'S', cid: 'C-TIME-01' },
    { id: 'P4.干净', term: '干净', synonyms: ['没开过火', '修的时候是干净的', '不干净'], dimension: 'S', cid: 'C-CLEAN-01' },
    { id: 'P4.校膛线', term: '校膛线', synonyms: ['过我的手工', '锉'], dimension: 'S', cid: 'C-CALIBER-01' },
    { id: 'P4.睡得很沉', term: '睡得很沉', synonyms: ['那晚听见什么'], dimension: 'S', cid: 'C-SLEEP-01' },
    { id: 'P4.字迹', term: '字迹', synonyms: ['签名', '洇了'], dimension: 'N', cid: 'C-HAND-01' },
    { id: 'P4.只打霰弹', term: '只打霰弹', synonyms: ['另一把老枪'], dimension: 'N', cid: 'C-AMMO-01' },
    { id: 'P4.借走', term: '借走', synonyms: ['还过', '名字洇了'], dimension: 'N', cid: 'C-LEND-01' },
    { id: 'P4.我只说我的部分', term: '我只说我的部分', synonyms: ['说这话时手收紧'], dimension: 'N', cid: 'C-SAY-01' },
  ],
  P5: [
    { id: 'P5.手表', term: '手表', synonyms: ['那块表', '这块表', '一块表', '绒布里的表'], dimension: 'S', cid: 'C-WATCH-01' },
    { id: 'P5.字条', term: '字条', synonyms: ['表壳里的条', '庄主的话'], dimension: 'S', cid: 'C-SLIP-01' },
    { id: 'P5.挂钟', term: '挂钟', synonyms: ['墙上那口', '整点响'], dimension: 'S', cid: 'C-CLOCK-01' },
    { id: 'P5.对时', term: '对时', synonyms: ['拿我的做准', '对过针'], dimension: 'S', cid: 'C-SYNC-01' },
    { id: 'P5.撬痕', term: '撬痕', synonyms: ['浅痕', '压簧边'], dimension: 'S', cid: 'C-PRY-01' },
    { id: 'P5.两小时', term: '两小时', synonyms: ['到我出事', '只有两小时'], dimension: 'N', cid: 'C-WIN-01' },
    { id: 'P5.托付', term: '托付', synonyms: ['等我走了再打开', '三年'], dimension: 'N', cid: 'C-TRUST-01' },
    { id: 'P5.我不碰针', term: '我不碰针', synonyms: ['只看针'], dimension: 'N', cid: 'C-NONEEDLE-01' },
    { id: 'P5.出事', term: '出事', synonyms: ['那晚出的事'], dimension: 'N', cid: 'C-INCIDENT-01' },
    { id: 'P5.召集', term: '召集', synonyms: ['临时召集', '集合令', '敲钟', '16:40'], dimension: 'N', cid: 'C-MUSTER-01' },
  ],
});

/**
 * 决策层隐性分叉。
 * axis 为空 = 只记定罪流向，不产生任何 MBTI 维度分（P7–P9）。
 * precedence：同一次输入多个选项词面同时命中时，高 precedence 优先（P5 doubt 优先，项目 seq=173 转产品终表）。
 * 词面为派生最小集（status: derived_pending_review），由数据/产品确认。
 */
export const DECISION_FORKS = Object.freeze([
  {
    id: 'P4.JP',
    beat: 'P4',
    axis: 'JP',
    source: '主线 L22（J/P · A→C / B→B）',
    status: 'derived_pending_review',
    options: [
      { id: 'A', label: '信"枪没被调换"', pole: 'J', conviction: 'C', words: ['信他', '信枪', '没被调换', '接受', '相信', '不用查', '不必查', '继续', '下一份', '就这样', '信任'] },
      { id: 'B', label: '要求复查磨损', pole: 'P', conviction: 'B', words: ['复查', '再查', '重新查', '核对', '对一遍', '磨损', '不放心', '存疑', '怀疑', '查一下', '再验', '验一遍', '不相信', '不信', '不信任'] },
    ],
  },
  {
    id: 'P5.JP',
    beat: 'P5',
    axis: 'JP',
    source: '主线 L23（J/P · A→0 / B→B）+ 项目 seq=173 裁-分叉词表（doubt 优先）',
    status: 'derived_pending_review',
    options: [
      { id: 'A', label: '按字条锁定窗口', pole: 'J', conviction: null, precedence: 0, words: ['按字条', '锁窗口', '锁定窗口', '签字', '签', '确认', '接受', '两小时', '落笔', '照办', '按他说的'] },
      { id: 'B', label: '怀疑表被动过', pole: 'P', conviction: 'B', precedence: 1, words: ['怀疑表', '表被动过', '被动过', '拒签', '撬痕', '对时', '复查', '再对一次', '不签', '表有问题', '不信', '不放心', '没把握', '不敢信', '不一定'] },
    ],
  },
  {
    id: 'P6.TF',
    beat: 'P6',
    axis: 'TF',
    source: '主线 L24（T/F · A→B / B→A）+ P06 素材包 §三 第 1 行（追账 vs 问丈夫）',
    status: 'derived_pending_review',
    options: [
      { id: 'A', label: '追账', pole: 'T', conviction: 'B', words: ['追账', '账本', '账', '流水', '数字', '核对', '查账', '资金', '转账', '中转', '编号', '账目'] },
      { id: 'B', label: '问丈夫', pole: 'F', conviction: 'A', words: ['丈夫', '她丈夫', '那件事', '车祸', '漆皮', '问问她', '动机', '问她', '为什么会'] },
    ],
  },
  {
    id: 'P7.LINK',
    beat: 'P7',
    axis: null,
    source: '主线 L25（定罪 A/B）',
    status: 'derived_pending_review',
    options: [
      { id: 'A', label: '要钥匙', conviction: 'A', words: ['钥匙', '要钥匙', '配的钥匙', '拿钥匙', '开柜'] },
      { id: 'B', label: '问遗憾', conviction: 'B', words: ['遗憾', '对不起', '问遗憾', '问问她', '末页', '日记'] },
    ],
  },
  {
    id: 'P8.LINK',
    beat: 'P8',
    axis: null,
    source: '主线 L26（定罪 C/B）',
    status: 'derived_pending_review',
    options: [
      { id: 'A', label: '逼交账本', conviction: 'C', words: ['逼', '交出来', '交账本', '账本', '鞋垫账本', '逼他'] },
      { id: 'B', label: '查借枪记录', conviction: 'B', words: ['借枪', '借枪记录', '借出', '登记', '出借本', '记录', '查枪'] },
    ],
  },
  {
    id: 'P9.LINK',
    beat: 'P9',
    axis: null,
    source: '主线 L27（定罪 B/A）',
    status: 'derived_pending_review',
    options: [
      { id: 'A', label: '拿信', conviction: 'B', words: ['信', '那封信', '拿信', '拆信', '未拆的信'] },
      { id: 'B', label: '问鞋', conviction: 'A', words: ['鞋', '旧鞋', '问鞋', '这双鞋', '谁穿的'] },
    ],
  },
  {
    id: 'P10.TF',
    beat: 'P10',
    axis: 'TF',
    source: '主线 L28（T/F · A→A / B→B 弱）',
    status: 'derived_pending_review',
    options: [
      { id: 'A', label: '追细节', pole: 'T', conviction: 'A', words: ['细节', '陈望', '名字', '追问', '记忆', '那半句', '临终', '问下去'] },
      { id: 'B', label: '问他信谁', pole: 'F', conviction: 'B', words: ['信谁', '相信谁', '托付', '他信', '信任', '依靠', '交托', '最信'] },
    ],
  },
  {
    id: 'P11.EI',
    beat: 'P11',
    axis: 'EI',
    source: '主线 L29（E/I · 定罪 —，暗线不计）',
    status: 'derived_pending_review',
    options: [
      { id: 'A', label: '追查暗线身份', pole: 'E', conviction: null, words: ['暗线', '查身份', '追查', '找人', '走访', '问人', '出去查', '认人', '查到底'] },
      { id: 'B', label: '回到枪案', pole: 'I', conviction: null, words: ['回枪案', '回到枪案', '案卷', '自己查', '一个人', '不声张', '回案', '枪案'] },
    ],
  },
]);

/** P2 顺序信号：契约称计 S/N，但"表/合同/陪护"的 S/N 归属全项目未定义（pending）。 */
export const ORDER_SIGNAL = Object.freeze({
  beat: 'P2',
  options: Object.freeze([
    { id: '表', sn: null },
    { id: '合同', sn: null },
    { id: '陪护', sn: null },
  ]),
  pending: 'P2.ORDER.SN_MAPPING',
});
