const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {Harness, source, registryPath, cachePath, root} = require('./helpers/calendar-engine-harness.cjs');
const task = extra => ({alarmName: 'Task', qrCodeID: 'bath', taskIDs: ['floss'], taskLoopMin: 21, maxReschedules: 2, ...extra});

async function start(definition = task()) {
  const h = new Harness([definition]);
  await h.install();
  await h.engine();
  return h;
}

test('QR restarts and backups preserve task deadline, remaining reschedules, and trigger actions', async () => {
  const h = await start(task({shortcutsOnTrigger: [{name: 'Example', input: []}]}));
  assert.deepEqual(h.times(), ['12:02', '12:04', '12:21']);
  assert.equal(h.registry()[0].maxReschedules, 1);
  h.at(2);
  const restart = await h.engine();
  assert.deepEqual(h.times(), ['12:04', '12:06', '12:21']);
  assert.equal(restart.triggerShortcutsToRunDetailed.length, 0);
  assert.equal(h.registry()[0].maxReschedules, 1);
  // Skip the next restart: fallback must recover playback without shifting the task.
  h.at(6);
  const backup = await h.engine();
  assert.deepEqual(h.times(), ['12:08', '12:10', '12:21']);
  assert.equal(backup.triggerShortcutsToRunDetailed.length, 0);
  assert.equal(h.registry()[0].taskCheckHHMM, '12:21');
  assert.equal(h.registry()[0].maxReschedules, 1);
});

test('unchanged scanner plus Engine stop cleanup cancels QR retries and preserves the task', async () => {
  const h = await start();
  const session = (await h.runtime({op: 'engine_begin', input: ''})).session;
  const result = await h.scan('bath');
  assert.equal(result.vibrate, true);
  assert.deepEqual(h.times(), ['12:02', '12:21']);
  const stopped = await h.runtime({op: 'qr_poll', session});
  assert.equal(stopped.reason, 'no_active_qr_alarm');
  h.apply(stopped);
  assert.deepEqual(h.times(), ['12:21']);
  h.at(2);
  await h.engine();
  assert.equal(h.registry()[0].qrActive, false);
  assert.deepEqual(h.times(), ['12:21']);
  h.at(21);
  await h.engine();
  assert.deepEqual(h.times(), ['12:23', '12:25', '12:42']);
  assert.equal(h.registry()[0].qrActive, true);
});

test('scan still stops QR after task reschedules are exhausted', async () => {
  const h = await start(task({maxReschedules: 0}));
  assert.deepEqual(h.times(), ['12:02', '12:04']);
  const session = (await h.runtime({op: 'engine_begin', input: ''})).session;
  await h.scan('bath');
  h.apply(await h.runtime({op: 'qr_poll', session}));
  assert.deepEqual(h.times(), []);
  h.at(2);
  await h.engine();
  assert.equal(h.registry()[0].qrActive, false);
  assert.deepEqual(h.times(), []);
});

for (const minutes of [2, 4]) test(`scan preserves a coincident +${minutes} task check`, async () => {
  const h = await start(task({taskLoopMin: minutes}));
  assert.deepEqual(h.times(), ['12:02', '12:04']);
  const session = (await h.runtime({op: 'engine_begin', input: ''})).session;
  await h.scan('bath');
  h.apply(await h.runtime({op: 'qr_poll', session}));
  assert.deepEqual(h.times(), ['12:0' + minutes]);
  h.at(minutes);
  const fired = await h.engine();
  assert.equal(h.registry()[0].maxReschedules, 0);
  assert.equal(fired.triggerShortcutsToRunDetailed.filter(x => x.name === 'Calendar Alarms Actions').length, 1);
  assert.equal(h.registry()[0].taskCheckFireTime, h.start / 1000 + minutes * 120);
});

test('a shared task/restart fire handles the task once and creates one alarm per unique time', async () => {
  const h = await start(task({taskLoopMin: 2}));
  h.at(2);
  const result = await h.engine();
  assert.deepEqual(h.times(), ['12:04', '12:06']);
  assert.equal(h.registry()[0].maxReschedules, 0);
  assert.equal(result.triggerShortcutsToRunDetailed.filter(x => x.name === 'Calendar Alarms Actions').length, 1);
});

