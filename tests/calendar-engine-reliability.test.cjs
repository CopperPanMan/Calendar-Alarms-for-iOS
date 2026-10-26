const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {Harness, root, registryPath, cachePath} = require('./helpers/calendar-engine-harness.cjs');
const task = (offsetMin = 0) => ({alarmName: 'Night QR', qrCodeID: 'test', taskIDs: ['night'],
  taskLoopMin: 10, maxReschedules: 3, offsetMin});
const report = (extra = {}) => JSON.stringify({ok: true, metricsByID: [{metricID: 'night', complete: true}], ...extra});

test('completion cancels current-day future alarms but preserves tomorrow and its later playback', async () => {
  const h = new Harness([task(), task(60), task(1430)]); await h.install();
  const start = new Date(h.now); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  await h.engine(report({completionScope: {evaluatedAtISO: new Date(h.now).toISOString(),
    windowStartISO: start.toISOString(), windowEndISO: end.toISOString()}}));
  assert.deepEqual(h.registry().map(e => e.taskSatisfied), [true, true, false]);
  assert.equal(h.clock.length, 1);
  h.at(1430); assert.equal((await h.engine()).qrLoop, true);
});

test('legacy completion at 2am uses the cached effective day and preserves the next nighttime occurrence', async () => {
  const h = new Harness([task(), task(1200)]);
  h.now = h.start = Date.parse('2026-10-06T02:00:00-04:00'); h.setCompletion({night: false});
  await h.install();
  h.setCompletion({night: true});
  const c = JSON.parse(h.disk.get(cachePath));
  c.virtualDay = {enabled: true, windowStartISO: '2026-10-05T09:00:00Z', windowEndISO: '2026-10-06T09:00:00Z'};
  c.timezone = 'America/New_York'; h.disk.set(cachePath, JSON.stringify(c));
  await h.engine(report());
  assert.deepEqual(h.registry().map(e => e.taskSatisfied), [true, false]);
});

for (const timezone of ['America/New_York', '-04:00']) test(`completion uses the ${timezone} day across UTC midnight`, async () => {
  const h = new Harness([task(), task(60)]);
  h.now = h.start = Date.parse('2026-10-05T23:30:00-04:00'); h.setCompletion({night: false});
  await h.install();
  await h.engine(report({completionScope: {evaluatedAtISO: new Date(h.now).toISOString(), timezone}}));
  assert.deepEqual(h.registry().map(e => e.taskSatisfied), [true, false]);
});

test('an exact task reset only satisfies its own occurrence and is included in the trigger payload', async () => {
  const h = new Harness([task(), task(60)]); await h.install();
  const plan = await h.engine();
  const payload = JSON.parse(plan.triggerShortcutsToRunDetailed.find(a => a.taskReset === 1).input[0]);
  assert.deepEqual(payload.alarmOccurrence, {alarmName: 'Night QR', calcFireTime: h.start / 1000});
  await h.engine(report({alarmOccurrence: payload.alarmOccurrence}));
  assert.deepEqual(h.registry().map(e => e.taskSatisfied), [true, false]);
});

test('legacy completion without a usable day cache cannot cancel a future occurrence', async () => {
  const h = new Harness([task(), task(60)]); await h.install(); h.disk.delete(cachePath);
  await h.engine(report());
  assert.deepEqual(h.registry().map(e => e.taskSatisfied), [true, false]);
});

test('a stale unscoped report cannot borrow a fresh cache day when that cache says incomplete', async () => {
  const h = new Harness([task(), task(60)]); await h.install(); h.setCompletion({night: false});
  await h.engine(report());
  assert.deepEqual(h.registry().map(e => e.taskSatisfied), [true, false]);
});

test('a scoped completion window excludes its exact end', async () => {
  const h = new Harness([task(), task(60)]); await h.install();
  await h.engine(report({completionScope: {windowStartISO: new Date(h.start).toISOString(),
    windowEndISO: new Date(h.start + 3600000).toISOString()}}));
  assert.deepEqual(h.registry().map(e => e.taskSatisfied), [true, false]);
});

