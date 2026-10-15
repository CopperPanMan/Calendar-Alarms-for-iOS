const test = require('node:test');
const assert = require('node:assert/strict');
const {Harness} = require('./helpers/calendar-engine-harness.cjs');

const task = extra => ({alarmName: 'Task', taskIDs: ['floss'], taskLoopMin: 21,
  maxReschedules: 2, taskLoopEnabled: false, ...extra});

for (const qr of [false, true]) {
  test(`disabled looping keeps saved metrics without checking or repeating a ${qr ? 'QR' : 'regular'} alarm`, async () => {
    const h = new Harness([task({qrCodeID: qr ? 'bath' : '',
      shortcutsOnTrigger: [{name: 'Example', input: []}]})]);
    await h.install();
    h.setCompletion({floss: true});
    const plan = await h.engine();
    assert.deepEqual(plan.triggerShortcutsToRunDetailed.map(a => a.name), ['Example']);
    const trigger = await h.runtime({op: 'trigger_check', trigger: plan.triggerShortcutsToRunDetailed[0]});
    assert.equal(trigger.run, 1);
    const entry = h.registry()[0];
    assert.equal(entry.taskLoopEnabled, false);
    assert.deepEqual(entry.taskIDs, ['floss']);
    assert.equal(entry.taskLoopMin, 21);
    assert.equal(entry.taskSatisfied, false);
    assert.equal(entry.maxReschedules, 2);
    assert.equal(entry.taskCheckFireTime, 0);
    assert.equal(plan.qrLoop, qr);
    assert.deepEqual(h.times(), qr ? ['12:02', '12:04'] : ['12:00']);
  });
}

test('completion reports do not dismiss a QR alarm whose task looping is off', async () => {
  const h = new Harness([task({qrCodeID: 'bath'})]);
  await h.install();
  await h.engine();
  h.at(1);
  await h.engine(JSON.stringify({ok: true, metricsByID: [{metricID: 'floss', complete: true}]}));
  assert.equal(h.registry()[0].taskSatisfied, false);
  assert.equal(h.registry()[0].qrActive, true);
  assert.deepEqual(h.times(), ['12:02', '12:04']);
  const session = (await h.runtime({op: 'engine_begin', input: ''})).session;
  await h.scan('bath');
  h.apply(await h.runtime({op: 'qr_poll', session}));
  assert.deepEqual(h.times(), []);
});

test('turning looping off cancels its pending repetition and turning it back on restores saved cadence', async () => {
  const definition = task({offsetMin: 60, taskLoopEnabled: true});
  const h = new Harness([definition]);
  await h.install();
  definition.taskLoopEnabled = false;
  h.at(1);
  await h.engine();
  assert.equal(h.registry()[0].taskLoopEnabled, false);
  assert.equal(h.registry()[0].taskCheckFireTime, 0);
  assert.deepEqual(h.times(), ['13:00']);
  definition.taskLoopEnabled = true;
  h.at(2);
  await h.engine();
  assert.equal(h.registry()[0].taskLoopEnabled, true);
  assert.equal(h.registry()[0].taskCheckHHMM, '13:00');
  h.at(60);
  await h.engine();
  assert.deepEqual(h.times(), ['13:00', '13:21']);
  definition.taskLoopEnabled = false;
  h.at(61);
  await h.engine();
  assert.equal(h.registry()[0].taskCheckFireTime, 0);
  // The original, already-fired Clock alarm remains; its pending repetition is removed.
  assert.deepEqual(h.times(), ['13:00']);
  assert.deepEqual(h.registry()[0].taskIDs, ['floss']);
});

test('disabling task looping leaves condition-based rescheduling enabled', async () => {
  const h = new Harness([task({contextEnabled: true, silenceIfDriving: 'ON',
    rescheduleMode: 'fixed', rescheduleIntervalMinutes: 10, rescheduleWindowMinutes: 120})], {focus: 'Driving'});
  await h.install();
  await h.engine();
  assert.deepEqual(h.times(), ['12:10']);
  assert.equal(h.registry()[0].maxReschedules, 1);
  h.options.focus = '';
  h.at(10);
  await h.engine();
  assert.equal(h.registry()[0].maxReschedules, 1);
  assert.equal(h.registry()[0].taskCheckFireTime, 0);
});

test('turning looping off during QR playback removes task repetitions and keeps scan-to-dismiss', async () => {
  const definition = task({taskLoopEnabled: true, qrCodeID: 'bath'});
  const h = new Harness([definition]);
  await h.install();
  await h.engine();
  assert.deepEqual(h.times(), ['12:02', '12:04', '12:21']);
  definition.taskLoopEnabled = false;
  h.at(1);
  await h.engine();
  assert.equal(h.registry()[0].taskLoopEnabled, false);
  assert.equal(h.registry()[0].qrActive, true);
  assert.deepEqual(h.times(), ['12:02', '12:04']);
  await h.scan('bath');
  assert.deepEqual(h.times(), []);
});

for (const component of ['scanner', 'runtime']) {
  test(`${component} cleans stopped QR pointers when disabled task settings are retained`, async () => {
    const h = new Harness([task({qrCodeID: 'bath'})]);
    await h.install();
    await h.engine();
    h.at(1);
    const entry = h.registry()[0];
    // A stopped or older QR flow can leave only its next/backup mirrors.
    for (const key of ['qrRestartFireTime', 'qrRestartHHMM', 'qrFallbackFireTime', 'qrFallbackHHMM']) delete entry[key];
    if (component === 'runtime') {
      entry.qrActive = false;
      entry.qrPending = false;
    }
    h.putRegistry([entry]);
    if (component === 'scanner') await h.scan('bath');
    else {
      const session = (await h.runtime({op: 'engine_begin', input: ''})).session;
      h.apply(await h.runtime({op: 'qr_poll', session}));
    }
    assert.deepEqual(h.times(), []);
  });
}
