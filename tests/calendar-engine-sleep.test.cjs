const test = require('node:test');
const assert = require('node:assert/strict');
const {Harness, root} = require('./helpers/calendar-engine-harness.cjs');

const settingsPath = root + 'settings.json';
const home = {title: 'Home', identifier: 'home'};
const work = {title: 'Work', identifier: 'work'};
const minute = 60_000;
const action = {name: 'Example', input: []};

function event(h, title, start, end, alarms = [], calendar = home) {
  const item = {title, calendar, identifier: title + start,
    startDate: new Date(h.start + start * minute), endDate: new Date(h.start + end * minute),
    notes: alarms.length ? JSON.stringify(alarms) : ''};
  h.options.events.push(item);
  return item;
}

function setup(settings = {skipAlarmsDuringSleep: true}) {
  const h = new Harness([], {events: []});
  h.disk.set(settingsPath, JSON.stringify(settings));
  return h;
}

test('overnight Sleep skips other alarms strictly between its start and end and exempts its own offset alarm', async () => {
  const h = setup();
  // The harness clock starts at local noon. Bedtime is 11 PM and wake-up is 7:30 AM.
  const bedtime = 11 * 60, wake = 19 * 60 + 30;
  event(h, 'Sleep', bedtime, wake, [{alarmName: 'Sunrise', reference: 'end', offsetMin: -15}]);
  event(h, 'Routine', bedtime, wake, [
    {alarmName: 'Bedtime'}, {alarmName: 'Just after bed', offsetMin: 1},
    {alarmName: 'During sleep', reference: 'end', offsetMin: -15},
    {alarmName: 'Wake', reference: 'end'},
  ]);
  await h.install();
  assert.deepEqual(h.times('Bedtime'), ['23:00']);
  assert.deepEqual(h.times('Sunrise'), ['07:15']);
  assert.deepEqual(h.times('Wake'), ['07:30']);
  assert.deepEqual(h.times('Just after bed'), []);
  assert.deepEqual(h.times('During sleep'), []);
});

test('an offset from a different occurrence of the Sleep series has no exemption in this sleep window', async () => {
  const h = setup();
  event(h, 'Sleep', -24 * 60, -23 * 60, [{alarmName: 'Yesterday’s offset', offsetMin: 24 * 60 + 5}]).identifier = 'series';
  event(h, 'Sleep', 0, 60, [{alarmName: 'Today’s offset', offsetMin: 5}]).identifier = 'series';
  await h.install();
  assert.deepEqual(h.times('Yesterday’s offset'), []);
  assert.deepEqual(h.times('Today’s offset'), ['12:05']);
});

test('opting in removes only owned alarms, retries a missed Clock deletion, and restores after a wake-time edit', async () => {
  const h = setup({disabledCalendars: []});
  const sleep = event(h, 'Sleep', 15, 60); // A Sleep event needs no alarm notes.
  event(h, 'Morning routine', 45, 65, [{alarmName: 'Gym'}]);
  await h.install();
  assert.deepEqual(h.times('Gym'), ['12:45']);
  h.clock.push({...h.clock[0], name: 'Personal Clock alarm'});
  h.disk.set(settingsPath, JSON.stringify({skipAlarmsDuringSleep: true}));
  const first = await h.engine('', false); // Clock failed to apply the delete.
  assert.deepEqual(first.alarmsToDelete, [{name: 'Gym', hh: '12', mm: '45'}]);
  await h.engine();
  await h.engine();
  assert.deepEqual(h.times('Gym'), []);
  assert.deepEqual(h.times('Personal Clock alarm'), ['12:45']);
  sleep.endDate = new Date(h.start + 40 * minute);
  await h.engine();
  assert.deepEqual(h.times('Gym'), ['12:45']);
});

test('a Sleep event on a disabled calendar does not suppress alarms from enabled calendars', async () => {
  const h = setup({skipAlarmsDuringSleep: true, disabledCalendars: ['Home']});
  event(h, 'Sleep', 0, 60);
  event(h, 'Meeting', 20, 30, [{alarmName: 'Meeting'}], work);
  await h.install();
  assert.deepEqual(h.times('Meeting'), ['12:20']);
});

test('a never-scheduled skipped occurrence cannot claim a matching personal Clock alarm', async () => {
  const h = setup();
  event(h, 'Sleep', 0, 60);
  event(h, 'Routine', 15, 30, [{alarmName: 'Reminder', shortcutsOnTrigger: [action]}]);
  h.clock.push({name: 'Reminder', hh: '12', mm: '15', fireTime: h.start + 15 * minute, isEnabled: true});
  const initial = await h.engine();
  assert.deepEqual(initial.alarmsToDelete, []);
  h.at(15);
  const fire = await h.engine();
  assert.deepEqual(fire.alarmsToDelete, []);
  assert.deepEqual(fire.triggerShortcutsToRunDetailed, []);
  assert.deepEqual(h.times('Reminder'), ['12:15']);
});

