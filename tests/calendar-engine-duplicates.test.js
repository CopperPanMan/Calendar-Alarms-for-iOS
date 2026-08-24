const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const engineSource = fs.readFileSync(require.resolve('../Calendar Alarm Engine.js'), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));

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

function loadDuplicateFunctions(deleteDuplicates) {
  const errors = [];
  const context = {
    output: { alarmsToDelete: [], alarmsToAdd: [] },
    errors,
    DELETE_DUPLICATE_ALARMS: deleteDuplicates,
    parseHHMMString: (value) => {
      const [hh, mm] = value.split(':');
      return { hh, mm };
    },
    epochToHHMM: () => ({ hh: '07', mm: '30' }),
    epochTo12HourTime: () => '7:30 AM',
    addError: (message) => errors.push(message),
  };
  vm.createContext(context);
  vm.runInContext([
    functionSource('findIOSMatches'),
    functionSource('queueDeleteIOSByStoredHHMMIfUnique'),
    functionSource('queueAddIOSIfMissing'),
  ].join('\n'), context);
  return context;
}

const duplicates = [
  { name: 'Wake Up', hh: '07', mm: '30' },
  { name: 'Wake Up', hh: '07', mm: '30' },
];

test('duplicate deletion defaults to enabled', () => {
  assert.match(engineSource, /^const DELETE_DUPLICATE_ALARMS = true;$/m);
});

test('enabled setting deletes every matching duplicate occurrence', () => {
  const context = loadDuplicateFunctions(true);

  assert.equal(context.queueDeleteIOSByStoredHHMMIfUnique(duplicates, 'Wake Up', '07:30', 0), true);
  assert.deepEqual(plain(context.output.alarmsToDelete), [{ name: 'Wake Up', hh: '07', mm: '30' }]);
  assert.deepEqual(context.errors, []);
});

test('enabled setting replaces duplicates with one canonical alarm when adding', () => {
  const context = loadDuplicateFunctions(true);

  assert.equal(context.queueAddIOSIfMissing(duplicates, 'Wake Up', 123), true);
  assert.deepEqual(plain(context.output.alarmsToDelete), [{ name: 'Wake Up', hh: '07', mm: '30' }]);
  assert.deepEqual(plain(context.output.alarmsToAdd), [{ name: 'Wake Up', time: '7:30 AM' }]);
  assert.deepEqual(context.errors, []);
});

test('disabled setting preserves the previous duplicate protection', () => {
  const context = loadDuplicateFunctions(false);

  assert.equal(context.queueDeleteIOSByStoredHHMMIfUnique(duplicates, 'Wake Up', '07:30', 0), false);
  assert.equal(context.queueAddIOSIfMissing(duplicates, 'Wake Up', 123), false);
  assert.deepEqual(context.output.alarmsToDelete, []);
  assert.deepEqual(context.output.alarmsToAdd, []);
  assert.equal(context.errors.length, 2);
  assert.match(context.errors[0], /won't delete/);
  assert.match(context.errors[1], /won't add/);
});
