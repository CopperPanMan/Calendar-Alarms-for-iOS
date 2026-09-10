const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ACTIONS_SHORTCUT_NAME,
  defaultAlarm,
  newActionShortcut,
  normalizeAlarm,
  cleanAlarm,
  moveItem,
  duplicateAlarm,
  extractAlarmArray,
  formatCalendarNotes,
} = require('../docs/alarm-config.js');

test('Calendar Notes output links to the editor above and below the JSON', () => {
  const url = 'https://example.com/editor';
  const alarms = [{ alarmName: 'Wake up', input: ['value with [brackets]'] }];
  const output = formatCalendarNotes(alarms, url);

  assert.equal(output, `${url}\n\n${JSON.stringify(alarms, null, 2)}\n\n${url}`);
  assert.deepEqual(extractAlarmArray(output), alarms);
});

test('alarm arrays can be extracted from likely full Notes content', () => {
  const alarms = [{ alarmName: 'Leave', shortcutsOnTrigger: [{ input: ['[nested]'] }] }];
  const notes = `Meeting details [not JSON]\n${JSON.stringify(alarms)}\nhttps://example.com/editor`;

  assert.deepEqual(extractAlarmArray(notes), alarms);
  assert.deepEqual(extractAlarmArray('[]'), []);
  assert.equal(extractAlarmArray('notes without alarms'), null);
});

test('duplicating an alarm creates an independently editable copy', () => {
  const original = normalizeAlarm({ alarmName: 'Wake up', locations: [{ lat: 1, lon: 2, radius: 3, name: 'Home' }] });
  const duplicate = duplicateAlarm(original);

  assert.equal(duplicate.alarmName, 'Wake up Copy');
  assert.deepEqual(duplicate.locations, original.locations);
  duplicate.locations[0].name = 'Elsewhere';
  assert.equal(original.locations[0].name, 'Home');
});

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

test('built-in actions serialize as one JSON string for Calendar Alarms Actions', () => {
  const alarm = renderReady(defaultAlarm());
  const shortcut = newActionShortcut('display');
  shortcut.action = { action: 'display', operation: 'brightness', percent: 30 };
  alarm.shortcutsOnTrigger.push(shortcut);

  const [exported] = cleanAlarm(alarm).shortcutsOnTrigger;
  assert.equal(exported.name, ACTIONS_SHORTCUT_NAME);
  assert.equal(exported.input.length, 1);
  assert.deepEqual(JSON.parse(exported.input[0]), {
    action: 'display',
    operation: 'brightness',
    percent: 30,
  });
});

test('new notifications default to show mode without a duplicate title', () => {
  const shortcut = newActionShortcut('notification');
  assert.deepEqual(shortcut.action, { action: 'notification', message: '', mode: 'show' });
  assert.equal('title' in shortcut.action, false);
});

test('valid Calendar Alarms Actions payloads load into the typed editor model', () => {
  const alarm = normalizeAlarm({
    shortcutsOnTrigger: [{
      name: ACTIONS_SHORTCUT_NAME,
      input: [JSON.stringify({ action: 'notification', message: 'Leave now', mode: 'both' })],
    }],
  });

  assert.equal(alarm.shortcutsOnTrigger[0].editorType, 'notification');
  assert.deepEqual(alarm.shortcutsOnTrigger[0].action, {
    action: 'notification',
    message: 'Leave now',
    mode: 'both',
  });
});

test('malformed and internal Calendar Alarms Actions payloads remain raw custom shortcuts', () => {
  const alarm = normalizeAlarm({
    shortcutsOnTrigger: [
      { name: ACTIONS_SHORTCUT_NAME, input: ['not json'] },
      { name: ACTIONS_SHORTCUT_NAME, input: [JSON.stringify({ action: 'task_alarm_reset' })] },
    ],
  });

  assert.deepEqual(alarm.shortcutsOnTrigger.map((item) => item.editorType), ['custom', 'custom']);
});