test('invalid and stale completion scopes do not fall back to broader completion', async () => {
  const h = new Harness([task()]); await h.install(); const before = h.disk.get(registryPath);
  for (const extra of [{alarmOccurrence: {}}, {completionScope: {timezone: 'Invalid/Zone'}},
    {completionScope: {evaluatedAtISO: new Date(h.start - 3600000).toISOString()}},
    {completionScope: {windowStartISO: 'bad', windowEndISO: 'bad'}}]) {
    const p = await h.engine(report(extra));
    assert.equal(h.disk.get(registryPath), before); assert.equal(p.alarmsToDelete.length, 0);
    assert.match(p.errorRegistry, /invalid|outdated/);
  }
});

for (const mode of ['read error', 'placeholder', 'corrupt']) test(`unavailable registry (${mode}) preserves Clock and disk state`, async () => {
  const h = new Harness([task()]); await h.install();
  if (mode === 'corrupt') h.disk.set(registryPath, '{broken');
  const before = h.disk.get(registryPath), clocks = JSON.stringify(h.clock);
  if (mode === 'read error') h.options.onRead = p => {if (p === registryPath) throw Error('iCloud unavailable');};
  if (mode === 'placeholder') {
    h.fm.isFileStoredIniCloud = p => p === registryPath; h.fm.isFileDownloaded = () => false;
    h.fm.downloadFileFromiCloud = () => assert.fail('Critical state must not wait for a download');
  }
  const p = await h.engine('', false);
  assert.equal(h.disk.get(registryPath), before);
  assert.equal(h.clock.length, JSON.parse(clocks).length);
  assert.deepEqual(p.alarmsToDelete, []); assert.deepEqual(p.alarmsToAdd, []);
  assert.equal(p.qrLoop, false); assert.match(p.errorRegistry, /preserved/);
});

test('a failed registry reread after locking does not overwrite it and releases only its own lock', async () => {
  const h = new Harness([task()]); await h.install(); const before = h.disk.get(registryPath);
  let reads = 0;
  h.options.onRead = p => {if (p === registryPath && ++reads === 2) throw Error('read failed while locked');};
  const p = await h.engine();
  assert.equal(h.disk.get(registryPath), before); assert.equal(h.disk.get(root + 'registryLock.txt'), '');
  assert.deepEqual(p.alarmsToDelete, []); assert.equal(p.qrLoop, false);
});

for (const mode of ['corrupt', 'unavailable']) test(`${mode} lock state cannot authorize a registry write`, async () => {
  const h = new Harness([task()]); await h.install(); const before = h.disk.get(registryPath);
  const lock = root + 'registryLock.txt';
  if (mode === 'corrupt') h.disk.set(lock, '{broken');
  else h.options.onRead = p => {if (p === lock) throw Error('lock unavailable');};
  const p = await h.engine();
  assert.equal(h.disk.get(registryPath), before); assert.deepEqual(p.alarmsToDelete, []);
  assert.equal(p.qrLoop, false); assert.match(p.errorRegistry, /preserved/);
});

test('GPS gets milliseconds and a successful 50ms response wins against the bounded timeout', async () => {
  const source = fs.readFileSync(require.resolve('../Calendar Alarm Engine.js'), 'utf8');
  const section = (from, to) => source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from)));
  const timers = [], start = Date.now();
  const c = {Date, LOCATION_TIMEOUT_MS: 2500, LOCATION_TOTAL_BUDGET_MS: 2500,
    LOCATION_MAX_ATTEMPTS: 2, ENGINE_STARTED_AT_MS: start, LOCATION_STARTUP_DEADLINE_MS: 3500,
    readLocationCache: () => null, writeLocationCache() {}, setLocationDebug() {},
    Location: {setAccuracyToHundredMeters() {}, current: () => new Promise(resolve =>
      setTimeout(() => resolve({latitude: 0, longitude: 0}), 50))},
    Timer: {schedule(ms, repeat, fn) {timers.push(ms); const id = setTimeout(fn, ms);
      return {invalidate() {clearTimeout(id);}};}}};
  vm.createContext(c);
  vm.runInContext(section('async function withTimeout(', 'function nowEpoch(') +
    section('async function getCurrentLocation()', 'function updateQRBackupAlarm('), c);
  assert.equal((await c.getCurrentLocation()).lat, 0);
  assert.ok(timers[0] >= 2000 && timers[0] <= 2500);
  await c.sleep(20); assert.equal(timers.at(-1), 20);
});

