const test = require('node:test');
const assert = require('node:assert/strict');
const {Harness} = require('./helpers/calendar-engine-harness.cjs');

async function start() {
  const h = new Harness([{alarmName: 'Task', qrCodeID: 'bath', taskIDs: ['floss'],
    taskLoopMin: 21, maxReschedules: 2}]);
  await h.install();
  await h.engine();
  h.at(1);
  return h;
}

for (const kind of ['task', 'ordinary', 'active QR', 'pending QR']) {
  for (const minutes of [2, 4]) test(`scan preserves a +${minutes} time owned by another ${kind} occurrence`, async () => {
    const h = await start();
    const epoch = h.start / 1000 + minutes * 60;
    const hhmm = '12:0' + minutes;
    const other = {alarmName: 'Task', calcFireTime: h.start / 1000 + 60,
      nextFireTime: epoch, nextFireHHMM: hhmm};
    if (kind === 'task') Object.assign(other, {taskIDs: ['walk'], taskCheckFireTime: epoch, taskCheckHHMM: hhmm});
    if (kind.includes('QR')) Object.assign(other, {qrCodeID: 'other', firstQRFireTime: h.start / 1000,
      qrActive: kind === 'active QR', qrPending: kind === 'pending QR',
      qrRestartFireTime: epoch, qrRestartHHMM: hhmm});
    h.putRegistry([...h.registry(), other]);
    const result = await h.scan('bath');
    assert.deepEqual(result.alarmsToDelete.map(a => a.hh + ':' + a.mm).sort(), ['12:00', '12:0' + (minutes === 2 ? 4 : 2)]);
    assert.deepEqual(h.times(), [hhmm, '12:21']);
  });
}

test('scan deletes the stored Clock times after a timezone change', async () => {
  const h = await start();
  const rows = h.registry();
  Object.assign(rows[0], {qrRestartHHMM: '09:02', qrFallbackHHMM: '09:04', qrBackupHHMM: '09:04'});
  h.putRegistry(rows);
  for (const alarm of h.clock) if (alarm.mm !== '21') alarm.hh = '09';
  const result = await h.scan('bath');
  assert.deepEqual(result.alarmsToDelete.map(a => a.hh + ':' + a.mm).sort(), ['09:02', '09:04', '12:00']);
  assert.deepEqual(h.times(), ['12:21']);
});

test('scan includes tracked obsolete alarms and retains ownership for failed native deletion recovery', async () => {
  const h = await start();
  const rows = h.registry();
  rows[0].retiredAlarmTimes = [{epoch: h.start / 1000 + 3 * 60, hhmm: '12:03'}];
  h.putRegistry(rows);
  h.clock.push({name: 'Task', hh: '12', mm: '03', isEnabled: true, fireTime: h.start + 180000});
  const plan = await h.run('Calendar Alarm QR Scanner.js', 'bath');
  assert.deepEqual(plan.alarmsToDelete.map(a => a.hh + ':' + a.mm).sort(), ['12:02', '12:03', '12:04']);
  assert.equal(h.registry()[0].qrActive, false);
  // Simulate the Scanner Shortcut stopping before its native deletion actions.
  await h.engine();
  assert.deepEqual(h.times(), ['12:21']);
});

test('failed scan registry commit returns no deletions, scan actions, or success', async () => {
  const h = await start();
  const rows = h.registry();
  rows[0].qrShortcutsOnScan = [{name: 'Example', input: []}];
  h.putRegistry(rows);
  h.options.failRegistryWrite = true;
  const result = await h.scan('bath');
  assert.match(result.errorRegistry, /write failed/);
  assert.deepEqual(result.alarmsToDelete, []);
  assert.deepEqual(result.shortcutsToRunDetailed, []);
  assert.equal(result.identifiedAlarms, 0);
  assert.equal(result.vibrate, false);
  assert.doesNotMatch(result.notification, /cleared/);
  assert.equal(h.registry()[0].qrActive, true);
  assert.deepEqual(h.times(), ['12:02', '12:04', '12:21']);
});

test('scan cleans legacy non-task QR pointers even without firstQRFireTime', async () => {
  const h = await start();
  const entry = h.registry()[0];
  entry.taskIDs = [];
  entry.nextFireTime = entry.qrRestartFireTime;
  entry.nextFireHHMM = entry.qrRestartHHMM;
  for (const field of ['firstQRFireTime', 'taskCheckFireTime', 'taskCheckHHMM',
    'qrRestartFireTime', 'qrRestartHHMM', 'qrFallbackFireTime', 'qrFallbackHHMM']) delete entry[field];
  h.putRegistry([entry]);
  h.clock = h.clock.filter(a => a.mm !== '21');
  await h.scan('bath');
  assert.deepEqual(h.times(), []);
});

test('one scan cancels every matching QR instance and deduplicates shared deletions', async () => {
  const h = await start();
  const first = h.registry()[0];
  const second = {...first, calcFireTime: first.calcFireTime + 30,
    qrRestartFireTime: h.start / 1000 + 3 * 60, qrRestartHHMM: '12:03',
    qrFallbackFireTime: h.start / 1000 + 5 * 60, qrFallbackHHMM: '12:05',
    qrBackupFireTime: h.start / 1000 + 5 * 60, qrBackupHHMM: '12:05'};
  h.putRegistry([first, second]);
  for (const mm of ['03', '05']) h.clock.push({name: 'Task', hh: '12', mm});
  const result = await h.scan('bath');
  assert.equal(result.identifiedAlarms, 2);
  assert.deepEqual(result.alarmsToDelete.map(a => a.hh + ':' + a.mm).sort(),
    ['12:00', '12:02', '12:03', '12:04', '12:05']);
  assert.deepEqual(h.times(), ['12:21']);
});
