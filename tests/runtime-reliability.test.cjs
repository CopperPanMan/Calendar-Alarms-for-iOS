const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../Calendar Alarms Runtime.js'), 'utf8');
const root = '/Shortcuts/OpenHabits/Calendar Alarms/';
const owner = '/local/calendar-alarms-loop-owner-v1.json';
function fixture(options = {}) {
  let now = Date.parse('2026-10-26T22:00:00-04:00'), seq = 0, output, notifications = 0, downloads = 0;
  const rows = [{alarmName: 'Night', calcFireTime: now / 1000, qrActive: true, qrCodeID: 'code',
    firstQRFireTime: now / 1000, qrVol: 25, qrSoundPath: 'ocean.mp3'}];
  const disk = new Map([[root + 'registry.txt', JSON.stringify(rows)],
    [root + 'scannerLastOpened.txt', new Date(0).toISOString()]]);
  const fm = {bookmarkedPath: () => '/Shortcuts', joinPath: (a,b) => a+'/'+b, cacheDirectory: () => '/local',
    fileExists: p => disk.has(p), readString: p => disk.get(p), writeString: (p,s) => disk.set(p,s), createDirectory() {},
    isFileStoredIniCloud: p => options.cold && p === root+'registry.txt', isFileDownloaded: () => !options.cold,
    downloadFileFromiCloud: async () => {downloads++; throw Error('Must not download');}};
  class Clock extends Date {constructor(...args) {super(...(args.length ? args : [now]));} static now() {return now;}}
  class Notification {
    static async removePending() {notifications++; if (options.stall) return new Promise(() => {});}
    static async removeDelivered() {notifications++;}
    setTriggerDate() {}
    async schedule() {notifications++;}
  }
  const run = async request => {
    await vm.runInNewContext('(async()=>{'+source+'})()', {Date: Clock, FileManager: {iCloud: () => fm, local: () => fm},
      UUID: {string: () => String(++seq)}, args: {shortcutParameter: request}, Notification,
      Timer: {schedule(ms, repeats, fn) {const timer = setTimeout(() => {now += ms; fn();}, 0); return {invalidate: () => clearTimeout(timer)};}},
      Script: {setShortcutOutput: x => {output = x;}, complete() {}}});
    return JSON.parse(JSON.stringify(output));
  };
  return {run, disk, rows, get now() {return now;}, advance: ms => {now += ms;},
    get notifications() {return notifications;}, get downloads() {return downloads;}};
}

test('a failed replacement preparation leaves the previous player owner intact', async () => {
  const h = fixture(), old = (await h.run({op: 'engine_begin', input: ''})).session;
  const oldPlan = await h.run({op: 'qr_poll', session: old});
  await h.run({op: 'qr_permit', session: old, alarmKey: oldPlan.alarmKey, duration: 2});
  h.advance(3000);
  const before = h.disk.get(owner);
  const next = (await h.run({op: 'engine_begin', input: '', reliableQRHandoff: true})).session;
  assert.equal(h.disk.get(owner), before);
  const poll = await h.run({op: 'qr_poll', session: next});
  assert.equal((await h.run({op: 'qr_permit', session: next, alarmKey: poll.alarmKey, duration: 999})).play, 0);
  assert.equal(h.disk.get(owner), before);
  assert.equal((await h.run({op: 'qr_poll', session: old})).play, 1);
});

test('only final playback permission transfers ownership and stale preparations cannot reclaim it', async () => {
  const h = fixture(), old = (await h.run({op: 'engine_begin', input: ''})).session;
  const earlier = (await h.run({op: 'engine_begin', input: '', reliableQRHandoff: true})).session;
  const next = (await h.run({op: 'engine_begin', input: '', reliableQRHandoff: true})).session;
  const poll = await h.run({op: 'qr_poll', session: next});
  assert.equal((await h.run({op: 'qr_permit', session: next, alarmKey: poll.alarmKey, duration: 2})).play, 1);
  assert.equal(JSON.parse(h.disk.get(owner)).id, next.id);
  assert.equal((await h.run({op: 'qr_poll', session: old})).reason, 'superseded');
  assert.equal((await h.run({op: 'qr_poll', session: earlier})).reason, 'superseded');
});