test('a launch 45 seconds late handles its owned fire once, while a future alarm waits', async () => {
  const h = new Harness([task()]);
  await h.install();
  h.at(-1, 40);
  assert.equal((await h.engine()).qrLoop, false);
  assert.equal(h.registry()[0].maxReschedules, 2);
  h.at(0, 45);
  const fired = await h.engine();
  assert.equal(fired.qrLoop, true);
  assert.deepEqual(h.times(), ['12:02', '12:04', '12:21']);
  const repeated = await h.engine();
  assert.equal(repeated.triggerShortcutsToRunDetailed.length, 0);
  assert.equal(h.registry()[0].maxReschedules, 1);
});

test('a task completion report cancels actual pending task and QR alarm times', async () => {
  const h = await start();
  h.at(3);
  await h.engine(JSON.stringify({ok: true, metricsByID: [{metricID: 'floss', complete: true}]}));
  assert.deepEqual(h.times(), []);
  assert.equal(h.registry()[0].taskSatisfied, true);
  assert.equal(h.registry()[0].qrActive, false);
});

test('partial completion cannot satisfy an alarm requiring two tasks', async () => {
  const h = await start(task({taskIDs: ['floss', 'walk']}));
  h.at(1);
  await h.engine(JSON.stringify({ok: true, metricsByID: [{metricID: 'floss', complete: true}, {metricID: 'walk', complete: false}]}));
  assert.equal(h.registry()[0].taskSatisfied, false);
  assert.deepEqual(h.times(), ['12:02', '12:04', '12:21']);
});

test('explicit completion flags govern checks instead of nonblank false/zero metric values', async () => {
  const h = new Harness([task()]);
  await h.install();
  const c = JSON.parse(h.disk.get(cachePath));
  c.metricState.allByID.floss.value = 0;
  h.disk.set(cachePath, JSON.stringify(c));
  await h.engine();
  assert.equal(h.registry()[0].taskSatisfied, false);
  h.at(21); h.setCompletion({floss: true});
  await h.engine();
  assert.deepEqual(h.times(), []);
  assert.equal(h.registry()[0].taskSatisfied, true);
});

test('calendar fetch failure preserves registry and existing Clock alarms', async () => {
  const h = new Harness([task({offsetMin: 60})]);
  await h.install();
  const before = h.registry();
  h.options.calendarFails = true;
  const result = await h.engine();
  assert.match(result.errorRegistry, /Calendar fetch failed/);
  assert.deepEqual(h.registry(), before);
  assert.deepEqual(h.times(), ['13:00']);
});

test('failed registry commit emits no Clock operations or triggered actions', async () => {
  const h = new Harness([task()]);
  await h.install();
  h.options.failRegistryWrite = true;
  const result = await h.engine();
  assert.match(result.errorRegistry, /write failed/);
  assert.deepEqual(result.alarmsToAdd, []);
  assert.deepEqual(result.alarmsToDelete, []);
  assert.deepEqual(result.triggerShortcutsToRunDetailed, []);
  assert.deepEqual(h.times(), ['12:00']);
});

test('a scan during an Engine calculation wins over the pending QR restart plan', async () => {
  const h = await start();
  h.at(2);
  let reads = 0;
  h.options.onRead = (p, env) => {
    if (p !== registryPath || ++reads !== 2) return;
    const rows = env.registry(); rows[0].qrActive = false; env.putRegistry(rows);
  };
  const result = await h.engine();
  assert.equal(h.registry()[0].qrActive, false);
  assert.deepEqual(h.times(), ['12:21']);
  assert.deepEqual(result.alarmsToAdd, []);
});

test('non-task QR scanning cancels both retry alarms using the unchanged scanner', async () => {
  const h = await start({alarmName: 'Wake', qrCodeID: 'bath'});
  assert.deepEqual(h.times(), ['12:02', '12:04']);
  await h.scan('bath');
  assert.deepEqual(h.times(), []);
  h.at(2); await h.engine();
  assert.deepEqual(h.times(), []);
  assert.equal(h.registry()[0].qrActive, false);
});

test('ordinary alarm trigger actions are not replayed by a second delayed invocation', async () => {
  const h = await start({alarmName: 'Ordinary', shortcutsOnTrigger: [{name: 'Example', input: []}]});
  h.at(1);
  const result = await h.engine();
  assert.equal(result.triggerShortcutsToRunDetailed.length, 0);
});

