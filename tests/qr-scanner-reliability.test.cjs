const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'Calendar Alarm QR Scanner.js'), 'utf8');
const root = '/Shortcuts/OpenHabits/Calendar Alarms/';
const registry = root + 'registry.txt';
const lock = root + 'registryLock.txt';

function harness(options = {}) {
  let now = Date.parse('2026-10-26T12:00:00Z');
  const started = now;
  const initial = JSON.stringify([{alarmName: 'Synthetic QR', qrCodeID: 'code', qrActive: true,
    firstQRFireTime: now / 1000 - 60, nextFireTime: now / 1000 + 120,
    qrShortcutsOnScan: [{name: 'Synthetic follow-up', input: ['a']}]}]);
  const disk = new Map([[registry, initial], [lock, ''],
    [root + 'menuOpenStatus.txt', 'false'],
    [root + 'menuLastOpened.txt', new Date(0).toISOString()]]);
  const writes = [], downloads = [], reads = new Map();
  if (options.missingRegistry) disk.delete(registry);
  if (options.lockContent !== undefined) disk.set(lock, options.lockContent);
  const h = {disk, writes, downloads, reads, initial, advance: ms => { now += ms; }};
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const fm = {
    bookmarkedPath: () => '/Shortcuts', joinPath: (a, b) => a + '/' + b,
    cacheDirectory: () => '/local', fileExists: p => disk.has(p),
    isFileStoredIniCloud: () => true,
    isFileDownloaded: p => !(options.unavailable || []).includes(p),
    downloadFileFromiCloud: async p => { downloads.push(p); throw Error('Downloads are forbidden in the scanner'); },
    readString(p) {
      reads.set(p, (reads.get(p) || 0) + 1);
      if (options.onRead) options.onRead(p, h);
      if (options.readFailure === p) throw Error('Synthetic filesystem read failure');
      return disk.get(p);
    },
    writeString(p, value) {
      writes.push({p, value}); disk.set(p, value);
      if (options.onWrite) options.onWrite(p, value, h);
    },
  };
  h.run = async (input = 'code') => {
    let output, completed = 0;
    await vm.runInNewContext('(async()=>{' + source + '})()', {
      Date: Clock, FileManager: {iCloud: () => {
        if (options.managerFailure) throw Error('Synthetic iCloud unavailable');
        return fm;
      }, local: () => fm},
      Timer: {schedule(ms, repeat, fn) { now += ms; queueMicrotask(fn); }},
      args: {shortcutParameter: input},
      Script: {setShortcutOutput: value => { output = value; }, complete: () => { completed++; }},
    });
    assert.equal(completed, 1);
    assert.equal(typeof output, 'string');
    h.elapsed = now - started;
    return JSON.parse(output);
  };
  return h;
}

function noScanEffects(result) {
  assert.equal(result.identifiedAlarms, 0);
  assert.equal(result.vibrate, false);
  assert.deepEqual(result.alarmsToDelete, []);
  assert.deepEqual(result.shortcutsToRunDetailed, []);
  assert.equal(result.shortcutToRun, '');
  assert.ok(result.errorRegistry);
}

test('registry read failure preserves every alarm and returns no cleanup or follow-ups', async () => {
  const h = harness({readFailure: registry});
  noScanEffects(await h.run());
  assert.equal(h.disk.get(registry), h.initial);
  assert.equal(h.disk.get(lock), '');
  assert.equal(h.writes.some(w => w.p === registry), false);
});

test('wrong QR code keeps its guidance and active alarm without requiring a registry write', async () => {
  const h = harness({onWrite(p) { if (p === registry) throw Error('Registry writes unavailable'); }});
  const result = await h.run('wrong-code');
  assert.equal(result.errorRegistry, '');
  assert.equal(result.notification, 'wrong code. Please scan Synthetic QR (ID = code)');
  assert.equal(result.identifiedAlarms, 0);
  assert.equal(result.vibrate, false);
  assert.deepEqual(result.alarmsToDelete, []);
  assert.deepEqual(result.shortcutsToRunDetailed, []);
  assert.equal(h.disk.get(registry), h.initial);
  assert.equal(h.writes.some(w => w.p === registry), false);
  assert.equal(h.disk.get(lock), '');
});

test('scan with no active matching QR preserves inactive and pending alarms without rewriting them', async () => {
  for (const pending of [false, true]) {
    const h = harness();
    const rows = JSON.parse(h.initial);
    Object.assign(rows[0], {qrActive: false, qrPending: pending, qrPendingSince: 123});
    const before = JSON.stringify(rows, null, 2);
    h.disk.set(registry, before);
    const result = await h.run();
    assert.equal(result.errorRegistry, '');
    assert.equal(result.notification, '');
    assert.equal(result.identifiedAlarms, 0);
    assert.equal(result.vibrate, false);
    assert.deepEqual(result.alarmsToDelete, []);
    assert.deepEqual(result.shortcutsToRunDetailed, []);
    assert.equal(h.disk.get(registry), before);
    assert.equal(h.writes.some(w => w.p === registry), false);
    assert.equal(h.disk.get(lock), '');
  }
});

