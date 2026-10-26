const test = require('node:test');
const assert = require('node:assert/strict');
const {Harness, cachePath, root} = require('./helpers/calendar-engine-harness.cjs');
const task = (name, id, extra = {}) => ({alarmName: name, qrCodeID: 'shared', taskIDs: [id],
  taskLoopMin: 10, maxReschedules: 3, ...extra});
const report = id => JSON.stringify({ok: true, metricsByID: [{metricID: id, complete: true}]});
async function start(definitions = [task('A', 'a')]) {
  const h = new Harness(definitions); await h.install();
  const plan = await h.engine(); return {h, plan};
}

test('native empty input representations start a normal Engine session', async () => {
  const h = new Harness();
  for (const input of [undefined, '', [], [''], ' \n ']) {
    const begin = await h.runtime({op: 'engine_begin', input});
    assert.equal(begin.completionOnly, 0); assert.equal(begin.cleanInput, '');
    assert.ok(begin.session.id);
  }
});

test('a rejected refresh and missing local completion data never wait on iCloud', async () => {
  const {h, plan} = await start([task('A', 'a', {shortcutsOnTrigger: [{name: 'Speak'}]})]);
  h.fm.isFileStoredIniCloud = p => p === cachePath;
  h.fm.isFileDownloaded = () => false;
  h.fm.downloadFileFromiCloud = async () => assert.fail('Completion must not download an old cache');
  const input = {action: 'task_alarm_reset', taskLoopMetricIDs: ['a']};
  const p = await h.runtime({op: 'action', input, refreshed: true, cacheOK: 0});
  assert.equal(p.ok, false); assert.equal(p.allComplete, false); assert.match(p.error, /refresh failed/);
  const speech = plan.triggerShortcutsToRunDetailed.find(t => t.name === 'Speak');
  assert.equal((await h.runtime({op: 'trigger_check', trigger: speech})).run, 1);
});

test('the Engine does not download an optional completion cache before running task reset', async () => {
  const h = new Harness([task('A', 'a', {shortcutsOnTrigger: [{name: 'Speak'}]})]); await h.install();
  h.fm.isFileStoredIniCloud = p => p === cachePath;
  h.fm.isFileDownloaded = () => false;
  h.fm.downloadFileFromiCloud = async () => assert.fail('Optional completion must not stall alarm startup');
  const plan = await h.engine();
  assert.equal(plan.debug.taskCacheUnavailable, true);
  assert.equal(plan.qrLoop, true);
  assert.ok(plan.triggerShortcutsToRunDetailed.some(t => t.taskReset === 1));
  assert.ok(plan.triggerShortcutsToRunDetailed.some(t => t.name === 'Speak'));
});

test('failed metric entries cannot reset an alarm even if they contain complete:true', async () => {
  for (const invalid of [{status: 'error'}, {found: false}, {errors: ['write failed']}, {errors: 'write failed'}]) {
    const {h} = await start();
    const before = h.registry();
    const result = await h.engine(JSON.stringify({ok: true, metricsByID: [{metricID: 'a', complete: true, ...invalid}]}));
    assert.deepEqual(h.registry(), before); assert.deepEqual(result.alarmsToDelete, []);
  }
});

test('an explicit failed duplicate cannot be overridden by a successful entry or cached completion', async () => {
  const {h} = await start([task('A', 'a', {taskIDs: ['a', 'b']})]);
  h.setCompletion({a: true, b: true});
  await h.engine(JSON.stringify({ok: true, metricsByID: [
    {metricID: 'a', complete: true}, {metricID: 'b', complete: true},
    {metricID: 'b', complete: true, status: 'error'}]}));
  assert.equal(h.registry()[0].taskSatisfied, false);
});

