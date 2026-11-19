const test = require('node:test');
const assert = require('node:assert/strict');
const {Harness, root, registryPath} = require('./helpers/calendar-engine-harness.cjs');

const NOTICE_ID = 'calendar-alarms-qr-menu-v1';
const UX_PATH = '/local/calendar-alarms-qr-menu-v1.json';
const SCANNER_PATH = root + 'scannerLastOpened.txt';
const qr = (extra = {}) => ({alarmName: 'Startup Test', qrCodeID: 'startup-test',
  qrSoundPath: 'Alarm Tones/ocean.mp3', qrVol: 30, ...extra});

class NotificationHarness extends Harness {
  constructor(definitions = [qr()], options = {}) {
    super(definitions, {nativePlaybackV2: true, ...options});
    this.schedules = [];
    this.attempts = 0;
    this.pending = new Map();
    this.delivered = new Map();
    this.removals = [];
    this.timers = [];
    this.options.onTimer = ms => this.timers.push(ms);
  }
  context(input, scriptName) {
    const context = super.context(input, scriptName), h = this;
    context.Notification = class {
      static async removePending(ids) {
        h.removals.push({kind: 'pending', ids: [...ids]});
        if (h.options.notificationCleanupDenied) throw Error('Notification cleanup denied');
        if (h.options.notificationCleanupHangs) return new Promise(() => {});
        for (const id of ids) h.pending.delete(id);
      }
      static async removeDelivered(ids) {
        h.removals.push({kind: 'delivered', ids: [...ids]});
        if (h.options.notificationCleanupDenied) throw Error('Notification cleanup denied');
        if (h.options.notificationCleanupHangs) return new Promise(() => {});
        for (const id of ids) h.delivered.delete(id);
      }
      setTriggerDate(date) { this.date = date.getTime(); }
      async schedule() {
        h.attempts++;
        if (h.options.notificationDenied) throw Error('Notification denied');
        if (h.options.notificationHangs) return new Promise(() => {});
        const notification = JSON.parse(JSON.stringify({...this, date: this.date || h.now}));
        h.schedules.push(notification);
        h.pending.set(notification.identifier, notification);
        if (h.options.onNotificationSchedule) await h.options.onNotificationSchedule(h);
      }
    };
    return context;
  }
}

async function prepared(definitions, options) {
  const h = new NotificationHarness(definitions, options);
  await h.install();
  assert.equal(h.schedules.length, 0, 'creating the Clock alarm must not post a scan prompt');
  return h;
}

test('QR activation posts one silent actionable notification in the existing Engine invocation', async () => {
  const h = await prepared();
  const result = await h.engine();
  assert.equal(result.nativePlaybackPlan.enabled, 1);
  assert.equal(h.schedules.length, 1);
  const notice = h.schedules[0];
  assert.equal(notice.identifier, NOTICE_ID);
  assert.equal(notice.title, 'Startup Test');
  assert.equal(notice.sound, null);
  assert.match(notice.body, /scan/i);
  assert.match(notice.body, /silence/i);
  const url = new URL(notice.openURL);
  assert.equal(url.protocol, 'shortcuts:');
  assert.equal(url.searchParams.get('name'), 'Calendar Alarms QR Scanner');
  assert.equal(url.searchParams.has('input'), false);
});

test('future QR alarms do not notify until their actual activation', async () => {
  const h = await prepared([qr({offsetMin: 10})]);
  h.at(5);
  assert.equal((await h.engine()).nativePlaybackPlan.enabled, 0);
  assert.equal(h.schedules.length, 0);
  h.at(10);
  assert.equal((await h.engine()).nativePlaybackPlan.enabled, 1);
  assert.equal(h.schedules.length, 1);
});

test('two-minute native restarts preserve the activation and never repeat the startup banner', async () => {
  const h = await prepared();
  const first = (await h.engine()).nativePlaybackPlan;
  for (const minute of [2, 4, 6]) {
    h.at(minute);
    const next = (await h.engine()).nativePlaybackPlan;
    assert.equal(next.enabled, 1);
    assert.equal(next.activationID, first.activationID);
    assert.equal(h.schedules.length, 1);
  }
  assert.equal(h.attempts, 1);
});

test('scanning and then starting the next occurrence posts a fresh startup notification', async () => {
  const h = await prepared([qr(), qr({offsetMin: 10})]);
  const first = (await h.engine()).nativePlaybackPlan;
  await h.scan('startup-test');
  assert.equal(h.registry().some(row => row.qrActive && row.nativePlaybackID === first.activationID), false);
  h.at(10);
  const next = (await h.engine()).nativePlaybackPlan;
  assert.equal(next.enabled, 1);
  assert.notEqual(next.activationID, first.activationID);
  assert.equal(h.schedules.length, 2);
});

