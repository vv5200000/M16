import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateTrigger, INSUFFICIENT_MESSAGE } from '../src/trigger.mjs';
import { createSession } from '../src/session.mjs';
import { resolveConfig } from '../src/config.mjs';

const config = resolveConfig();
const DEEP = ['P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10'];

function decisionWith({ p5jp = 0, tf = {}, ei = 0 } = {}) {
  return {
    byBeat: {
      P5: { TF: { T: 0, F: 0 }, EI: { E: 0, I: 0 }, JP: { J: p5jp, P: 0 } },
      P6: { TF: { T: tf.P6 ?? 0, F: 0 }, EI: { E: 0, I: 0 }, JP: { J: 0, P: 0 } },
      P10: { TF: { T: tf.P10 ?? 0, F: 0 }, EI: { E: 0, I: 0 }, JP: { J: 0, P: 0 } },
      P11: { TF: { T: 0, F: 0 }, EI: { E: ei, I: 0 }, JP: { J: 0, P: 0 } },
    },
  };
}

test('空会话：五类缺口全部列出', () => {
  const r = evaluateTrigger({ opened: [], perception: { total: 0 }, decision: decisionWith(), config });
  assert.equal(r.ok, false);
  assert.equal(r.message, INSUFFICIENT_MESSAGE);
  assert.deepEqual(r.missing.map((m) => m.code), [
    'MISSING_DEEP_MOUNT', 'MISSING_SN', 'MISSING_P5_JP', 'MISSING_TF', 'MISSING_EI',
  ]);
  assert.deepEqual(r.missing[0].beats, DEEP);
  assert.deepEqual(r.missing[3].beats, ['P6', 'P10']);
});

test('全部条件满足 → ok', () => {
  const r = evaluateTrigger({
    opened: DEEP,
    perception: { total: 1 },
    decision: decisionWith({ p5jp: 1, tf: { P6: 1 }, ei: 1 }),
    config,
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.missing, []);
  assert.equal(r.message, '');
});

test('P4 的 J/P 不能顶替 P5 的 J/P（主线 L48）', () => {
  const decision = decisionWith({ p5jp: 0, tf: { P6: 1 }, ei: 1 });
  decision.byBeat.P4 = { TF: { T: 0, F: 0 }, EI: { E: 0, I: 0 }, JP: { J: 1, P: 0 } };
  const r = evaluateTrigger({ opened: DEEP, perception: { total: 1 }, decision, config });
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing.map((m) => m.code), ['MISSING_P5_JP']);
});

test('T/F 由 P6 或 P10 任一满足', () => {
  const viaP10 = evaluateTrigger({
    opened: DEEP,
    perception: { total: 1 },
    decision: decisionWith({ p5jp: 1, tf: { P10: 1 }, ei: 1 }),
    config,
  });
  assert.equal(viaP10.ok, true);

  const noneTf = evaluateTrigger({
    opened: DEEP,
    perception: { total: 1 },
    decision: decisionWith({ p5jp: 1, ei: 1 }),
    config,
  });
  assert.deepEqual(noneTf.missing.map((m) => m.code), ['MISSING_TF']);
});

test('仅 1 条深挂缺失也阻塞并精确指出拍号', () => {
  const r = evaluateTrigger({
    opened: DEEP.filter((beat) => beat !== 'P8'),
    perception: { total: 1 },
    decision: decisionWith({ p5jp: 1, tf: { P6: 1 }, ei: 1 }),
    config,
  });
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, [{ code: 'MISSING_DEEP_MOUNT', beats: ['P8'] }]);
});

// —— 会话级集成：触发 → 进入归档 → 归档后写入锁 ——

function openDeep(session) {
  for (const beat of DEEP) session.openMaterial(beat);
}

test('会话：P4 关键词探索不满足 S/N 最低采样', () => {
  const s = createSession({ config: {}, sessionId: 't' });
  openDeep(s);
  s.explore({ beat: 'P4', input: '膛线' });
  s.choose({ beat: 'P5', input: '怀疑表被动过' });
  s.choose({ beat: 'P6', input: '追账' });
  s.choose({ beat: 'P11', input: '回到枪案' });
  const gate = s.canEnterArchive();
  assert.equal(gate.ok, false);
  assert.deepEqual(gate.missing.map((m) => m.code), ['MISSING_SN']);
  assert.equal(s.beginArchive().ok, false);
  assert.equal(s.beginArchive().message, INSUFFICIENT_MESSAGE);
});

test('会话：forced 不满足 P5 J/P，重进补采后才可归档', () => {
  const s = createSession({ config: {}, sessionId: 't' });
  openDeep(s);
  s.explore({ beat: 'P1', input: '死亡报告' });
  s.choose({ beat: 'P5', forced: true });
  s.choose({ beat: 'P6', input: '追账' });
  s.choose({ beat: 'P11', input: '回到枪案' });
  assert.deepEqual(s.canEnterArchive().missing.map((m) => m.code), ['MISSING_P5_JP']);

  const reentry = s.choose({ beat: 'P5', input: '怀疑表被动过' });
  assert.equal(reentry.forkEffective, true);
  assert.equal(s.canEnterArchive().ok, true);
});

test('会话：满足条件后进入归档，重复进入幂等，seed 可控', () => {
  const s = createSession({ config: {}, sessionId: 't', seed: 'session-seed' });
  openDeep(s);
  s.explore({ beat: 'P1', input: '死亡报告' });
  s.choose({ beat: 'P5', input: '怀疑表被动过' });
  s.choose({ beat: 'P6', input: '追账' });
  s.choose({ beat: 'P11', input: '回到枪案' });

  const first = s.beginArchive();
  assert.equal(first.ok, true);
  assert.equal(first.alreadyStarted, false);
  assert.equal(first.seed, 'session-seed');
  assert.deepEqual([...first.presentedOrder].sort(), ['A', 'B', 'C']);

  const again = s.beginArchive();
  assert.equal(again.alreadyStarted, true);
  assert.deepEqual(again.presentedOrder, first.presentedOrder);
});

test('会话：归档未开始时不能填段；归档开始后探索/选择写入被锁', () => {
  const s = createSession({ config: {}, sessionId: 't' });
  assert.equal(s.fillSegment({ segmentId: 'A', input: '他替她顶罪' }).reason, 'archive_not_started');

  openDeep(s);
  s.explore({ beat: 'P1', input: '死亡报告' });
  s.choose({ beat: 'P5', input: '怀疑表被动过' });
  s.choose({ beat: 'P6', input: '追账' });
  s.choose({ beat: 'P11', input: '回到枪案' });
  s.beginArchive();

  assert.equal(s.explore({ beat: 'P1', input: '规矩表' }).reason, 'archive_started');
  assert.equal(s.choose({ beat: 'P4', input: '信他' }).reason, 'archive_started');
  assert.equal(s.chooseOrder({ beat: 'P2', optionId: '表' }).reason, 'archive_started');
});

test('会话：归档段未填完时 settle 标记 archiveComplete=false', () => {
  const s = createSession({ config: {}, sessionId: 't' });
  openDeep(s);
  s.explore({ beat: 'P1', input: '死亡报告' });
  s.choose({ beat: 'P5', input: '怀疑表被动过' });
  s.choose({ beat: 'P6', input: '追账' });
  s.choose({ beat: 'P11', input: '回到枪案' });
  s.beginArchive();
  s.fillSegment({ segmentId: 'A', input: '他替她顶罪' });
  assert.equal(s.settle().archiveComplete, false);
});
