const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const runtime = fs.readFileSync(require.resolve('../Calendar Alarms Runtime.js'), 'utf8');
const readout = fs.readFileSync(require.resolve('../Shortcut Actions/Calendar Alarms Actions.md'), 'utf8');
const menuURL = new URL(readout.match(/OPEN URLS: (scriptable:\/\/\/run\/\S+)/)[1]);
const syncURL = 'shortcuts://run-shortcut?name=Calendar%20Alarm%20Engine';

async function runMenu({stored, selection, inApp = true, query = Object.fromEntries(menuURL.searchParams)}) {
  let value = stored, complete = false, output;
  const alerts = [], opened = [];
  const fm = {
    bookmarkedPath: () => '/shortcuts', joinPath: (base, name) => base + '/' + name, cacheDirectory: () => '/cache',
    fileExists: file => file.endsWith('/settings.json') && value !== undefined,
    isFileStoredIniCloud: () => false, createDirectory() {}, readString: () => value,
    writeString(file, text) { if (file.endsWith('/settings.json')) value = text; },
  };
  class Alert {
    constructor() { this.actions = []; }
    addAction(label) { this.actions.push(label); }
    addCancelAction(label) { this.cancel = label; }
    async presentAlert() { alerts.push(this); return selection; }
  }
  await vm.runInNewContext('(async () => {' + runtime + '})()', {
    FileManager: {iCloud: () => fm, local: () => fm}, Alert, config: {runsInApp: inApp},
    args: {queryParameters: query, shortcutParameter: {op: 'settings_read', supportsSleepMenu: true}},
    Safari: {open(url) { opened.push({url, settings: JSON.parse(value)}); }},
    Script: {complete() { complete = true; }, setShortcutOutput(result) { output = result; }},
  });
  assert.equal(complete, true);
  return {value, alerts, opened, output};
}

test('Actions opens the foreground Runtime and its explicit choice saves before syncing', async () => {
  assert.equal(decodeURIComponent(menuURL.pathname), '/run/Calendar Alarms Runtime');
  for (const [selection, initial] of [[0, false], [1, true]]) {
    const original = {disabledCalendars: ['Work'], otherSetting: 42, skipAlarmsDuringSleep: initial};
    const r = await runMenu({selection, stored: JSON.stringify(original)});
    assert.match(r.alerts[0].message, new RegExp('is ' + (initial ? 'on' : 'off')));
    assert.deepEqual(r.alerts[0].actions, ['Turn On', 'Turn Off']);
    assert.equal(r.alerts[0].cancel, 'Cancel');
    assert.deepEqual(r.opened, [{url: syncURL, settings: {...original, skipAlarmsDuringSleep: !initial}}]);
    assert.equal(r.output, undefined);
  }
});

test('canceling the foreground menu preserves settings and leaves the Engine idle', async () => {
  const r = await runMenu({selection: -1});
  assert.equal(r.value, undefined);
  assert.equal(r.alerts.length, 1);
  assert.deepEqual(r.opened, []);
});

test('an unreadable settings dictionary shows the error and keeps the original file', async () => {
  const r = await runMenu({stored: '[]', selection: 0});
  assert.match(r.alerts[0].message, /dictionary/);
  assert.equal(r.value, '[]');
  assert.deepEqual(r.opened, []);
});

test('ordinary shortcut requests retain their dictionary output and never present the menu', async () => {
  for (const invocation of [{inApp: false}, {inApp: true, query: {}}]) {
    const r = await runMenu(invocation);
    assert.equal(r.output.hasError, 0);
    assert.equal(r.output.skipAlarmsDuringSleep, false);
    assert.deepEqual(r.alerts, []);
    assert.deepEqual(r.opened, []);
  }
});