test('initial context reschedule remains eligible to start a QR alarm', async () => {
  const h = new Harness([{alarmName: 'Wake', qrCodeID: 'bath', silenceIfDriving: 'ON', reschedMinutes: 5, maxReschedules: 3}], {focus: 'Driving'});
  await h.install(); await h.engine();
  assert.deepEqual(h.times(), ['12:05']);
  h.options.focus = ''; h.at(5);
  await h.engine();
  assert.equal(h.registry()[0].qrActive, true);
  assert.deepEqual(h.times(), ['12:07', '12:09']);
});

test('non-QR task alarm keeps its current native ring unless silenced, then cleans up later', async () => {
  const h = await start(task({qrCodeID: ''}));
  assert.deepEqual(h.times(), ['12:00', '12:21']);
  h.at(1); await h.engine();
  assert.deepEqual(h.times(), ['12:00', '12:21']);
  h.at(5); await h.engine();
  assert.deepEqual(h.times(), ['12:21']);
  const silent = await start(task({qrCodeID: '', silenceAlarm: true}));
  assert.deepEqual(silent.times(), ['12:21']);
});

test('logging the final remaining task immediately resets a multi-task alarm', async () => {
  const h = await start(task({taskIDs: ['floss', 'walk']}));
  h.at(1); h.setCompletion({floss: true, walk: false});
  await h.engine(JSON.stringify({ok: true, metricsByID: [{metricID: 'walk', complete: true}]}));
  assert.equal(h.registry()[0].taskSatisfied, true);
  assert.deepEqual(h.times(), []);
});

test('stale completed cache does not silence a new task alarm before a fresh check', async () => {
  const h = new Harness([task()]);
  await h.install();
  const c = JSON.parse(h.disk.get(cachePath));
  c.generatedAtISO = new Date(h.start - 3600000).toISOString();
  c.reminderState.byID.floss.complete = true;
  h.disk.set(cachePath, JSON.stringify(c));
  await h.engine();
  assert.equal(h.registry()[0].taskSatisfied, false);
  assert.deepEqual(h.times(), ['12:02', '12:04', '12:21']);
});

test('scan during mute-state read is visible to the final playback permission check', async () => {
  const h = await start();
  const session = (await h.runtime({op: 'engine_begin', input: ''})).session;
  const poll = await h.runtime({op: 'qr_poll', session});
  h.options.onRead = (p, env) => {
    if (p !== root + 'scannerLastOpened.txt') return;
    const rows = env.registry(); rows[0].qrActive = false; env.putRegistry(rows);
  };
  const permit = await h.runtime({op: 'qr_permit', session, alarmKey: poll.alarmKey, duration: 6});
  assert.equal(permit.play, 0);
  assert.equal(permit.reason, 'no_active_qr_alarm');
  h.apply(permit);
  assert.deepEqual(h.times(), ['12:21']);
});

test('an old playback permission request cannot target a newer QR generation', async () => {
  const h = await start();
  const session = (await h.runtime({op: 'engine_begin', input: ''})).session;
  const poll = await h.runtime({op: 'qr_poll', session});
  const rows = h.registry(); rows[0].qrGeneration++; h.putRegistry(rows);
  const permit = await h.runtime({op: 'qr_permit', session, alarmKey: poll.alarmKey, duration: 6});
  assert.equal(permit.play, 0);
});

test('a legacy active task schedule migrates without moving its task deadline', async () => {
  const h = new Harness([task()]);
  const epoch = h.start / 1000;
  h.at(1);
  h.putRegistry([{...task(), calcFireTime: epoch, nextFireTime: epoch + 21 * 60, nextFireHHMM: '12:21',
    prevFireTime: epoch, prevFireHHMM: '12:00', firstQRFireTime: epoch,
    qrActive: true, qrBackupFireTime: epoch + 3 * 60, qrBackupHHMM: '12:03', maxReschedules: 1}]);
  h.clock = ['12:00', '12:03', '12:21'].map(time => ({name: 'Task', hh: time.slice(0, 2), mm: time.slice(3)}));
  await h.engine();
  assert.equal(h.registry()[0].scheduleVersion, 2);
  assert.equal(h.registry()[0].taskCheckHHMM, '12:21');
  assert.deepEqual(h.times(), ['12:03', '12:05', '12:21']);
});

