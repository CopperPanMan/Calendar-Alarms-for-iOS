const test = require('node:test');
const assert = require('node:assert/strict');
const {Harness, root} = require('./helpers/calendar-engine-harness.cjs');
const task = {alarmName: 'Task', qrCodeID: 'code', taskIDs: ['work'], taskLoopMin: 10, maxReschedules: 3};
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

test('task menus wait through reset, finished triggers, and polling until playback permission', async () => {
  const {h, session, plan} = await start();
  for (const stage of ['reset', 'finished', 'polled']) {
    if (stage === 'finished') await h.runtime({op: 'trigger_finish', trigger: plan.triggerShortcutsToRunDetailed.at(-1)});
    if (stage === 'polled') assert.equal((await h.runtime({op: 'qr_poll', session})).play, 1);
    const result = await menu(h);
    assert.equal(result.hasActiveQR, true); assert.equal(result.activeName, 'Task');
    assert.equal(result.shouldShowMenu, false);
    assert.equal(h.disk.get(root + 'menuOpenStatus.txt'), 'false');
  }
  assert.equal((await permit(h, session, plan)).play, 1);
  assert.equal((await menu(h)).shouldShowMenu, true);
});

test('completion before playback stops the alarm without claiming a scanner menu', async () => {
  const {h} = await start();
  await h.engine(JSON.stringify({ok: true, metricsByID: [{metricID: 'work', complete: true}]}));
  const result = await menu(h);
  assert.equal(result.hasActiveQR, false); assert.equal(result.shouldShowMenu, false);
  assert.equal(h.disk.get(root + 'menuOpenStatus.txt'), 'false');
});

test('a direct scan can cancel a task while its automatic menu is deferred', async () => {
  const {h} = await start();
  assert.equal((await h.scan('code')).identifiedAlarms, 1);
  assert.equal((await menu(h)).hasActiveQR, false);
  assert.deepEqual(h.times(), ['12:10']);
});

test('every new task check waits for its own playback, not a prior group marker', async () => {
  const {h, session, plan} = await start();
  await permit(h, session, plan);
  h.at(10);
  const successor = (await h.runtime({op: 'engine_begin', input: ''})).session;
  assert.equal((await menu(h)).shouldShowMenu, false);
  const next = await h.engine();
  assert.notEqual(next.triggerShortcutsToRunDetailed.at(-1).triggerID, plan.triggerShortcutsToRunDetailed.at(-1).triggerID);
  assert.equal((await menu(h)).shouldShowMenu, false);
  await permit(h, successor, next);
  assert.equal((await menu(h)).shouldShowMenu, true);
});

test('a successor does not reuse a superseded playback reservation', async () => {
  const {h, session, plan} = await start();
  await permit(h, session, plan);
  await h.runtime({op: 'engine_begin', input: ''});
  assert.equal((await menu(h)).shouldShowMenu, false);
});

test('task QR without reset/trigger actions also waits for the playback handoff', async () => {
  const {h, session, plan} = await start({...task, checkTasksFirstTime: false});
  assert.deepEqual(plan.triggerShortcutsToRunDetailed, []);
  assert.equal((await menu(h)).shouldShowMenu, false);
  await permit(h, session, plan);
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
  const {h, session} = await start(); h.now = session.deadline;
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
