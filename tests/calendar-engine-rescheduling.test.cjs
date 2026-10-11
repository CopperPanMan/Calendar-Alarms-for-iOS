const test = require('node:test');
const assert = require('node:assert/strict');
const {fire} = require('./helpers/context-harness.cjs');
const modern = (mode = 'smart', interval = 15, window = 120) => ({rescheduleMode: mode,
  rescheduleIntervalMinutes: interval, rescheduleWindowMinutes: window});

for (const task of [false, true]) {
  const kind = task ? 'task-linked' : 'ordinary';
  test(`${kind}: Fixed ignores estimates and retries by the exact interval`, async () => {
    const {h, plan} = await fire({task, timing: modern('fixed'), meetings: [[-10, 60]], location: {lat: 10, lon: 10}});
    assert.deepEqual(h.times(), ['12:15']);
    assert.equal(plan.triggerShortcutsToRunDetailed.length, 0);
    assert.equal(h.registry()[0].maxReschedules, 1);
  });
  test(`${kind}: Smart applies the minimum to an arrival estimate`, async () => {
    const {h} = await fire({task, timing: modern('smart', 30), location: {lat: 0, lon: 0.01}});
    assert.deepEqual(h.times(), ['12:30']);
  });
  test(`${kind}: Smart checks the final arrival time against future meetings`, async () => {
    const {h} = await fire({task, timing: modern(), location: {lat: 0, lon: 0.01}, meetings: [[15, 40]]});
    assert.deepEqual(h.times(), ['12:50']);
  });
  test(`${kind}: Smart preserves the full buffer after a short following meeting`, async () => {
    const {h} = await fire({task, timing: modern(), meetings: [[-10, 20], [23, 27]]});
    assert.deepEqual(h.times(), ['12:37']);
  });
  test(`${kind}: Smart permits a meeting estimate with zero minimum`, async () => {
    const {h} = await fire({task, timing: modern('smart', 0), meetings: [[-10, 20]]});
    assert.deepEqual(h.times(), ['12:30']);
  });
  test(`${kind}: Smart uses the minimum when Driving has no prediction`, async () => {
    const {h} = await fire({task, timing: modern(), focus: 'Driving'});
    assert.deepEqual(h.times(), ['12:15']);
  });
  test(`${kind}: a known estimate beyond the deadline stops rather than falling back`, async () => {
    const {h, plan} = await fire({task, timing: modern(), meetings: [[-10, 130]]});
    assert.deepEqual(h.times(), []);
    assert.equal(h.registry()[0].maxReschedules, 2);
    assert.equal(plan.triggerShortcutsToRunDetailed.length, 0);
    await h.engine();
    assert.deepEqual(h.times(), []);
  });
  test(`${kind}: distant arrival beyond the window stops`, async () => {
    const {h} = await fire({task, timing: modern(), location: {lat: 10, lon: 10}});
    assert.deepEqual(h.times(), []);
  });
  test(`${kind}: Smart allows five hours without shortening to four`, async () => {
    const {h} = await fire({task, timing: modern('smart', 0, 360), meetings: [[-10, 290]]});
    assert.deepEqual(h.times(), ['17:00']);
  });
  test(`${kind}: retries at the deadline are allowed, later ones are stopped`, async () => {
    const {h} = await fire({task, timing: modern('fixed', 15, 15), focus: 'Driving'});
    assert.deepEqual(h.times(), ['12:15']);
    h.at(15); await h.engine();
    assert.deepEqual(h.times(), []);
    assert.equal(h.registry()[0].maxReschedules, 1);
  });
  test(`${kind}: the deadline remains anchored to the original fire across retries`, async () => {
    const {h} = await fire({task, retries: 5, timing: modern('fixed', 15, 25), focus: 'Driving'});
    h.at(15); await h.engine();
    assert.deepEqual(h.times(), []);
    assert.equal(h.registry()[0].calcFireTime, h.start / 1000);
    assert.equal(h.registry()[0].maxReschedules, 4);
  });
  test(`${kind}: disabling rules preserves configuration and permits the initial fire`, async () => {
    const {h, plan} = await fire({task, enabled: false, timing: modern(), focus: 'Driving',
      meetings: [[-10, 60]], location: {lat: 10, lon: 10}});
    assert.ok(plan.triggerShortcutsToRunDetailed.some(action => action.name === 'Allowed'));
    assert.equal(h.registry()[0].contextEnabled, false);
    assert.deepEqual(h.registry()[0].conflictingCalendars, ['Meetings']);
    if (task) assert.deepEqual(h.times(), ['12:00', '12:20']);
  });
}