test('reliable first audio poll never waits for notification APIs, before or after ownership commits', async () => {
  const h = fixture({stall: true}), session = (await h.run({op: 'engine_begin', input: '', reliableQRHandoff: true})).session;
  assert.equal((await h.run({op: 'qr_poll', session, notificationPollIndex: 1})).play, 1);
  assert.equal(h.notifications, 0);
  const poll = await h.run({op: 'qr_poll', session});
  await h.run({op: 'qr_permit', session, alarmKey: poll.alarmKey, duration: 2});
  const committedSession = JSON.parse(h.disk.get(owner));
  assert.equal(committedSession.pending, false);
  h.advance(3000);
  assert.equal((await h.run({op: 'qr_poll', session: committedSession, notificationPollIndex: 1})).play, 1);
  assert.equal(h.notifications, 0);
});

test('legacy wrapper posts its banner only after a completed clip and only once', async () => {
  const h = fixture(), session = (await h.run({op: 'engine_begin', input: ''})).session;
  const plan = await h.run({op: 'qr_poll', session, notificationPollIndex: 1});
  assert.equal(plan.play, 1); assert.equal(h.notifications, 0);
  const permit = await h.run({op: 'qr_permit', session, alarmKey: plan.alarmKey, duration: 2});
  h.advance(2000);
  assert.equal((await h.run({op: 'qr_poll', session, completedPlaybackToken: permit.playbackToken})).play, 1);
  assert.equal(h.notifications, 3);
  assert.equal((await h.run({op: 'qr_poll', session, notificationPollIndex: 2})).play, 1);
  assert.equal((await h.run({op: 'qr_poll', session})).play, 1);
  assert.equal(h.notifications, 3);
});

test('legacy post-playback notification timeout stays bounded and does not prevent the next clip', async () => {
  const h = fixture({stall: true}), session = (await h.run({op: 'engine_begin', input: ''})).session;
  const plan = await h.run({op: 'qr_poll', session});
  const permit = await h.run({op: 'qr_permit', session, alarmKey: plan.alarmKey, duration: 2});
  h.advance(2000);
  const start = h.now, before = h.disk.get(root + 'registry.txt');
  const result = await h.run({op: 'qr_poll', session, completedPlaybackToken: permit.playbackToken});
  assert.equal(result.play, 1);
  assert.equal(result.stop, 0);
  assert.equal(h.now - start, 1200);
  assert.equal(h.notifications, 1);
  assert.equal(h.disk.get(root + 'registry.txt'), before);
});

test('a superseded legacy player cannot replace its successor notification', async () => {
  const h = fixture(), old = (await h.run({op: 'engine_begin', input: ''})).session;
  const next = (await h.run({op: 'engine_begin', input: ''})).session;
  const plan = await h.run({op: 'qr_poll', session: next});
  await h.run({op: 'qr_permit', session: next, alarmKey: plan.alarmKey, duration: 2});
  const result = await h.run({op: 'qr_poll', session: old, notificationPollIndex: 1});
  assert.equal(result.reason, 'superseded');
  assert.equal(h.notifications, 0);
});

test('notification timeout preserves the silence deadline and stops optional work', async () => {
  const h = fixture({stall: true}), start = h.now;
  const result = await h.run({op: 'scanner_silence'});
  assert.equal(result.ok, 1);
  assert.equal(result.activeCount, 1);
  assert.match(result.notificationWarning, /timed out/);
  assert.equal(h.now - start, 1200);
  assert.equal(h.notifications, 1);
  assert.equal(JSON.parse(h.disk.get('/local/calendar-alarms-qr-menu-v1.json')).silenceUntil, start + 15000);
  assert.equal(JSON.parse(h.disk.get(root + 'registry.txt'))[0].qrActive, true);
});

