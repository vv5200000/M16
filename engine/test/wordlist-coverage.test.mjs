import test from 'node:test';
import assert from 'node:assert/strict';
import { BEATS, PERCEPTION_WORDLISTS } from '../data/beats.mjs';
import { createPerceptionTrack } from '../src/perception.mjs';
import { resolveConfig } from '../src/config.mjs';
import { createSession } from '../src/session.mjs';

// BLK-1（seq=914/917）拦截件：「键缺拍」必须红。
// 缺陷形：PERCEPTION_WORDLISTS 只有 P1–P5，beat 表里 sn=perception 的 P6–P11 无键，
// 运行时落 no_wordlist，整局 S/N 只覆盖 P1–P5，而 109/109 全绿——测试集缺这条断言。

const REQUIRED = BEATS
  .filter((beat) => typeof beat.sn === 'string' && beat.sn.startsWith('perception'))
  .map((beat) => beat.id);

test('词表覆盖：凡 sn=perception 的拍，PERCEPTION_WORDLISTS 必须有键', () => {
  assert.ok(REQUIRED.length > 0, 'beat 表未解析出任何 perception 拍，断言自身失效');
  const missing = REQUIRED.filter((beat) => !Object.hasOwn(PERCEPTION_WORDLISTS, beat));
  assert.deepEqual(
    missing,
    [],
    `感知词表缺这些拍的键：${missing.join(', ')}（命中即 BLK-1 型缺陷：运行时 no_wordlist）`,
  );
});

test('词表覆盖：无野拍键——PERCEPTION_WORDLISTS 的键必须都是 beat 表内的 id', () => {
  const beatIds = new Set(BEATS.map((beat) => beat.id));
  const stray = Object.keys(PERCEPTION_WORDLISTS).filter((key) => !beatIds.has(key));
  assert.deepEqual(stray, [], `词表存在 beat 表外的键：${stray.join(', ')}`);
});

test('词表覆盖：每拍词表非空，行结构齐（id/term/synonyms/dimension/cid）', () => {
  const problems = [];
  for (const [beat, rows] of Object.entries(PERCEPTION_WORDLISTS)) {
    if (!Array.isArray(rows) || rows.length === 0) {
      problems.push(`${beat}: 词表为空或非数组`);
      continue;
    }
    rows.forEach((row, index) => {
      const at = `${beat}[${index}]`;
      if (typeof row?.id !== 'string' || row.id.length === 0) problems.push(`${at}: id 缺失`);
      if (typeof row?.term !== 'string' || row.term.length === 0) problems.push(`${at}: term 缺失`);
      if (!Array.isArray(row?.synonyms)) problems.push(`${at}: synonyms 非数组`);
      if (row?.dimension !== 'S' && row?.dimension !== 'N') problems.push(`${at}: dimension 非 S/N`);
      if (typeof row?.cid !== 'string' || row.cid.length === 0) problems.push(`${at}: cid 缺失`);
    });
  }
  assert.deepEqual(problems, [], problems.join('；'));
});

test('词表覆盖：每个 perception 拍在运行时能进计分轨，不得落 no_wordlist', () => {
  const stuck = [];
  for (const beat of REQUIRED) {
    const rows = PERCEPTION_WORDLISTS[beat];
    if (!rows || rows.length === 0) {
      stuck.push(`${beat}: 无词表`);
      continue;
    }
    const track = createPerceptionTrack({ config: resolveConfig(), wordlists: PERCEPTION_WORDLISTS });
    const result = track.record({ beat, input: rows[0].term });
    if (result.reason === 'no_wordlist') stuck.push(`${beat}: no_wordlist`);
  }
  assert.deepEqual(stuck, [], `运行时不可达的感知拍：${stuck.join(', ')}`);
});

test('词表覆盖：P4 虽有词表但不进 S/N 轨（契约 §二.3 O1 口径②）', () => {
  const track = createPerceptionTrack({ config: resolveConfig(), wordlists: PERCEPTION_WORDLISTS });
  const result = track.record({ beat: 'P4', input: PERCEPTION_WORDLISTS.P4[0].term });
  assert.equal(result.reason, 'beat_excluded_from_sn');
  assert.equal(track.summary().total, 0);
});

// 数据供给单《引擎感知词表供给单_P6-P11_v1.md》§七 建议断言（BLK-1 修复同 commit 落）。

