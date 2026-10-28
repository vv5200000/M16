# M16 计分引擎（批次 2）

零依赖 ESM 纯函数引擎：定罪轨（A/B/C）+ 感知/决策双通道（S/N · T/F · E/I · J/P）+ P12 归档结语分类 + 结算 + 触发校验。
事实源：`shared/M16_批次1_Schema冻结契约_v1.md`、`shared/P04-P12计分口径_产品裁决_v1.md`、`cases/第17条主故事线_v1.md`（节拍表 L22–L33 / §三 / L48）、项目 seq=173 裁定。

## 运行

需要 Node ≥ 20（在本机 Node v24.19.0 上验证）。

```bash
cd engine
npm test        # node --test（自动发现 test/*.test.mjs）
```

## 入口

```js
import { createSession } from './src/index.mjs';

const s = createSession({ config: {}, sessionId: 'demo', seed: 'reader-123' });
s.openMaterial('P4');                       // 深挂材料
s.explore({ beat: 'P1', input: '死亡报告' }); // 感知层关键词 → S/N
s.choose({ beat: 'P6', input: '追账' });     // 决策层隐性分叉 → T/F + 定罪
s.canEnterArchive();                        // { ok, missing[], message }
s.beginArchive();
s.fillSegment({ segmentId: 'A', input: '他替她顶罪' });
s.settle();                                 // 结算（含并列 did not convict）
s.dimensionScores();                        // 只含 MBTI 四维，无定罪字段
s.exportSettlementRecord();                 // 生产留档（口径 B 严格字段集）
```

`createSession` 是唯一对外入口；内部轨道（perception / decision / p12）不暴露。

灰度通道（批次 3 · 2A，D-B3-2）：`createSession({ config: { settlement: { mode: 'shadow' } } })` —— 记分/审计照常，`settle()` 只返回旁路壳（`outcome:'bypassed'`、无原型、无分值）；真实计算值仅在 `diagnostics().shadowSettlement`，生产留档 schema 不变（`conviction` 记 `bypassed`）。默认 `live`。

## 契约追溯表

| 冻结规则（出处） | 实现 | 测试 |
|---|---|---|
| `T_p = S_p + P12 有效分_p`，argmax 唯一/并列（契约 §一.1、C1） | `src/settle.mjs` | `test/settle.test.mjs` |
| P12 加法项、可翻转 ≤3 分差、不设分差门槛 N（C2） | `src/settle.mjs` | `settle.test.mjs` |
| P12 每段 ≤1、全拍 ≤3 | `src/p12.mjs` `points()` / `config.mjs` 冻结校验 | `p12.test.mjs`、`weights.test.mjs` |
| 并列 → 等权展示、无百分比、固定文案 | `settle.mjs` `display` / `UNRESOLVED_COPY` | `settle.test.mjs` |
| S/N 只来自感知层词库；T/F·E/I·J/P 只来自决策层分叉（契约 §二.1–2） | `perception.mjs` / `decision.mjs` | `isolation.test.mjs` |
| P4 整拍不进 S/N 轨（O1 口径②，契约 §二.3） | `perception.record()` + 配置不可移除 | `perception.test.mjs`、`weights.test.mjs`、`trigger.test.mjs` |
| 词库映射严格 S\|N（契约 §三.2） | `matcher.buildLexicon()` 构建期校验 | `matcher.test.mjs` |
| G6 四规则 + §四.1 一次输入只计一次 | `matcher.longestMatch()` | `matcher.test.mjs`、`perception.test.mjs` |
| 跨拍同词 R1–R6（项目 seq=187 采纳）：cid 唯一映射、**计分去重键 = C-ID**、`l3:false` 不计分、同词异指按拍解析、P4 不占首计位 | `perception.mjs`（cid_registry / word_index / scored_cids）+ `data/beats.mjs` 行内 `cid` | `cid.test.mjs`（含规则 §五.6 三条回归用例） |
| first-decision-wins，改选不覆写、`fork_typed` 恒记审计 | `decision.choose()` | `decision.test.mjs` |
| forced 超窗：不采样、不占 first-decision-wins、可重进补采（seq=173） | `decision.choose({forced:true})` | `decision.test.mjs`、`trigger.test.mjs` |
| P7–P9 只带定罪流向，不产生 MBTI 维度分 | `decision.mjs`（axis=null） | `decision.test.mjs` |
| P06 T/F 权重待裁 → 先按单层 +1 并预留配置位 | `config.dimension.weights.P6.TF` | `weights.test.mjs` |
| P12 触发（深挂全开 + S/N + P5 J/P + P6/P10 T/F + P11 E/I，L48） | `trigger.mjs` | `trigger.test.mjs` |
| P12 复述/锚词不计分、同段冲突判 0、弃权判 0（C3、方案 A） | `p12.mjs` | `p12.test.mjs` |
| C3 硬上限 120 字：截断 + 降权（默认判 0） | `p12.mjs` + `p12.overLimitPolicy` | `p12.test.mjs` |
| 生产留档字段集 `{段ID, 是否计分, 终采原型, tie_state, presented_order/种子}`（C1b 口径 B） | `session.exportSettlementRecord()` | `isolation.test.mjs` |
| 呈现顺序非人格信号（seed 驱动，不参与结算） | `p12.presentationOrder()` | `p12.test.mjs`、`isolation.test.mjs` |
| 灰度通道：记分/审计照常、定罪结算旁路；live 默认（D-B3-2） | `config.settlement.mode` + `settle.toEffectiveSettlement()` + `session.diagnostics().shadowSettlement` | `shadow.test.mjs` |

