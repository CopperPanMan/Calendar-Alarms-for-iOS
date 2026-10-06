const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {Harness, source} = require('./helpers/calendar-engine-harness.cjs');

const emptyInput = () => ({labels: [], hours: [], minutes: [], isEnabled: [], currentFocus: '', taskLogResponse: ''});

async function dailyAlarm() {
  const h = new Harness([{alarmName: 'Daily'}, {alarmName: 'Daily', offsetMin: 24 * 60}]);
  h.at(-1); await h.install();
  h.at(0); await h.engine();
  return h;
}

test('disabled fired alarm is replaced by an enabled next-day occurrence in one pass', async () => {
  const h = await dailyAlarm();
  h.at(6);
  const result = await h.engine();
  assert.deepEqual(result.alarmsToDelete, [{name: 'Daily', hh: '12', mm: '00'}]);
  assert.deepEqual(result.alarmsToAdd, [{name: 'Daily', time: '12:00 PM'}]);
  assert.equal(h.clock.length, 1);
  assert.equal(h.clock[0].isEnabled, true);
  assert.equal(h.clock[0].fireTime, h.start + 86400000);
  assert.equal(h.registry().filter(e => e.alarmName === 'Daily').length, 2);
  const repeated = await h.engine();
  assert.deepEqual(repeated.alarmsToDelete, []);
  assert.deepEqual(repeated.alarmsToAdd, []);
});

test('five-minute grace defers both deletion and next-day replacement of a fresh ring', async () => {
  const h = await dailyAlarm();
  h.at(4, 59);
  const protectedRun = await h.engine();
  assert.deepEqual(protectedRun.alarmsToDelete, []);
  assert.deepEqual(protectedRun.alarmsToAdd, []);
  assert.equal(h.clock[0].isEnabled, false);
  h.at(5);
  const expired = await h.engine();
  assert.equal(expired.alarmsToDelete.length, 1);
  assert.equal(expired.alarmsToAdd.length, 1);
  assert.equal(h.clock[0].isEnabled, true);
});

test('an enabled same-time future alarm survives cleanup of the older occurrence', async () => {
  const h = await dailyAlarm();
  h.clock[0].isEnabled = true;
  h.clock[0].fireTime = h.start + 86400000;
  h.at(6);
  const result = await h.engine();
  assert.deepEqual(result.alarmsToDelete, []);
  assert.deepEqual(result.alarmsToAdd, []);
  assert.equal(h.clock[0].isEnabled, true);
});

test('routine duplicate replacement cannot interrupt a fresh ordinary ring', async () => {
  const h = await dailyAlarm();
  h.clock.push({...h.clock[0]});
  h.at(4);
  const protectedRun = await h.engine();
  assert.deepEqual(protectedRun.alarmsToDelete, []);
  assert.deepEqual(protectedRun.alarmsToAdd, []);
  assert.equal(h.clock.length, 2);
  h.at(5);
  const replaced = await h.engine();
  assert.equal(replaced.alarmsToDelete.length, 1);
  assert.equal(replaced.alarmsToAdd.length, 1);
  assert.equal(h.clock.length, 1);
  assert.equal(h.clock[0].isEnabled, true);
});

test('disabled future alarm is replaced without any past firing history', async () => {
  const h = new Harness([{alarmName: 'Future', offsetMin: 60}]);
  await h.install();
  h.clock[0].isEnabled = false;
  const result = await h.engine();
  assert.deepEqual(result.alarmsToDelete, [{name: 'Future', hh: '13', mm: '00'}]);
  assert.deepEqual(result.alarmsToAdd, [{name: 'Future', time: '1:00 PM'}]);
  assert.equal(h.clock[0].isEnabled, true);
  assert.equal(h.registry()[0].lastHandledFireTime, undefined);
});

test('fast-path handling also removes older disabled owned alarms without fetching Calendar', async () => {
  const h = new Harness([{alarmName: 'Old', offsetMin: -10},
    {alarmName: 'Current', shortcutsOnTrigger: [{name: 'Example', input: []}]}]);
  h.at(-11); await h.install();
  h.at(-10); await h.engine();
  h.options.calendarFails = true;
  h.at(0);
  const result = await h.engine();
  assert.deepEqual(result.alarmsToDelete, [{name: 'Old', hh: '11', mm: '50'}]);
  assert.deepEqual(h.times(), ['12:00']);
  assert.equal(result.errorRegistry, '');
  assert.equal(result.triggerShortcutsToRunDetailed.length, 1);
});