const BLK1_BEATS = ['P6', 'P7', 'P8', 'P9', 'P10', 'P11'];
const BLK1_ROW_COUNTS = { P6: 12, P7: 12, P8: 12, P9: 12, P10: 10, P11: 13 };
const BLK1_SN_COUNTS = {
  P6: { S: 6, N: 6 },
  P7: { S: 6, N: 6 },
  P8: { S: 6, N: 6 },
  P9: { S: 5, N: 7 },
  P10: { S: 4, N: 6 },
  P11: { S: 7, N: 6 },
};

test('BLK-1 词表：每拍行数与 S/N 行计不漂移（12/12/12/12/10/13）', () => {
  for (const beat of BLK1_BEATS) {
    const rows = PERCEPTION_WORDLISTS[beat];
    assert.ok(Array.isArray(rows), `${beat} 缺词表`);
    assert.equal(rows.length, BLK1_ROW_COUNTS[beat], `${beat} 行数漂移`);
    const counts = { S: 0, N: 0 };
    for (const row of rows) counts[row.dimension] += 1;
    assert.deepEqual(counts, BLK1_SN_COUNTS[beat], `${beat} S/N 行计漂移`);
  }
});

test('BLK-1 词表：71 枚 C-ID 在本单内全唯一', () => {
  const seen = new Map();
  for (const beat of BLK1_BEATS) {
    for (const row of PERCEPTION_WORDLISTS[beat]) {
      if (seen.has(row.cid)) {
        assert.fail(`C-ID 重号：${row.cid} 同时出现在 ${seen.get(row.cid)} 与 ${beat}.${row.term}`);
      }
      seen.set(row.cid, `${beat}.${row.term}`);
    }
  }
  assert.equal(seen.size, 71);
});

test('BLK-1 词表：l3:false 仅 2 行，命中返回文本但不计分、不占首计位', () => {
  const flagged = [];
  for (const beat of BLK1_BEATS) {
    for (const row of PERCEPTION_WORDLISTS[beat]) {
      if (row.l3 === false) flagged.push({ beat, id: row.id, cid: row.cid });
    }
  }
  assert.deepEqual(
    flagged.sort((a, b) => a.beat.localeCompare(b.beat)),
    [
      { beat: 'P6', id: 'P6.窗口', cid: 'C-WIN-01' },
      { beat: 'P7', id: 'P7.守一段', cid: 'C-TRUST-01' },
    ],
    'l3:false 标记集漂移（X7 去重面：P6 窗口首计 P05、P7 守一段首计 P02）',
  );

  const cases = [
    { beat: 'P6', input: '窗口', cid: 'C-WIN-01' },
    { beat: 'P7', input: '守一段', cid: 'C-TRUST-01' },
  ];
  for (const item of cases) {
    const track = createPerceptionTrack({ config: resolveConfig(), wordlists: PERCEPTION_WORDLISTS });
    const result = track.record({ beat: item.beat, input: item.input });
    assert.equal(result.cid, item.cid);
    assert.equal(result.scored, false, `${item.beat}「${item.input}」不得计分`);
    // 现状口径（perception.mjs L166）：l3 关断返回 reason/dedupReason = 'l3_not_scored'，非 no_wordlist。
    assert.equal(result.reason, 'l3_not_scored');
    assert.equal(track.summary().total, 0, `${item.beat}「${item.input}」不得占首计位`);
  }
});

test('BLK-1 词表：同串跨 C-ID 按拍内词表解析，不落全局首个（出借本／复印件）', () => {
  const rent = createPerceptionTrack({ config: resolveConfig(), wordlists: PERCEPTION_WORDLISTS });
  const p8 = rent.record({ beat: 'P8', input: '出借本' });
  assert.equal(p8.scored, true);
  assert.equal(p8.cid, 'C-ACC-07');

  const copy = createPerceptionTrack({ config: resolveConfig(), wordlists: PERCEPTION_WORDLISTS });
  const p6 = copy.record({ beat: 'P6', input: '复印件' });
  assert.equal(p6.scored, true);
  assert.equal(p6.cid, 'C-ACC-01');
});

test('BLK-1 词表：经 session 入口可达计分（P9 没拆的信 / P11 歌词行）', () => {
  const session = createSession({ config: {} });
  const letter = session.explore({ beat: 'P9', input: '没拆的信' });
  assert.equal(letter.scored, true);
  assert.equal(letter.cid, 'C-LETTER-01');

  const lyric = session.explore({ beat: 'P11', input: '天亮之前，别回头' });
  assert.equal(lyric.scored, true);
  assert.equal(lyric.cid, 'C-LYRIC-01');
});
