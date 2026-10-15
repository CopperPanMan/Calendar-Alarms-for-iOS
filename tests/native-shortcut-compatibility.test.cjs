const test = require('node:test');
const assert = require('node:assert/strict');
const fixture = require('./fixtures/native-shortcut-v1.json');
const {Harness} = require('./helpers/calendar-engine-harness.cjs');

test('v1 Engine dictionary keeps JSON-text output and native plan types', async () => {
  const h = new Harness();
  const result = await h.run('Calendar Alarm Engine.js', fixture.engineInput);
  assert.equal(typeof h.output, 'string');
  for (const key of ['alarmsToDelete', 'alarmsToAdd', 'triggerShortcutsToRunDetailed']) assert.ok(Array.isArray(result[key]));
  assert.equal(typeof result.qrLoop, 'boolean');
  assert.equal(typeof result.completionOnly, 'boolean');
  assert.equal(typeof result.errorRegistry, 'string');
});

test('v1 action requests accept serialized dictionaries and retain Boolean display flags', async () => {
  const h = new Harness();
  const plan = await h.runtime(JSON.stringify(fixture.notificationRequest));
  assert.equal(plan.kind, 'notification'); assert.equal(plan.message, 'Native interface fixture');
  assert.equal(plan.refresh, false); assert.equal(plan.speak, true); assert.equal(plan.show, true);
  assert.equal((await h.runtime({...fixture.notificationRequest, focus: 'Do Not Disturb'})).speak, false);
});

test('v1 task planning retains Boolean completion and JSON-text Engine input', async () => {
  const h = new Harness(); h.setCompletion({work: true});
  const plan = await h.runtime(fixture.taskRequest);
  assert.equal(plan.ok, true); assert.equal(plan.allComplete, true);
  assert.equal(typeof plan.engineInput, 'string');
  assert.deepEqual(JSON.parse(plan.engineInput).metricsByID, [{metricID: 'work', found: true, complete: true}]);
  assert.equal((await h.runtime({...fixture.taskRequest, cacheOK: 0})).ok, false);
});

test('v1 numeric control flags and older trigger metadata remain compatible', async () => {
  const h = new Harness();
  const begin = await h.runtime({op: 'engine_begin', input: []});
  assert.equal(begin.clock, 0); assert.equal(begin.completionOnly, 0);
  assert.equal(begin.cleanInput, ''); assert.equal(typeof begin.session.id, 'string');
  const poll = await h.runtime({op: 'qr_poll', session: JSON.stringify(begin.session)});
  assert.equal(poll.stop, 1); assert.equal(poll.play, 0);
  assert.ok(Array.isArray(poll.alarmsToDelete));
  assert.equal((await h.runtime({op: 'trigger_check', trigger: fixture.legacyTrigger})).run, 1);
  assert.equal((await h.runtime({op: 'trigger_finish', trigger: fixture.legacyTrigger})).ok, 1);
  const clock = await h.runtime({op: 'engine_begin', input: 'Clock'});
  assert.equal(clock.clock, 1); assert.equal(clock.activeCount, 0); assert.equal(typeof clock.notification, 'string');
});

test('v1 Scanner output stays JSON text with Boolean menu and scan flags', async () => {
  const h = new Harness();
  const menu = await h.run('Calendar Alarm QR Scanner.js', '');
  assert.equal(typeof h.output, 'string'); assert.equal(menu.hasActiveQR, false);
  assert.equal(menu.shouldShowMenu, false); assert.equal(typeof menu.errorRegistry, 'string');
  const scan = await h.run('Calendar Alarm QR Scanner.js', 'unknown');
  assert.equal(typeof h.output, 'string'); assert.equal(scan.vibrate, false);
  assert.ok(Array.isArray(scan.alarmsToDelete)); assert.ok(Array.isArray(scan.shortcutsToRunDetailed));
});