test('disabled unowned alarms remain untouched', async () => {
  const h = new Harness([{alarmName: 'Future', offsetMin: 60}]);
  await h.install();
  h.clock.push({name: 'Personal', hh: '09', mm: '00', isEnabled: false});
  const result = await h.engine();
  assert.deepEqual(result.alarmsToDelete, []);
  assert.equal(h.clock.find(a => a.name === 'Personal').isEnabled, false);
});

test('disabled retired task alarm remains protected for five minutes, then is removed', async () => {
  const h = new Harness([{alarmName: 'Task', taskIDs: ['task'], taskLoopMin: 21, maxReschedules: 1}]);
  await h.install(); await h.engine();
  h.at(4, 59); await h.engine();
  assert.deepEqual(h.times(), ['12:00', '12:21']);
  assert.equal(h.registry()[0].retiredAlarmTimes.length, 1);
  h.at(5); await h.engine();
  assert.deepEqual(h.times(), ['12:21']);
  assert.equal(h.clock[0].isEnabled, true);
});

test('explicit silencing and context gates still delete fresh alarms immediately', async () => {
  for (const definition of [{alarmName: 'Silent', silenceAlarm: true},
    {alarmName: 'Gated', silenceIfDriving: 'ON', reschedMinutes: 5, maxReschedules: 1}]) {
    const h = new Harness([definition], {focus: 'Driving'});
    await h.install();
    const result = await h.engine();
    assert.ok(result.alarmsToDelete.some(a => a.hh === '12' && a.mm === '00'));
    assert.ok(!h.times().includes('12:00'));
  }
});

test('calendar fetch failure does not prevent overdue disabled-alarm cleanup', async () => {
  const h = new Harness([{alarmName: 'Old'}]);
  await h.install(); await h.engine();
  h.at(5); h.options.calendarFails = true;
  const before = h.registry();
  const result = await h.engine();
  assert.match(result.errorRegistry, /Calendar fetch failed/);
  assert.deepEqual(h.times(), []);
  assert.deepEqual(h.registry(), before);
});

test('duplicate enabled/disabled future alarms are replaced by one enabled alarm', async () => {
  const h = new Harness([{alarmName: 'Future', offsetMin: 60}]);
  await h.install();
  h.clock.push({...h.clock[0], isEnabled: false});
  const result = await h.engine();
  assert.equal(result.alarmsToDelete.length, 1);
  assert.equal(result.alarmsToAdd.length, 1);
  assert.equal(h.clock.length, 1);
  assert.equal(h.clock[0].isEnabled, true);
});

test('parser preserves task-log text and handles explicit Boolean representations', () => {
  const engine = source('Calendar Alarm Engine.js');
  const ctx = {pad2: n => String(n).padStart(2, '0')};
  vm.runInNewContext(engine.slice(engine.indexOf('function parseEngineInput('),
    engine.indexOf('function getCompletedTaskMetricIDs(')) + '\nthis.parse = parseEngineInput;', ctx);
  const flags = [true, false, 1, 0, 'true', 'false', '1', '0', ' FALSE '];
  const taskLogResponse = '  {"ok":true,"metricsByID":[],"message":"leave :;: unchanged"}\n';
  const result = ctx.parse({labels: flags.map((_, i) => 'Alarm ' + i), hours: flags.map(() => '07'),
    minutes: flags.map(() => '30'), isEnabled: flags, currentFocus: '', taskLogResponse});
  assert.deepEqual(Array.from(result.iosAlarms, a => a.isEnabled), [true, false, true, false, true, false, true, false, false]);
  assert.equal(result.taskLogResponseRaw, taskLogResponse);
  assert.equal(ctx.parse(emptyInput()).iosAlarms.length, 0);
});

test('invalid dictionary input emits no mutations or actions and leaves all files unchanged', async () => {
  const valid = {labels: ['Future'], hours: [13], minutes: [0], isEnabled: [false],
    currentFocus: '', taskLogResponse: ''};
  const invalid = ['Future:;:13:;:0:;::;:', null, [], {...valid, isEnabled: []},
    {...valid, labels: 'Future'}, {...valid, hours: [24]}, {...valid, hours: ['']},
    {...valid, minutes: [1.5]}, {...valid, isEnabled: ['unknown']},
    {...valid, currentFocus: null}, {...valid, taskLogResponse: {ok: true}}];
  const h = new Harness([{alarmName: 'Future', offsetMin: 60}]);
  await h.install();
  const before = [...h.disk];
  for (const input of invalid) {
    const result = await h.run('Calendar Alarm Engine.js', input);
    assert.match(result.errorRegistry, /^ERR:/);
    assert.deepEqual(result.alarmsToDelete, []);
    assert.deepEqual(result.alarmsToAdd, []);
    assert.deepEqual(result.triggerShortcutsToRunDetailed, []);
    assert.deepEqual([...h.disk], before);
  }
});
