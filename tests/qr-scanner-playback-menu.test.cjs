const test = require('node:test');
const assert = require('node:assert/strict');
const {Harness, root} = require('./helpers/calendar-engine-harness.cjs');
const task = {alarmName: 'Task', qrCodeID: 'code', taskIDs: ['work'], taskLoopMin: 10, maxReschedules: 3};
const ownerPath = '/local/calendar-alarms-loop-owner-v1.json';
async function start(definition = task) {
  const h = new Harness([definition]); await h.install();
  const {session} = await h.runtime({op: 'engine_begin', input: ''});
  const plan = await h.engine();
  return {h, session, plan};
}
const menu = h => h.run('Calendar Alarm QR Scanner.js', '');
async function permit(h, session, plan) {
  const last = plan.triggerShortcutsToRunDetailed.at(-1);
  if (last) await h.runtime({op: 'trigger_finish', trigger: last});
  const poll = await h.runtime({op: 'qr_poll', session});
  assert.equal(poll.play, 1);
  return h.runtime({op: 'qr_permit', session, alarmKey: poll.alarmKey, duration: 2});
}

test('a first pending Engine keeps the recovery menu available while preparing playback', async () => {
  for (const stage of ['reset', 'finished', 'polled']) {
    const {h, session, plan} = await start();
    if (stage !== 'reset') await h.runtime({op: 'trigger_finish', trigger: plan.triggerShortcutsToRunDetailed.at(-1)});
    if (stage === 'polled') assert.equal((await h.runtime({op: 'qr_poll', session})).play, 1);
    assert.equal(h.disk.has(ownerPath), false);
    const result = await menu(h);
    assert.equal(result.hasActiveQR, true); assert.equal(result.activeName, 'Task');
    assert.equal(result.shouldShowMenu, true);
    assert.equal(h.disk.get(root + 'menuOpenStatus.txt'), 'true');
  }
});

test('completion before playback stops the alarm without claiming a scanner menu', async () => {
  const {h} = await start();
  await h.engine(JSON.stringify({ok: true, metricsByID: [{metricID: 'work', complete: true}]}));
  const result = await menu(h);
  assert.equal(result.hasActiveQR, false); assert.equal(result.shouldShowMenu, false);
  assert.equal(h.disk.get(root + 'menuOpenStatus.txt'), 'false');
});

test('a direct scan can cancel a pending task without waiting for playback', async () => {
  const {h} = await start();
  assert.equal((await h.scan('code')).identifiedAlarms, 1);
  assert.equal((await menu(h)).hasActiveQR, false);
  assert.deepEqual(h.times(), ['12:10']);
});

test('every new task check waits for its own playback, not a prior group marker', async () => {
  const {h, session, plan} = await start({...task, taskLoopMin: 1});
  await permit(h, session, plan);
  // Keep the established player inside its three-minute ownership deadline.
  h.at(1);
  const successor = (await h.runtime({op: 'engine_begin', input: ''})).session;
  assert.equal((await menu(h)).shouldShowMenu, false);
  const next = await h.engine();
  assert.notEqual(next.triggerShortcutsToRunDetailed.at(-1).triggerID, plan.triggerShortcutsToRunDetailed.at(-1).triggerID);
  assert.equal((await menu(h)).shouldShowMenu, false);
  await permit(h, successor, next);
  assert.equal((await menu(h)).shouldShowMenu, true);
});

test('a pending successor preserves its working predecessor and available menu', async () => {
  const {h, session, plan} = await start();
  await permit(h, session, plan);
  const successor = (await h.runtime({op: 'engine_begin', input: ''})).session;
  assert.notEqual(successor.id, session.id);
  assert.equal(JSON.parse(h.disk.get(ownerPath)).id, session.id);
  assert.equal((await menu(h)).shouldShowMenu, true);
});

test('task QR without reset/trigger actions establishes ownership only at playback permission', async () => {
  const {h, session, plan} = await start({...task, checkTasksFirstTime: false});
  assert.deepEqual(plan.triggerShortcutsToRunDetailed, []);
  assert.equal(h.disk.has(ownerPath), false);
  await permit(h, session, plan);
  assert.equal(JSON.parse(h.disk.get(ownerPath)).id, session.id);
  assert.equal((await menu(h)).shouldShowMenu, true);
});

test('ordinary QR and older task registry entries retain their menu behavior', async () => {
  for (const legacy of [false, true]) {
    const {h} = await start(legacy ? task : {alarmName: 'Task', qrCodeID: 'code'});
    if (legacy) { const rows = h.registry(); delete rows[0].qrMenuAfterPlayback; h.putRegistry(rows); }
    assert.equal((await menu(h)).shouldShowMenu, true);
  }
});

test('legacy native playback without a Runtime owner keeps an available scanner menu', async () => {
  const h = new Harness([task]); await h.install(); await h.engine();
  assert.equal((await menu(h)).shouldShowMenu, true);
});

test('an abandoned Runtime session cannot defer a recovery menu indefinitely', async () => {
  const {h, session, plan} = await start();
  await permit(h, session, plan);
  h.now = session.deadline;
  assert.equal((await menu(h)).shouldShowMenu, true);
});

test('menu-state reads cannot resurrect a task completed while the scanner was waiting', async () => {
  const {h, session, plan} = await start(); await permit(h, session, plan);
  h.options.onRead = p => {
    if (p !== root + 'menuOpenStatus.txt') return;
    h.options.onRead = undefined;
    const rows = h.registry(); rows[0].qrActive = false; rows[0].taskSatisfied = true; h.putRegistry(rows);
  };
  assert.equal((await menu(h)).shouldShowMenu, false);
  assert.equal(h.disk.get(root + 'menuOpenStatus.txt'), 'false');
});
