const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../Calendar Alarms Runtime.js'), 'utf8');
const ROOT = '/Shortcuts/OpenHabits/Calendar Alarms/';
const OWNER = '/local/calendar-alarms-loop-owner-v1.json';
const PLAY = '/local/calendar-alarms-playback-v1.json';
const UX = '/local/calendar-alarms-qr-menu-v1.json';

function fixture() {
  let now = Date.parse('2026-10-26T22:00:00-04:00'), seq = 0;
  const alarm = {alarmName: 'Night', calcFireTime: now / 1000, firstQRFireTime: now / 1000,
    qrActive: true, qrCodeID: 'code', qrSoundPath: 'ocean.mp3', qrVol: 25};
  const disk = new Map([[ROOT + 'registry.txt', JSON.stringify([alarm])],
    [ROOT + 'scannerLastOpened.txt', new Date(0).toISOString()]]);
  const hooks = {}, notifications = [];
  const fm = {bookmarkedPath: () => '/Shortcuts', joinPath: (a,b) => a + '/' + b,
    cacheDirectory: () => '/local', fileExists: p => disk.has(p), readString: p => disk.get(p),
    writeString(p, s) { if (hooks.failWrite === p) throw Error('State write failed'); disk.set(p,s); },
    createDirectory() {}, isFileStoredIniCloud: () => false, isFileDownloaded: () => true};
  class Clock extends Date {constructor(...a) {super(...(a.length ? a : [now]));} static now() {return now;}}
  class Notification {
    static async removePending() { if (hooks.removeFail) throw Error('Notification removal denied'); }
    static async removeDelivered() {}
    setTriggerDate() {}
    async schedule() {
      notifications.push(this);
      if (hooks.scheduleFail) throw Error('Notification denied');
      if (hooks.onSchedule) await hooks.onSchedule();
    }
  }
  async function run(request) {
    let output;
    await vm.runInNewContext('(async()=>{' + source + '})()', {FileManager: {iCloud: () => fm, local: () => fm},
      Date: Clock, UUID: {string: () => String(++seq)}, Notification, args: {shortcutParameter: request},
      Script: {setShortcutOutput: x => {output = x;}, complete() {}}});
    return JSON.parse(JSON.stringify(output));
  }
  const rows = value => disk.set(ROOT + 'registry.txt', JSON.stringify(value));
  const step = (session, plan, extra = {}) => run({op: 'qr_step', session,
    alarmKey: plan.alarmKey, fileName: plan.fileName, volume: plan.volume, duration: 2, ...extra});
  return {run, step, rows, disk, alarm, hooks, notifications, advance(ms) {now += ms;}, get now() {return now;}};
}

test('initial poll supplies a complete plan during mute, trigger work and another playback', async () => {
  for (const blocked of ['mute', 'trigger', 'playback']) {
    const h = fixture(), session = (await h.run({op: 'engine_begin', input: ''})).session;
    if (blocked === 'mute') await h.run({op: 'scanner_silence'});
    if (blocked === 'trigger') h.rows([{...h.alarm, triggerActionID: 'task', triggerActionsUntil: h.now / 1000 + 60}]);
    if (blocked === 'playback') h.disk.set(PLAY, JSON.stringify({reservedAt: h.now, expectedEndAt: h.now + 2000}));
    const plan = await h.run({op: 'qr_poll', session});
    assert.equal(plan.stop, 0); assert.equal(plan.play, 0);
    assert.equal(plan.fileName, 'ocean.mp3'); assert.equal(plan.volume, 0.25); assert.ok(plan.alarmKey);
    assert.equal(h.disk.has(OWNER), false);
  }
});

test('one step acknowledges the previous clip, posts once and permits the next prepared clip', async () => {
  const h = fixture(), session = (await h.run({op: 'engine_begin', input: ''})).session;
  const plan = await h.run({op: 'qr_poll', session, notificationPollIndex: 1});
  assert.equal(h.notifications.length, 0); assert.equal(h.disk.has(OWNER), false);
  const first = await h.step(JSON.stringify(session), plan);
  assert.equal(first.play, 1); assert.equal(h.notifications.length, 0);
  assert.equal(JSON.parse(h.disk.get(OWNER)).id, session.id);
  h.advance(2000);
  const next = await h.step(session, first, {completedPlaybackToken: first.playbackToken});
  assert.equal(next.play, 1); assert.equal(h.notifications.length, 1);
  assert.notEqual(next.playbackToken, first.playbackToken);
  h.advance(2000);
  assert.equal((await h.step(session, next, {completedPlaybackToken: next.playbackToken})).play, 1);
  assert.equal(h.notifications.length, 1);
});

