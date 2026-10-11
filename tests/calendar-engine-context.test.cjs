const test = require('node:test');
const assert = require('node:assert/strict');

const {fire} = require('./helpers/context-harness.cjs');

for (const task of [false, true]) {
  const kind = task ? 'task' : 'ordinary';
  test(`${kind}: zero fallback permits meeting estimates and looks through consecutive meetings`, async () => {
    const {h, plan} = await fire({task, min: 0, max: 90, meetings: [[-10, 20], [25, 50]]});
    assert.deepEqual(h.times(), ['13:00']);
    assert.equal(h.registry()[0].maxReschedules, 1);
    assert.equal(plan.triggerShortcutsToRunDetailed.length, 0);
  });
  test(`${kind}: a meeting beyond the maximum blocks actions and uses fallback`, async () => {
    const {h, plan} = await fire({task, meetings: [[-10, 60]]});
    assert.deepEqual(h.times(), ['12:10']);
    assert.equal(plan.triggerShortcutsToRunDetailed.length, 0);
  });
  test(`${kind}: no fallback and no valid estimate stops the occurrence`, async () => {
    const {h, plan} = await fire({task, min: 0, meetings: [[-10, 60]]});
    assert.deepEqual(h.times(), []);
    assert.equal(h.registry()[0].maxReschedules, 2);
    assert.equal(plan.triggerShortcutsToRunDetailed.length, 0);
  });
  test(`${kind}: exhausted allowance stops a blocked occurrence`, async () => {
    const {h, plan} = await fire({task, retries: 0, meetings: [[-10, 20]]});
    assert.deepEqual(h.times(), []);
    assert.equal(plan.triggerShortcutsToRunDetailed.length, 0);
  });
  test(`${kind}: zero fallback permits arrival estimates`, async () => {
    const {h, plan} = await fire({task, min: 0, location: {lat: 0, lon: 0.01}});
    assert.equal(h.clock.length, 1);
    assert.ok(h.clock[0].fireTime > h.start);
    assert.equal(h.registry()[0].maxReschedules, 1);
    assert.equal(plan.triggerShortcutsToRunDetailed.length, 0);
  });
  test(`${kind}: distant arrival uses fallback`, async () => {
    const {h} = await fire({task, location: {lat: 10, lon: 10}});
    assert.deepEqual(h.times(), ['12:10']);
  });
  test(`${kind}: combined driving, arrival and meeting choose the latest candidate`, async () => {
    const {h} = await fire({task, focus: 'Driving', location: {lat: 0, lon: 0.01}, meetings: [[-10, 25]]});
    assert.deepEqual(h.times(), ['12:35']);
  });
}
