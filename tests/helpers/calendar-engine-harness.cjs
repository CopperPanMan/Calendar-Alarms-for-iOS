const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = name => fs.readFileSync(path.join(__dirname, '../..', name), 'utf8');
const root = '/Shortcuts/OpenHabits/Calendar Alarms/';
const registryPath = root + 'registry.txt';
const cachePath = '/Shortcuts/OpenHabits/OpenHabits Metrics/lockoutCache.json';
class Harness {
  constructor(definitions = [], options = {}) {
    this.now = Date.parse('2026-10-05T12:00:00');
    this.start = this.now;
    this.clock = [];
    this.disk = new Map();
    this.definitions = definitions;
    this.options = options;
    this.seq = 0;
    this.fm = {
      bookmarkedPath: () => '/Shortcuts', joinPath: (a, b) => a + '/' + b,
      cacheDirectory: () => '/local', createDirectory() {},
      fileExists: p => this.disk.has(p),
      readString: p => { if (this.options.onRead) this.options.onRead(p, this); return this.disk.get(p); },
      writeString: (p, s) => { if (this.options.failRegistryWrite && p === registryPath) throw Error('write failed'); this.disk.set(p, s); },
      isFileStoredIniCloud: () => false, isFileDownloaded: () => true,
    };
    this.setCompletion(Object.fromEntries(definitions.flatMap(d => (d.taskIDs || []).map(id => [id, false]))));
  }
  at(minutes, seconds = 0) { this.now = this.start + minutes * 60000 + seconds * 1000; }
  registry() { return JSON.parse(this.disk.get(registryPath) || '[]'); }
  putRegistry(rows) { this.disk.set(registryPath, JSON.stringify(rows)); }
  setCompletion(values) {
    this.disk.set(cachePath, JSON.stringify({ok: true, generatedAtISO: new Date(this.now).toISOString(),
      reminderState: {byID: Object.fromEntries(Object.entries(values).map(([id, complete]) => [id, {found: true, complete}]))},
      metricState: {allByID: Object.fromEntries(Object.entries(values).map(([id]) => [id, {value: false}]))}}));
  }
  context(input) {
    const h = this;
    class Clock extends Date { constructor(...args) {super(...(args.length ? args : [h.now]));} static now() {return h.now;} }
    return {Date: Clock, FileManager: {iCloud: () => h.fm, local: () => h.fm},
      Timer: {schedule(seconds, repeat, fn) {h.now += seconds * 1000; fn(); return {invalidate() {}};}},
      CalendarEvent: {between: async () => {
        if (h.options.calendarFails) throw Error('calendar fetch failed');
        return [{title: 'Tasks', startDate: new Clock(h.start), endDate: new Clock(h.start + 3600000), notes: JSON.stringify(h.definitions)}];
      }},
      Calendar: {forEvents: async () => []},
      UUID: {string: () => String(++h.seq)},
      args: {shortcutParameter: input}, Script: {setShortcutOutput: x => h.output = x, complete() {}},
    };
  }
  async run(name, input) {
    this.output = undefined;
    await vm.runInNewContext('(async()=>{' + source(name) + '})()', this.context(input));
    return typeof this.output === 'string' ? JSON.parse(this.output) : JSON.parse(JSON.stringify(this.output));
  }
  apply(plan) {
    for (const a of plan.alarmsToDelete || []) this.clock = this.clock.filter(x => x.name !== a.name || x.hh !== a.hh || x.mm !== a.mm);
    for (const a of plan.alarmsToAdd || []) {
      const m = a.time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
      if (!m) throw Error('Invalid Clock time: ' + a.time);
      const hh = String(Number(m[1]) % 12 + (m[3] === 'PM' ? 12 : 0)).padStart(2, '0');
      const fire = new Date(this.now);
      fire.setHours(Number(hh), Number(m[2]), 0, 0);
      if (fire.getTime() < Math.floor(this.now / 60000) * 60000) fire.setDate(fire.getDate() + 1);
      this.clock.push({name: a.name, hh, mm: m[2], isEnabled: true, fireTime: fire.getTime()});
    }
  }
  async engine(response = '', apply = true) {
    for (const alarm of this.clock) {
      if (alarm.fireTime <= this.now) alarm.isEnabled = false;
    }
    const result = await this.run('Calendar Alarm Engine.js', {
      labels: this.clock.map(x => x.name), hours: this.clock.map(x => Number(x.hh)),
      minutes: this.clock.map(x => Number(x.mm)), isEnabled: this.clock.map(x => x.isEnabled ?? true),
      currentFocus: this.options.focus || '', taskLogResponse: response,
    });
    if (apply) this.apply(result);
    return result;
  }
  async scan(code) {
    const result = await this.run('Calendar Alarm QR Scanner.js', code);
    this.apply(result);
    return result;
  }
  runtime(input) { return this.run('Calendar Alarms Runtime.js', input); }
  times(name) { return this.clock.filter(x => !name || x.name === name).map(x => x.hh + ':' + x.mm).sort(); }
  async install() { await this.engine(); }
}
module.exports = {Harness, source, root, registryPath, cachePath};
