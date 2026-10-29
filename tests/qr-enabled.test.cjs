const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../docs/alarm-config.js');
const {Harness} = require('./helpers/calendar-engine-harness.cjs');

test('QR input pattern compiles with HTML Unicode sets and rejects invalid IDs', () => {
  const html = require('node:fs').readFileSync(require.resolve('../docs/index.html'), 'utf8');
  const pattern = html.match(/<input data-field="qrCodeID"[^>]*pattern="([^"]+)"/)[1];
  const expression = new RegExp(pattern, 'v');
  for (const value of ['bath', 'A-Z_0.9~']) assert.equal(expression.test(value), true);
  for (const value of ['', 'bad id', 'bad%id', 'bad[id]', 'bath\n']) assert.equal(expression.test(value), false);
});

const qr = extra => ({alarmName: 'QR', qrCodeID: 'bath', qrSoundPath: 'Alarm Tones/ocean.mp3',
  qrVol: 30, qrShortcutsOnScan: [{name: 'After scan', input: [0, 'bath']}], ...extra});

test('editor defaults QR off and infers legacy QR enablement without rebuilding alarms', () => {
  assert.equal(config.normalizeAlarm(config.defaultAlarm()).qrEnabled, false);
  for (const [raw, expected] of [[{}, false], [{qrCodeID: ' '}, false], [qr(), true],
    [qr({qrEnabled: false}), false], [{qrEnabled: true}, true]]) {
    const alarm = config.normalizeAlarm(raw);
    assert.equal(alarm.qrEnabled, expected);
    assert.equal(config.cleanAlarm(alarm).qrEnabled, expected);
  }
});

test('off/export/import/on preserves the QR ID, custom sound, volume and typed scan actions', () => {
  const input = qr({qrSoundPath: 'Alarm Tones/Nature/rain.mp3'});
  const alarm = config.normalizeAlarm(input);
  const enabled = config.cleanAlarm(alarm);
  alarm.qrEnabled = false;
  const notes = config.formatCalendarNotes([config.cleanAlarm(alarm)], 'https://example.com/editor');
  const restored = config.normalizeAlarm(config.extractAlarmArray(notes)[0]);
  assert.equal(restored.qrEnabled, false);
  for (const field of ['qrCodeID', 'qrSoundPath', 'qrVol', 'qrShortcutsOnScan'])
    assert.deepEqual(config.cleanAlarm(restored)[field], enabled[field]);
  assert.equal(restored.qrSoundChoice, 'custom');
  const duplicate = config.duplicateAlarm(restored);
  assert.equal(duplicate.qrEnabled, false);
  assert.deepEqual(duplicate.qrShortcutsOnScan, restored.qrShortcutsOnScan);
  restored.qrEnabled = true;
  assert.deepEqual(config.cleanAlarm(restored), enabled);
});

for (const extra of [{}, {qrEnabled: true}]) {
  test(`Engine keeps ${extra.qrEnabled ? 'explicitly enabled' : 'legacy'} QR playback and scanning`, async () => {
    const h = new Harness([qr(extra)], {nativePlaybackV2: true});
    await h.install();
    const plan = await h.engine();
    assert.equal(plan.qrLoop, true);
    assert.equal(plan.nativePlaybackPlan.enabled, 1);
    assert.deepEqual(h.times(), ['12:02', '12:04']);
    const scan = await h.scan('bath');
    assert.equal(scan.identifiedAlarms, 1);
    assert.deepEqual(scan.shortcutsToRunDetailed, [{name: 'After scan', input: ['0', 'bath']}]);
    assert.deepEqual(h.times(), []);
  });
}

