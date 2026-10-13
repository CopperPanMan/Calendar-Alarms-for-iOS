const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const config = require('../docs/alarm-config.js');

function editor(initial) {
  const source = fs.readFileSync(require.resolve('../docs/app.js'), 'utf8');
  const start = source.indexOf('function snapshotState()');
  const end = source.indexOf('function renderAfterMutation()', start);
  assert.ok(start >= 0 && end > start);
  const context = vm.createContext({normalizeAlarm: config.normalizeAlarm,
    undoBtn: {}, redoBtn: {}, render() {}});
  // Execute the actual editor history functions with rendering stubbed out.
  vm.runInContext(`
    let alarms = [], history = [], historyIndex = -1, isNavigatingHistory = false;
    function updateOutput() { pushHistorySnapshot(); }
    ${source.slice(start, end)}
    this.historyEditor = {
      get alarms() { return alarms; },
      set alarms(value) { alarms = value; },
      save: pushHistorySnapshot,
      restore: restoreHistoryAt,
    };
  `, context);
  context.historyEditor.alarms = initial;
  context.historyEditor.save();
  return context.historyEditor;
}

const plain = value => JSON.parse(JSON.stringify(value));
const output = e => plain(e.alarms.map(config.cleanAlarm));

test('undo and redo of a checkbox preserve imported reminders and custom text/number inputs', () => {
  const e = editor([config.normalizeAlarm({alarmName: 'Dinner',
    shortcutsOnTrigger: [{name: config.ACTIONS_SHORTCUT_NAME,
      input: [JSON.stringify({action: 'openhabits_reminder', metricIDs: ['dinner'], mode: 'both'})]}],
    qrShortcutsOnScan: [{name: 'Example', input: [0, 'dinner']}],
  })]);
  const before = output(e);
  e.alarms[0].silenceAlarm = true;
  e.save();
  const after = output(e);
  for (let repeat = 0; repeat < 3; repeat++) {
    e.restore(0);
    assert.deepEqual(output(e), before);
    assert.equal(e.alarms[0].shortcutsOnTrigger[0].editorType, 'openhabits_reminder');
    e.restore(1);
    assert.deepEqual(output(e), after);
  }
});

for (const action of config.PUBLIC_ACTIONS) {
  test(`undo and redo preserve a newly created ${action} action`, () => {
    const alarm = config.normalizeAlarm(config.defaultAlarm());
    alarm.shortcutsOnTrigger.push(config.newActionShortcut(action));
    const e = editor([alarm]);
    const before = output(e);
    e.alarms[0].maxReschedules = 5;
    e.save();
    const after = output(e);
    e.restore(0);
    assert.deepEqual(output(e), before);
    assert.equal(e.alarms[0].shortcutsOnTrigger[0].editorType, action);
    e.restore(1);
    assert.deepEqual(output(e), after);
  });
}

test('editing a restored reminder leaves saved history intact and discards the old redo branch', () => {
  const alarm = config.normalizeAlarm(config.defaultAlarm());
  const action = config.newActionShortcut('openhabits_reminder');
  action.action.metricIDs = ['dinner'];
  alarm.shortcutsOnTrigger.push(action);
  const e = editor([alarm]);
  e.alarms[0].alarmName = 'Changed';
  e.save();
  e.restore(0);
  e.alarms[0].shortcutsOnTrigger[0].action.metricIDs.push('exercise');
  e.save();
  const changed = output(e);
  e.restore(0);
  assert.deepEqual(plain(e.alarms[0].shortcutsOnTrigger[0].action.metricIDs), ['dinner']);
  e.restore(1);
  assert.deepEqual(output(e), changed);
  assert.equal(e.alarms[0].alarmName, 'New Alarm');
});