test('pending replacement and failed preparation preserve the committed player', async () => {
  const h = fixture(), old = (await h.run({op: 'engine_begin', input: ''})).session;
  const plan = await h.run({op: 'qr_poll', session: old});
  const first = await h.step(old, plan); h.advance(2000);
  await h.run({op: 'qr_poll', session: old, completedPlaybackToken: first.playbackToken});
  const before = h.disk.get(OWNER), next = (await h.run({op: 'engine_begin', input: ''})).session;
  assert.equal(next.pending, true); assert.equal(next.reliableQRHandoff, undefined);
  assert.equal(h.disk.get(OWNER), before);
  assert.equal((await h.step(next, plan, {fileName: 'wrong.mp3'})).play, 0);
  assert.equal(h.disk.get(OWNER), before);
  assert.equal((await h.run({op: 'qr_poll', session: old})).play, 1);
  assert.equal((await h.step(next, plan)).play, 1);
  assert.equal((await h.run({op: 'qr_poll', session: old})).reason, 'superseded');
});

test('changed alarm, sound or volume returns a replacement plan without stale permission', async () => {
  for (const change of [{qrGeneration: 2}, {qrSoundPath: 'new.mp3'}, {qrVol: 50}]) {
    const h = fixture(), session = (await h.run({op: 'engine_begin', input: ''})).session;
    const initial = await h.run({op: 'qr_poll', session});
    h.rows([{...h.alarm, ...change}]);
    const next = await h.step(session, initial);
    assert.equal(next.stop, 0); assert.equal(next.play, 0); assert.equal(h.disk.has(OWNER), false);
    assert.equal((await h.step(session, next)).play, 1);
  }
});

test('missing or invalid preparation never claims playback', async () => {
  for (const invalid of [{fileName: undefined}, {fileName: '../ocean.mp3'}, {volume: undefined},
    {volume: ''}, {volume: 'bad'}, {volume: 0.5}, {alarmKey: undefined}, {duration: 0}, {duration: 'bad'}]) {
    const h = fixture(), session = (await h.run({op: 'engine_begin', input: ''})).session;
    const plan = await h.run({op: 'qr_poll', session});
    const result = await h.step(session, plan, invalid);
    assert.equal(result.play, 0); assert.equal(h.disk.has(OWNER), false); assert.equal(h.disk.has(PLAY), false);
  }
});

test('scan during native preparation stops with cleanup rather than playing its stale file', async () => {
  const h = fixture(), session = (await h.run({op: 'engine_begin', input: ''})).session;
  const plan = await h.run({op: 'qr_poll', session});
  h.rows([{...h.alarm, qrActive: false, qrRestartFireTime: h.now / 1000 + 120, qrRestartHHMM: '22:02'}]);
  const result = await h.step(session, plan);
  assert.equal(result.stop, 1); assert.equal(result.play, 0); assert.equal(result.reason, 'no_active_qr_alarm');
  assert.deepEqual(result.alarmsToDelete, [{name: 'Night', hh: '22', mm: '02'}]);
});

test('scan during the post-audio banner is rechecked before another permission', async () => {
  const h = fixture(), session = (await h.run({op: 'engine_begin', input: ''})).session;
  const plan = await h.run({op: 'qr_poll', session});
  const first = await h.step(session, plan); h.advance(2000);
  h.hooks.onSchedule = () => h.rows([]);
  const next = await h.step(session, first, {completedPlaybackToken: first.playbackToken});
  assert.equal(next.stop, 1); assert.equal(next.play, 0); assert.equal(next.reason, 'no_active_qr_alarm');
  assert.equal(JSON.parse(h.disk.get(PLAY)).expectedEndAt, 0);
});

test('strict whole-clip boundary is checked after optional notification latency', async () => {
  const h = fixture(), session = (await h.run({op: 'engine_begin', input: ''})).session;
  const bounded = {...session, deadline: h.now + 6000};
  const plan = await h.run({op: 'qr_poll', session: bounded});
  const first = await h.step(bounded, plan); assert.equal(first.play, 1); h.advance(2000);
  h.hooks.onSchedule = () => h.advance(1000);
  const next = await h.step(bounded, first, {completedPlaybackToken: first.playbackToken});
  assert.equal(next.reason, 'clip_exceeds_remaining_time'); assert.equal(next.play, 0);
  h.advance(3000);
  assert.equal((await h.step(bounded, first)).reason, 'deadline_expired');
});

test('mute after preparation denies playback and stale acknowledgements cannot release another clip', async () => {
  const h = fixture(), session = (await h.run({op: 'engine_begin', input: ''})).session;
  const plan = await h.run({op: 'qr_poll', session});
  await h.run({op: 'scanner_silence'});
  assert.equal((await h.step(session, plan)).play, 0); assert.equal(h.disk.has(OWNER), false);
  h.advance(15000); const first = await h.step(session, plan); h.advance(2000);
  const next = await h.step(session, first, {completedPlaybackToken: first.playbackToken});
  const before = h.disk.get(PLAY);
  assert.equal((await h.step(session, next, {completedPlaybackToken: first.playbackToken})).play, 0);
  assert.equal(h.disk.get(PLAY), before);
});