test('a losing concurrent activation cannot post the winning Engine invocation’s notification', async () => {
  const h = await prepared();
  let reads = 0;
  h.options.onRead = path => {
    if (path !== registryPath || ++reads !== 2) return;
    const rows = h.registry(), row = rows[0], now = Math.floor(h.now / 1000);
    Object.assign(row, {qrActive: true, qrPending: false, nativePlaybackID: 'concurrent-winner',
      firstQRFireTime: now, qrRestartFireTime: now + 120, qrFallbackFireTime: now + 240,
      qrGeneration: Number(row.qrGeneration || 0) + 1});
    h.putRegistry(rows);
  };
  const result = await h.engine();
  assert.equal(h.registry()[0].nativePlaybackID, 'concurrent-winner');
  assert.ok(result.debug.rejectedScheduleKeys.length);
  assert.equal(result.nativePlaybackPlan.activationID, 'concurrent-winner');
  assert.equal(h.attempts, 0);
});

test('a failed activation commit never posts a scan notification', async () => {
  const h = await prepared();
  h.options.failRegistryWrite = true;
  const result = await h.engine('', false);
  assert.equal(result.nativePlaybackPlan.enabled, 0);
  assert.equal(h.attempts, 0);
});

test('a scan after activation commit but before notification posting suppresses the stale banner', async () => {
  const h = await prepared();
  let activationCommitted = false;
  const write = h.fm.writeString;
  h.fm.writeString = (path, value) => {
    write(path, value);
    if (path === registryPath && JSON.parse(value).some(row => row.qrActive && row.nativePlaybackID))
      activationCommitted = true;
  };
  h.options.onRead = path => {
    if (path !== registryPath || !activationCommitted) return;
    activationCommitted = false;
    const rows = h.registry();
    for (const row of rows) row.qrActive = false;
    h.putRegistry(rows);
  };
  const result = await h.engine();
  assert.equal(h.registry().some(row => row.qrActive), false);
  assert.equal(h.attempts, 0);
  assert.doesNotMatch(result.errorRegistry, /alarm state unavailable/);
});

for (const scenario of ['Silence return reminder', 'Scanner mute without UX cache', 'future reminder without mute']) {
  test(`startup respects ${scenario} without changing Scanner state or removing notifications`, async () => {
    const h = await prepared();
    const ux = scenario === 'Silence return reminder'
      ? {silenceUntil: h.now + 15000, reminderAt: h.now + 10000}
      : scenario === 'future reminder without mute' ? {reminderAt: h.now + 10000} : null;
    if (ux) h.disk.set(UX_PATH, JSON.stringify(ux));
    if (scenario !== 'future reminder without mute') h.disk.set(SCANNER_PATH, new Date(h.now).toISOString());
    const scannerBefore = h.disk.get(SCANNER_PATH), uxBefore = h.disk.get(UX_PATH);
    const reminder = {identifier: NOTICE_ID, date: h.now + 10000, body: 'Returning Scan menu'};
    h.pending.set(NOTICE_ID, reminder);
    h.pending.set('unrelated', {date: h.now + 60000});
    const result = await h.engine();
    assert.equal(result.nativePlaybackPlan.enabled, 1);
    assert.equal(h.attempts, 0);
    assert.equal(h.disk.get(SCANNER_PATH), scannerBefore);
    assert.equal(h.disk.get(UX_PATH), uxBefore);
    assert.deepEqual(h.pending.get(NOTICE_ID), reminder);
    assert.ok(h.pending.has('unrelated'));
    assert.equal(h.removals.length, 0);
  });
}

test('notification denial is a warning and preserves the committed native playback plan', async () => {
  const h = await prepared(undefined, {notificationDenied: true});
  const result = await h.engine();
  assert.equal(result.nativePlaybackPlan.enabled, 1);
  assert.equal(h.registry()[0].qrActive, true);
  assert.equal(h.attempts, 1);
  assert.match(result.errorRegistry, /notification denied/i);
  h.at(2);
  assert.equal((await h.engine()).nativePlaybackPlan.enabled, 1);
  assert.equal(h.attempts, 1, 'a failed startup attempt must not reintroduce notification work each restart');
});

test('a hung notification is bounded to 1200ms and cannot prevent native playback', async () => {
  const h = await prepared(undefined, {notificationHangs: true});
  h.timers.length = 0;
  const start = h.now;
  const result = await h.engine();
  assert.equal(result.nativePlaybackPlan.enabled, 1);
  assert.equal(h.registry()[0].qrActive, true);
  assert.equal(h.attempts, 1);
  assert.match(result.errorRegistry, /notif.*tim(?:ed? ?out|eout)|tim(?:ed? ?out|eout).*notif/i);
  assert.ok(h.timers.includes(1200), 'notification work must have a 1200ms deadline');
  assert.ok(h.now - start <= 1400, 'only the existing lock wait and bounded notification wait may delay output');
});

