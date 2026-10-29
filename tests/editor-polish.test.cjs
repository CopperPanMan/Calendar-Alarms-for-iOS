const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../docs/alarm-config.js');
const {fieldMessage, activeControl, collectIssues} = require('../docs/editor-validation.js');
const {Harness} = require('./helpers/calendar-engine-harness.cjs');

test('built-in paths import as dropdown choices while subfolder files remain custom', () => {
  for (const [file] of config.BUILT_IN_SOUNDS) {
    for (const path of [file, 'Alarm Tones/' + file, 'Shortcuts/OpenHabits/Calendar Alarms/Alarm Tones/' + file]) {
      const alarm = config.normalizeAlarm({qrSoundPath: path});
      assert.equal(alarm.qrSoundChoice, file);
      assert.equal(config.cleanAlarm(alarm).qrSoundPath, 'Alarm Tones/' + file);
    }
  }
  const path = 'Alarm Tones/Nature/ocean.mp3';
  const alarm = config.normalizeAlarm({qrSoundPath: path});
  assert.equal(alarm.qrSoundChoice, 'custom');
  assert.equal(alarm.customQrSoundPath, path);
  assert.equal(config.cleanAlarm(alarm).qrSoundPath, path);
});

test('custom filename survives built-in switches, duplication, and history serialization', () => {
  let alarm = config.normalizeAlarm({qrSoundPath: 'Nature/rain.mp3'});
  config.selectSound(alarm, 'ocean.mp3');
  config.selectSound(alarm, 'sonar.mp3');
  alarm = JSON.parse(JSON.stringify(config.duplicateAlarm(alarm)));
  config.selectSound(alarm, 'custom');
  assert.equal(alarm.qrSoundPath, 'Nature/rain.mp3');
  const output = config.cleanAlarm(alarm);
  assert.equal(output.qrSoundPath, 'Alarm Tones/Nature/rain.mp3');
  assert.equal('qrSoundChoice' in output, false);
  assert.equal('customQrSoundPath' in output, false);
});

test('blank sound stays unselected and selecting an empty Custom survives rerender state', () => {
  const alarm = config.normalizeAlarm({});
  assert.equal(alarm.qrSoundChoice, '');
  config.selectSound(alarm, 'custom');
  assert.equal(JSON.parse(JSON.stringify(alarm)).qrSoundChoice, 'custom');
  assert.equal(alarm.qrSoundPath, '');
});

test('sound length is discarded on import, duplication and export', () => {
  const alarm = config.normalizeAlarm({qrCodeID: 'bath', qrSoundPath: 'ocean.mp3', qrSoundLen: 999});
  assert.equal('qrSoundLen' in config.defaultAlarm(), false);
  assert.equal('qrSoundLen' in alarm, false);
  assert.equal('qrSoundLen' in config.cleanAlarm(config.duplicateAlarm(alarm)), false);
});

test('Engine ignores old sound length and removes it from existing registry entries', async () => {
  const h = new Harness([{alarmName: 'QR', offsetMin: 10, qrCodeID: 'bath', qrSoundPath: 'ocean.mp3', qrSoundLen: 999}]);
  await h.install();
  assert.ok(h.registry().length);
  assert.ok(h.registry().every(row => !('qrSoundLen' in row)));
  h.putRegistry(h.registry().map(row => ({...row, qrSoundLen: 2.13})));
  await h.engine();
  assert.ok(h.registry().every(row => !('qrSoundLen' in row)));
  assert.equal(h.registry()[0].qrSoundPath, 'ocean.mp3');
});

const field = extra => ({value: '', required: false, dataset: {}, validity: {valid: true}, ...extra});
test('export validation rejects empty required values and comma-only metric IDs', () => {
  assert.match(fieldMessage(field({value: '  ', required: true})), /Enter a value/);
  assert.match(fieldMessage(field({value: ', ,', dataset: {actionField: 'metricIDs'}})), /Metric ID/);
  assert.equal(fieldMessage(field({value: 'floss, work', dataset: {actionField: 'metricIDs'}})), '');
});

test('export validation accepts zero volume but rejects zero timers and invalid numeric input', () => {
  assert.equal(fieldMessage(field({value: '0', required: true, dataset: {actionField: 'speechVolume'}})), '');
  assert.match(fieldMessage(field({value: '0', dataset: {actionField: 'minutes'}})), /greater than zero/);
  for (const validity of [{badInput: true}, {rangeOverflow: true}, {rangeUnderflow: true}, {stepMismatch: true}])
    assert.notEqual(fieldMessage(field({value: '101', max: '100', min: '0', step: '1', validity})), '');
});

test('validation includes collapsed fields but excludes disabled features and inactive QR settings', () => {
  const card = {alarm: {qrEnabled: false, qrCodeID: 'saved', locationMode: 'off'}};
  const collapsed = {closest: selector => selector === '.alarm-card' ? card : null};
  assert.equal(activeControl(collapsed), true);
  assert.equal(activeControl({...collapsed, disabled: true}), false);
  assert.equal(activeControl({closest: selector => selector === '[hidden]' ? {} : null}), false);
  const qr = {dataset: {field: 'qrVol'}, closest: selector => selector === '.alarm-card' ? card : selector === '[data-section="qr"]' ? {} : null};
  assert.equal(activeControl(qr), false);
  qr.dataset.field = 'qrCodeID';
  assert.equal(activeControl(qr), false);
  qr.dataset.field = 'qrEnabled';
  assert.equal(activeControl(qr), true);
  card.alarm.qrEnabled = true; qr.dataset.field = 'qrVol';
  assert.equal(activeControl(qr), true);
});

test('empty enabled task loops receive an actionable error while disabled saved settings do not', () => {
  const button = {};
  const card = {alarm: {taskLoopEnabled: true, taskIDs: []}, querySelector: selector => selector.includes('data-add') ? button : null};
  const container = {querySelectorAll: selector => selector === '.alarm-card' ? [card] : []};
  assert.deepEqual(collectIssues(container), [{control: button, message: 'Add at least one Metric ID for task looping.'}]);
  card.alarm.taskLoopEnabled = false;
  assert.deepEqual(collectIssues(container), []);
});
