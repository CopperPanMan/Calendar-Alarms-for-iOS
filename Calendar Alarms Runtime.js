// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: orange; icon-glyph: cogs;
// Calendar Alarms Runtime.js
// Does not import, modify, or replace either existing core script.
// QR diagnostic revision: explicit numeric QR flags and stop reasons.

const REMINDER = {urgentAtMinutes: 20, criticalAtMinutes: 5,
  includeTodayPoints: true, includeYesterdayPoints: false, decimals: 1};
let fm, local, ownerPath, playbackPath, ticketPath, qrUXPath;
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
    throw new Error('File is not downloaded. Open Files to download it, then retry: ' + p);
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
  if (Array.isArray(raw) && raw.length === 0) return '';
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
  if (Date.now() >= Number(session.deadline)) return 'deadline_expired';
  // A prepared replacement does not displace a healthy player until its first
  // actual playback permit. A newer committed player still supersedes it.
  if (session.pending === true && current.id !== session.id) {
    if (!(Number(session.ticket) > 0)) return 'invalid_session';
    return Number(current.ticket || 0) >= Number(session.ticket) ? 'superseded' : '';
  }
  if (!current.id) return 'owner_missing';
  if (current.id !== session.id) return 'superseded';
  return '';
}
function owns(session) {
  return sessionStopReason(session) === '';
}
function stopped(session, reason) {
  const deadline = Number(session && session.deadline);
  return {stop: true, play: false, reason, alarmsToDelete: [],
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
function begin(raw, reliableQRHandoff = false) {
  const input = text(raw).trim();
  // Completion input is cleanup work, not a new playback owner. Preserve an
  // existing session even when a failed/malformed response was forwarded.
  if (input && input !== 'Calendar') return {completionOnly: 1, cleanInput: input};
  const previousTicket = local.fileExists(ticketPath) ? Number(local.readString(ticketPath)) : 0;
  const ticket = Math.max(Date.now(), (Number.isFinite(previousTicket) ? previousTicket : 0) + 1);
  local.writeString(ticketPath, String(ticket));
  // Preparing a replacement must not silence the working player. This applies
  // to legacy wrappers too; reliableQRHandoff only describes native Clock work.
  const session = {id: UUID.string(), deadline: Date.now() + 180000, ticket, pending: true,
    ...(reliableQRHandoff ? {reliableQRHandoff: true} : {})};
  // Ownership can change while an old native Play Sound is still running.
  // Leave its separate playback reservation intact until it expires.
  return {session, completionOnly: 0, cleanInput: ''};
}

function triggerReadyPath(id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(id))
    throw new Error('Invalid trigger action ID.');
  return local.joinPath(local.cacheDirectory(), 'calendar-alarms-trigger-ready-' + id + '.json');
}
function triggerPending(entry) {
  if (Number(entry.triggerActionsUntil) * 1000 <= Date.now()) {
    clearTriggerReady(entry);
    return false;
  }
  return entry.triggerActionID && !local.fileExists(triggerReadyPath(entry.triggerActionID));
}
function clearTriggerReady(entry) {
  if (!entry.triggerActionID) return;
  const p = triggerReadyPath(entry.triggerActionID);
  if (local.fileExists(p) && typeof local.remove === 'function') local.remove(p);
}
async function triggerCheck(raw) {
  const trigger = object(raw);
  if (!trigger.triggerKey || !trigger.triggerID) return {run: 1}; // Older core output.
  const rows = await json(path('registry.txt'), []);
  const entry = rows.find(e => `${e.alarmName}|||${e.calcFireTime}` === trigger.triggerKey &&
    e.triggerActionID === trigger.triggerID);
  if (!entry || entry.taskSatisfied) return {run: 0};
  if (!trigger.taskReset && entry.taskLoopEnabled !== false && Array.isArray(entry.taskIDs) && entry.taskIDs.length) {
    try {
      const c = await cache(true);
      if (currentTaskCache(c) && entry.taskIDs.every(id =>
        c.reminderState.byID[id]?.found !== false && c.reminderState.byID[id]?.complete === true)) return {run: 0};
    } catch (_) {} // Unavailable completion data must not suppress an alarm.
  }
  return {run: 1};
}
function triggerFinish(raw) {
  const trigger = object(raw);
  if (trigger.triggerID && trigger.hasQR !== 0)
    local.writeString(triggerReadyPath(trigger.triggerID), JSON.stringify({completedAt: Date.now()}));
  return {ok: 1};
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
function qrAlarmKey(alarm) {
  return JSON.stringify([alarm.alarmName, alarm.calcFireTime || 0,
    alarm.firstQRFireTime, alarm.qrGeneration || 0, alarm.qrCodeID]);
}
function qrCleanup(rows) {
  const protectedTimes = new Set();
  const hhmm = (entry, time, mirror) => {
    if (!(Number(entry[time]) > 0)) return '';
    if (/^\d{2}:\d{2}$/.test(entry[mirror] || '')) return entry[mirror];
    const date = new Date(Number(entry[time]) * 1000);
    return String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
  };
  for (const entry of rows) {
    const task = entry.taskLoopEnabled !== false && Array.isArray(entry.taskIDs) && entry.taskIDs.length > 0;
    const fields = [];
    if (!entry.taskSatisfied && (task || !Number(entry.firstQRFireTime))) fields.push(['nextFireTime', 'nextFireHHMM']);
    if (!entry.taskSatisfied && task) fields.push(['taskCheckFireTime', 'taskCheckHHMM']);
    if (entry.qrActive || entry.qrPending) fields.push(['qrRestartFireTime', 'qrRestartHHMM'], ['qrFallbackFireTime', 'qrFallbackHHMM']);
    for (const [time, mirror] of fields) {
      const clock = hhmm(entry, time, mirror);
      if (clock) protectedTimes.add(entry.alarmName + '|||' + clock);
    }
  }
  const result = new Map();
  for (const entry of rows) {
    if (!entry.qrActive && !entry.qrPending) clearTriggerReady(entry);
    if (entry.qrActive || entry.qrPending || !(Number(entry.firstQRFireTime) > 0)) continue;
    const fields = [['qrRestartFireTime', 'qrRestartHHMM'], ['qrFallbackFireTime', 'qrFallbackHHMM'], ['qrBackupFireTime', 'qrBackupHHMM']];
    if (entry.taskLoopEnabled === false || !Array.isArray(entry.taskIDs) || !entry.taskIDs.length) fields.push(['nextFireTime', 'nextFireHHMM']);
    for (const [time, mirror] of fields) {
      const clock = hhmm(entry, time, mirror), key = entry.alarmName + '|||' + clock;
      if (!clock || protectedTimes.has(key)) continue;
      const [hh, mm] = clock.split(':');
      result.set(key, {name: entry.alarmName, hh, mm});
    }
  }
  return Array.from(result.values());
}
// QR interaction timing. Both values are seconds and can be tuned together.
const QR_UX = Object.freeze({notificationReturnSeconds: 10, silenceSeconds: 15});
const QR_NOTIFICATION_ID = 'calendar-alarms-qr-menu-v1';
const NOTIFICATION_BUDGET_MS = 1200;
let notificationDeadline = 0;
let notificationWarning = '';

async function notificationStep(operation) {
  // Only notification-system work is optional. Registry and mute-state writes
  // remain outside this boundary and still fail their enclosing operation.
  if (notificationWarning) return false;
  let timer;
  try {
    const remaining = notificationDeadline - Date.now();
    if (!(remaining > 0)) throw new Error('Notification maintenance timed out; alarm state was preserved.');
    const work = operation();
    if (typeof Timer === 'undefined') await work;
    else await Promise.race([work, new Promise((_, reject) => {
      timer = Timer.schedule(remaining, false, () => reject(new Error(
        'Notification maintenance timed out; alarm state was preserved.')));
    })]);
    return true;
  } catch (error) {
    notificationWarning = String(error);
    recordRuntimeError('notification', error);
    return false;
  } finally { if (timer) { try { timer.invalidate(); } catch (_) {} } }
}

function qrUXState() {
  try {
    if (!local.fileExists(qrUXPath)) return {};
    const value = JSON.parse(local.readString(qrUXPath));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch (_) { return {}; }
}
function saveQRUXState(value) { local.writeString(qrUXPath, JSON.stringify(value)); }
async function removeQRNotification() {
  if (typeof Notification === 'undefined') return;
  await notificationStep(() => Notification.removePending([QR_NOTIFICATION_ID]));
  await notificationStep(() => Notification.removeDelivered([QR_NOTIFICATION_ID]));
}
function clearQRUXState() {
  // Clear the mute deadline synchronously before awaiting notification cleanup.
  if (local.fileExists(qrUXPath)) {
    saveQRUXState({});
    write('scannerLastOpened.txt', new Date(0).toISOString());
    write('menuOpenStatus.txt', 'false');
  }
  return {ok: 1, error: '', activeCount: 0};
}
async function clearQRUX() {
  const result = clearQRUXState();
  await removeQRNotification();
  return result;
}
function qrMenuDetails(rows) {
  return {ok: 1, error: '', activeCount: rows.length,
    activeName: rows.map(a => String(a.alarmName || 'QR alarm')).join(', '),
    silenceSeconds: QR_UX.silenceSeconds,
    notificationReturnSeconds: QR_UX.notificationReturnSeconds};
}
async function scheduleQRNotification(rows, state) {
  await removeQRNotification();
  // A Silence request may arrive while notification removal is awaited.
  state = qrUXState();
  saveQRUXState(state);
  const scheduledAt = Math.max(Date.now(), Number(state.reminderAt) || 0);
  await notificationStep(() => {
    if (typeof Notification === 'undefined') throw new Error('Notifications are unavailable.');
    const n = new Notification();
    n.identifier = QR_NOTIFICATION_ID;
    n.title = rows.length === 1 ? String(rows[0].alarmName || 'QR alarm') : 'QR alarms active';
    n.body = rows.length === 1
      ? 'Scan your QR code to stop the alarm. Tap for Scan or Silence for ' + QR_UX.silenceSeconds + ' seconds.'
      : 'Scan to stop: ' + rows.map(a => String(a.alarmName || 'QR alarm')).join(', ') + '. Tap for options.';
    n.sound = null;
    n.openURL = 'shortcuts://run-shortcut?name=' + encodeURIComponent('Calendar Alarms QR Scanner');
    if (Number(state.reminderAt) > Date.now()) n.setTriggerDate(new Date(Number(state.reminderAt)));
    return n.schedule();
  });
  // Registry failures are not notification failures and must remain visible.
  const current = await active();
  if (!current.length) return clearQRUX();
  return {...qrMenuDetails(current), ...(notificationWarning ? {} : {scheduledAt})};
}
async function qrUXOperationState(r) {
  // These UI operations fail separately from the alarm/sound engine.
  try {
    const rows = await active();
    if (!rows.length) return ['scanner_menu', 'scanner_scan_begin'].includes(r.op)
      ? clearQRUXState() : await clearQRUX();
    if (r.op === 'scanner_menu') {
      const state = qrUXState();
      state.reminderAt = 0;
      saveQRUXState(state);
      await removeQRNotification();
      return qrMenuDetails(rows);
    }
    if (r.op === 'scanner_silence' || r.op === 'scanner_scan_begin') {
      const state = qrUXState();
      const now = Date.now();
      state.silenceUntil = now + QR_UX.silenceSeconds * 1000;
      state.reminderAt = r.op === 'scanner_silence' ? now + QR_UX.notificationReturnSeconds * 1000 : 0;
      saveQRUXState(state);
      // Retain the existing timestamp for older shortcut flows.
      write('scannerLastOpened.txt', new Date(now).toISOString());
      write('menuOpenStatus.txt', 'false');
      if (r.op === 'scanner_silence') await scheduleQRNotification(rows, state);
      else await removeQRNotification();
      return {...qrMenuDetails(rows), silenceUntil: state.silenceUntil, reminderAt: state.reminderAt};
    }
    if (r.op === 'qr_notification') {
      if (r.cleanupOnly === true) return {...qrMenuDetails(rows), kept: 1};
      if (r.session && !owns(r.session)) return {ok: 1, skipped: 'superseded'};
      if (r.session && owner().id === r.session.id) {
        const current = owner();
        if (!current.notificationAttempted)
          local.writeString(ownerPath, JSON.stringify({...current, notificationAttempted: true}));
      }
      // An engine restart must not replace the user's ten-second return timer.
      if (Number(qrUXState().reminderAt) > Date.now()) return {...qrMenuDetails(rows), kept: 1};
    }
    return await scheduleQRNotification(rows, qrUXState());
  } catch (error) {
    recordRuntimeError(r.op, error);
    return {ok: 0, activeCount: 0, activeName: '', error: String(error)};
  }
}

async function qrUXOperation(r) {
  notificationDeadline = Date.now() + NOTIFICATION_BUDGET_MS;
  notificationWarning = '';
  const result = await qrUXOperationState(r);
  return notificationWarning ? {...result, notificationWarning} : result;
}

function releaseCompletedPlayback(session, token) {
  if (!token || !session || !local.fileExists(playbackPath)) return false;
  try {
    const reservation = JSON.parse(local.readString(playbackPath));
    // Only a completed native Play Sound can acknowledge this exact lease.
    // An old instance must never release a successor's reservation.
    if (reservation.instanceID !== session.id || reservation.playbackToken !== token) return false;
    if (!(Number(reservation.expectedEndAt) > 0)) return false;
    local.writeString(playbackPath, JSON.stringify({...reservation, expectedEndAt: 0}));
    return true;
  } catch (_) { return false; } // Keep expiry as fallback if acknowledgement fails.
}

async function acknowledgePlayback(session, token) {
  if (!releaseCompletedPlayback(session, token)) return;
  const current = owner();
  if (current.id !== session.id || current.notificationAttempted || !owns(session)) return;
  // Banner bookkeeping is optional for playback. Direct scanner operations
  // still report mute-state failures; this hook cannot stop the next clip.
  try {
    local.writeString(ownerPath, JSON.stringify({...current, notificationAttempted: true}));
    // Camera/Silence already chose its own banner behavior during this clip.
    if (Number(qrUXState().silenceUntil) > Date.now()) return;
    await qrUXOperation({op: 'qr_notification', session});
  } catch (error) { recordRuntimeError('qr_notification', error); }
}


async function qrState(session) {
  const reason = sessionStopReason(session);
  if (reason) return stopped(session, reason);
  // Read mute state first, then the registry last. A scan during an awaited
  // mute-file read must be visible in the final playback eligibility check.
  const opened = Date.parse(await read(path('scannerLastOpened.txt'), new Date(0).toISOString()));
  const rows = await json(path('registry.txt'), []);
  const alarms = rows.filter(x => x.qrActive === true).sort((a,b) =>
    (Number(a.firstQRFireTime) || 0) - (Number(b.firstQRFireTime) || 0));
  const changed = sessionStopReason(session);
  if (changed) return stopped(session, changed);
  if (!alarms.length) {
    // Optional banner cleanup cannot hide the already-known Clock cleanup.
    if (local.fileExists(qrUXPath)) await qrUXOperation({op: 'qr_notification', cleanupOnly: true});
    return {...stopped(session, 'no_active_qr_alarm'), alarmsToDelete: qrCleanup(rows)};
  }
  const age = Date.now() - opened;
  return {stop: false, play: !triggerPending(alarms[0]) && !(age >= 0 && age < 13000)
    && !(Number(qrUXState().silenceUntil) > Date.now()) && !playbackBusy(), alarm: alarms[0]};
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
function qrPlan(alarm) {
  return {fileName: qrSoundRelativePath(alarm.qrSoundPath), alarmKey: qrAlarmKey(alarm),
    volume: Math.min(1, Math.max(0, Number(alarm.qrVol ?? 40) / 100))};
}
async function qrPoll(session, completedPlaybackToken) {
  await acknowledgePlayback(session, completedPlaybackToken);
  const state = await qrState(session);
  if (state.stop) return state;
  // The initial plan is needed even during mute, trigger work or a prior clip.
  // Loading/preparation is native; no audio bytes are read by Runtime.
  const plan = qrPlan(state.alarm);
  const reason = sessionStopReason(session);
  return reason ? stopped(session, reason) : {stop: false, play: state.play, ...plan};
}
function permitPrepared(r, state, strictPreparation = false) {
  if (state.stop) return state;
  const plan = qrPlan(state.alarm);
  const reason = sessionStopReason(r.session);
  if (reason) return stopped(r.session, reason);
  const samePreparation = plan.alarmKey === r.alarmKey && (!strictPreparation ||
    (typeof r.fileName === 'string' && r.fileName === plan.fileName &&
      r.volume !== '' && r.volume != null && Number.isFinite(Number(r.volume)) &&
      Math.abs(Number(r.volume) - plan.volume) < 0.000001));
  if (!samePreparation) return {stop: false, play: false, ...plan};
  const duration = Number(r.duration);
  if (!(duration > 0 && Number.isFinite(duration)))
    throw new Error('Could not read the QR audio duration.');
  if (Date.now() + duration * 1000 + PLAYBACK_ALLOWANCE_MS >= r.session.deadline)
    return stopped(r.session, 'clip_exceeds_remaining_time');
  if (!state.play || playbackBusy()) return {stop: false, play: false, ...plan};
  if (r.session.pending === true && owner().id !== r.session.id) {
    // Transfer only when this caller has finished preparing a playable clip.
    // This does not assert that its native wrapper verified Clock fallback.
    local.writeString(ownerPath, JSON.stringify({...r.session, pending: false}));
    if (!owns(r.session)) return stopped(r.session, sessionStopReason(r.session));
  }
  const reservedAt = Date.now();
  const playbackToken = UUID.string();
  local.writeString(playbackPath, JSON.stringify({playbackToken,
    instanceID: r.session.id, alarmKey: plan.alarmKey,
    triggerID: state.alarm.triggerActionID || '', reservedAt,
    expectedEndAt: reservedAt + duration * 1000 + PLAYBACK_ALLOWANCE_MS}));
  return owns(r.session) ? {stop: false, play: true, playbackToken, ...plan}
    : stopped(r.session, sessionStopReason(r.session));
}
async function qrPermit(r) {
  return permitPrepared(r, await qrState(r.session));
}
async function qrStep(r) {
  // Acknowledge the previous native Play Sound before testing the next clip.
  // Any optional first banner runs before the final fresh state read.
  await acknowledgePlayback(r.session, r.completedPlaybackToken);
  return permitPrepared(r, await qrState(r.session), true);
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
  // Completion is optional alarm-suppression data. Never spend the extension's
  // execution window downloading an old snapshot; the native refresh owns I/O.
  if (fm.fileExists(p) && fm.isFileStoredIniCloud(p) && !fm.isFileDownloaded(p)) {
    if (optional) return {};
    throw new Error('OpenHabits cache is not downloaded. Download it in Files.');
  }
  const c = await json(p, optional ? {} : undefined);
  if (!optional && (c.ok === false || !c.reminderState?.byID))
    throw new Error('OpenHabits cache is missing a successful reminderState.byID.');
  return c;
}
function currentTaskCache(c) {
  const age = Date.now() - Date.parse(c.generatedAtISO);
  return c.ok === true && !!c.reminderState?.byID && age >= 0 && age <= 90000;
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
      if (a.alarmOccurrence !== undefined) {
        const occurrence = object(a.alarmOccurrence);
        if (typeof occurrence.alarmName !== 'string' || !occurrence.alarmName.trim() ||
            !Number.isFinite(Number(occurrence.calcFireTime)) || Number(occurrence.calcFireTime) <= 0)
          throw new Error('Invalid alarm occurrence. Task alarms were not reset.');
        a.alarmOccurrence = {alarmName: occurrence.alarmName, calcFireTime: Number(occurrence.calcFireTime)};
      }
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
    if (a.speechVolume === undefined) a.speechVolume = 50;
    if (typeof a.speechVolume !== 'number' || !Number.isFinite(a.speechVolume) || a.speechVolume < 0 || a.speechVolume > 100)
      throw new Error('speechVolume must be a number from 0 to 100.');
  }
  return a;
}
async function action(r) {
  const a = validateAction(object(r.input));
  const p = {kind: a.action, refresh: false, speak: false, show: false, ...a};
  if (['notification','openhabits_reminder'].includes(a.action)) p.speechLevel = a.speechVolume / 100;
  if (a.action === 'notification') return {...p, ...display(a.message, a.mode, r.focus, a.title || '')};
  if (a.action === 'openhabits_reminder' || a.action === 'task_alarm_reset') {
    if (a.action === 'task_alarm_reset' && r.refreshed !== true) return {...p, refresh: true};
    try {
      if (r.refreshed === true && r.cacheOK !== undefined && Number(r.cacheOK) !== 1)
        throw new Error('Cache refresh failed. Task alarms were not reset.');
      const initial = await cache(true);
      if (r.refreshed !== true && !currentTaskCache(initial))
        return {...p, refresh: true};
      if (r.refreshed === true && !currentTaskCache(initial))
        throw new Error('Cache refresh failed or returned an outdated snapshot. Task alarms were not reset.');
      const c = initial;
      if (a.action === 'openhabits_reminder')
        return {...p, ...display(reminder(c, ids(a.metricIDs)), a.mode, r.focus)};
      const metricsByID = ids(a.taskLoopMetricIDs).map(metricID => {
        const m = c.reminderState.byID[metricID];
        return {metricID, found: !!m && m.found !== false, complete: !!m && m.found !== false && m.complete === true};
      });
      const vd = c.virtualDay || {};
      const scope = vd.enabled === true && Number.isFinite(Date.parse(vd.windowStartISO)) &&
        Date.parse(vd.windowEndISO) > Date.parse(vd.windowStartISO)
        ? {windowStartISO: vd.windowStartISO, windowEndISO: vd.windowEndISO,
          timezone: vd.timezone || c.timezone || ''}
        : {evaluatedAtISO: c.generatedAtISO, timezone: c.timezone || ''};
      const result = {ok: true, allComplete: metricsByID.every(m => m.complete), metricsByID,
        completionScope: scope, ...(a.alarmOccurrence ? {alarmOccurrence: a.alarmOccurrence} : {})};
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
  const start = new Date(Date.now() - 10 * 3600000);
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
  const duration = end.getTime() - oldStart.getTime();
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Sleep event duration must be positive.');
  const m = String(r.time).match(/^(\d{1,2}):(\d{2})$/);
  if (!m || +m[1] > 23 || +m[2] > 59) throw new Error('Wake time must be HH:mm.');
  end.setHours(+m[1], +m[2], 0, 0);
  const start = new Date(end.getTime() - duration);
  return {start: start.toISOString(), end: end.toISOString(), hh: end.getHours(), mm: end.getMinutes(),
    endFirst: start > oldStart, notification: 'Alarm Set for ' + clock(end), wakeTime: clock(end)};
}
async function main(r) {
  // Shortcuts may serialize a dictionary placed in a request field as JSON text.
  if ((r.op === 'qr_poll' || r.op === 'qr_permit' || r.op === 'qr_step' || r.op === 'qr_notification') && typeof r.session === 'string') {
    r.session = JSON.parse(r.session);
  }
  switch (r.op) {
    case 'clock_guard': return guard();
    case 'engine_begin':
      return text(r.input) === 'Clock' ? {clock: 1, ...await guard()}
        : {clock: 0, ...begin(r.input, r.reliableQRHandoff === true)};
    case 'qr_poll': return qrOutput(await qrPoll(r.session, r.completedPlaybackToken));
    case 'qr_permit': return qrOutput(await qrPermit(r));
    case 'qr_step': return qrOutput(await qrStep(r));
    case 'trigger_check': return triggerCheck(r.trigger);
    case 'trigger_finish': return triggerFinish(r.trigger);
    case 'sound_file': return soundFile(r.file);
    case 'qr_notification':
    case 'scanner_menu':
    case 'scanner_silence':
    case 'scanner_scan_begin':
    case 'scanner_scan_finished': return qrUXOperation(r);
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
const invocationStartedAt = Date.now();
function recordRuntimeError(op, error) {
  try {
    if (local) local.writeString(local.joinPath(local.cacheDirectory(), 'calendar-alarms-last-error-v1.json'),
      JSON.stringify({op: String(op || 'startup'), at: new Date().toISOString(),
        elapsedMs: Date.now() - invocationStartedAt, error: String(error)}));
  } catch (_) {} // Diagnostics must never replace the original failure.
}
let request, result;
try {
  fm = FileManager.iCloud();
  local = FileManager.local();
  ownerPath = local.joinPath(local.cacheDirectory(), 'calendar-alarms-loop-owner-v1.json');
  playbackPath = local.joinPath(local.cacheDirectory(), 'calendar-alarms-playback-v1.json');
  ticketPath = local.joinPath(local.cacheDirectory(), 'calendar-alarms-loop-ticket-v1.txt');
  qrUXPath = local.joinPath(local.cacheDirectory(), 'calendar-alarms-qr-menu-v1.json');
  request = object(args.shortcutParameter);
  result = await main(request);
} catch (error) {
  const op = request && request.op || 'startup';
  recordRuntimeError(op, error);
  result = {ok: 0, error: String(error), failedOp: op, stop: 1, play: 0,
    reason: 'runtime_error', alarmsToDelete: [], code: '', activeCount: 0,
    activeName: '', notification: String(error), message: String(error),
    show: true, speak: false, refresh: false, kind: 'error'};
}
// Native Shortcuts must branch on a number, not an absent/empty text value:
// normal stops and successful notification maintenance intentionally have no error.
// Preserve the existing plain-path output of sound_file.
if (result && typeof result === 'object' && !Array.isArray(result))
  result = {...result, hasError: String(result.error ?? '').trim().length > 0 ? 1 : 0};
Script.setShortcutOutput(result);
Script.complete();
