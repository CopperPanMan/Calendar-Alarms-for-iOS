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

test('continuing an active QR loop always supplies its next start time', () => {
  const output = { qrLoop: false, nextLoopStart: '' };
  const scheduled = [];
  const context = {
    output,
    scheduleQRLoop: (entry, baseEpoch, iosAlarms) => {
      scheduled.push({ entry, baseEpoch, iosAlarms });
      return 1_800;
    },
    epochToShortcutTimestamp: (epoch) => `timestamp:${epoch}`,
  };
  vm.createContext(context);
  vm.runInContext(functionSource('continueActiveQRLoop'), context);

  const entry = { nextFireTime: 1_700, nextFireHHMM: '00:28' };
  const iosAlarms = [];
  context.continueActiveQRLoop(entry, 1_750, iosAlarms);

  assert.equal(entry.prevFireTime, 1_700);
  assert.equal(entry.prevFireHHMM, '00:28');
  assert.equal(entry.nextFireTime, 1_800);
  assert.equal(output.qrLoop, true);
  assert.equal(output.nextLoopStart, 'timestamp:1800');
  assert.deepEqual(scheduled, [{ entry, baseEpoch: 1_750, iosAlarms }]);
});
