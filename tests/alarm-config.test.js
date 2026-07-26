const test = require('node:test');
const assert = require('node:assert/strict');

const { defaultAlarm, normalizeAlarm, cleanAlarm, moveItem } = require('../docs/alarm-config.js');

function renderReady(raw) {
  const alarm = normalizeAlarm(raw);
  const fixed = typeof alarm.reschedMinutes === 'number';
  alarm.reschedType = fixed ? 'fixed' : 'range';
  alarm.reschedFixed = fixed ? alarm.reschedMinutes : 10;
  alarm.reschedMin = fixed ? 10 : alarm.reschedMinutes.min;
  alarm.reschedMax = fixed ? 45 : alarm.reschedMinutes.max;
  return alarm;
}

test('deleting the last shortcut removes its key from exported JSON', () => {
  const alarm = renderReady({
    alarmName: 'Wake up',
    shortcutsOnTrigger: [{ name: 'Lights', input: ['bedroom'] }],
    qrShortcutsOnScan: [{ name: 'Coffee', input: [] }],
  });

  alarm.shortcutsOnTrigger.splice(0, 1);
  alarm.qrShortcutsOnScan.splice(0, 1);

  const output = cleanAlarm(alarm);
  assert.equal('shortcutsOnTrigger' in output, false);
  assert.equal('qrShortcutsOnScan' in output, false);
});

test('normalization and export retain supported values without adding location labels', () => {
  const alarm = renderReady({
    alarmName: 'Round trip',
    qrSoundLen: 3.75,
    locations: [[0, -73.9, 25, 'Home']],
    shortcutsOnTrigger: [{ name: 'Count', input: [0, 'text'] }],
  });

  const output = cleanAlarm(alarm);
  assert.equal(output.qrSoundLen, 3.75);
  assert.deepEqual(output.locations, [[0, -73.9, 25]]);
  assert.deepEqual(output.shortcutsOnTrigger, [{ name: 'Count', input: [0, 'text'] }]);
});

test('malformed collection values normalize to editable empty lists', () => {
  const alarm = normalizeAlarm({
    alarmName: 'Safe',
    shortcutsOnTrigger: 'not-an-array',
    qrShortcutsOnScan: null,
    locations: {},
    conflictingCalendars: false,
    taskIDs: 'task',
  });

  assert.deepEqual(alarm.shortcutsOnTrigger, []);
  assert.deepEqual(alarm.qrShortcutsOnScan, []);
  assert.deepEqual(alarm.locations, []);
  assert.deepEqual(alarm.conflictingCalendars, []);
  assert.deepEqual(alarm.taskIDs, []);
});

test('moveItem rejects invalid indexes without corrupting a list', () => {
  const values = ['first', 'second', 'third'];
  assert.equal(moveItem(values, -1, 1), false);
  assert.equal(moveItem(values, 0, 99), false);
  assert.deepEqual(values, ['first', 'second', 'third']);
  assert.equal(moveItem(values, 0, 2), true);
  assert.deepEqual(values, ['second', 'third', 'first']);
});

test('new alarms can be normalized and exported', () => {
  const output = cleanAlarm(renderReady(defaultAlarm()));
  assert.equal(output.alarmName, 'New Alarm');
  assert.equal(output.status, 'ON');
  assert.deepEqual(output.reschedMinutes, { min: 10, max: 45 });
});