test('two simultaneous QR alarms serialize playback and promote the pending alarm without rerunning actions', async () => {
  const h = new Harness([task(), task({alarmName: 'Other', qrCodeID: 'other'})]);
  await h.install(); await h.engine();
  const rows = h.registry();
  assert.equal(rows.filter(x => x.qrActive).length, 1);
  assert.equal(rows.filter(x => x.qrPending).length, 1);
  const active = rows.find(x => x.qrActive);
  const session = (await h.runtime({op: 'engine_begin', input: ''})).session;
  await h.scan(active.qrCodeID); h.apply(await h.runtime({op: 'qr_poll', session}));
  h.at(2);
  const result = await h.engine();
  assert.equal(h.registry().filter(x => x.qrActive).length, 1);
  assert.equal(h.registry().find(x => x.qrActive).alarmName, 'Other');
  assert.equal(result.triggerShortcutsToRunDetailed.length, 0);
  assert.equal(h.registry().find(x => x.alarmName === 'Other').maxReschedules, 1);
});

test('legacy exhausted minute restart is canceled after a scan instead of becoming a task check', async () => {
  const h = new Harness([task()]);
  const epoch = h.start / 1000;
  h.at(6, 15);
  h.putRegistry([{...task(), calcFireTime: epoch, nextFireTime: epoch + 7 * 60, nextFireHHMM: '12:07',
    prevFireTime: epoch + 24 * 60, prevFireHHMM: '12:24', firstQRFireTime: epoch,
    qrActive: false, qrBackupFireTime: epoch + 9 * 60, qrBackupHHMM: '12:09', maxReschedules: 0}]);
  h.clock = ['12:07', '12:24'].map(time => ({name: 'Task', hh: time.slice(0, 2), mm: time.slice(3)}));
  await h.engine();
  assert.equal(h.registry()[0].qrActive, false);
  assert.equal(h.registry()[0].taskCheckHHMM, '12:24');
  assert.deepEqual(h.times(), ['12:24']);
});

test('QR-only restart skips task cache reads and calendar fetches', async () => {
  const h = await start();
  let cacheReads = 0;
  h.options.onRead = p => {if (p === cachePath) cacheReads++;};
  h.options.calendarFails = true;
  h.at(2);
  const result = await h.engine();
  assert.equal(cacheReads, 0);
  assert.equal(result.errorRegistry, '');
  assert.equal(h.registry()[0].taskCheckHHMM, '12:21');
});

test('Clock alarm whose calendar definition is removed gets deleted', async () => {
  const h = new Harness([task({offsetMin: 60})]);
  await h.install();
  h.definitions = [];
  await h.engine();
  assert.deepEqual(h.times(), []);
  assert.deepEqual(h.registry(), []);
});

test('QR hard timeout is enforced even when a restart is due', async () => {
  const h = await start(task({maxReschedules: 0}));
  h.at(62);
  const rows = h.registry();
  rows[0].qrRestartFireTime = h.now / 1000; rows[0].qrRestartHHMM = '13:02';
  rows[0].qrFallbackFireTime = h.now / 1000 + 120; rows[0].qrFallbackHHMM = '13:04';
  rows[0].qrBackupFireTime = rows[0].qrFallbackFireTime; rows[0].qrBackupHHMM = '13:04';
  h.putRegistry(rows);
  h.clock = ['13:02', '13:04'].map(time => ({name: 'Task', hh: time.slice(0, 2), mm: time.slice(3)}));
  await h.engine();
  assert.deepEqual(h.times(), []);
  assert.deepEqual(h.registry(), []);
});

test('timezone reconciliation deletes original Clock mirrors and creates the new local times', async () => {
  const original = process.env.TZ;
  try {
    process.env.TZ = 'America/New_York';
    const h = new Harness([task({offsetMin: 60})]); await h.install();
    assert.deepEqual(h.times(), ['13:00']);
    process.env.TZ = 'America/Los_Angeles';
    await h.engine();
    assert.deepEqual(h.times(), ['10:00']);
    assert.equal(h.registry()[0].taskCheckHHMM, '10:00');
  } finally {process.env.TZ = original;}
});

test('removing task IDs removes the task role while keeping active QR retries', async () => {
  const h = await start();
  h.definitions[0] = task({taskIDs: []});
  h.at(1); await h.engine();
  assert.deepEqual(h.times(), ['12:02', '12:04']);
  assert.equal(h.registry()[0].taskCheckFireTime, 0);
  assert.equal(h.registry()[0].qrActive, true);
});

test('adding task IDs to an upcoming alarm preserves its initial Clock time', async () => {
  const h = new Harness([{alarmName: 'Task', offsetMin: 60}]);
  await h.install();
  h.definitions[0] = task({offsetMin: 60});
  await h.engine();
  assert.deepEqual(h.times(), ['13:00']);
  assert.equal(h.registry()[0].taskCheckHHMM, '13:00');
});