test('disabled QR retains its definition but fires as an ordinary alarm with trigger actions', async () => {
  const definition = qr({qrEnabled: false, shortcutsOnTrigger: [{name: 'On trigger', input: []}]});
  const before = JSON.stringify(definition);
  const h = new Harness([definition], {nativePlaybackV2: true});
  await h.install();
  const plan = await h.engine();
  assert.equal(plan.qrLoop, false);
  assert.equal(plan.nativePlaybackPlan.enabled, 0);
  assert.deepEqual(plan.triggerShortcutsToRunDetailed.map(a => a.name), ['On trigger']);
  assert.deepEqual(h.times(), ['12:00']);
  assert.equal(h.registry()[0].qrCodeID, '');
  assert.equal(h.registry()[0].qrActive, false);
  const scan = await h.scan('bath');
  assert.equal(scan.identifiedAlarms, 0);
  assert.deepEqual(scan.shortcutsToRunDetailed, []);
  assert.deepEqual(h.times(), ['12:00']);
  assert.equal(JSON.stringify(definition), before);
});

for (const task of [false, true]) {
  test(`calendar sync disables active QR and removes retries${task ? ' while preserving its task follow-up' : ''}`, async () => {
    const definition = qr({qrEnabled: true, ...(task ? {taskLoopEnabled: true, taskIDs: ['floss'],
      taskLoopMin: 21, maxReschedules: 2} : {})});
    const h = new Harness([definition], {nativePlaybackV2: true});
    await h.install();
    await h.engine();
    assert.equal(h.registry()[0].qrActive, true);
    h.at(1);
    definition.qrEnabled = false;
    const plan = await h.engine();
    assert.equal(plan.qrLoop, false);
    assert.equal(plan.nativePlaybackPlan.enabled, 0);
    assert.equal(h.registry()[0].qrActive, false);
    assert.equal(h.registry()[0].qrPending, false);
    assert.deepEqual(h.times(), task ? ['12:21'] : []);
    const scan = await h.scan('bath');
    assert.equal(scan.identifiedAlarms, 0);
    assert.deepEqual(scan.shortcutsToRunDetailed, []);
    if (task) {
      h.at(21);
      const followup = await h.engine();
      assert.equal(followup.qrLoop, false);
      assert.deepEqual(h.times(), ['12:21', '12:42']);
    }
  });
}

test('off/on before a future alarm restores saved QR behavior at its scheduled time', async () => {
  const definition = qr({offsetMin: 60, qrEnabled: false});
  const h = new Harness([definition], {nativePlaybackV2: true});
  await h.install();
  assert.equal(h.registry()[0].qrCodeID, '');
  definition.qrEnabled = true;
  h.at(1);
  await h.engine();
  assert.equal(h.registry()[0].qrCodeID, 'bath');
  assert.equal(h.registry()[0].qrActive, false);
  h.at(60);
  const plan = await h.engine();
  assert.equal(plan.nativePlaybackPlan.enabled, 1);
  assert.equal(plan.nativePlaybackPlan.volume, 0.3);
  assert.deepEqual(h.times(), ['13:02', '13:04']);
});

test('disabling one occurrence leaves another future occurrence with the same name intact', async () => {
  const current = qr({qrEnabled: true});
  const h = new Harness([current, qr({offsetMin: 60, qrEnabled: true})]);
  await h.install();
  await h.engine();
  h.at(1); current.qrEnabled = false;
  await h.engine();
  assert.deepEqual(h.times(), ['13:00']);
  assert.equal(h.registry().find(row => row.calcFireTime === h.start / 1000 + 3600).qrCodeID, 'bath');
});

test('explicit QR enablement requires an ID while disabled saved IDs are not validated as active', async () => {
  for (const qrCodeID of ['', '  ']) {
    const h = new Harness([qr({qrEnabled: true, qrCodeID})]);
    const plan = await h.engine();
    assert.match(plan.errorRegistry, /qrCodeID is required/);
    assert.deepEqual(h.times(), []);
  }
  const h = new Harness([qr({qrEnabled: false, qrCodeID: 'unfinished saved ID'})]);
  const plan = await h.engine();
  assert.equal(plan.errorRegistry, '');
  assert.deepEqual(h.times(), ['12:00']);
});