test('confirmed removal releases a managed Clock slot for a new matching personal alarm', async () => {
  const h = setup();
  event(h, 'Work out', 30, 45, [{alarmName: 'Gym'}]);
  await h.install();
  assert.deepEqual(h.times(), ['12:30']);
  event(h, 'Sleep', 5, 45);
  h.at(1);
  await h.engine();
  assert.deepEqual(h.times(), []);
  h.at(2);
  await h.engine(); // Clock confirms the managed Gym alarm is gone.
  const personal = {name: 'Gym', hh: '12', mm: '30', fireTime: h.start + 30 * minute, isEnabled: true};
  h.clock.push(personal);
  for (const minutes of [3, 30, 46, 24 * 60 + 31]) {
    h.at(minutes);
    const plan = await h.engine();
    assert.ok(h.clock.includes(personal), `lost the replacement personal alarm at minute ${minutes}`);
    assert.deepEqual(plan.alarmsToDelete, []);
  }
});

test('turning suppression off or removing Sleep restores a future occurrence', async () => {
  for (const change of ['setting', 'event']) {
    const h = setup();
    const sleep = event(h, 'Sleep', 0, 60);
    event(h, 'Gym', 20, 40, [{alarmName: 'Gym'}]);
    await h.install();
    assert.deepEqual(h.times(), []);
    if (change === 'setting') h.disk.set(settingsPath, JSON.stringify({skipAlarmsDuringSleep: false}));
    else h.options.events = h.options.events.filter(e => e !== sleep);
    await h.engine();
    assert.deepEqual(h.times(), ['12:20']);
  }
});

test('a stale Clock fire after a Sleep edit cannot run triggers or start QR playback', async () => {
  const h = setup();
  event(h, 'Check in', 5, 20, [{alarmName: 'Check in', qrCodeID: 'scan', shortcutsOnTrigger: [action]}]);
  await h.install();
  assert.deepEqual(h.times(), ['12:05']);
  event(h, 'Sleep', 0, 10);
  h.at(5);
  const plan = await h.engine();
  assert.deepEqual(plan.triggerShortcutsToRunDetailed, []);
  assert.equal(plan.qrLoop, false);
  assert.deepEqual(plan.alarmsToAdd, []);
  h.at(11);
  assert.deepEqual((await h.engine()).triggerShortcutsToRunDetailed, []);
  assert.deepEqual(h.times(), []);
});

test('an outside task alarm can fire while its follow-up inside Sleep is skipped', async () => {
  const h = setup();
  event(h, 'Task', 0, 30, [{alarmName: 'Task', taskIDs: ['task'], taskLoopMin: 10, maxReschedules: 2,
    shortcutsOnTrigger: [action]}]);
  event(h, 'Sleep', 5, 15);
  h.setCompletion({task: false});
  h.at(-1);
  await h.install();
  h.at(0);
  const first = await h.engine();
  assert.ok(first.triggerShortcutsToRunDetailed.some(x => x.name === 'Example'));
  assert.ok(!h.times().includes('12:10'));
  h.at(10);
  const followup = await h.engine();
  assert.deepEqual(followup.triggerShortcutsToRunDetailed, []);
  assert.ok(!h.registry().some(x => x.taskSatisfied));
  h.at(16);
  const wake = await h.engine();
  assert.deepEqual(wake.triggerShortcutsToRunDetailed, []);
  assert.deepEqual(h.times(), []);
});

for (const isEnabled of [true, false]) {
  test(`a never-armed skipped task retry cannot delete an ${isEnabled ? 'enabled' : 'already disabled'} personal Clock alarm, even at expiry`, async () => {
    const h = setup();
    event(h, 'Task', 0, 30, [{alarmName: 'Task', taskIDs: ['task'], taskLoopMin: 10, maxReschedules: 2}]);
    event(h, 'Sleep', 5, 15);
    h.setCompletion({task: false});
    const personal = {name: 'Task', hh: '12', mm: '10', fireTime: h.start + 10 * minute, isEnabled};
    h.clock.push(personal);
    h.at(-1);
    await h.install();
    // Cover the initial fire, repeated sync, suppressed retry, end of Sleep,
    // and the following day when the original task entry expires.
    for (const minutes of [0, 1, 2, 10, 11, 16, 24 * 60 + 1]) {
      h.at(minutes);
      const plan = await h.engine();
      assert.ok(h.clock.includes(personal), `lost the personal alarm at minute ${minutes}`);
      assert.ok(!plan.alarmsToDelete.some(a => a.name === 'Task' && a.hh === '12' && a.mm === '10'));
      assert.ok(!plan.alarmsToAdd.some(a => a.name === 'Task' && a.time === '12:10 PM'));
    }
    assert.deepEqual(h.registry(), []);
  });
}

