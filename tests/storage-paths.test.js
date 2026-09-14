const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing function ${name}`);

  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unterminated function ${name}`);
}

const joinPath = (parent, child) => `${parent}/${child}`;

test('engine derives Calendar Alarms and tracker folders from the Shortcuts root', () => {
  const source = fs.readFileSync(require.resolve('../Calendar Alarm Engine.js'), 'utf8');
  const context = {
    OPENHABITS_DIRNAME: 'OpenHabits',
    CALENDAR_ALARMS_DIRNAME: 'Calendar Alarms',
    OPENHABITS_TRACKER_DIRNAME: 'OpenHabits Tracker',
  };
  vm.createContext(context);
  vm.runInContext(functionSource(source, 'resolveOpenHabitsDirs'), context);

  const dirs = context.resolveOpenHabitsDirs({ joinPath }, '/iCloud Drive/Shortcuts');
  assert.equal(dirs.calendarAlarms, '/iCloud Drive/Shortcuts/OpenHabits/Calendar Alarms');
  assert.equal(dirs.tracker, '/iCloud Drive/Shortcuts/OpenHabits/OpenHabits Tracker');
});

test('QR scanner derives its data folder from the Shortcuts root', () => {
  const source = fs.readFileSync(require.resolve('../Calendar Alarm QR Scanner.js'), 'utf8');
  const context = {
    OPENHABITS_DIRNAME: 'OpenHabits',
    CALENDAR_ALARMS_DIRNAME: 'Calendar Alarms',
  };
  vm.createContext(context);
  vm.runInContext(functionSource(source, 'resolveCalendarAlarmsDir'), context);

  const dir = context.resolveCalendarAlarmsDir({ joinPath }, '/iCloud Drive/Shortcuts');
  assert.equal(dir, '/iCloud Drive/Shortcuts/OpenHabits/Calendar Alarms');
});