test('unmatched scan still reports lost lock ownership and preserves the successor claim', async () => {
  const successor = '{"id":"successor","timestamp":1793016000}';
  const h = harness({onRead(p, state) {
    if (p === registry) state.disk.set(lock, successor);
  }});
  const result = await h.run('wrong-code');
  noScanEffects(result);
  assert.match(result.errorRegistry, /Alarm data changed/);
  assert.equal(h.disk.get(registry), h.initial);
  assert.equal(h.disk.get(lock), successor);
  assert.equal(h.writes.some(w => w.p === registry || (w.p === lock && !w.value)), false);
});

test('missing registry fails closed without initializing persistent state in scan or menu mode', async () => {
  for (const input of ['code', '']) {
    const h = harness({missingRegistry: true});
    const result = await h.run(input);
    if (input) noScanEffects(result);
    else { assert.equal(result.shouldShowMenu, false); assert.ok(result.errorRegistry); }
    assert.equal(h.disk.has(registry), false);
    assert.deepEqual(h.writes, []);
  }
});

test('undownloaded registry never starts iCloud work or changes alarm files', async () => {
  for (const input of ['code', '']) {
    const h = harness({unavailable: [registry]});
    const result = await h.run(input);
    assert.match(result.errorRegistry, /not downloaded/);
    assert.deepEqual(h.downloads, []);
    assert.deepEqual(h.writes, []);
    assert.equal(h.elapsed, 0);
    assert.equal(h.disk.get(registry), h.initial);
  }
});

test('unreadable or undownloaded lock is never treated as an empty claim', async () => {
  for (const options of [{readFailure: lock}, {unavailable: [lock]}]) {
    const h = harness({...options, lockContent: '{"id":"other","timestamp":1793016000}'});
    const old = h.disk.get(lock);
    noScanEffects(await h.run());
    assert.equal(h.disk.get(lock), old);
    assert.equal(h.disk.get(registry), h.initial);
    assert.deepEqual(h.writes, []);
    assert.deepEqual(h.downloads, []);
  }
});

test('malformed lock fails closed and a future timestamp stays busy', async () => {
  for (const lockContent of ['broken', '[]', '{}', '{"id":"other","timestamp":"bad"}',
    '{"id":"other","timestamp":null}',
    '{"id":"other","timestamp":1793016060}']) {
    const h = harness({lockContent});
    noScanEffects(await h.run());
    assert.equal(h.disk.get(lock), lockContent);
    assert.deepEqual(h.writes, []);
  }
});

test('failed verification read leaves an unreadable claim intact instead of blindly releasing it', async () => {
  const h = harness({onRead(p, state) {
    if (p === lock && state.reads.get(lock) >= 2) throw Error('Verification unavailable');
  }});
  noScanEffects(await h.run());
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].p, lock);
  assert.equal(h.disk.get(registry), h.initial);
});

test('lost lock before commit aborts and never releases the successor claim', async () => {
  const successor = '{"id":"successor","timestamp":1793016000}';
  const h = harness({onRead(p, state) {
    if (p === registry) state.disk.set(lock, successor);
  }});
  noScanEffects(await h.run());
  assert.equal(h.disk.get(registry), h.initial);
  assert.equal(h.disk.get(lock), successor);
  assert.equal(h.writes.some(w => w.p === registry || (w.p === lock && !w.value)), false);
});

test('successor claim after committed scan is preserved during release', async () => {
  const successor = '{"id":"successor","timestamp":1793016000}';
  const h = harness({onWrite(p, value, state) {
    if (p === registry) state.disk.set(lock, successor);
  }});
  const result = await h.run();
  assert.equal(result.identifiedAlarms, 1);
  assert.equal(JSON.parse(h.disk.get(registry))[0].qrActive, false);
  assert.equal(h.disk.get(lock), successor);
  assert.equal(h.writes.some(w => w.p === lock && !w.value), false);
});

test('slow synchronous registry read aborts before commit and safely releases owned lock', async () => {
  const h = harness({onRead(p, state) { if (p === registry) state.advance(5000); }});
  const result = await h.run();
  noScanEffects(result);
  assert.match(result.errorRegistry, /took too long/);
  assert.equal(h.disk.get(registry), h.initial);
  assert.equal(h.disk.get(lock), '');
});

test('optional menu-state read failure does not claim a menu or change alarm state', async () => {
  const h = harness({readFailure: root + 'menuOpenStatus.txt'});
  const result = await h.run('');
  assert.equal(result.shouldShowMenu, false);
  assert.ok(result.errorRegistry);
  assert.deepEqual(h.writes, []);
  assert.equal(h.disk.get(registry), h.initial);
});

test('iCloud manager startup failure returns the existing structured scanner contract', async () => {
  const h = harness({managerFailure: true});
  noScanEffects(await h.run());
  assert.deepEqual(h.writes, []);
});