test('QR retry alarms respect Sleep while a Sleep-attached QR alarm retains its retries', async () => {
  for (const attached of [false, true]) {
    const h = setup();
    // Both initial alarms fire at noon, one minute before bedtime.
    const qr = {alarmName: 'Scan', qrCodeID: 'scan', offsetMin: -1};
    event(h, 'Sleep', 1, 10, attached ? [qr] : []);
    if (!attached) event(h, 'Routine', 1, 10, [qr]);
    h.at(-1);
    await h.install();
    assert.deepEqual(h.times(), ['12:00']);
    h.at(0);
    await h.engine();
    assert.deepEqual(h.times('Scan'), attached ? ['12:02', '12:04'] : []);
  }
});

test('a native QR session with a skipped restart cannot restart inside Sleep or catch up after waking', async () => {
  for (const nextInvocation of [1, 11]) {
    const h = setup();
    Object.assign(h.options, {nativePlaybackV2: true, reliableQRHandoff: true});
    event(h, 'Routine', 0, 10, [{alarmName: 'Scan', qrCodeID: 'scan'}]);
    event(h, 'Sleep', 1, 10);
    h.at(-1);
    await h.install();
    h.at(0);
    await h.engine();
    assert.equal(h.registry()[0].qrActive, true);
    // No natural restart can invoke Engine. Run it manually after bedtime,
    // before the original +2 restart or after Sleep has already ended.
    h.at(nextInvocation, 10);
    const plan = await h.engine();
    assert.equal(plan.qrLoop, false);
    assert.equal(plan.nativePlaybackPlan.enabled, 0);
    assert.deepEqual(plan.qrFallbackAlarmsToVerify, []);
    const row = h.registry()[0];
    assert.equal(row.qrActive, false);
    assert.equal(row.qrRestartFireTime, 0);
    assert.equal(row.qrFallbackFireTime, 0);
  }
});

test('a suppressed occurrence does not block the next day’s alarm at the same Clock time', async () => {
  const h = setup();
  event(h, 'Sleep', 0, 30);
  for (const offset of [0, 24 * 60]) {
    event(h, 'Routine', 10 + offset, 20 + offset, [{alarmName: 'Daily'}]);
  }
  await h.install();
  assert.deepEqual(h.times(), []);
  h.at(31);
  await h.engine();
  assert.deepEqual(h.times(), ['12:10']);
  assert.equal(h.clock[0].fireTime, h.start + (24 * 60 + 10) * minute);
});

test('calendar read failure with skipping enabled preserves previously scheduled Clock alarms', async () => {
  const h = setup();
  event(h, 'Routine', 10, 20, [{alarmName: 'Daily'}]);
  await h.install();
  const before = h.registry();
  h.options.calendarFails = true;
  const plan = await h.engine();
  assert.deepEqual(plan.alarmsToAdd, []);
  assert.deepEqual(plan.alarmsToDelete, []);
  assert.deepEqual(h.registry(), before);
  assert.deepEqual(h.times(), ['12:10']);
  assert.match(plan.errorRegistry, /calendar/i);
});

test('a verified wake alarm runs its action and QR recovery if Calendar fails at wake-up', async () => {
  const h = setup();
  event(h, 'Sleep', 0, 10, [{alarmName: 'Wake', reference: 'end', qrCodeID: 'wake', shortcutsOnTrigger: [action]}]);
  await h.install();
  h.options.calendarFails = true;
  h.at(10);
  const plan = await h.engine();
  assert.deepEqual(plan.triggerShortcutsToRunDetailed.map(a => a.name), ['Example']);
  assert.equal(plan.qrLoop, true);
  assert.deepEqual(h.times('Wake'), ['12:12', '12:14']);
  assert.match(plan.errorRegistry, /calendar/i);
});

test('during a Calendar outage a newly computed task retry still observes verified Sleep windows', async () => {
  const h = setup();
  event(h, 'Routine', 1, 20, [{alarmName: 'Task', taskIDs: ['task'], taskLoopMin: 10,
    maxReschedules: 2, shortcutsOnTrigger: [action]}]);
  event(h, 'Sleep', 5, 15);
  h.setCompletion({task: false});
  await h.install();
  h.options.calendarFails = true;
  h.at(1);
  const plan = await h.engine();
  assert.ok(plan.triggerShortcutsToRunDetailed.some(a => a.name === 'Example'));
  assert.deepEqual(plan.alarmsToAdd, []);
  h.at(11);
  assert.deepEqual((await h.engine()).triggerShortcutsToRunDetailed, []);
});