test('notification API failure preserves known menu and silence details', async () => {
  for (const op of ['scanner_menu', 'scanner_scan_begin', 'scanner_silence', 'qr_notification']) {
    const h = fixture(); h.hooks.removeFail = true;
    const result = await h.run({op});
    assert.equal(result.ok, 1); assert.equal(result.hasError, 0);
    assert.equal(result.activeCount, 1); assert.equal(result.activeName, 'Night');
    assert.match(result.notificationWarning, /denied/);
    if (op === 'scanner_scan_begin' || op === 'scanner_silence')
      assert.equal(result.silenceUntil, h.now + 15000);
  }
});

test('registry and mute-state write failures remain real errors', async () => {
  const h = fixture(); h.disk.set(ROOT + 'registry.txt', 'not JSON');
  assert.equal((await h.run({op: 'scanner_menu'})).hasError, 1);
  for (const target of [UX, ROOT + 'scannerLastOpened.txt']) {
    const h = fixture(); h.hooks.failWrite = target;
    const result = await h.run({op: 'scanner_scan_begin'});
    assert.equal(result.ok, 0); assert.equal(result.hasError, 1); assert.match(result.error, /State write failed/);
  }
});

test('optional banner failure is attempted once and never invalidates a prepared clip', async () => {
  const h = fixture(), session = (await h.run({op: 'engine_begin', input: ''})).session;
  const plan = await h.run({op: 'qr_poll', session});
  const first = await h.step(session, plan); h.advance(2000); h.hooks.scheduleFail = true;
  const next = await h.step(session, first, {completedPlaybackToken: first.playbackToken});
  assert.equal(next.play, 1); assert.equal(next.hasError, 0); assert.equal(h.notifications.length, 1);
  h.advance(2000);
  assert.equal((await h.step(session, next, {completedPlaybackToken: next.playbackToken})).play, 1);
  assert.equal(h.notifications.length, 1);
});


test('camera and Silence during the first clip keep their chosen banner timing', async () => {
  for (const op of ['scanner_scan_begin', 'scanner_silence']) {
    const h = fixture(), session = (await h.run({op: 'engine_begin', input: ''})).session;
    const plan = await h.run({op: 'qr_poll', session});
    const first = await h.step(session, plan);
    await h.run({op});
    const count = h.notifications.length, state = h.disk.get(UX);
    h.advance(2000);
    const next = await h.step(session, first, {completedPlaybackToken: first.playbackToken});
    assert.equal(next.play, 0); assert.equal(next.stop, 0);
    assert.equal(h.notifications.length, count); assert.equal(h.disk.get(UX), state);
    assert.equal(JSON.parse(h.disk.get(OWNER)).notificationAttempted, true);
  }
});


test('optional banner bookkeeping failure cannot stop playback with a valid registry', async () => {
  for (const target of [UX, OWNER]) {
    const h = fixture(), session = (await h.run({op: 'engine_begin', input: ''})).session;
    const plan = await h.run({op: 'qr_poll', session});
    const first = await h.step(session, plan); h.advance(2000); h.hooks.failWrite = target;
    const next = await h.step(session, first, {completedPlaybackToken: first.playbackToken});
    assert.equal(next.play, 1); assert.equal(next.hasError, 0);
  }
});

test('optional UX cleanup failure cannot suppress known Clock deletions', async () => {
  const h = fixture(), session = (await h.run({op: 'engine_begin', input: ''})).session;
  const plan = await h.run({op: 'qr_poll', session});
  h.disk.set(UX, '{}'); h.hooks.failWrite = UX;
  h.rows([{...h.alarm, qrActive: false, qrRestartFireTime: h.now / 1000 + 120, qrRestartHHMM: '22:02'}]);
  const result = await h.step(session, plan);
  assert.equal(result.reason, 'no_active_qr_alarm'); assert.equal(result.hasError, 0);
  assert.deepEqual(result.alarmsToDelete, [{name: 'Night', hh: '22', mm: '02'}]);
});

test('main registry failure still stops step playback despite optional notification handling', async () => {
  const h = fixture(), session = (await h.run({op: 'engine_begin', input: ''})).session;
  const plan = await h.run({op: 'qr_poll', session});
  const first = await h.step(session, plan); h.advance(2000);
  h.disk.set(ROOT + 'registry.txt', 'broken JSON');
  const next = await h.step(session, first, {completedPlaybackToken: first.playbackToken});
  assert.equal(next.play, 0); assert.equal(next.hasError, 1); assert.equal(next.reason, 'runtime_error');
});