test('completion-only calls preserve unrelated active QR, playback owner, and schedules without Calendar access', async () => {
  const {h} = await start([task('A', 'a'), task('B', 'b')]);
  const owner = (await h.runtime({op: 'engine_begin', input: ''})).session;
  const ownerText = h.disk.get('/local/calendar-alarms-loop-owner-v1.json');
  const aBefore = h.registry().find(e => e.alarmName === 'A');
  h.options.calendarFails = true;
  const begin = await h.runtime({op: 'engine_begin', input: report('b')});
  assert.equal(begin.completionOnly, 1); assert.equal(begin.session, undefined);
  assert.equal(h.disk.get('/local/calendar-alarms-loop-owner-v1.json'), ownerText);
  const plan = await h.engine(begin.cleanInput);
  assert.equal(plan.completionOnly, true); assert.equal(plan.qrLoop, false);
  assert.deepEqual(plan.triggerShortcutsToRunDetailed, []);
  assert.deepEqual(plan.alarmsToAdd, []); assert.equal(plan.errorRegistry, '');
  assert.deepEqual(h.registry().find(e => e.alarmName === 'A'), aBefore);
  assert.equal(h.registry().find(e => e.alarmName === 'B').taskSatisfied, true);
  assert.equal((await h.runtime({op: 'qr_poll', session: owner})).stop, 0);
});

test('failed or malformed completion input never starts playback or runs unrelated due actions', async () => {
  for (const response of ['<html>Drive unavailable</html>', '{bad', JSON.stringify({ok: false, metricsByID: []})]) {
    const {h} = await start(); const before = h.registry();
    h.options.calendarFails = true;
    const p = await h.engine(response);
    assert.equal(p.completionOnly, true); assert.equal(p.qrLoop, false);
    assert.deepEqual(p.alarmsToAdd, []); assert.deepEqual(p.alarmsToDelete, []);
    assert.deepEqual(h.registry(), before); assert.match(p.errorRegistry, /task log response/);
  }
});

test('fresh task completion cancels the pending task without scanning a shared code or running scan actions', async () => {
  const {h} = await start([task('A', 'a', {qrShortcutsOnScan: [{name: 'Scan action'}]}), task('B', 'b')]);
  h.setCompletion({a: false, b: true});
  const evaluated = await h.runtime({op: 'action', input: {action: 'task_alarm_reset', taskLoopMetricIDs: ['b']},
    refreshed: true, cacheOK: 1});
  assert.equal(evaluated.allComplete, true);
  const p = await h.engine(evaluated.engineInput);
  assert.equal(h.registry().find(e => e.alarmName === 'A').qrActive, true);
  assert.equal(h.registry().find(e => e.alarmName === 'B').taskSatisfied, true);
  assert.deepEqual(p.triggerShortcutsToRunDetailed, []);
});

test('refreshed flag cannot turn old, future, missing or rejected completion data into success', async () => {
  const {h} = await start(); h.setCompletion({a: true});
  const c = JSON.parse(h.disk.get(cachePath));
  const input = {action: 'task_alarm_reset', taskLoopMetricIDs: ['a']};
  for (const age of [91000, 86400000, -1000]) {
    h.disk.set(cachePath, JSON.stringify({...c, generatedAtISO: new Date(h.now - age).toISOString()}));
    const p = await h.runtime({op: 'action', input, refreshed: true, cacheOK: 1});
    assert.equal(p.ok, false); assert.equal(p.allComplete, false);
    assert.equal(p.engineInput, undefined);
  }
  h.disk.set(cachePath, JSON.stringify(c));
  assert.equal((await h.runtime({op: 'action', input, refreshed: true, cacheOK: 0})).ok, false);
  assert.equal((await h.runtime({op: 'action', input, refreshed: true, cacheOK: 1})).allComplete, true);
});

test('completed trigger groups skip their actions while unrelated groups run', async () => {
  const {h, plan} = await start([
    task('A', 'a', {shortcutsOnTrigger: [{name: 'Speak A'}]}),
    task('B', 'b', {shortcutsOnTrigger: [{name: 'Speak B'}]})
  ]);
  const a = plan.triggerShortcutsToRunDetailed.find(t => t.name === 'Speak A');
  const b = plan.triggerShortcutsToRunDetailed.find(t => t.name === 'Speak B');
  assert.notEqual(a.triggerKey, b.triggerKey);
  assert.equal((await h.runtime({op: 'trigger_check', trigger: a})).run, 1);
  h.setCompletion({a: true, b: false});
  // Even a failed registry commit must not cause completed-task speech.
  assert.equal((await h.runtime({op: 'trigger_check', trigger: a})).run, 0);
  assert.equal((await h.runtime({op: 'trigger_check', trigger: b})).run, 1);
  await h.engine(report('a'));
  assert.equal((await h.runtime({op: 'trigger_check', trigger: a})).run, 0);
  assert.equal((await h.runtime({op: 'trigger_check', trigger: b})).run, 1);
});

