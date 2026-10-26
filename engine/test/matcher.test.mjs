import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLexicon, longestMatch, LexiconError } from '../src/matcher.mjs';
import { normalize } from '../src/text.mjs';

const rows = [
  { id: 'x', term: '干净', synonyms: ['不干净'], dimension: 'S' },
  { id: 'y', term: '登记簿', synonyms: ['出借本', '出借'], dimension: 'S' },
  { id: 'z', term: '借走', dimension: 'N' },
];
const lexicon = buildLexicon(rows);

test('归一化：全半角 / 标点 / emoji / 大小写', () => {
  assert.equal(normalize('１０：４０'), '1040');
  assert.equal(normalize('他，护着 她！😀'), '他护着她');
  assert.equal(normalize('ABC'), 'abc');
  assert.equal(normalize(null), '');
});

test('AC-5 最长匹配优先：同维包含不叠计（不干净 ⊃ 干净）', () => {
  const match = longestMatch(normalize('不干净'), lexicon);
  assert.equal(match.matched, true);
  assert.equal(match.chosen.surface, '不干净');
  assert.equal(match.chosen.key, 'S');
  // 一次输入只产出 1 个计分命中；短词只作为候选留痕
  const scoringHits = match.ambiguous ? 0 : 1;
  assert.equal(scoringHits, 1);
  assert.ok(match.candidates.some((c) => c.surface === '干净'));
});

test('AC-5 §四.1 一次输入只计一次命中（多词同句不叠计）', () => {
  const match = longestMatch(normalize('登记簿借走'), lexicon);
  assert.equal(match.matched, true);
  assert.equal(match.chosen.surface, '登记簿');
  assert.equal(match.candidates.filter((c) => c.length === 3).length >= 1, true);
});

test('AC-5 G6③ 异维等长多命中 → 判 0', () => {
  const crossDim = buildLexicon([
    { id: 'a', term: '陈望', dimension: 'S' },
    { id: 'b', term: '陈望', dimension: 'N' },
  ]);
  const match = longestMatch(normalize('陈望'), crossDim);
  assert.equal(match.matched, true);
  assert.equal(match.ambiguous, true);
  assert.equal(match.reason, 'cross_key_ambiguous');
  assert.equal(match.chosen, null);
});

test('AC-5 G6④ 严格前缀异维由最长匹配消歧（消源优先）', () => {
  const prefix = buildLexicon([
    { id: 'a', term: '出借', dimension: 'N' },
    { id: 'b', term: '出借本', dimension: 'S' },
  ]);
  const match = longestMatch(normalize('出借本'), prefix);
  assert.equal(match.ambiguous, false);
  assert.equal(match.chosen.key, 'S');
  assert.equal(match.chosen.surface, '出借本');
});

test('无命中', () => {
  const match = longestMatch(normalize('天气不错'), lexicon);
  assert.equal(match.matched, false);
  assert.equal(match.reason, 'no_match');
});

test('G6① 单条单映射：映射列必须是严格 S|N', () => {
  assert.throws(() => buildLexicon([{ id: 'bad', term: '枪', dimension: 'T' }]), LexiconError);
  assert.throws(() => buildLexicon([{ id: 'bad', term: '枪' }]), LexiconError);
});