test('completion during notification scheduling removes the late prompt but preserves unrelated notifications', async () => {
  const h = await prepared(undefined, {onNotificationSchedule: h => {
    const rows = h.registry();
    for (const row of rows) row.qrActive = false;
    h.putRegistry(rows);
  }});
  h.pending.set('unrelated', {date: h.now + 10000});
  h.delivered.set('unrelated', {body: 'Keep this'});
  const result = await h.engine();
  assert.equal(h.attempts, 1);
  assert.equal(h.pending.has(NOTICE_ID), false);
  assert.equal(h.delivered.has(NOTICE_ID), false);
  assert.ok(h.pending.has('unrelated'));
  assert.ok(h.delivered.has('unrelated'));
  assert.doesNotMatch(result.errorRegistry, /alarm state unavailable/);
});

async function ringing(options) {
  const h = await prepared(undefined, options);
  await h.engine();
  h.delivered.set(NOTICE_ID, h.schedules[0]);
  h.pending.set('unrelated', {date: h.now + 10000});
  h.delivered.set('unrelated', {body: 'Keep this'});
  h.removals.length = 0;
  return h;
}

test('a successful direct Camera QR scan clears only the shared QR notification', async () => {
  const h = await ringing();
  const result = await h.scan('startup-test');
  assert.equal(result.identifiedAlarms, 1);
  assert.equal(result.vibrate, true);
  assert.ok(result.alarmsToDelete.length);
  assert.equal(h.registry().some(row => row.qrActive), false);
  assert.equal(h.pending.has(NOTICE_ID), false);
  assert.equal(h.delivered.has(NOTICE_ID), false);
  assert.ok(h.pending.has('unrelated'));
  assert.ok(h.delivered.has('unrelated'));
  assert.ok(h.removals.length > 0);
  assert.ok(h.removals.every(operation => operation.ids.length === 1 && operation.ids[0] === NOTICE_ID));
});

test('an unmatched direct QR scan retains the notification and active alarm', async () => {
  const h = await ringing();
  const result = await h.scan('wrong-code');
  assert.equal(result.identifiedAlarms, 0);
  assert.equal(h.registry()[0].qrActive, true);
  assert.ok(h.pending.has(NOTICE_ID));
  assert.ok(h.delivered.has(NOTICE_ID));
  assert.equal(h.removals.length, 0);
});

test('a failed scan commit retains the notification and successful-scan actions are suppressed', async () => {
  const h = await ringing();
  h.options.failRegistryWrite = true;
  const result = await h.scan('startup-test');
  assert.equal(result.identifiedAlarms, 0);
  assert.equal(result.vibrate, false);
  assert.deepEqual(result.alarmsToDelete, []);
  assert.equal(h.registry()[0].qrActive, true);
  assert.ok(h.pending.has(NOTICE_ID));
  assert.ok(h.delivered.has(NOTICE_ID));
  assert.equal(h.removals.length, 0);
});

test('scanning one code preserves the notification while another QR alarm remains active', async () => {
  const h = await ringing();
  const rows = h.registry();
  h.putRegistry([...rows, {...rows[0], alarmName: 'Other active QR', qrCodeID: 'other-code',
    nativePlaybackID: 'other-activation', calcFireTime: rows[0].calcFireTime + 60}]);
  const result = await h.scan('startup-test');
  assert.equal(result.identifiedAlarms, 1);
  assert.equal(h.registry().filter(row => row.qrActive).length, 1);
  assert.ok(h.pending.has(NOTICE_ID));
  assert.ok(h.delivered.has(NOTICE_ID));
  assert.equal(h.removals.length, 0);
});

for (const failure of ['notificationCleanupDenied', 'notificationCleanupHangs']) {
  test(`${failure} cannot turn a committed direct QR scan into a failure`, async () => {
    const h = await ringing({[failure]: true});
    h.timers.length = 0;
    const start = h.now;
    const result = await h.scan('startup-test');
    assert.equal(result.identifiedAlarms, 1);
    assert.equal(result.vibrate, true);
    assert.ok(result.alarmsToDelete.length);
    assert.equal(h.registry().some(row => row.qrActive), false);
    assert.match(result.errorRegistry, /notif/i);
    assert.doesNotMatch(result.errorRegistry, /CA_qrScanner_core failed/);
    assert.ok(h.pending.has('unrelated'));
    assert.ok(h.delivered.has('unrelated'));
    if (failure === 'notificationCleanupHangs') {
      assert.ok(h.timers.includes(1200));
      assert.equal(h.now - start, 1700,
        'the existing 500ms Scanner lock verification plus the 1200ms notification budget must bound output');
    }
  });
}
