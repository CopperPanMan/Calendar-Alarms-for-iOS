const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const config = require('../docs/alarm-config.js');
const source = fs.readFileSync(process.env.CA_RUNTIME_SOURCE || require.resolve('../Calendar Alarms Runtime.js'), 'utf8');

function runtime() {
  const now = new Date();
  const cachePath = '/Shortcuts/OpenHabits/OpenHabits Metrics/lockoutCache.json';
  const cache = {ok: true, generatedAtISO: now.toISOString(), reminderState: {todayPoints: 2, byID: {
    pending: {displayName: 'Example', complete: false, scheduledToday: true, points: 1},
    done: {complete: true},
  }}};
  const disk = new Map([[cachePath, JSON.stringify(cache)]]);
  const fm = {bookmarkedPath: () => '/Shortcuts', joinPath: (a,b) => a+'/'+b,
    cacheDirectory: () => '/local', fileExists: p => disk.has(p), readString: p => disk.get(p),
    isFileStoredIniCloud: () => false, createDirectory() {}};
  return {disk, cache, cachePath, async run(input, extra = {}) {
    let output;
    await vm.runInNewContext('(async()=>{'+source+'})()', {
      FileManager: {iCloud: () => fm, local: () => fm},
      args: {shortcutParameter: {op: 'action', input, ...extra}},
      Script: {setShortcutOutput: value => {output = value;}, complete() {}},
    });
    return JSON.parse(JSON.stringify(output));
  }};
}

for (const action of ['notification', 'openhabits_reminder']) {
  const input = {action, message: 'Example reminder', metricIDs: ['pending'], mode: 'speak'};
  test(`${action}: defaults to 50 and honors zero, decimal and full volume`, async () => {
    const h = runtime();
    assert.equal((await h.run(input)).speechLevel, 0.5);
    for (const speechVolume of [0, 12.5, 50, 100]) {
      const plan = await h.run({...input, speechVolume});
      assert.equal(plan.speechLevel, speechVolume / 100);
      assert.equal(Boolean(plan.speak), true);
    }
  });
  test(`${action}: show-only and Do Not Disturb do not enter the volume/speech branch`, async () => {
    const h = runtime();
    assert.equal(Boolean((await h.run({...input, mode: 'show'})).speak), false);
    for (const mode of ['speak', 'both']) {
      const plan = await h.run({...input, mode, speechVolume: 70}, {focus: 'Do Not Disturb'});
      assert.equal(Boolean(plan.speak), false);
      assert.equal(Boolean(plan.show), true);
    }
  });
  test(`${action}: rejects invalid volume instead of passing it to Shortcuts`, async () => {
    const h = runtime();
    for (const speechVolume of [-1, 101, '', '50', null, NaN, Infinity]) {
      const plan = await h.run({...input, speechVolume});
      assert.equal(plan.ok, 0);
      assert.match(plan.error, /speechVolume/);
    }
  });
  test(`${action}: editor defaults and round trips preserve volume on both action routes`, () => {
    assert.equal(config.newActionShortcut(action).action.speechVolume, 50);
    for (const route of ['shortcutsOnTrigger', 'qrShortcutsOnScan']) {
      for (const speechVolume of [undefined, 0, 37.5, 100]) {
        const payload = {...input};
        if (speechVolume !== undefined) payload.speechVolume = speechVolume;
        const alarm = config.normalizeAlarm({[route]: [{name: config.ACTIONS_SHORTCUT_NAME, input: [JSON.stringify(payload)]}]});
        const exported = JSON.parse(config.cleanAlarm(config.duplicateAlarm(alarm))[route][0].input[0]);
        assert.equal(exported.speechVolume, speechVolume ?? 50);
        assert.equal(exported.mode, 'speak');
      }
    }
  });
}

test('completed metrics skip both speech and its volume action', async () => {
  const h = runtime();
  const plan = await h.run({action: 'openhabits_reminder', metricIDs: ['done'], mode: 'both', speechVolume: 80});
  assert.equal(Boolean(plan.speak), false);
  assert.equal(Boolean(plan.show), false);
});

test('cache refresh preserves selected speech volume in the final action plan', async () => {
  const h = runtime();
  h.cache.generatedAtISO = '2000-01-01T00:00:00Z';
  h.disk.set(h.cachePath, JSON.stringify(h.cache));
  const input = {action: 'openhabits_reminder', metricIDs: ['pending'], mode: 'both', speechVolume: 35};
  assert.equal(Boolean((await h.run(input)).refresh), true);
  h.cache.generatedAtISO = new Date().toISOString();
  h.disk.set(h.cachePath, JSON.stringify(h.cache));
  const plan = await h.run(input, {refreshed: true, cacheOK: 1});
  assert.equal(plan.speechLevel, 0.35);
  assert.equal(Boolean(plan.speak), true);
  assert.equal(Boolean(plan.show), true);
});
