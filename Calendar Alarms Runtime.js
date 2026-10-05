// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: orange; icon-glyph: cogs;
// Calendar Alarms Runtime.js
// Does not import, modify, or replace either existing core script.
// QR diagnostic revision: explicit numeric QR flags and stop reasons.

const REMINDER = {urgentAtMinutes: 20, criticalAtMinutes: 5,
  includeTodayPoints: true, includeYesterdayPoints: false, decimals: 1};
const fm = FileManager.iCloud();
const local = FileManager.local();
const ownerPath = local.joinPath(local.cacheDirectory(), 'calendar-alarms-loop-owner-v1.json');
const playbackPath = local.joinPath(local.cacheDirectory(), 'calendar-alarms-playback-v1.json');
const PLAYBACK_ALLOWANCE_MS = 1000;
let root;
function base() {
  if (!root) root = fm.bookmarkedPath('Shortcuts');
  if (!root) throw new Error('Missing Scriptable bookmark "Shortcuts".');
  return fm.joinPath(root, 'OpenHabits/Calendar Alarms');
}
const path = name => fm.joinPath(base(), name);
async function ready(p) {
  if (!fm.fileExists(p)) throw new Error('File not found: ' + p);
  if (fm.isFileStoredIniCloud(p) && !fm.isFileDownloaded(p))
    await fm.downloadFileFromiCloud(p);
  return p;
}
async function read(p, fallback) {
  if (!fm.fileExists(p) && fallback !== undefined) return fallback;
  return fm.readString(await ready(p));
}
async function json(p, fallback) {
  return JSON.parse(await read(p, fallback === undefined ? undefined : JSON.stringify(fallback)));
}
function write(name, value) {
  fm.createDirectory(base(), true);
  fm.writeString(path(name), value);
}
function object(raw) {
  if (Array.isArray(raw)) {
    if (raw.length !== 1) throw new Error('Expected exactly one input object.');
    raw = raw[0];
  }
  if (typeof raw === 'string') raw = JSON.parse(raw);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new Error('Expected a JSON dictionary.');
  return raw;
}
function text(raw) {
  if (Array.isArray(raw) && raw.length === 1) raw = raw[0];
  return raw == null ? '' : typeof raw === 'object' ? JSON.stringify(raw) : String(raw);
}
function ids(raw) {
  if (typeof raw === 'string')
    raw = raw.trim().startsWith('[') ? JSON.parse(raw) : raw.split(',');
  if (!Array.isArray(raw)) raw = raw == null ? [] : [raw];
  return [...new Set(raw.map(x => String(x ?? '').trim()).filter(Boolean))];
}
function display(message, mode = 'show', focus = '', title = '') {
  const quiet = focus === 'Do Not Disturb';
  return {message, title,
    speak: !!message && !quiet && (mode === 'speak' || mode === 'both'),
    show: !!message && (quiet || mode === 'show' || mode === 'both')};
}
async function active() {
  const rows = await json(path('registry.txt'), []);
  return rows.filter(x => x.qrActive === true).sort((a,b) =>
    (Number(a.firstQRFireTime) || 0) - (Number(b.firstQRFireTime) || 0));
}
async function guard() {
  const rows = await active();
  return {activeCount: rows.length,
    notification: rows.length ? 'Please scan: ' + rows.map(x => x.alarmName).join(', ') : ''};
}
function owner() {
  return local.fileExists(ownerPath) ? JSON.parse(local.readString(ownerPath)) : {};
}
function sessionStopReason(session) {
  if (!session || typeof session !== 'object' || Array.isArray(session)
      || typeof session.id !== 'string' || !session.id
      || !Number.isFinite(Number(session.deadline))) return 'invalid_session';
  const current = owner();
  if (!current.id) return 'owner_missing';
  if (current.id !== session.id) return 'superseded';
  if (Date.now() >= Number(session.deadline)) return 'deadline_expired';
  return '';
}
function owns(session) {
  return sessionStopReason(session) === '';
}
function stopped(session, reason) {
  const deadline = Number(session && session.deadline);
  return {stop: true, play: false, reason,
    receivedSessionType: Array.isArray(session) ? 'list' : typeof session,
    receivedSession: session == null ? null : session,
    ownerID: owner().id || '',
    secondsRemaining: Number.isFinite(deadline)
      ? Math.round((deadline - Date.now()) / 1000) : null};
}
function qrOutput(result) {
  // Shortcuts receives actual numbers; it need not coerce Boolean values.
  return {...result, stop: result.stop ? 1 : 0, play: result.play ? 1 : 0};
}
function playbackBusy() {
  if (!local.fileExists(playbackPath)) return false;
  const playback = JSON.parse(local.readString(playbackPath));
  const now = Date.now();
  return now >= playback.reservedAt && now < playback.expectedEndAt;
}
function begin(raw) {
  const session = {id: UUID.string(), deadline: Date.now() + 180000};
  local.writeString(ownerPath, JSON.stringify(session));
  // Ownership can change while an old native Play Sound is still running.
  // Leave its separate playback reservation intact until it expires.
  const input = text(raw);
  return {session, cleanInput: input === 'Calendar' ? '' : input};
}
async function soundFile(name) {
  const relative = String(name || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!relative || relative.split('/').includes('..')) throw new Error('Invalid sound path.');
  // Preserve old paths; prefer explicit paths, then the current tones folder.
  const candidates = relative.startsWith('Alarm Tones/')
    ? [path(relative)] : [path(relative), path('Alarm Tones/' + relative)];
  for (const p of candidates) if (fm.fileExists(p)) return ready(p);
  throw new Error('Alarm sound not found: ' + relative);
}
async function qrState(session) {
  const reason = sessionStopReason(session);
  if (reason) return stopped(session, reason);
  const rows = await active();
  if (!rows.length) return stopped(session, 'no_active_qr_alarm');
  const opened = Date.parse(await read(path('scannerLastOpened.txt'), new Date(0).toISOString()));
  const age = Date.now() - opened;
  const changed = sessionStopReason(session);
  if (changed) return stopped(session, changed);
  return {stop: false,
    play: !(age >= 0 && age < 13000) && !playbackBusy(), alarm: rows[0]};
}
function qrSoundRelativePath(name) {
  let relative = String(name || 'ringtone.mp3').replace(/\\/g, '/');
  relative = relative.replace(/^\/+/, '');
  for (const prefix of ['Shortcuts/OpenHabits/Calendar Alarms/Alarm Tones/',
    'OpenHabits/Calendar Alarms/Alarm Tones/', 'Alarm Tones/']) {
    if (relative.startsWith(prefix)) {
      relative = relative.slice(prefix.length);
      break;
    }
  }
  const parts = relative.split('/');
  if (!relative || parts.some(part => !part || part === '.' || part === '..'))
    throw new Error('Invalid QR sound path.');
  return relative;
}
async function qrPoll(session) {
  const state = await qrState(session);
  if (state.stop) return state;
  if (!state.play) return {stop: false, play: false};
  const a = state.alarm;
  // Return only the path. Shortcuts loads the file when its cached path changes.
  // Poll must not repeatedly download or read the audio file.
  const fileName = qrSoundRelativePath(a.qrSoundPath);
  const reason = sessionStopReason(session);
  if (reason) return stopped(session, reason);
  return {stop: false, play: true, fileName,
    alarmKey: JSON.stringify([a.alarmName, a.firstQRFireTime, a.qrCodeID]),
    volume: Math.min(1, Math.max(0, Number(a.qrVol ?? 40) / 100))};
}
async function qrPermit(r) {
  const state = await qrState(r.session);
  if (state.stop) return state;
  const duration = Number(r.duration);
  if (!(duration > 0 && Number.isFinite(duration)))
    throw new Error('Could not read the QR audio duration.');
  // Reserve 1 second for native-action overhead. Never start a clip that
  // cannot finish within this instance's three-minute budget.
  if (Date.now() + duration * 1000 + PLAYBACK_ALLOWANCE_MS >= r.session.deadline)
    return stopped(r.session, 'clip_exceeds_remaining_time');
  const a = state.alarm;
  const key = JSON.stringify([a.alarmName, a.firstQRFireTime, a.qrCodeID]);
  const reason = sessionStopReason(r.session);
  if (reason) return stopped(r.session, reason);
  if (!state.play || key !== r.alarmKey || playbackBusy())
    return {stop: false, play: false};
  // Keep the final check and reservation together, without an intervening await.
  // The allowance covers the handoff to Set Volume and native Play Sound.
  const reservedAt = Date.now();
  local.writeString(playbackPath, JSON.stringify({
    instanceID: r.session.id,
    reservedAt,
    expectedEndAt: reservedAt + duration * 1000 + PLAYBACK_ALLOWANCE_MS
  }));
  // If superseded during the write, leave the brief reservation to expire.
  // Never clear it here: a successor may already be relying on it.
  const permitted = owns(r.session);
  return permitted ? {stop: false, play: true}
    : stopped(r.session, sessionStopReason(r.session));
}
function scanInput(raw, fromScan) {
  const s = text(raw).trim();
  if (!/^shortcuts:\/\//i.test(s)) return fromScan ? '' : s;
  const q = {};
  const query = s.split('?')[1] || '';
  for (const part of query.split('&')) {
    const i = part.indexOf('=');
    if (i >= 0) q[decodeURIComponent(part.slice(0,i))] = decodeURIComponent(part.slice(i+1));
  }
  return q.name === 'Calendar Alarms QR Scanner' ? String(q.input || '') : '';
}
async function cache(optional = false) {
  base();
  const p = fm.joinPath(root, 'OpenHabits/OpenHabits Metrics/lockoutCache.json');
  const c = await json(p, optional ? {} : undefined);
  if (!optional && (c.ok === false || !c.reminderState?.byID))
    throw new Error('OpenHabits cache is missing a successful reminderState.byID.');
  return c;
}
function reminder(c, metricIDs) {
  const rs = c.reminderState;
  const number = x => x == null || x === '' || !Number.isFinite(Number(x))
    ? null : String(Math.round((Number(x) + Number.EPSILON) * 10 ** REMINDER.decimals) / 10 ** REMINDER.decimals);
  const metrics = metricIDs.map(id => ({...rs.byID[id], metricID: id}))
    .filter(m => rs.byID[m.metricID] && m.found !== false && m.complete !== true && m.scheduledToday !== false)
    .map((m, index) => {
      const d = m.dueProperties || {};
      const minutes = d.minutesRemaining == null ? NaN : Number(d.minutesRemaining);
      const level = d.hasDeadline && d.status !== 'none'
        ? d.status === 'expired' ? -1 : minutes <= REMINDER.criticalAtMinutes ? 3 : minutes <= REMINDER.urgentAtMinutes ? 2 : 1 : 1;
      return {m, index, level, minutes};
    }).filter(x => x.level > 0).sort((a,b) => b.level-a.level || a.index-b.index);
  let totalUsed = false;
  return metrics.map(({m, level, minutes}) => {
    const name = m.displayName || m.metricID;
    const points = number(m.points);
    const reward = Number(points) > 0 ? `${points} ${Number(points) === 1 ? 'point' : 'points'}` : '';
    const streak = Number(m.streak) > 0 ? Math.round(Number(m.streak)) : 0;
    const remaining = minutes <= 0 ? 'less than a minute' : `${Math.ceil(minutes)} ${Math.ceil(minutes) === 1 ? 'minute' : 'minutes'}`;
    if (level === 3) {
      const losses = [reward ? `lose ${reward}` : '', streak ? `end your ${streak}-day streak` : ''].filter(Boolean).join(' and ');
      const when = minutes <= 0 ? 'now' : `within ${remaining}`;
      return `Final reminder. Log ${name} ${when}${losses ? ' or ' + losses : ''}.`;
    }
    if (level === 2) {
      const stakes = [reward, streak ? `your ${streak}-day streak` : ''].filter(Boolean).join(' and ');
      const verb = reward && streak || Number(points) > 1 && !streak ? 'are' : 'is';
      return `${name} still isn't logged. ${remaining} left.${stakes ? ' ' + stakes + ' ' + verb + ' at stake.' : ''}`;
    }
    const due = m.dueProperties || {};
    const parts = [`Log ${name}${due.hasDeadline && due.dueTimeLocal ? ' by ' + due.dueTimeLocal : ''}${reward ? ' for ' + reward : ''}.`];
    if (!totalUsed) {
      totalUsed = true;
      const today = number(m.todayPoints ?? rs.todayPoints);
      if (REMINDER.includeTodayPoints && today !== null) parts.push(`You currently have ${today} points.`);
      const yesterday = number(m.yesterdayPoints ?? rs.yesterdayPoints);
      if (REMINDER.includeYesterdayPoints && yesterday !== null) parts.push(`Yesterday you finished with ${yesterday} points.`);
    }
    if (streak) parts.push(`Your current streak is ${streak} days.`);
    return parts.join(' ');
  }).join('\n');
}
function validateAction(a) {
  const string = key => {
    if (typeof a[key] !== 'string' || !a[key].trim()) throw new Error('Missing text field: ' + key);
  };
  const oneOf = (key, values) => {
    if (!values.includes(a[key])) throw new Error('Invalid ' + key + ': ' + a[key]);
  };
  const percent = () => {
    if (typeof a.percent !== 'number' || !Number.isFinite(a.percent) || a.percent < 0 || a.percent > 100)
      throw new Error('percent must be a number from 0 to 100.');
  };
  switch (a.action) {
    case 'notification':
      string('message');
      if (a.title != null && typeof a.title !== 'string') throw new Error('title must be text.');
      break;
    case 'openhabits_reminder':
    case 'task_alarm_reset':
      if (!ids(a.action === 'task_alarm_reset' ? a.taskLoopMetricIDs : a.metricIDs).length)
        throw new Error('At least one metric ID is required.');
      break;
    case 'timer':
      oneOf('operation', ['start','cancel']);
      if (a.operation === 'start' && !(typeof a.minutes === 'number' && Number.isFinite(a.minutes) && a.minutes > 0))
        throw new Error('Timer minutes must be a positive number.');
      break;
    case 'focus': string('name'); oneOf('state', ['on','off']); break;
    case 'display':
      oneOf('operation', ['color_filters','brightness','appearance']);
      if (a.operation === 'color_filters') oneOf('state', ['on','off']);
      if (a.operation === 'brightness') percent();
      if (a.operation === 'appearance') oneOf('mode', ['dark','light']);
      break;
    case 'open':
      oneOf('operation', ['app','url','home_screen','lock_screen']);
      if (a.operation === 'app') string('appName');
      if (a.operation === 'url') string('url');
      break;
    case 'audio':
      oneOf('operation', ['volume','silent_mode']);
      if (a.operation === 'volume') percent(); else oneOf('state', ['on','off']);
      break;
    case 'cue':
      oneOf('operation', ['haptic','sound']);
      if (a.operation === 'sound') string('file');
      break;
    default: throw new Error('Unknown Calendar Alarms action: ' + a.action);
  }
  if (['notification','openhabits_reminder'].includes(a.action)) {
    if (a.mode === undefined) a.mode = 'show';
    oneOf('mode', ['show','speak','both']);
  }
  return a;
}
async function action(r) {
  const a = validateAction(object(r.input));
  const p = {kind: a.action, refresh: false, speak: false, show: false, ...a};
  if (a.action === 'notification') return {...p, ...display(a.message, a.mode, r.focus, a.title || '')};
  if (a.action === 'openhabits_reminder' || a.action === 'task_alarm_reset') {
    if (a.action === 'task_alarm_reset' && r.refreshed !== true) return {...p, refresh: true};
    try {
      const initial = await cache(true);
      const age = Date.now() - Date.parse(initial.generatedAtISO);
      if (r.refreshed !== true && (initial.ok === false || !initial.reminderState?.byID || !(age >= 0 && age <= 90000)))
        return {...p, refresh: true};
      const c = await cache();
      if (a.action === 'openhabits_reminder')
        return {...p, ...display(reminder(c, ids(a.metricIDs)), a.mode, r.focus)};
      const metricsByID = ids(a.taskLoopMetricIDs).map(metricID => {
        const m = c.reminderState.byID[metricID];
        return {metricID, found: !!m && m.found !== false, complete: !!m && m.found !== false && m.complete === true};
      });
      const result = {ok: true, allComplete: metricsByID.every(m => m.complete), metricsByID};
      return {...p, ...result, engineInput: JSON.stringify(result), qrCodeID: a.qrCodeID || ''};
    } catch (e) {
      if (a.action === 'task_alarm_reset') return {...p, ok: false, allComplete: false, error: String(e)};
      return {...p, ...display('OpenHabits reminder error: ' + e.message, a.mode, r.focus)};
    }
  }
  if (a.action === 'focus') p.kind = 'focus_' + a.state;
  if (a.action === 'timer') p.kind = 'timer_' + a.operation;
  if (a.action === 'display') p.kind = a.operation === 'color_filters'
    ? 'filters_' + a.state : a.operation === 'appearance' ? 'appearance_' + a.mode : 'brightness';
  if (a.action === 'audio') p.kind = a.operation === 'volume' ? 'volume' : 'silent_' + a.state;
  if (a.action === 'open') p.kind = 'open_' + a.operation;
  if (a.action === 'cue') p.kind = a.operation;
  if (typeof a.percent === 'number') p.level = a.percent / 100;
  return p;
}
async function settingsRead() {
  const exists = fm.fileExists(path('settings.json'));
  const s = await json(path('settings.json'), {});
  return {exists, defaultInput: ids(s.disabledCalendars).join(', '),
    welcome: exists ? '' : 'Welcome to Calendar Alarms!\n\nAnswer one question here to finish install. You can run this shortcut again at any time to change this setting.'};
}
async function settingsSave(r) {
  const exists = fm.fileExists(path('settings.json'));
  const s = await json(path('settings.json'), {});
  if (r.skip !== true || !exists) {
    s.disabledCalendars = r.skip === true ? [] : ids(r.names);
    write('settings.json', JSON.stringify(s));
  }
  return {message: exists ? 'Settings updated.' : 'Install complete!'};
}
const wakeHelp = 'Warning: No "Sleep" event found.\n\nCA Wake Times lets you change your wake alarm time with one tap while moving all related alarms with it. Add this shortcut to your Home Screen for easy access.\n\nCreate a recurring event named "Sleep" that starts at bedtime, ends at wake time, and has at least one alarm referencing the event end with a 0-minute offset. Attach other wake/sleep alarms to the same event to move them together.';
function clock(d) {
  return `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2,'0')}${d.getHours() >= 12 ? 'PM' : 'AM'}`;
}
async function wakeInfo() {
  const start = new Date(Date.now() - 9 * 3600000);
  const end = new Date(Date.now() + 14 * 3600000);
  const s = await json(path('settings.json'), {});
  const disabled = ids(s.disabledCalendars);
  const events = (await CalendarEvent.between(start, end)).filter(e =>
    e.title === 'Sleep' && e.startDate >= start && e.startDate <= end && !disabled.includes(e.calendar.title));
  if (events.length !== 1) return {error: events.length ?
    `Error: ${events.length} events named "Sleep" found. There can only be one.\nPeriod: ${start.toLocaleString()} to ${end.toLocaleString()}` : wakeHelp};
  const e = events[0];
  const hours = Math.round((e.endDate.getTime() - Date.now()) / 360000) / 10;
  return {error: '', start: e.startDate.toISOString(), end: e.endDate.toISOString(), calendar: e.calendar.title,
    notification: 'Morning Alarm set to ' + clock(e.endDate),
    warning: hours < 7.5 ? `Warning, only ${hours} hours until ${clock(e.endDate)} alarm.` : ''};
}
function wakePlan(r) {
  const oldStart = new Date(r.sleep.start), end = new Date(r.sleep.end);
  const m = String(r.time).match(/^(\d{1,2}):(\d{2})$/);
  if (!m || +m[1] > 23 || +m[2] > 59) throw new Error('Wake time must be HH:mm.');
  end.setHours(+m[1], +m[2], 0, 0);
  const start = new Date(end.getTime() - 8 * 3600000);
  return {start: start.toISOString(), end: end.toISOString(), hh: end.getHours(), mm: end.getMinutes(),
    endFirst: start > oldStart, notification: 'Alarm Set for ' + clock(end), wakeTime: clock(end)};
}
async function main(r) {
  // Shortcuts may serialize a dictionary placed in a request field as JSON text.
  if ((r.op === 'qr_poll' || r.op === 'qr_permit') && typeof r.session === 'string') {
    r.session = JSON.parse(r.session);
  }
  switch (r.op) {
    case 'clock_guard': return guard();
    case 'engine_begin':
      return text(r.input) === 'Clock' ? {clock: 1, ...await guard()} : {clock: 0, ...begin(r.input)};
    case 'qr_poll': return qrOutput(await qrPoll(r.session));
    case 'qr_permit': return qrOutput(await qrPermit(r));
    case 'sound_file': return soundFile(r.file);
    case 'scanner_touch':
      write('scannerLastOpened.txt', new Date().toISOString());
      write('menuOpenStatus.txt', 'false');
      return {ok: true};
    case 'scan_input': return {code: scanInput(r.input, r.fromScan === true)};
    case 'action': return action(r);
    case 'settings_read': return settingsRead();
    case 'settings_save': return settingsSave(r);
    case 'wake_info': return wakeInfo();
    case 'wake_plan': return wakePlan(r);
    case 'wake_warning': {
      const n = Number(r.count1) + Number(r.count2);
      return {message: n ? `Warning, ${n} ${n === 1 ? 'alarm exists' : 'alarms exist'} before ${r.wakeTime}.` : ''};
    }
    default: throw new Error('Unknown runtime operation: ' + r.op);
  }
}
const result = await main(object(args.shortcutParameter));
Script.setShortcutOutput(result);
Script.complete();