test('cold registry does not download or claim playback; malformed QR gives structured error', async () => {
  const h = fixture({cold: true});
  const session = (await h.run({op: 'engine_begin', input: '', reliableQRHandoff: true})).session;
  const r = await h.run({op: 'qr_poll', session});
  assert.equal(r.play, 0); assert.match(r.error, /not downloaded/);
  assert.equal(h.downloads, 0); assert.equal(h.disk.has(owner), false);
  const malformed = await h.run({op: 'scan_input', input: 'shortcuts://run-shortcut?input=%ZZ', fromScan: true});
  assert.equal(malformed.code, ''); assert.equal(malformed.failedOp, 'scan_input');
});

test('task reset preserves exact occurrence and virtual-day evaluation window', async () => {
  const h = fixture(), alarmOccurrence = {alarmName: 'Night', calcFireTime: h.now / 1000};
  const virtualDay = {enabled: true, windowStartISO: '2026-10-26T09:00:00Z', windowEndISO: '2026-10-27T09:00:00Z'};
  h.disk.set('/Shortcuts/OpenHabits/OpenHabits Metrics/lockoutCache.json', JSON.stringify({ok: true,
    generatedAtISO: new Date(h.now).toISOString(), timezone: 'America/New_York', virtualDay,
    reminderState: {byID: {floss_time: {found: true, complete: true}}}}));
  const result = await h.run({op: 'action', refreshed: true, input: {action: 'task_alarm_reset',
    taskLoopMetricIDs: ['floss_time'], alarmOccurrence}});
  const report = JSON.parse(result.engineInput);
  assert.deepEqual(report.alarmOccurrence, alarmOccurrence);
  assert.deepEqual(report.completionScope, {windowStartISO: virtualDay.windowStartISO,
    windowEndISO: virtualDay.windowEndISO, timezone: 'America/New_York'});
});

test('notification success and normal playback stops explicitly suppress native error banners', async () => {
  const h = fixture();
  const begin = await h.run({op: 'engine_begin', input: '', reliableQRHandoff: true});
  assert.equal(begin.hasError, 0);
  const session = begin.session;
  const notification = await h.run({op: 'qr_notification', session});
  assert.equal(notification.ok, 1);
  assert.equal(notification.error, '');
  assert.equal(notification.hasError, 0);
  const poll = await h.run({op: 'qr_poll', session});
  assert.equal(poll.play, 1);
  assert.equal(poll.hasError, 0);
  const clipStop = await h.run({op: 'qr_permit', session, alarmKey: poll.alarmKey, duration: 999});
  assert.equal(clipStop.reason, 'clip_exceeds_remaining_time');
  assert.equal(clipStop.stop, 1);
  assert.equal(clipStop.hasError, 0);
  h.advance(180000);
  const deadlineStop = await h.run({op: 'qr_poll', session});
  assert.equal(deadlineStop.reason, 'deadline_expired');
  assert.equal(deadlineStop.hasError, 0);
  const skipped = await h.run({op: 'qr_notification', session});
  assert.equal(skipped.skipped, 'superseded');
  assert.equal(skipped.hasError, 0);
  h.disk.set(root + 'registry.txt', '[]');
  const emptyError = await h.run({op: 'scanner_menu'});
  assert.equal(emptyError.error, '');
  assert.equal(emptyError.hasError, 0);
});

test('optional notification failures are separate from real runtime errors', async () => {
  const h = fixture({stall: true});
  const notification = await h.run({op: 'qr_notification'});
  assert.equal(notification.hasError, 0);
  assert.equal(notification.activeCount, 1);
  assert.match(notification.notificationWarning, /timed out/);
  const invalidInput = await h.run('invalid JSON');
  assert.equal(invalidInput.failedOp, 'startup');
  assert.equal(invalidInput.hasError, 1);
  const malformedQR = await h.run({op: 'scan_input', input: 'shortcuts://run-shortcut?input=%ZZ', fromScan: true});
  assert.equal(malformedQR.hasError, 1);
  assert.ok(malformedQR.error.length > 0);
});

test('numeric error contract preserves the sound-file path output', async () => {
  const h = fixture();
  h.disk.set(root + 'Alarm Tones/ocean.mp3', 'audio');
  assert.equal(await h.run({op: 'sound_file', file: 'ocean.mp3'}), root + 'Alarm Tones/ocean.mp3');
});
