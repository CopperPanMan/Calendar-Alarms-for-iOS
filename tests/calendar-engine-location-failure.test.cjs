const test = require('node:test');
const assert = require('node:assert/strict');
const {Harness} = require('./helpers/calendar-engine-harness.cjs');
async function start({task = true, retry = 0, limit = 2, mode = 'whitelist', failure = 'denied', timing = {}, enabled = true, complete = false} = {}) {
  const h = new Harness([{alarmName: 'Located', qrCodeID: 'code',
    locationMode: mode, locations: [[0, 0, 50]], contextEnabled: enabled,
    reschedMinutes: retry, maxReschedules: limit, shortcutsOnTrigger: [{name: 'Speak'}],
    ...(task ? {taskIDs: ['work'], taskLoopMin: 20} : {}), ...timing}]);
  let calls = 0;
  const original = h.context.bind(h);
  h.context = input => {
    const c = original(input), timer = c.Timer;
    c.Keychain = {contains: () => false, set() {}};
    c.Location = {setAccuracyToHundredMeters() {}, current: async () => {
      calls++;
      if (failure === 'timeout') return new Promise(() => {});
      if (failure === 'invalid') return {latitude: NaN, longitude: 0};
      if (failure === 'inside') return {latitude: 0, longitude: 0};
      if (failure === 'outside') return {latitude: 1, longitude: 1};
      throw Error('Location access denied');
    }};

    return c;
  };
  await h.install(); if (complete) h.setCompletion({work: true});
  const plan = await h.engine();
  return {h, plan, calls};
}

for (const mode of ['whitelist', 'blacklist']) for (const failure of ['denied', 'timeout', 'invalid']) {
  test(`${mode}: ${failure} location keeps the task interval when rescheduling is off`, async () => {
    const {h, plan, calls} = await start({mode, failure});
    assert.equal(calls, failure === 'timeout' ? 1 : 2); assert.deepEqual(h.times(), ['12:20']);
    assert.equal(h.registry()[0].maxReschedules, 1);
    assert.equal(h.registry()[0].qrActive, false);
    assert.deepEqual(plan.triggerShortcutsToRunDetailed, []); assert.equal(plan.qrLoop, false);
    assert.match(plan.errorRegistry, /Location could not be fetched/);
    h.at(1); await h.engine(); assert.deepEqual(h.times(), ['12:20']);
  });
}
for (const task of [false, true]) test(`${task ? 'task' : 'ordinary'}: location failure uses the configured retry`, async () => {
  const {h, plan} = await start({task, retry: 10});
  assert.deepEqual(h.times(), ['12:10']); assert.equal(h.registry()[0].maxReschedules, 1);
  assert.deepEqual(plan.triggerShortcutsToRunDetailed, []);
});
test('ordinary alarms with rescheduling off do not acquire a task follow-up', async () => {
  assert.deepEqual((await start({task: false})).h.times(), []);
});
test('location failure cannot bypass the shared loop limit', async () => {
  assert.deepEqual((await start({limit: 0})).h.times(), []);
});
for (const failure of ['inside', 'outside']) test(`known ${failure} blocked location keeps the same task cadence as unavailable location`, async () => {
  const {h, plan} = await start({failure, mode: failure === 'inside' ? 'blacklist' : 'whitelist'});
  assert.deepEqual(h.times(), ['12:20']); assert.deepEqual(plan.triggerShortcutsToRunDetailed, []);
});
for (const mode of ['fixed', 'smart']) test(`${mode}: zero context interval retains task cadence within its window`, async () => {
  const {h} = await start({timing: {rescheduleMode: mode, rescheduleIntervalMinutes: 0, rescheduleWindowMinutes: 30}});
  assert.deepEqual(h.times(), ['12:20']);
  h.at(20); await h.engine(); assert.deepEqual(h.times(), []);
});
test('a zero configured window still prevents task repetitions', async () => {
  const {h} = await start({timing: {rescheduleMode: 'fixed', rescheduleIntervalMinutes: 0, rescheduleWindowMinutes: 0}});
  assert.deepEqual(h.times(), []);
});
test('disabling context rules skips the location fetch and permits the alarm', async () => {
  const {h, plan, calls} = await start({enabled: false});
  assert.equal(calls, 0); assert.equal(h.registry()[0].qrActive, true);
  assert.ok(plan.triggerShortcutsToRunDetailed.some(a => a.name === 'Speak'));
});

test('known task completion cancels before attempting GPS or scheduling another context retry', async () => {
  const {h, plan, calls} = await start({complete: true});
  assert.equal(calls, 0); assert.equal(h.registry()[0].taskSatisfied, true);
  assert.deepEqual(h.times(), []); assert.deepEqual(plan.triggerShortcutsToRunDetailed, []);
});