test('removing QR configuration preserves an independent task check', async () => {
  const h = await start();
  h.definitions[0] = task({qrCodeID: ''});
  h.at(1); await h.engine();
  assert.deepEqual(h.times(), ['12:21']);
  assert.equal(h.registry()[0].qrActive, false);
});

test('a normal context gate can use its final available reschedule', async () => {
  const h = new Harness([{alarmName: 'Drive', silenceIfDriving: 'ON', reschedMinutes: 5, maxReschedules: 1}], {focus: 'Driving'});
  await h.install(); await h.engine();
  assert.deepEqual(h.times(), ['12:05']);
  assert.equal(h.registry()[0].maxReschedules, 0);
});

test('Engine action readout has balanced blocks and requests permission after setting volume', () => {
  const readout = source('Shortcut Actions/Calendar Alarm Engine.md');
  const code = readout.split('```jsx\n')[1].split('```')[0];
  const stack = [];
  for (const line of code.split('\n')) {
    const s = line.trim();
    if (/^IF:/.test(s)) stack.push('IF');
    if (/^REPEAT(?: WITH EACH)?:/.test(s)) stack.push('REPEAT');
    if (s === 'END IF') assert.equal(stack.pop(), 'IF');
    if (s === 'END REPEAT') assert.equal(stack.pop(), 'REPEAT');
  }
  assert.deepEqual(stack, []);
  assert.ok(code.lastIndexOf('SET VOLUME:') < code.indexOf('op: qr_permit'));
  assert.ok(code.indexOf('op: qr_permit') < code.indexOf('PLAY SOUND: CachedAudioFile'));
  assert.match(code, /Dictionary: LoopState\s+Key: alarmsToDelete/);
});

test('a newer Engine schedule rejects a stale run and its Clock operations', async () => {
  const h = await start(); h.at(2);
  let reads = 0;
  h.options.onRead = (p, env) => {
    if (p !== registryPath || ++reads !== 2) return;
    const rows = env.registry(), row = rows[0];
    row.qrRestartFireTime = env.start / 1000 + 6 * 60; row.qrRestartHHMM = '12:06';
    row.qrFallbackFireTime = env.start / 1000 + 8 * 60; row.qrFallbackHHMM = '12:08';
    row.qrBackupFireTime = row.qrFallbackFireTime; row.qrBackupHHMM = row.qrFallbackHHMM;
    row.lastHandledFireTime = env.start / 1000 + 2 * 60;
    env.putRegistry(rows);
    env.clock = ['12:06', '12:08', '12:21'].map(time => ({name: 'Task', hh: time.slice(0, 2), mm: time.slice(3)}));
  };
  const result = await h.engine();
  assert.deepEqual(result.alarmsToAdd, []);
  assert.deepEqual(result.alarmsToDelete, []);
  assert.deepEqual(result.triggerShortcutsToRunDetailed, []);
  assert.equal(result.debug.rejectedScheduleKeys.length, 1);
  assert.equal(h.registry()[0].qrRestartHHMM, '12:06');
  assert.deepEqual(h.times(), ['12:06', '12:08', '12:21']);
});

test('registry lock timeout emits no Clock mutations or trigger actions', async () => {
  const h = new Harness([task()]); await h.install(); h.at(0);
  h.disk.set(root + 'registryLock.txt', JSON.stringify({id: 'busy', timestamp: h.now / 1000}));
  const result = await h.engine();
  assert.match(result.errorRegistry, /registry lock timeout/);
  assert.deepEqual(result.alarmsToAdd, []);
  assert.deepEqual(result.alarmsToDelete, []);
  assert.deepEqual(result.triggerShortcutsToRunDetailed, []);
  assert.deepEqual(h.times(), ['12:00']);
});

test('retired alarm ownership allows recovery after a native deletion was skipped', async () => {
  const h = new Harness([task()]); await h.install();
  const plan = await h.engine('', false);
  // Simulate partial native application: creations succeed, deletion is skipped.
  h.apply({alarmsToAdd: plan.alarmsToAdd});
  assert.deepEqual(h.times(), ['12:00', '12:02', '12:04', '12:21']);
  h.at(1); await h.engine();
  assert.deepEqual(h.times(), ['12:02', '12:04', '12:21']);
  await h.engine();
  assert.equal(h.registry()[0].retiredAlarmTimes.length, 0);
});