test('cold GPS consumes one total 2500ms budget, and lock contention consumes at most 1500ms', async () => {
  const timers = [], h = new Harness([{...task(), locationMode: 'whitelist', locations: [[0, 0, 50]]}],
    {onTimer: ms => timers.push(ms)});
  const original = h.context.bind(h);
  h.context = (...args) => ({...original(...args), Keychain: {contains: () => false},
    Location: {setAccuracyToHundredMeters() {}, current: () => new Promise(() => {})}});
  await h.install(); const before = h.now; await h.engine();
  assert.ok(h.now - before <= 2600); assert.equal(timers.filter(ms => ms === 2500).length, 1);
  const busy = new Harness([task()]); await busy.install();
  busy.disk.set(root + 'registryLock.txt', JSON.stringify({id: 'another', timestamp: Math.floor(busy.now / 1000)}));
  const start = busy.now; const p = await busy.engine();
  assert.ok(busy.now - start <= 1500); assert.match(p.errorRegistry, /lock timeout/);
});

test('reliable QR handoff preserves current ring and verifies both separate recovery times', async () => {
  const h = new Harness([task()], {reliableQRHandoff: true}); await h.install();
  const p = await h.engine('', false);
  assert.equal(p.qrHandoffVersion, 1);
  assert.deepEqual(p.alarmsToDeleteBeforePlayback, [{name: 'Night QR', hh: '12', mm: '00'}]);
  assert.equal(p.alarmsToDelete.some(a => a.hh === '12' && a.mm === '00'), false);
  assert.deepEqual(p.qrFallbackAlarmsToVerify.map(a => a.hh + ':' + a.mm), ['12:02', '12:04']);
  const reset = JSON.parse(p.triggerShortcutsToRunDetailed.find(a => a.taskReset === 1).input[0]);
  assert.ok(reset.alarmOccurrence);
  assert.equal(h.registry()[0].triggerActionsUntil - Math.floor(h.now / 1000), 60);
});

test('a retry before the next tick preserves the original ring after an abandoned handoff', async () => {
  const h = new Harness([task()], {reliableQRHandoff: true}); await h.install();
  const first = await h.engine('', false);
  h.apply({alarmsToAdd: first.alarmsToAdd}); // Native stopped before deleting the original.
  h.at(0, 30);
  const retry = await h.engine('', false);
  assert.ok(retry.alarmsToDeleteBeforePlayback.some(a => a.hh === '12' && a.mm === '00'));
  assert.equal(retry.alarmsToDelete.some(a => a.hh === '12' && a.mm === '00'), false);
});

test('same-slot recovery recreation runs before adding and never deletes its replacement afterwards', async () => {
  const h = new Harness([task()], {reliableQRHandoff: true}); await h.install();
  h.clock.push({name: 'Night QR', hh: '12', mm: '02', isEnabled: false, fireTime: h.start + 120000});
  const p = await h.engine('', false);
  assert.ok(p.alarmsToDeleteBeforeAdd.some(a => a.hh === '12' && a.mm === '02'));
  assert.equal(p.alarmsToDelete.some(a => a.hh === '12' && a.mm === '02'), false);
  h.apply({alarmsToDelete: p.alarmsToDeleteBeforeAdd}); h.apply({alarmsToAdd: p.alarmsToAdd});
  h.apply({alarmsToDelete: p.alarmsToDelete});
  assert.ok(h.clock.some(a => a.hh === '12' && a.mm === '02' && a.isEnabled));
  assert.ok(h.clock.some(a => a.hh === '12' && a.mm === '00'));
});
