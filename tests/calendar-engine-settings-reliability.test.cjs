const test = require('node:test');
const assert = require('node:assert/strict');
const {Harness, root, registryPath} = require('./helpers/calendar-engine-harness.cjs');
const settingsPath = root + 'settings.json';
const task = {alarmName: 'Night QR', qrCodeID: 'test', taskIDs: ['night'],
  taskLoopMin: 10, maxReschedules: 3};

function assertPreserved(h, before, plan) {
  assert.deepEqual([...h.disk], before);
  assert.deepEqual(plan.alarmsToDelete, []);
  assert.deepEqual(plan.alarmsToAdd, []);
  assert.deepEqual(plan.triggerShortcutsToRunDetailed, []);
  assert.equal(plan.nextLoopStart, '');
  assert.equal(plan.qrLoop, false);
  assert.match(plan.errorRegistry, /existing Clock alarms were preserved/);
}

for (const phase of ['initial fire', 'QR restart']) {
  test(`an undownloaded settings file preserves state and Clock alarms at ${phase}`, async () => {
    const h = new Harness([task]); await h.install();
    if (phase === 'QR restart') { await h.engine(); h.at(2); }
    h.disk.set(settingsPath, JSON.stringify({disabledCalendars: ['Excluded']}));
    let downloads = 0;
    h.fm.isFileStoredIniCloud = p => p === settingsPath;
    h.fm.isFileDownloaded = p => p !== settingsPath;
    h.fm.downloadFileFromiCloud = async () => { downloads++; throw Error('download must not start'); };
    const before = [...h.disk], clockSlots = h.times();
    const plan = await h.engine();
    assertPreserved(h, before, plan);
    assert.equal(downloads, 0);
    assert.deepEqual(h.times(), clockSlots);
    assert.match(plan.errorRegistry, /settings\.json.*not downloaded|not downloaded.*settings\.json/);
  });
}

for (const [label, raw] of [['malformed JSON', '{broken'], ['array root', '[]'],
  ['null root', 'null'], ['non-list exclusions', '{"disabledCalendars":"Excluded"}']]) {
  test(`${label} settings preserve state before any native alarm work`, async () => {
    const h = new Harness([task]); await h.install();
    h.disk.set(settingsPath, raw);
    const before = [...h.disk], clockSlots = h.times();
    const plan = await h.engine();
    assertPreserved(h, before, plan);
    assert.deepEqual(h.times(), clockSlots);
    assert.match(plan.errorRegistry, /settings\.json/);
  });
}

test('a settings read failure occurs before creating setup files or querying calendars', async () => {
  const h = new Harness([task], {calendarFails: true});
  h.disk.set(settingsPath, '{}');
  h.options.onRead = p => {if (p === settingsPath) throw Error('settings unavailable');};
  const before = [...h.disk];
  const plan = await h.engine();
  assertPreserved(h, before, plan);
  assert.equal(h.disk.has(registryPath), false);
  assert.match(plan.errorRegistry, /settings unavailable/);
});

for (const settings of [undefined, {}, {disabledCalendars: []}]) {
  test(`${settings === undefined ? 'missing settings' : JSON.stringify(settings)} retains default calendar scheduling`, async () => {
    const h = new Harness([task]);
    if (settings !== undefined) h.disk.set(settingsPath, JSON.stringify(settings));
    await h.install();
    const plan = await h.engine();
    assert.equal(plan.qrLoop, true);
    assert.equal(plan.errorRegistry, '');
    assert.equal(h.disk.has(settingsPath), settings !== undefined);
  });
}

test('completion cleanup does not depend on settings availability', async () => {
  const h = new Harness([task]); await h.install(); await h.engine();
  h.disk.set(settingsPath, '{}');
  h.options.onRead = p => {if (p === settingsPath) assert.fail('Completion must not read settings');};
  h.fm.isFileStoredIniCloud = p => p === settingsPath;
  h.fm.isFileDownloaded = p => p !== settingsPath;
  h.fm.downloadFileFromiCloud = async () => assert.fail('Completion must not download settings');
  const occurrence = h.registry()[0];
  const plan = await h.engine(JSON.stringify({ok: true,
    alarmOccurrence: {alarmName: occurrence.alarmName, calcFireTime: occurrence.calcFireTime},
    metricsByID: [{metricID: 'night', complete: true}]}));
  assert.equal(plan.errorRegistry, '');
  assert.equal(h.registry()[0].taskSatisfied, true);
  assert.deepEqual(h.times(), []);
});

test('valid local settings preserve intentional task reset, trigger order and both volume levels', async () => {
  const actions = [{action: 'timer', operation: 'cancel', minutes: 15},
    {action: 'audio', operation: 'volume', percent: 50},
    {action: 'openhabits_reminder', metricIDs: ['phone_on_power_by'], mode: 'both'}];
  const h = new Harness([{...task, checkTasksFirstTime: true, qrVol: 25,
    shortcutsOnTrigger: actions.map(a => ({name: 'Calendar Alarms Actions', input: [JSON.stringify(a)]}))}]);
  h.disk.set(settingsPath, '{}');
  await h.install();
  const plan = await h.engine();
  const payloads = plan.triggerShortcutsToRunDetailed.map(a => JSON.parse(a.input[0]));
  assert.equal(payloads[0].action, 'task_alarm_reset');
  assert.deepEqual(payloads.slice(1), actions);
  assert.equal(h.registry()[0].qrVol, 25);
  assert.equal(plan.qrLoop, true);
});
