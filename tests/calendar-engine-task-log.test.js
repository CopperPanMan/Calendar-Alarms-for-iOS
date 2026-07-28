const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const engineSource = fs.readFileSync(require.resolve('../Calendar Alarm Engine.js'), 'utf8');

function functionSource(name) {
  const start = engineSource.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing function ${name}`);

  const bodyStart = engineSource.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < engineSource.length; i += 1) {
    if (engineSource[i] === '{') depth += 1;
    if (engineSource[i] === '}') depth -= 1;
    if (depth === 0) return engineSource.slice(start, i + 1);
  }
  throw new Error(`unterminated function ${name}`);
}

function loadTaskLogFunctions(overrides = {}) {
  const context = {
    Set,
    JSON,
    String,
    ...overrides,
  };
  vm.createContext(context);
  vm.runInContext([
    functionSource('getCompletedTaskMetricIDs'),
    functionSource('applyTaskLogCompletions'),
  ].join('\n'), context);
  return context;
}

test('task log parsing returns unique completed metric IDs only', () => {
  const { getCompletedTaskMetricIDs } = loadTaskLogFunctions();
  const result = getCompletedTaskMetricIDs(JSON.stringify({
    ok: true,
    metricsByID: [
      { metricID: 'meditationDuration', complete: true },
      { metricID: 'meditationDuration', complete: true },
      { metricID: 'journal', complete: false },
      { metricID: '  exercise  ', complete: true },
      { complete: true },
    ],
  }));

  assert.deepEqual(Array.from(result.ids), ['meditationDuration', 'exercise']);
  assert.equal(result.error, '');
});

test('malformed task log input is non-destructive and reports a warning', () => {
  const warnings = [];
  const deletions = [];
  const context = loadTaskLogFunctions({
    addError: (message) => warnings.push(message),
    queueDeleteIOSByStoredHHMMIfUnique: (...args) => deletions.push(args),
    clearQRBackupAlarm: () => {},
  });
  const registry = [{ alarmName: 'Meditate', taskIDs: ['meditationDuration'], taskSatisfied: false }];

  context.applyTaskLogCompletions({ taskLogResponseRaw: '{bad', iosAlarms: [] }, registry);

  assert.equal(registry[0].taskSatisfied, false);
  assert.equal(deletions.length, 0);
  assert.match(warnings[0], /invalid task log response JSON/);
});

test('completed metrics delete and reset every matching task loop', () => {
  const deletions = [];
  const backupsCleared = [];
  const context = loadTaskLogFunctions({
    addError: () => {},
    queueDeleteIOSByStoredHHMMIfUnique: (...args) => deletions.push(args),
    clearQRBackupAlarm: (...args) => backupsCleared.push(args),
  });
  const iosAlarms = [{ name: 'Meditate', hh: '07', mm: '30' }];
  const registry = [
    {
      alarmName: 'Meditate',
      taskIDs: ['meditationDuration'],
      nextFireHHMM: '07:30',
      nextFireTime: 123,
      taskSatisfied: false,
      qrActive: true,
      qrPending: true,
      qrPendingSince: 100,
    },
    { alarmName: 'Journal', taskIDs: ['journal'], taskSatisfied: false },
  ];
  const response = JSON.stringify({
    ok: true,
    metricsByID: [{ metricID: 'meditationDuration', complete: true }],
  });

  context.applyTaskLogCompletions({ taskLogResponseRaw: response, iosAlarms }, registry);

  assert.deepEqual(deletions, [[iosAlarms, 'Meditate', '07:30', 123]]);
  assert.equal(backupsCleared.length, 1);
  assert.equal(registry[0].taskSatisfied, true);
  assert.equal(registry[0].taskCheckFirstFireHandled, true);
  assert.equal(registry[0].qrActive, false);
  assert.equal(registry[0].qrPending, false);
  assert.equal(registry[0].qrPendingSince, 0);
  assert.equal(registry[1].taskSatisfied, false);
});