## 待裁 / 开放项（引擎按默认值运行并显式暴露，不静默生效）

通过 `createSession().config().pending` 或 `diagnostics().pendingArbitrations` 读取。

| ID | 归属 | 当前默认 | 说明 |
|---|---|---|---|
| `P06.TF.weight` | 项目 | `1` | 素材包 §三 待裁项②：主嫌疑入口是否配更高权重。配置位 `dimension.weights.P6.TF` 已就绪。 |
| `P2.ORDER.SN_MAPPING` | 数据/产品 | 不落分 | 契约称 P2 顺序信号计 S/N，但"表/合同/陪护"的 S/N 归属全项目未定义；引擎只记 `order_signal_pending_mapping` 事件。 |
| `P12.WORDLIST` | 数据 | `seed_v0` | P12 正/负/弃权词表终版未定；当前为可测种子表。 |
| `P5.JP.WORDFACE` | 产品 | `derived_v0` | P05 trust/doubt 词面终表未回；已实现 doubt 优先（`precedence`）、否定词面不翻正向、互斥重喷不采分。 |

跨拍同词策略**已定案**：R3 = C-ID 去重（默认 `perception.crossBeatPolicy = 'first_exploration_per_cid'`）；`count_all` 保留为遗留对照口径，不合规、勿用于生产。

## 数据侧缺陷登记（引擎已按 G6③ 判 0，需数据修订）

- **P02 `陈望`**：同时是 `P2.陪护`（S）的同义词与 `P2.陈望`（N）的关键词 → 违反 R1/R5（同词面异映射），构建期登记为 `X6_cross_mapping_conflict`（`summary().cidConflicts`），运行期判 0 并记 `cross_dimension_ambiguous`。`test/cid.test.mjs` 固定该行为；数据侧修法 = 从 `P2.陪护` 同义列移出「陈望」。
- **P2 顺序信号无 S/N 映射**：见上表 `P2.ORDER.SN_MAPPING`。
- **P06/P07/P08 词库未入引擎数据**：账本系 `C-ACC-01…03` + `C-ACC-04`（刀疤那本账；按数据 seq=193 C6「一本」裁定，私账=账本=藏鞋垫那本同 C-ID 同义；`C-ACC-05` 已撤销、编号不复用；`C-ACC-06` 庄主账本待定）、`C-WIN-01`（窗口 `l3:false`）、`C-KEY-01`（P07）、`C-NUM-01` 已由数据台账预分配；引擎侧已支持同词异指与 `l3:false`，待产品 r2 词库落版后按 `cid` 字段接入即可（测试用合成行证明行为，编号按台账）。

## 实现口径备注（需评审确认）

1. **复述判定顺序**：先剥锚词再算残留 3-gram 覆盖率；只有"无正向信号"时才报 `echo`。这样"复述 + 真实信号"不会因复述连带判 0（契约 §三.2–3 与参考表第 4 行存在措辞张力，按"零误报优先 + 不吞真实信号"取向实现）。
2. **超长策略**：`overLimitPolicy` 默认 `zero`（121 字起判 0），备选 `truncate_only`（仅截断）。依据 C2"零误报优先、接受欠计"。
3. **P12 重填**：`allowResubmit` 默认 `true`（同段替换，每段仍 ≤1，`attempts` 记审计）；若产品要求"提交即锁"改为 `false`。
4. **P12 原型可跨段累加**：同一原型在三段各得 1 分时计 3 分（每段 ≤1 指单段上限，全拍上限 3 为硬顶）。
5. **跨拍同词**：已按 R3 落地——同一 C-ID 只在首次有效探索计 1 分，后续返回文本、记 `dedup_hit`；P4 命中不写首计位；`l3:false` 行（如 P06「窗口」）命中即返回文本但不计分、不占位。
6. **审计日志字段**：按规则 §五.5 记 `beat / matchedRow / cid / mapping / scored / dedupReason / crossDim`；**`input` 不落原文**（遵守 C1b"生产留档不含原文"），改记 `inputLength` + `inputHash`（FNV-1a）。如需 QA 留原文，另加显式开关，不默认开启。
7. **`perception.maxHitsPerInput` 为空槽**：配置位保留（`1` 或 `'per_row'`），但运行期恒按 §四.1 严读法执行"一次输入全局 1 命中"；`'per_row'` 尚无消费点，待数据正式裁定后接实现，勿视为已生效。
8. **灰度旁路（批次 3 · 2A，D-B3-2）**：`settlement.mode='shadow'` 时 `settle()` 只返回旁路壳（`outcome/prototype/tieState/winners/display`，`display.copy=''`），不含 `s/p12/t/maxT`；`outcome/tieState` 新增枚举值 `bypassed`（字段集不变）。真实计算值经 `diagnostics().shadowSettlement` 供联调攒数，**不写生产留档**；`exportSettlementRecord()` 字段集冻结不变、`conviction` 取旁路值。live 并列文案与算法零改动（1A）。

## 不变量（有测试守护）

- `dimensionScores()` 无任何定罪字段；`settle()` / `exportSettlementRecord()` 无任何 MBTI 字段。
- 灰度（`settlement.mode='shadow'`）下 `settle()` 不含原型与分值，`shadowSettlement` 仅存在于 `diagnostics()`、不进入生产留档。
- 生产留档不含读者原文、连续分值、相似度或向量；呈现顺序（`presented_order`）只影响展示。
- 配置解析结果深度冻结；P4 排除与 P12 上限不可通过配置修改。