test('QR playback waits for its trigger actions, including during a concurrent Engine run', async () => {
  const {h, plan} = await start([task('A', 'a', {shortcutsOnTrigger: [{name: 'Speak for ten seconds'}]})]);
  const last = plan.triggerShortcutsToRunDetailed.at(-1);
  assert.equal(last.lastInGroup, 1);
  let session = (await h.runtime({op: 'engine_begin', input: ''})).session;
  assert.equal((await h.runtime({op: 'qr_poll', session})).play, 0);
  await h.engine();
  session = (await h.runtime({op: 'engine_begin', input: ''})).session;
  assert.equal((await h.runtime({op: 'qr_poll', session})).play, 0);
  h.at(0, 10);
  await h.runtime({op: 'trigger_finish', trigger: last});
  assert.equal((await h.runtime({op: 'qr_poll', session})).play, 1);
});

test('old trigger completion cannot release a newer task-check group; abandoned groups have bounded leases', async () => {
  const {h, plan} = await start([task('A', 'a', {taskLoopMin: 2})]);
  const old = plan.triggerShortcutsToRunDetailed.at(-1);
  h.at(2); const next = (await h.engine()).triggerShortcutsToRunDetailed.at(-1);
  assert.notEqual(old.triggerID, next.triggerID);
  await h.runtime({op: 'trigger_finish', trigger: old});
  let session = (await h.runtime({op: 'engine_begin', input: ''})).session;
  assert.equal((await h.runtime({op: 'qr_poll', session})).play, 0);
  h.at(5, 1); session = (await h.runtime({op: 'engine_begin', input: ''})).session;
  assert.equal((await h.runtime({op: 'qr_poll', session})).play, 1);
});

test('missing completion data permits prompting and task-reset actions still run before checking user actions', async () => {
  const {h, plan} = await start([task('A', 'a', {shortcutsOnTrigger: [{name: 'Speak'}]})]);
  const reset = plan.triggerShortcutsToRunDetailed[0], speech = plan.triggerShortcutsToRunDetailed[1];
  h.setCompletion({a: true});
  assert.equal((await h.runtime({op: 'trigger_check', trigger: reset})).run, 1);
  h.disk.delete(cachePath);
  assert.equal((await h.runtime({op: 'trigger_check', trigger: speech})).run, 1);
  const invalid = await h.runtime({op: 'trigger_finish', trigger: {...speech, triggerID: '../escape'}});
  assert.equal(invalid.ok, 0); assert.match(invalid.error, /Invalid trigger/);
});

test('completed QR groups remove their local readiness flags after scan; ordinary triggers need no flag', async () => {
  const {h, plan} = await start(); h.fm.remove = p => h.disk.delete(p);
  const trigger = plan.triggerShortcutsToRunDetailed.at(-1);
  const marker = '/local/calendar-alarms-trigger-ready-' + trigger.triggerID + '.json';
  const session = (await h.runtime({op: 'engine_begin', input: ''})).session;
  await h.runtime({op: 'trigger_finish', trigger}); assert.equal(h.disk.has(marker), true);
  await h.scan('shared'); await h.runtime({op: 'qr_poll', session});
  assert.equal(h.disk.has(marker), false);
  await h.runtime({op: 'trigger_finish', trigger: {...trigger, hasQR: 0}});
  assert.equal(h.disk.has(marker), false);
});

test('identical trigger actions on two alarms retain separate groups and group endings after deduplication', async () => {
  const action = {name: 'Shared action', input: ['same']};
  const {h, plan} = await start([task('A', 'a', {shortcutsOnTrigger: [action, action]}),
    task('B', 'b', {shortcutsOnTrigger: [action]})]);
  const actions = plan.triggerShortcutsToRunDetailed.filter(t => t.name === 'Shared action');
  assert.equal(actions.length, 2); assert.notEqual(actions[0].triggerID, actions[1].triggerID);
  assert.equal(actions[0].lastInGroup, 1); assert.equal(actions[1].lastInGroup, 1);
  await h.engine(report('a'));
  assert.equal((await h.runtime({op: 'trigger_check', trigger: actions[0]})).run, 0);
  assert.equal((await h.runtime({op: 'trigger_check', trigger: actions[1]})).run, 1);
});
