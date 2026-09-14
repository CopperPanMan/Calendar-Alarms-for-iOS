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

test('engine loads disabled calendars from Calendar Alarms settings', () => {
  const source = fs.readFileSync(require.resolve('../Calendar Alarm Engine.js'), 'utf8');
  const context = {
    safeReadString: async () => JSON.stringify({
      disabledCalendars: ['Shared Calendar', 'Work'],
    }),
    safeJSONParse: (value) => {
      try {
        return { ok: true, val: JSON.parse(value) };
      } catch (error) {
        return { ok: false, err: String(error) };
      }
    },
    addError: () => assert.fail('valid settings should not produce a warning'),
  };
  vm.createContext(context);
  vm.runInContext(`async ${functionSource(source, 'loadDisabledCalendarNames')}`, context);

  return context.loadDisabledCalendarNames({}, '/iCloud Drive/Shortcuts/OpenHabits/Calendar Alarms/settings.json')
    .then((names) => assert.deepEqual(Array.from(names), ['Shared Calendar', 'Work']));
});

test('engine safely includes all calendars when disabledCalendars is not a list', async () => {
  const source = fs.readFileSync(require.resolve('../Calendar Alarm Engine.js'), 'utf8');
  const warnings = [];
  const context = {
    safeReadString: async () => JSON.stringify({ disabledCalendars: 'Work' }),
    safeJSONParse: (value) => ({ ok: true, val: JSON.parse(value) }),
    addError: (warning) => warnings.push(warning),
  };
  vm.createContext(context);
  vm.runInContext(`async ${functionSource(source, 'loadDisabledCalendarNames')}`, context);

  const names = await context.loadDisabledCalendarNames({}, '/settings.json');
  assert.deepEqual(Array.from(names), []);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /disabledCalendars must be a list/);
});