test('task cadence and context postponements share the same retry count', async () => {
  const {h} = await fire({task: true, retries: 2, timing: modern(), focus: 'Driving'});
  assert.equal(h.registry()[0].maxReschedules, 1);
  h.options.focus = ''; h.at(15); await h.engine();
  assert.equal(h.registry()[0].maxReschedules, 0);
  assert.equal(h.registry()[0].taskCheckFireTime, h.start / 1000 + 35 * 60);
});

test('task repetitions keep their own cadence but cannot extend beyond the original window', async () => {
  const {h} = await fire({task: true, enabled: false, retries: 5, timing: modern('smart', 60, 30)});
  assert.equal(h.registry()[0].taskCheckFireTime, h.start / 1000 + 20 * 60);
  h.at(20); const plan = await h.engine();
  assert.equal(h.registry()[0].taskCheckFireTime, 0);
  assert.equal(h.registry()[0].maxReschedules, 4);
  assert.equal(plan.alarmsToAdd.length, 0);
});

test('Smart accounts for meetings covering a future task repetition', async () => {
  const {h} = await fire({task: true, timing: modern(), meetings: [[15, 40]]});
  assert.equal(h.registry()[0].taskCheckFireTime, h.start / 1000 + 50 * 60);
});

test('zero window permits the original fire but schedules no task repetitions', async () => {
  const {h, plan} = await fire({task: true, timing: modern('smart', 15, 0)});
  assert.equal(h.registry()[0].taskCheckFireTime, 0);
  assert.equal(h.registry()[0].maxReschedules, 2);
  assert.ok(plan.triggerShortcutsToRunDetailed.some(action => action.name === 'Allowed'));
});

test('QR-only prompting remains independent of a zero rescheduling window', async () => {
  const {h} = await fire({task: true, enabled: false, timing: {...modern('smart', 15, 0), qrCodeID: 'work'}});
  assert.deepEqual(h.times(), ['12:02', '12:04']);
  assert.equal(h.registry()[0].maxReschedules, 2);
  h.at(2); await h.engine();
  assert.deepEqual(h.times(), ['12:04', '12:06']);
  assert.equal(h.registry()[0].maxReschedules, 2);
});

test('shortening the configured window retires an already scheduled context retry', async () => {
  const {h} = await fire({timing: modern('fixed', 15), focus: 'Driving'});
  h.definitions[0].rescheduleWindowMinutes = 5;
  h.at(1); await h.engine();
  assert.deepEqual(h.times(), []);
});

test('shortening the configured window retires a future task repetition', async () => {
  const {h} = await fire({task: true, enabled: false, timing: modern()});
  h.definitions[0].rescheduleWindowMinutes = 5;
  h.at(1); await h.engine();
  assert.equal(h.registry()[0].taskCheckFireTime, 0);
  assert.ok(!h.times().includes('12:20'));
});

for (const task of [false, true]) test(`${task ? 'task' : 'ordinary'}: disabling imported legacy rules also disables their task timing influence`, async () => {
  const {h, plan} = await fire({task, enabled: false, meetings: [[-10, 60]], focus: 'Driving'});
  assert.ok(plan.triggerShortcutsToRunDetailed.some(action => action.name === 'Allowed'));
  if (task) assert.equal(h.registry()[0].taskCheckFireTime, h.start / 1000 + 20 * 60);
});

for (const task of [false, true]) test(`${task ? 'task' : 'ordinary'}: Smart zero minimum has no fallback for Driving`, async () => {
  const {h, plan} = await fire({task, timing: modern('smart', 0), focus: 'Driving'});
  assert.deepEqual(h.times(), []);
  assert.equal(plan.triggerShortcutsToRunDetailed.length, 0);
});
