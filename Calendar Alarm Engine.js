const DELETE_DUPLICATE_ALARMS = true;

// Set DELETE_DUPLICATE_ALARMS to false to preserve same-name alarms at the same time.


// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: red; icon-glyph: magic;
// Calendar Alarms Engine — independent QR and task schedules (v2)
//
// QR restart (+2m), fallback (+4m), and task checks have independent deadlines.
// QR-only fires restart playback without consuming task reschedules or running
// task-trigger actions. Coincident purposes share one native Clock alarm.
// nextFireTime remains the task pointer for compatibility with the unchanged
// QR Scanner. qrBackupFireTime aliases only a fallback that is not also a task
// check, so scanning cannot delete a shared task alarm. The Engine playback
// stop path deletes the additional QR restart after a scan.
// Retired Clock times remain owned until a later alarm snapshot confirms removal.

// Input: args.shortcutParameter string: labels + ":;:" + hours + ":;:" + minutes + ":;:" + currentFocus + ":;:" + task log JSON
// Output: JSON string set via Script.setShortcutOutput()

const CALENDAR_ALARMS_ACTIONS = "Calendar Alarms Actions";
const DELIM = ":;:";

// Path config
// This expects one Scriptable file bookmark:
// - "Shortcuts" -> iCloud Drive/Shortcuts
const SHORTCUTS_BOOKMARK_NAME = "Shortcuts";
const OPENHABITS_DIRNAME = "OpenHabits";
const CALENDAR_ALARMS_DIRNAME = "Calendar Alarms";
const OPENHABITS_METRICS_DIRNAME = "OpenHabits Metrics";

const LOCKOUT_CACHE_FILENAME = "lockoutCache.json";
const SETTINGS_FILENAME = "settings.json";

// Constants
const CONFLICT_BUFFER_MIN = 10;
const LOCK_STALE_SEC = 30;
const LOCK_RETRY_DELAY_MS = 500;
const LOCK_HARD_TIMEOUT_MS = 30000;

const WINDOW_PAST_SEC = 60 * 60;        // now - 1h
const WINDOW_FUTURE_SEC = 24 * 60 * 60; // now + 24h
const TTL_HARD_SEC = 24 * 60 * 60;      // calcFireTime older than 24h => purge
const QR_TIMEOUT_SEC = 60 * 60;         // qrActive for >60m => purge
const QR_LOOP_MINUTES = 2;              // 1/2/3 minute loop interval (dev-tunable)
const QR_LOOP_INTERVAL_SEC = QR_LOOP_MINUTES * 60;
const QR_BACKUP_MULTIPLIER = 2;
const QR_BACKUP_INTERVAL_SEC = QR_LOOP_INTERVAL_SEC * QR_BACKUP_MULTIPLIER;
const RESCHED_CLAMP_FUTURE_SEC = 4 * 60 * 60;
const LOCATION_CACHE_KEY = "calendar_alarms_last_location_v1";
const LOCATION_TIMEOUT_MS = 4500;
const LOCATION_MAX_ATTEMPTS = 2;
const FIRED_ALARM_GRACE_SEC = 15 * 60;
let registryMigrationNeeded = false;

const FILES = {
  registry: "registry.txt",
  lock: "registryLock.txt",
  scannerLastOpened: "scannerLastOpened.txt",
  menuLastOpened: "menuLastOpened.txt",
  menuOpenStatus: "menuOpenStatus.txt",
};

const errors = [];
const ZERO_WIDTH_RE = /[\u200B-\u200D\uFEFF]/g;

function addError(line) {
  if (line === null || typeof line === "undefined") return;

  // remove zero-width chars, then ignore if it's effectively empty
  const s = String(line).replace(ZERO_WIDTH_RE, "");
  if (s.trim() === "") return;

  errors.push(s);
}

const output = {
  alarmsToDelete: [],
  alarmsToAdd: [],
  triggerShortcutsToRun: [],
  triggerShortcutsToRunDetailed: [],
  qrLoop: false,
  nextLoopStart: "",
  debug: {},
  errorRegistry: "",
};

let lockoutCachePath = "";
let lockoutCachePathAttempted = false;
let disabledCalendarNames = [];

function normalizeShortcutInputArray(raw) {
  if (Array.isArray(raw)) {
    return raw
      .map((x) => String(x ?? "").trim())
      .filter((x) => x !== "");
  }
  if (typeof raw === "string") {
    const s = raw.trim();
    return s ? [s] : [];
  }
  return [];
}

function normalizeShortcutAction(raw) {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    const input = normalizeShortcutInputArray(raw.input);
    const silenceAlarm = raw.silenceAlarm === true;
    return { name, input, silenceAlarm };
  }
  return { name: "", input: [], silenceAlarm: false };
}

function normalizeShortcutActionList(raw) {
  if (Array.isArray(raw)) {
    return raw
      .map((x) => normalizeShortcutAction(x))
      .filter((x) => x.name);
  }

  const single = normalizeShortcutAction(raw);
  return single.name ? [single] : [];
}

function queueTriggerShortcut(raw) {
  const action = normalizeShortcutAction(raw);
  if (!action.name) return;
  output.triggerShortcutsToRun.push(action.name);
  output.triggerShortcutsToRunDetailed.push(action);
}

function queueTriggerShortcuts(rawList) {
  const actions = normalizeShortcutActionList(rawList);
  for (const action of actions) queueTriggerShortcut(action);
}

function setLocationDebug(details) {
  if (!details) return;
  output.debug.location = details;
}

function readLocationCache() {
  try {
    if (!Keychain.contains(LOCATION_CACHE_KEY)) return null;
    const parsed = safeJSONParse(Keychain.get(LOCATION_CACHE_KEY));
    if (!parsed.ok || !parsed.val) return null;
    const { lat, lon, ts } = parsed.val;
    if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon))) return null;
    return { lat: Number(lat), lon: Number(lon), ts: Number(ts), cached: true };
  } catch (e) {
    addError(`WARN: failed to read location cache (${String(e)})`);
    return null;
  }
}

function writeLocationCache(loc) {
  try {
    const payload = {
      lat: loc.latitude,
      lon: loc.longitude,
      acc: loc.horizontalAccuracy,
      ts: new Date().toISOString(),
    };
    Keychain.set(LOCATION_CACHE_KEY, JSON.stringify(payload));
    return payload;
  } catch (e) {
    addError(`WARN: failed to write location cache (${String(e)})`);
    return null;
  }
}

async function withTimeout(promise, ms) {
  let timer = null;
  const timeoutPromise = new Promise((_, reject) => {
    timer = Timer.schedule(ms / 1000, false, () => {
      reject(new Error(`TIMEOUT_AFTER_${ms}MS`));
    });
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    if (timer) timer.invalidate();
    return result;
  } catch (e) {
    if (timer) timer.invalidate();
    throw e;
  }
}

function sleep(ms) {
  const seconds = Math.max(0, Number(ms) / 1000);
  return new Promise((resolve) => {
    Timer.schedule(seconds, false, () => resolve());
  });
}

function nowEpoch() {
  return Math.floor(Date.now() / 1000);
}

function floorToMinute(epochSec) {
  return Math.floor(epochSec / 60) * 60;
}

function pad2(n) {
  const s = String(Math.trunc(n));
  return s.length === 1 ? "0" + s : s;
}

function epochToHHMM(epochSec) {
  const d = new Date(epochSec * 1000);
  return { hh: pad2(d.getHours()), mm: pad2(d.getMinutes()) };
}

function epochToHHMMString(epochSec) {
  const { hh, mm } = epochToHHMM(epochSec);
  return `${hh}:${mm}`;
}

function parseHHMMString(s) {
  const t = String(s ?? "").trim();
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;

  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;

  return { hh: pad2(h), mm: pad2(min) };
}

function epochTo12HourTime(epochSec) {
  const d = new Date(epochSec * 1000);
  const hours24 = d.getHours();
  const minutes = d.getMinutes();
  const suffix = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${pad2(minutes)} ${suffix}`;
}

function epochToShortcutTimestamp(epochSec) {
  if (!Number.isFinite(epochSec) || epochSec <= 0) return "";
  return new Date(epochSec * 1000).toISOString();
}

function hhmmToClosestEpoch(hh, mm, nowSec) {
  const h = Number(hh), m = Number(mm);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;

  const base = new Date(nowSec * 1000);
  const today = new Date(base);
  today.setSeconds(0, 0);
  today.setHours(h, m, 0, 0);

  const cand = [
    Math.floor(today.getTime() / 1000),
    Math.floor((today.getTime() - 86400 * 1000) / 1000),
    Math.floor((today.getTime() + 86400 * 1000) / 1000),
  ];

  let best = cand[0], bestDist = Math.abs(cand[0] - nowSec);
  for (let i = 1; i < cand.length; i++) {
    const dist = Math.abs(cand[i] - nowSec);
    if (dist < bestDist) {
      best = cand[i];
      bestDist = dist;
    }
  }
  return best;
}

function formatEventDateShort(date) {
  const d = date instanceof Date ? date : new Date(date);
  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const month = monthNames[d.getMonth()] ?? "";
  const day = d.getDate();
  return month ? `${month} ${day}` : String(day);
}

function safeJSONParse(str) {
  try {
    return { ok: true, val: JSON.parse(str) };
  } catch (e) {
    return { ok: false, err: String(e) };
  }
}

async function getEnabledAlarmSourceCalendars() {
  const disabled = Array.isArray(disabledCalendarNames)
    ? disabledCalendarNames
      .map((name) => String(name ?? "").trim())
      .filter((name) => name.length > 0)
    : [];

  if (!disabled.length) return null; // null => include all calendars

  try {
    const allCals = await Calendar.forEvents();
    const disabledSet = new Set(disabled);
    const allTitles = new Set(allCals.map((cal) => String(cal.title ?? "")));

    for (const title of disabled) {
      if (!allTitles.has(title)) {
        addError(`WARN: settings.json disabledCalendars calendar not found: "${title}"`);
      }
    }

    const selected = allCals.filter((cal) => !disabledSet.has(String(cal.title ?? "")));

    if (!selected.length) {
      addError("WARN: settings.json disabledCalendars excludes all calendars; no calendar alarms will be scheduled.");
    }

    return selected;
  } catch (e) {
    addError(`WARN: failed to load calendar list; falling back to all calendars. (${String(e)})`);
    return null;
  }
}

async function fetchEventsForAlarmSource(start, end) {
  const selectedCalendars = await getEnabledAlarmSourceCalendars();
  if (selectedCalendars === null) {
    return CalendarEvent.between(start, end);
  }
  if (!selectedCalendars.length) return [];
  return CalendarEvent.between(start, end, selectedCalendars);
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// Extract first JSON array substring from arbitrary notes text.
function extractFirstAlarmJSONArraySubstring(text) {
  if (!text || typeof text !== "string") return null;

  const looksLikeAlarmArray = (arr) => {
    if (!Array.isArray(arr)) return false;
    if (arr.length === 0) return true;
    // must contain at least one non-array object
    return arr.some((x) => x && typeof x === "object" && !Array.isArray(x));
  };

  let start = text.indexOf("[");
  while (start !== -1) {
    let depth = 0;
    let inStr = false;
    let esc = false;

    for (let i = start; i < text.length; i++) {
      const ch = text[i];

      if (inStr) {
        if (esc) { esc = false; continue; }
        if (ch === "\\") { esc = true; continue; }
        if (ch === '"') { inStr = false; continue; }
        continue;
      } else {
        if (ch === '"') { inStr = true; continue; }
        if (ch === "[") { depth++; continue; }
        if (ch === "]") {
          depth--;
          if (depth === 0) {
            const sub = text.slice(start, i + 1);
            const p = safeJSONParse(sub);
            if (p.ok && looksLikeAlarmArray(p.val)) return sub;
            break; // not a valid alarm array; search next '['
          }
          continue;
        }
      }
    }

    start = text.indexOf("[", start + 1);
  }

  return null;
}


// ---------- File / Bookmark ----------
function getFileManager() {
  return FileManager.iCloud();
}

function resolveShortcutsRootOrThrow(fm) {
  let p = null;
  try {
    if (typeof fm.bookmarkedPath === "function") {
      p = fm.bookmarkedPath(SHORTCUTS_BOOKMARK_NAME);
    }
  } catch (_) {}
  try {
    if (!p && typeof FileManager.bookmarkedPath === "function") {
      p = FileManager.bookmarkedPath(SHORTCUTS_BOOKMARK_NAME);
    }
  } catch (_) {}

  if (!p || typeof p !== "string" || !p.trim()) {
    throw new Error(
      `Missing Scriptable File Bookmark "${SHORTCUTS_BOOKMARK_NAME}". Create it pointing to iCloud Drive/Shortcuts.`
    );
  }

  // Trust the folder selected for the bookmark instead of checking its path's
  // last component. iOS exposes app-owned iCloud folders by their physical
  // container path, where the Files folder shown as "Shortcuts" can end in
  // "Documents". The bookmark name is therefore the stable identifier; the
  // basename of the security-scoped path is not.
  return p;
}

function resolveOpenHabitsDirs(fm, shortcutsRoot) {
  const openHabitsDir = fm.joinPath(shortcutsRoot, OPENHABITS_DIRNAME);
  return {
    calendarAlarms: fm.joinPath(openHabitsDir, CALENDAR_ALARMS_DIRNAME),
    metrics: fm.joinPath(openHabitsDir, OPENHABITS_METRICS_DIRNAME),
  };
}

function ensureLockoutCachePathInitialized() {
  if (lockoutCachePath) return lockoutCachePath;
  if (lockoutCachePathAttempted) return "";

  lockoutCachePathAttempted = true;

  try {
    const shortcutsRoot = resolveShortcutsRootOrThrow(fm);
    const dirs = resolveOpenHabitsDirs(fm, shortcutsRoot);
    lockoutCachePath = fm.joinPath(dirs.metrics, LOCKOUT_CACHE_FILENAME);
    return lockoutCachePath;
  } catch (e) {
    addError(`ERR: ${String(e)}`);
    return "";
  }
}

async function ensureFile(fm, path, defaultContent) {
  try {
    if (!fm.fileExists(path)) {
      fm.writeString(path, defaultContent);
    }
  } catch (e) {
    addError(`ERR: ensureFile failed (${path}): ${String(e)}`);
  }
}

async function safeReadString(fm, path, fallback) {
  try {
    if (!fm.fileExists(path)) return fallback;
    if (fm.isFileStoredIniCloud && fm.isFileStoredIniCloud(path)) {
      if (!fm.isFileDownloaded(path)) {
        await fm.downloadFileFromiCloud(path);
      }
    }
    return fm.readString(path);
  } catch (e) {
    addError(`ERR: read failed (${path}): ${String(e)}`);
    return fallback;
  }
}

async function loadDisabledCalendarNames(fm, settingsPath) {
  const raw = await safeReadString(fm, settingsPath, "{}");
  const parsed = safeJSONParse(raw);

  if (!parsed.ok || !parsed.val || typeof parsed.val !== "object" || Array.isArray(parsed.val)) {
    addError(`WARN: settings.json is not a valid JSON dictionary; all calendars will be included. (${parsed.err ?? "invalid root value"})`);
    return [];
  }

  if (typeof parsed.val.disabledCalendars === "undefined") return [];
  if (!Array.isArray(parsed.val.disabledCalendars)) {
    addError("WARN: settings.json disabledCalendars must be a list; all calendars will be included.");
    return [];
  }

  return parsed.val.disabledCalendars;
}

async function safeWriteString(fm, path, content) {
  try {
    fm.writeString(path, content);
    return true;
  } catch (e) {
    addError(`ERR: write failed (${path}): ${String(e)}`);
    return false;
  }
}

// ---------- Locking ----------
async function acquireLock(fm, lockPath) {
  const myId = `${nowEpoch()}-${Math.floor(Math.random() * 1e9)}`;
  const startMs = Date.now();

  while (Date.now() - startMs < LOCK_HARD_TIMEOUT_MS) {
    const raw = await safeReadString(fm, lockPath, "");
    let lockObj = null;

    if (raw && raw.trim()) {
      const p = safeJSONParse(raw);
      if (p.ok && p.val && typeof p.val === "object") {
        lockObj = p.val;
      } else {
        addError("WARN: registryLock.txt corrupt; treating as stale.");
        lockObj = null;
      }
    }

    const now = nowEpoch();
    const ts = Number(lockObj?.timestamp ?? 0);
    const age = now - ts;

    if (lockObj && Number.isFinite(ts) && age >= 0 && age < LOCK_STALE_SEC) {
      await sleep(LOCK_RETRY_DELAY_MS);
      continue;
    }

    const claim = { id: myId, timestamp: now };
    await safeWriteString(fm, lockPath, JSON.stringify(claim));

    await sleep(LOCK_RETRY_DELAY_MS);
    const verifyRaw = await safeReadString(fm, lockPath, "");
    const verify = safeJSONParse(verifyRaw);
    if (verify.ok && verify.val && verify.val.id === myId) {
      return { ok: true, id: myId };
    }
  }

  addError("ERR: registry lock timeout (30s). No registry write performed.");
  return { ok: false, id: null };
}

async function releaseLock(fm, lockPath) {
  await safeWriteString(fm, lockPath, "");
}

// ---------- Input parsing (index-aligned) ----------
// New input shape (still delimiter-based):
// labels:;:hours:;:minutes:;:currentFocus:;:taskLogResponseJSON
function parseEngineInput(inputStr) {
  const raw = String(inputStr ?? "");
  const parts = raw.split(DELIM);

  const labelsPart = parts[0] ?? "";
  const hoursPart  = parts[1] ?? "";
  const minsPart   = parts[2] ?? "";
  const focusPart  = parts[3] ?? "";
  // Rejoin in case a free-form message in the JSON happens to contain DELIM.
  const taskLogResponsePart = parts.length > 4 ? parts.slice(4).join(DELIM) : "";

  const labels = labelsPart.split("\n");
  const hours  = hoursPart.split("\n");
  const mins   = minsPart.split("\n");

  const n = Math.max(labels.length, hours.length, mins.length);
  const iosAlarms = [];

  for (let i = 0; i < n; i++) {
    const name = labels[i] ?? "";
    const hhRaw = hours[i] ?? "";
    const mmRaw = mins[i] ?? "";

    if (!name) continue;
    const hhNum = Number(hhRaw), mmNum = Number(mmRaw);
    if (!Number.isFinite(hhNum) || !Number.isFinite(mmNum)) continue;

    const hh = pad2(hhNum);
    const mm = pad2(mmNum);
    if (!/^\d{2}$/.test(hh) || !/^\d{2}$/.test(mm)) continue;

    iosAlarms.push({ name, hh, mm });
  }

  return {
    iosAlarms,
    currentFocus: String(focusPart ?? "").trim(),
    taskLogResponseRaw: String(taskLogResponsePart ?? "").trim(),
    currentLocation: null,
    locationAttempted: false,
  };
}

function getCompletedTaskMetricIDs(taskLogResponseRaw) {
  const raw = String(taskLogResponseRaw ?? "").trim();
  if (!raw) return { ids: [], error: "" };

  let response;
  try {
    response = JSON.parse(raw);
  } catch (e) {
    return { ids: [], error: `invalid task log response JSON (${String(e)})` };
  }

  if (!response || typeof response !== "object" || Array.isArray(response)) {
    return { ids: [], error: "task log response must be a JSON object" };
  }
  if (response.ok === false) return {ids: [], error: "task log response reported failure"};
  if (!Array.isArray(response.metricsByID)) {
    return { ids: [], error: "task log response missing metricsByID array" };
  }

  const ids = [];
  const seen = new Set();
  for (const metric of response.metricsByID) {
    if (!metric || typeof metric !== "object" || metric.found === false || metric.complete !== true) continue;
    const metricID = String(metric.metricID ?? "").trim();
    if (!metricID || seen.has(metricID)) continue;
    seen.add(metricID);
    ids.push(metricID);
  }
  return { ids, error: "" };
}

async function applyTaskLogCompletions(input, registryAfter) {
  const parsed = getCompletedTaskMetricIDs(input.taskLogResponseRaw);
  if (parsed.error) {
    addError(`WARN: ${parsed.error}; task loops were not reset.`);
    return;
  }
  if (!parsed.ids.length) return;
  const report = JSON.parse(input.taskLogResponseRaw);
  const explicitlyIncomplete = new Set(report.metricsByID.filter((m) => m && m.complete !== true)
    .map((m) => String(m.metricID || "").trim()));
  const completedIDs = new Set(parsed.ids);
  for (const entry of registryAfter) {
    const taskIDs = Array.isArray(entry?.taskIDs)
      ? entry.taskIDs.map((x) => String(x ?? "").trim()).filter(Boolean) : [];
    if (!taskIDs.length || !taskIDs.some((id) => completedIDs.has(id))) continue;
    if (taskIDs.some((id) => explicitlyIncomplete.has(id))) continue;
    const remainingIDs = taskIDs.filter((id) => !completedIDs.has(id));
    if (remainingIDs.length && !await checkTaskIDsCompleteFailOpen(remainingIDs)) continue;
    const previous = ownedAlarmSlots(entry, true);
    entry.taskSatisfied = true;
    entry.taskCheckFirstFireHandled = true;
    setTaskCheck(entry, 0);
    cancelQRLoop(entry);
    retireReplacedAlarms(entry, previous, input.iosAlarms);
  }
}

function findIOSMatches(iosAlarms, name, hh, mm) {
  let count = 0;
  for (const a of iosAlarms) {
    if (a.name === name && a.hh === hh && a.mm === mm) count++;
  }
  return count;
}

function queueDeleteIOSIfUnique(iosAlarms, name, epochSec) {
  return queueDeleteIOSByStoredHHMMIfUnique(iosAlarms, name, "", epochSec);
}

function queueDeleteIOSByStoredHHMMIfUnique(iosAlarms, name, storedHHMM, fallbackEpochSec) {
  let hhmm = parseHHMMString(storedHHMM);

  if (!hhmm && Number.isFinite(Number(fallbackEpochSec)) && Number(fallbackEpochSec) > 0) {
    hhmm = epochToHHMM(fallbackEpochSec);
  }

  if (!hhmm) return false;

  const c = findIOSMatches(iosAlarms, name, hhmm.hh, hhmm.mm);
  if (c === 1 || (c > 1 && DELETE_DUPLICATE_ALARMS)) {
    output.alarmsToDelete.push({ name, hh: hhmm.hh, mm: hhmm.mm });
    return true;
  }
  if (c > 1) addError(`ERR: duplicate iOS alarms found (won't delete): "${name}" @ ${hhmm.hh}:${hhmm.mm}`);
  return false;
}

function queueAddIOSIfMissing(iosAlarms, name, epochSec) {
  const { hh, mm } = epochToHHMM(epochSec);
  const c = findIOSMatches(iosAlarms, name, hh, mm);
  if (c === 0) {
    output.alarmsToAdd.push({ name, time: epochTo12HourTime(epochSec) });
    return true;
  }
  if (c > 1 && DELETE_DUPLICATE_ALARMS) {
    // Shortcuts deletes every alarm matching this name and time. Re-add one
    // canonical occurrence after removing the duplicated set.
    output.alarmsToDelete.push({ name, hh, mm });
    output.alarmsToAdd.push({ name, time: epochTo12HourTime(epochSec) });
    return true;
  }
  if (c > 1) addError(`ERR: duplicate iOS alarms exist (won't add): "${name}" @ ${hh}:${mm}`);
  return false;
}

function refreshNextFireHHMMAndDeleteStaleIOS(iosAlarms, entry) {
  const next = Number(entry?.nextFireTime ?? 0);
  if (!Number.isFinite(next) || next <= 0) {
    entry.nextFireHHMM = "";
    return;
  }

  const desiredHHMM = epochToHHMMString(next);
  const stored = parseHHMMString(entry.nextFireHHMM);
  if (stored && `${stored.hh}:${stored.mm}` !== desiredHHMM) {
    queueDeleteIOSByStoredHHMMIfUnique(iosAlarms, entry.alarmName, entry.nextFireHHMM, next);
  }
  entry.nextFireHHMM = desiredHHMM;
}

function dedupeOutputOps() {
  const seenDel = new Set();
  output.alarmsToDelete = output.alarmsToDelete.filter((a) => {
    const k = `${a.name}|||${a.hh}|||${a.mm}`;
    if (seenDel.has(k)) return false;
    seenDel.add(k);
    return true;
  });

  const seenAdd = new Set();
  output.alarmsToAdd = output.alarmsToAdd.filter((a) => {
    const k = `${a.name}|||${a.time}`;
    if (seenAdd.has(k)) return false;
    seenAdd.add(k);
    return true;
  });

  const seenTD = new Set();
  const td = [];
  for (const a of output.triggerShortcutsToRunDetailed) {
    const spec = normalizeShortcutAction(a);
    if (!spec.name) continue;
    const k = `${spec.name}|||${JSON.stringify(spec.input)}|||${spec.silenceAlarm ? 1 : 0}`;
    if (seenTD.has(k)) continue;
    seenTD.add(k);
    td.push(spec);
  }
  output.triggerShortcutsToRun = td.map((a) => a.name);
  output.triggerShortcutsToRunDetailed = td.map((a) => ({ name: a.name, input: a.input }));
}

// ---------- Calendar alarm normalization ----------
function normalizeCalendarAlarmObject(rawObj) {
  const errPrefix = `Alarm validation: `;
  if (!rawObj || typeof rawObj !== "object") return { ok: false, err: `${errPrefix}not an object` };

  const alarmName = rawObj.alarmName;
  if (typeof alarmName !== "string" || alarmName.trim() === "") {
    return { ok: false, err: `${errPrefix}missing/invalid alarmName` };
  }

  const upper = (v, def) => (typeof v === "string" ? v.trim().toUpperCase() : def);
  const lower = (v, def) => (typeof v === "string" ? v.trim().toLowerCase() : def);
  const intInRange = (v, def, min, max) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return def;
    const i = Math.trunc(n);
    if (i < min || i > max) return def;
    return i;
  };
  const offsetMinInRange = (v, def, min, max) => {
    let minutes;
    if (typeof v === "string") {
      const trimmed = v.trim();
      const unitMatch = trimmed.match(/^([+-]?)(\d+)([hdm])$/i);
      if (unitMatch) {
        const sign = unitMatch[1] === "-" ? -1 : 1;
        const amount = Number(unitMatch[2]);
        const unit = unitMatch[3].toLowerCase();
        const multiplier = unit === "h" ? 60 : unit === "d" ? 1440 : 1;
        minutes = sign * amount * multiplier;
      } else if (trimmed !== "") {
        const numeric = Number(trimmed);
        if (Number.isFinite(numeric)) minutes = Math.trunc(numeric);
      }
    } else if (Number.isFinite(Number(v))) {
      minutes = Math.trunc(Number(v));
    }
    if (!Number.isFinite(minutes)) return def;
    if (minutes < min || minutes > max) return def;
    return minutes;
  };
  const num = (v, def) => (Number.isFinite(Number(v)) ? Number(v) : def);

  const status = upper(rawObj.status, "ON");
  if (status !== "ON" && status !== "OFF") return { ok: false, err: `${errPrefix}status must be ON/OFF` };

  const reference = lower(rawObj.reference, "start");
  if (reference !== "start" && reference !== "end") return { ok: false, err: `${errPrefix}reference must be start/end` };

  const offsetMin = offsetMinInRange(rawObj.offsetMin, 0, -10080, 10080);

  const qrCodeID = typeof rawObj.qrCodeID === "string" ? rawObj.qrCodeID.trim() : "";
  if (qrCodeID.includes(" ")) return { ok: false, err: `${errPrefix}qrCodeID must not contain spaces` };

  const qrSoundPath = typeof rawObj.qrSoundPath === "string" ? rawObj.qrSoundPath : "ringtone.mp3";
  const qrSoundLen = num(rawObj.qrSoundLen, 2.13);
  const qrVol = intInRange(rawObj.qrVol, 40, 1, 100);

  const qrShortcutsOnScan = normalizeShortcutActionList(rawObj.qrShortcutsOnScan ?? rawObj.qrShortcutOnScan);
  const shortcutsOnTrigger = normalizeShortcutActionList(rawObj.shortcutsOnTrigger ?? rawObj.shortcutOnTrigger);
  const silenceAlarm = rawObj.silenceAlarm === true || shortcutsOnTrigger.some((x) => x.silenceAlarm === true);

  const locationMode = lower(rawObj.locationMode, "off");
  if (!["off", "whitelist", "blacklist"].includes(locationMode)) {
    return { ok: false, err: `${errPrefix}locationMode must be off/whitelist/blacklist` };
  }

  let locations = [];
  if (Array.isArray(rawObj.locations)) {
    const tmp = [];
    for (const pair of rawObj.locations) {
      if (!Array.isArray(pair) || pair.length < 2) continue;
      const lat = Number(pair[0]), lon = Number(pair[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      let radiusMeters = Number(pair[2]);
      if (!Number.isFinite(radiusMeters)) radiusMeters = Number(rawObj.radiusMeters);
      if (!Number.isFinite(radiusMeters)) radiusMeters = 50;
      const radius = Math.min(500, Math.max(1, Math.trunc(radiusMeters)));
      tmp.push([lat, lon, radius]);
    }
    locations = tmp;
  }

  const radiusMeters = intInRange(rawObj.radiusMeters, 50, 1, 500);

  const silenceIfDriving = upper(rawObj.silenceIfDriving, "OFF");
  if (silenceIfDriving !== "ON" && silenceIfDriving !== "OFF") {
    return { ok: false, err: `${errPrefix}silenceIfDriving must be ON/OFF` };
  }

  const conflictingCalendars = Array.isArray(rawObj.conflictingCalendars)
    ? rawObj.conflictingCalendars.filter((x) => typeof x === "string" && x.trim())
    : [];

  const parseReschedMinutes = (v) => {
    // Backward compatible:
    // - number => { min: number, max: 45 }
    // - object => { min, max }
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const min = intInRange(v.min, 0, 0, 500);
      const maxRaw = intInRange(v.max, 45, 0, 500);
      return { min, max: Math.max(min, maxRaw) };
    }
    const min = intInRange(v, 0, 0, 500);
    return { min, max: Math.max(min, 45) };
  };

  const reschedMinutes = parseReschedMinutes(rawObj.reschedMinutes);
  const taskLoopMin = intInRange(rawObj.taskLoopMin, 0, 0, 500);
  const taskIDs = Array.isArray(rawObj.taskIDs)
    ? rawObj.taskIDs.filter((x) => typeof x === "string" && x.trim())
    : [];
  const checkTasksFirstTime = typeof rawObj.checkTasksFirstTime === "boolean"
    ? rawObj.checkTasksFirstTime
    : !(rawObj.ignoreTaskCheckFirstTime === true || rawObj.alwaysRunAlarmOnce === true);
  const maxReschedules = intInRange(rawObj.maxReschedules, 1, 0, 10);

  return {
    ok: true,
    val: {
      alarmName,
      status,
      offsetMin,
      reference,
      qrCodeID,
      qrSoundPath,
      qrSoundLen,
      qrVol,
      qrShortcutsOnScan,
      shortcutsOnTrigger,
      silenceAlarm,
      locationMode,
      locations,
      radiusMeters,
      silenceIfDriving,
      conflictingCalendars,
      reschedMinutes,
      taskLoopMin,
      taskIDs,
      checkTasksFirstTime,
      maxReschedules,
    },
  };
}

// ---------- Registry shape / identity ----------
function registryKey(entry) {
  return `${String(entry?.alarmName ?? "")}|||${String(entry?.calcFireTime ?? "")}`;
}

function normalizeReschedMinutesRange(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const minRaw = Number(value.min);
    const maxRaw = Number(value.max);
    const min = Number.isFinite(minRaw) ? Math.trunc(minRaw) : 0;
    const max = Number.isFinite(maxRaw) ? Math.trunc(maxRaw) : 45;
    const minClamped = Math.max(0, Math.min(min, 500));
    const maxClamped = Math.max(0, Math.min(max, 500));
    return { min: minClamped, max: Math.max(minClamped, maxClamped) };
  }

  const legacy = Number(value);
  const min = Number.isFinite(legacy) ? Math.max(0, Math.min(Math.trunc(legacy), 500)) : 0;
  return { min, max: Math.max(min, 45) };
}

function ensureRegistryEntryShape(entry) {
  if (!entry || typeof entry !== "object") return null;
  if (typeof entry.alarmName !== "string" || !entry.alarmName) return null;

  const cft = Number(entry.calcFireTime);
  if (!Number.isFinite(cft)) return null;

  entry.calcFireTime = floorToMinute(Math.trunc(cft));

  const nf = Number(entry.nextFireTime);
  entry.nextFireTime = floorToMinute(Number.isFinite(nf) ? Math.trunc(nf) : entry.calcFireTime);
  if (typeof entry.nextFireHHMM !== "string") entry.nextFireHHMM = "";

  const pf = Number(entry.prevFireTime);
  entry.prevFireTime = Number.isFinite(pf) ? floorToMinute(Math.trunc(pf)) : 0;
  if (typeof entry.prevFireHHMM !== "string") entry.prevFireHHMM = "";

  if (entry.firstQRFireTime === "" || typeof entry.firstQRFireTime === "undefined") {
    entry.firstQRFireTime = "";
  } else {
    const fq = Number(entry.firstQRFireTime);
    entry.firstQRFireTime = Number.isFinite(fq) ? Math.trunc(fq) : "";
  }

  entry.qrActive = !!entry.qrActive;
  entry.qrPending = entry.qrPending === true;
  const qps = Number(entry.qrPendingSince);
  entry.qrPendingSince = Number.isFinite(qps) && qps > 0 ? Math.trunc(qps) : 0;
  const qb = Number(entry.qrBackupFireTime);
  entry.qrBackupFireTime = Number.isFinite(qb) ? floorToMinute(Math.trunc(qb)) : 0;
  if (typeof entry.qrBackupHHMM !== "string") entry.qrBackupHHMM = "";

  // Registry-only task keys:
  // - taskSatisfied: suppress scheduling once this task-loop alarm is satisfied.
  // - taskCheckFirstFireHandled: tracks whether checkTasksFirstTime=false has already consumed its initial override.
  // - taskLoopEligible: allows taskLoopMin follow-ups only after at least one ungated fire reached task handling.
  entry.taskSatisfied = !!entry.taskSatisfied;
  entry.taskCheckFirstFireHandled = entry.taskCheckFirstFireHandled === true || entry.taskLoopFirstFireHandled === true;
  entry.taskLoopEligible = entry.taskLoopEligible === true;
  delete entry.taskLoopFirstFireHandled;
  delete entry.taskCooldownScheduled;

  // Fill calendar-derived fields best-effort
  if (typeof entry.status !== "string") entry.status = "ON";
  if (typeof entry.reference !== "string") entry.reference = "start";
  if (!Number.isFinite(Number(entry.offsetMin))) entry.offsetMin = 0;

  if (typeof entry.qrCodeID !== "string") entry.qrCodeID = "";
  if (typeof entry.qrSoundPath !== "string") entry.qrSoundPath = "ringtone.mp3";
  if (!Number.isFinite(Number(entry.qrSoundLen))) entry.qrSoundLen = 2.13;
  if (!Number.isFinite(Number(entry.qrVol))) entry.qrVol = 40;
  entry.qrShortcutsOnScan = normalizeShortcutActionList(entry.qrShortcutsOnScan ?? entry.qrShortcutOnScan);
  entry.shortcutsOnTrigger = normalizeShortcutActionList(entry.shortcutsOnTrigger ?? entry.shortcutOnTrigger);
  entry.silenceAlarm = entry.silenceAlarm === true || entry.shortcutsOnTrigger.some((x) => x.silenceAlarm === true);
  delete entry.qrShortcutOnScan;
  delete entry.shortcutOnTrigger;

  if (typeof entry.locationMode !== "string") entry.locationMode = "off";
  if (!Array.isArray(entry.locations)) entry.locations = [];
  if (!Number.isFinite(Number(entry.radiusMeters))) entry.radiusMeters = 50;

  if (typeof entry.silenceIfDriving !== "string") entry.silenceIfDriving = "OFF";
  if (!Array.isArray(entry.conflictingCalendars)) entry.conflictingCalendars = [];
  entry.reschedMinutes = normalizeReschedMinutesRange(entry.reschedMinutes);
  if (!Number.isFinite(Number(entry.taskLoopMin))) entry.taskLoopMin = 0;
  if (!Array.isArray(entry.taskIDs)) {
    if (Number.isFinite(Number(entry.taskRow)) && Number(entry.taskRow) > 0) {
      entry.taskIDs = [String(entry.taskRow)];
    } else {
      entry.taskIDs = [];
    }
  } else {
    entry.taskIDs = entry.taskIDs.filter((x) => typeof x === "string" && x.trim());
  }
  if (typeof entry.checkTasksFirstTime !== "boolean") {
    entry.checkTasksFirstTime = !(entry.ignoreTaskCheckFirstTime === true || entry.alwaysRunAlarmOnce === true);
  }
  delete entry.ignoreTaskCheckFirstTime;
  delete entry.alwaysRunAlarmOnce;
  if (!Number.isFinite(Number(entry.maxReschedules))) entry.maxReschedules = 1;

  const migrating = entry.scheduleVersion !== 2;
  if (migrating) {
    registryMigrationNeeded = true;
    const legacyMinuteRestart = hasTaskLoop(entry) && Number(entry.firstQRFireTime) > 0 &&
      Number(entry.maxReschedules) <= 0 && Number(entry.taskLoopMin) !== 1 &&
      Number(entry.qrBackupFireTime) === Number(entry.nextFireTime) + 120;
    entry.taskCheckFireTime = hasTaskLoop(entry)
      ? (legacyMinuteRestart ? Math.max(0, Number(entry.prevFireTime) || 0) : entry.nextFireTime) : 0;
    entry.taskCheckHHMM = hasTaskLoop(entry)
      ? (legacyMinuteRestart ? entry.prevFireHHMM : entry.nextFireHHMM) : "";
    entry.qrRestartFireTime = legacyMinuteRestart || ((entry.qrActive || entry.qrPending) &&
      !hasTaskLoop(entry)) ? entry.nextFireTime : 0;
    entry.qrRestartHHMM = entry.qrRestartFireTime ? entry.nextFireHHMM : "";
    entry.qrFallbackFireTime = entry.qrBackupFireTime;
    entry.qrFallbackHHMM = entry.qrBackupHHMM;
    entry.qrGeneration = Number(entry.firstQRFireTime) > 0 ? 1 : 0;
  }
  for (const key of ["taskCheckFireTime", "qrRestartFireTime", "qrFallbackFireTime"]) {
    entry[key] = Number(entry[key]) > 0 ? floorToMinute(Number(entry[key])) : 0;
  }
  for (const key of ["taskCheckHHMM", "qrRestartHHMM", "qrFallbackHHMM"]) {
    if (typeof entry[key] !== "string") entry[key] = "";
  }
  entry.qrGeneration = Math.max(0, Math.trunc(Number(entry.qrGeneration) || 0));
  entry.retiredAlarmTimes = Array.isArray(entry.retiredAlarmTimes)
    ? entry.retiredAlarmTimes.filter((x) => x && Number(x.epoch) > 0 && parseHHMMString(x.hhmm)) : [];
  entry.scheduleVersion = 2;
  syncScannerPointers(entry);

  return entry;
}

function hasTaskLoop(entry) {
  return Array.isArray(entry?.taskIDs) && entry.taskIDs.length > 0;
}

function setTaskCheck(entry, epoch) {
  entry.taskCheckFireTime = Number(epoch) > 0 ? floorToMinute(epoch) : 0;
  entry.taskCheckHHMM = entry.taskCheckFireTime ? epochToHHMMString(entry.taskCheckFireTime) : "";
  if (hasTaskLoop(entry)) {
    entry.nextFireTime = entry.taskCheckFireTime;
    entry.nextFireHHMM = entry.taskCheckHHMM;
  }
}

function syncScannerPointers(entry) {
  if (hasTaskLoop(entry)) {
    entry.nextFireTime = Number(entry.taskCheckFireTime) || 0;
    entry.nextFireHHMM = entry.taskCheckHHMM || "";
  } else if (entry.qrActive || entry.qrPending) {
    entry.nextFireTime = Number(entry.qrRestartFireTime) || 0;
    entry.nextFireHHMM = entry.qrRestartHHMM || "";
  }
  const fallback = Number(entry.qrFallbackFireTime) || 0;
  const sharedTask = hasTaskLoop(entry) && fallback === Number(entry.taskCheckFireTime);
  entry.qrBackupFireTime = sharedTask ? 0 : fallback;
  entry.qrBackupHHMM = entry.qrBackupFireTime ? entry.qrFallbackHHMM : "";
}

function ownedAlarmSlots(entry, includePrevious = false) {
  const fields = [
    ["nextFireTime", "nextFireHHMM"], ["taskCheckFireTime", "taskCheckHHMM"],
    ["qrRestartFireTime", "qrRestartHHMM"], ["qrFallbackFireTime", "qrFallbackHHMM"],
    ["qrBackupFireTime", "qrBackupHHMM"],
  ];
  if (includePrevious) fields.push(["prevFireTime", "prevFireHHMM"]);
  const slots = [];
  const seen = new Set();
  for (const [timeKey, mirrorKey] of fields) {
    const epoch = Number(entry[timeKey]) || 0;
    if (epoch <= 0) continue;
    const hhmm = entry[mirrorKey] || epochToHHMMString(epoch);
    if (seen.has(hhmm)) continue;
    seen.add(hhmm);
    slots.push({ epoch, hhmm });
  }
  return slots;
}

function retireReplacedAlarms(entry, previous, iosAlarms) {
  const wanted = new Set(ownedAlarmSlots(entry).map((x) => x.hhmm));
  const retired = Array.isArray(entry.retiredAlarmTimes) ? entry.retiredAlarmTimes : [];
  for (const slot of previous) {
    if (wanted.has(slot.hhmm)) continue;
    if (!retired.some((x) => x.hhmm === slot.hhmm)) retired.push(slot);
  }
  entry.retiredAlarmTimes = retired;
  entry.prevFireTime = 0;
  entry.prevFireHHMM = "";
  cleanupRetiredAlarms(entry, iosAlarms);
}

function cleanupRetiredAlarms(entry, iosAlarms) {
  const wanted = new Set(ownedAlarmSlots(entry).map((x) => x.hhmm));
  entry.retiredAlarmTimes = (entry.retiredAlarmTimes || []).filter((slot) => {
    if (wanted.has(slot.hhmm)) return false;
    const hhmm = parseHHMMString(slot.hhmm);
    if (!hhmm || !findIOSMatches(iosAlarms, entry.alarmName, hhmm.hh, hhmm.mm)) return false;
    // Preserve an unsilenced non-QR ring in its current minute. Context
    // gates and completion already request explicit deletion independently.
    if (!entry.qrCodeID && !entry.silenceAlarm && !entry.taskSatisfied &&
        slot.epoch >= floorToMinute(nowEpoch()) && slot.epoch <= nowEpoch()) return true;
    queueDeleteIOSByStoredHHMMIfUnique(iosAlarms, entry.alarmName, slot.hhmm, slot.epoch);
    // Keep ownership until a later Clock snapshot confirms deletion.
    return true;
  });
}

function cancelQRLoop(entry) {
  entry.qrActive = false;
  entry.qrPending = false;
  entry.qrPendingSince = 0;
  entry.qrRestartFireTime = 0;
  entry.qrRestartHHMM = "";
  entry.qrFallbackFireTime = 0;
  entry.qrFallbackHHMM = "";
  entry.qrBackupFireTime = 0;
  entry.qrBackupHHMM = "";
  if (!hasTaskLoop(entry) && Number(entry.firstQRFireTime) > 0) {
    entry.nextFireTime = 0;
    entry.nextFireHHMM = "";
  }
}

function expireRegistryEntries(registry, iosAlarms) {
  const now = nowEpoch();
  return registry.filter((entry) => {
    const expired = entry.calcFireTime < now - TTL_HARD_SEC ||
      (entry.qrActive && (!(Number(entry.firstQRFireTime) > 0) || now - entry.firstQRFireTime > QR_TIMEOUT_SEC));
    if (!expired) return true;
    for (const slot of ownedAlarmSlots(entry, true).concat(entry.retiredAlarmTimes || [])) {
      queueDeleteIOSByStoredHHMMIfUnique(iosAlarms, entry.alarmName, slot.hhmm, slot.epoch);
    }
    return false;
  });
}

function cleanupScannedQRLoops(registry, iosAlarms) {
  for (const entry of registry) {
    if (entry.taskSatisfied || (!entry.qrActive && !entry.qrPending && Number(entry.firstQRFireTime) > 0)) {
      const previous = ownedAlarmSlots(entry, true);
      if (entry.taskSatisfied) setTaskCheck(entry, 0);
      cancelQRLoop(entry);
      retireReplacedAlarms(entry, previous, iosAlarms);
    }
    cleanupRetiredAlarms(entry, iosAlarms);
  }
}

async function loadRegistry(fm, registryPath) {
  const raw = await safeReadString(fm, registryPath, "[]");
  const p = safeJSONParse(raw);
  if (!p.ok) {
    addError(`ERR: registry.txt corrupt; treating as empty. (${p.err})`);
    return [];
  }
  if (!Array.isArray(p.val)) {
    addError("ERR: registry.txt not a JSON array; treating as empty.");
    return [];
  }

  const out = [];
  for (const e of p.val) {
    const shaped = ensureRegistryEntryShape(e);
    if (shaped) out.push(shaped);
    else addError("WARN: registry entry malformed; dropped.");
  }
  return out;
}

function dropRegistryDuplicatesRandom(registryArr) {
  const groups = new Map();
  for (let i = 0; i < registryArr.length; i++) {
    const k = registryKey(registryArr[i]);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(i);
  }

  const toDrop = new Set();
  for (const [k, idxs] of groups.entries()) {
    if (idxs.length > 1) {
      addError(`WARN: duplicate registry entries for "${k}" — dropping all but one.`);
      const keep = idxs[Math.floor(Math.random() * idxs.length)];
      for (const idx of idxs) if (idx !== keep) toDrop.add(idx);
    }
  }

  if (toDrop.size === 0) return registryArr;
  return registryArr.filter((_, i) => !toDrop.has(i));
}

// ---------- Diff-based patch write ----------
function computeRegistryPatch(regBefore, regAfter) {
  const beforeMap = new Map(regBefore.map((e) => [registryKey(e), e]));
  const afterMap = new Map(regAfter.map((e) => [registryKey(e), e]));

  const adds = new Map();
  const removes = new Set();
  const fieldUpdates = new Map();

  for (const [k, a] of afterMap.entries()) {
    if (!beforeMap.has(k)) {
      adds.set(k, a);
      continue;
    }
    const b = beforeMap.get(k);
    const fields = new Set([...Object.keys(b), ...Object.keys(a)]);

    const updates = {};
    const deletes = new Set();

    for (const f of fields) {
      const bs = JSON.stringify(b[f]);
      const as = JSON.stringify(a[f]);
      if (bs !== as) {
        if (typeof a[f] === "undefined") deletes.add(f);
        else updates[f] = a[f];
      }
    }

    if (Object.keys(updates).length || deletes.size) {
      fieldUpdates.set(k, { updates, deletes });
    }
  }

  for (const [k] of beforeMap.entries()) {
    if (!afterMap.has(k)) removes.add(k);
  }

  return { adds, removes, fieldUpdates, beforeMap };
}

function schedulingFingerprint(entry) {
  return JSON.stringify([entry.nextFireTime, entry.taskCheckFireTime,
    entry.qrRestartFireTime, entry.qrFallbackFireTime, entry.qrGeneration,
    entry.firstQRFireTime, entry.maxReschedules, entry.taskSatisfied,
    entry.taskCheckFirstFireHandled, entry.qrPending, entry.lastHandledFireTime]);
}

function applyRegistryPatch(regOnDiskNow, patch, iosAlarms = []) {
  const diskMap = new Map(regOnDiskNow.map((e) => [registryKey(e), e]));
  output.debug.rejectedScheduleKeys = [];
  const current = (key) => {
    const before = patch.beforeMap.get(key), disk = diskMap.get(key);
    if (!before || !disk || schedulingFingerprint(before) !== schedulingFingerprint(disk)) {
      output.debug.rejectedScheduleKeys.push(key);
      return false;
    }
    return true;
  };
  for (const k of patch.removes) if (current(k)) diskMap.delete(k);
  for (const [k, e] of patch.adds) {
    if (!diskMap.has(k)) diskMap.set(k, e);
    else output.debug.rejectedScheduleKeys.push(k);
  }
  for (const [k, upd] of patch.fieldUpdates) {
    if (!current(k)) continue;
    const e = diskMap.get(k), before = patch.beforeMap.get(k);
    const scannedWhileComputing = before.qrActive === true && e.qrActive !== true;
    for (const [f, v] of Object.entries(upd.updates)) e[f] = v;
    for (const f of upd.deletes) delete e[f];
    if (scannedWhileComputing) {
      const previous = ownedAlarmSlots(e, true);
      cancelQRLoop(e);
      retireReplacedAlarms(e, previous, iosAlarms);
    }
  }
  return Array.from(diskMap.values());
}

function filterOutputAgainstCommittedSchedule(registry, iosAlarms) {
  const desired = new Set();
  for (const entry of registry) {
    for (const slot of ownedAlarmSlots(entry)) if (slot.epoch >= floorToMinute(nowEpoch())) desired.add(`${entry.alarmName}|||${slot.hhmm}`);
  }
  const rejected = new Set(output.debug.rejectedScheduleKeys || []);
  output.alarmsToAdd = output.alarmsToAdd.filter((alarm) => {
    if (rejected.has(alarm._ownerKey)) return false;
    const match = String(alarm.time).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!match) return false;
    const hour = Number(match[1]) % 12 + (match[3].toUpperCase() === "PM" ? 12 : 0);
    const hhmm = `${pad2(hour)}:${match[2]}`;
    return desired.has(`${alarm.name}|||${hhmm}`);
  });
  output.alarmsToDelete = output.alarmsToDelete.filter((alarm) =>
    !rejected.has(alarm._ownerKey) && (!desired.has(`${alarm.name}|||${alarm.hh}:${alarm.mm}`) ||
      (DELETE_DUPLICATE_ALARMS && findIOSMatches(iosAlarms, alarm.name, alarm.hh, alarm.mm) > 1)));
  output.triggerShortcutsToRunDetailed = output.triggerShortcutsToRunDetailed.filter((a) => !rejected.has(a._ownerKey));
  for (const list of [output.alarmsToAdd, output.alarmsToDelete, output.triggerShortcutsToRunDetailed]) {
    for (const item of list) delete item._ownerKey;
  }
}

function registryEquals(a, b) {
  if (a.length !== b.length) return false;
  const m = new Map(a.map((e) => [registryKey(e), JSON.stringify(e)]));
  for (const e of b) {
    const k = registryKey(e);
    if (!m.has(k)) return false;
    if (m.get(k) !== JSON.stringify(e)) return false;
  }
  return true;
}

// ---------- Fired-alarm inference ----------
function inferFiredOwnedAlarms(iosAlarms, registryArr, nowSec) {
  const fired = [];
  registryArr.forEach((entry, registryIndex) => {
    const slots = hasTaskLoop(entry)
      ? [["taskCheckFireTime", "taskCheckHHMM", "task"]]
      : [["nextFireTime", "nextFireHHMM", "calendar"]];
    if (entry.qrActive || entry.qrPending) {
      slots.push(["qrRestartFireTime", "qrRestartHHMM", entry.qrPending ? "pendingQR" : "qrRestart"]);
      if (entry.qrActive) slots.push(["qrFallbackFireTime", "qrFallbackHHMM", "qrBackup"]);
    }
    const matches = new Map();
    for (const [field, mirror, purpose] of slots) {
      const epoch = Number(entry[field]) || 0;
      const age = nowSec - epoch;
      // Never treat a future alarm as fired. Accept delayed launches, using
      // the stored schedule transition to consume each purpose only once.
      if (epoch <= 0 || age < 0 || age > FIRED_ALARM_GRACE_SEC || epoch <= Number(entry.lastHandledFireTime || 0)) continue;
      const hhmm = parseHHMMString(entry[mirror]) || epochToHHMM(epoch);
      const count = findIOSMatches(iosAlarms, entry.alarmName, hhmm.hh, hhmm.mm);
      if (!count) continue;
      const key = `${hhmm.hh}:${hhmm.mm}`;
      if (!matches.has(key)) matches.set(key, {registryIndex,
        ios: {name: entry.alarmName, ...hhmm}, iosUnique: count === 1,
        firedEpoch: epoch, firedSource: field, purposes: []});
      matches.get(key).purposes.push(purpose);
    }
    // A late invocation may encounter both a restart and a missed task check.
    // Process task handling once and use the newest due QR tick for playback.
    const values = Array.from(matches.values());
    const task = values.find((x) => x.purposes.includes("task"));
    const chosen = task || values.sort((a, b) => b.firedEpoch - a.firedEpoch)[0];
    if (chosen) fired.push(chosen);
  });
  return fired.sort((a, b) => a.firedEpoch - b.firedEpoch || a.registryIndex - b.registryIndex);
}

// ---------- Gating helpers ----------
function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---- Travel-time estimate from coords only (tuned) ----
// Haversine distance in miles
function haversineMiles(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 3958.7613; // Earth radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Detour factor based on straight-line distance (roads vs as-the-crow-flies)
function detourFactor(straightMiles) {
  if (straightMiles < 3) return 1.33;     // local streets / turns / lights
  if (straightMiles < 10) return 1.22;    // mixed arterial
  if (straightMiles < 60) return 1.14;    // often highway-dominant in suburbs
  return 1.15;                            // long trips: fairly direct but not perfect
}

// Average speed (mph) based on *road miles*
function avgSpeedMph(roadMiles) {
  if (roadMiles <= 2) return 18;
  if (roadMiles <= 8) return 25;
  if (roadMiles <= 20) return 45;
  if (roadMiles <= 80) return 58;
  return 55; // long trips include exits, towns, traffic variability
}

// Main estimator: returns integer minutes
function estimateDriveMinutes(lat1, lon1, lat2, lon2) {
  const OVERHEAD_MIN = 14; // lights/parking/getting onto main roads
  const straight = haversineMiles(lat1, lon1, lat2, lon2);

  const detour = detourFactor(straight);
  const roadMiles = straight * detour;

  const mph = avgSpeedMph(roadMiles);
  const driveMin = (roadMiles / mph) * 60;

  // Keep a small minimum for rapid retry noise, but allow large values so caller can
  // decide whether distance-based rescheduling is relevant.
  const raw = driveMin + OVERHEAD_MIN;
  const clamped = Math.max(2, raw);

  return Math.round(clamped);
}

async function checkTaskIDsCompleteFailOpen(taskIDs) {
  if (!Array.isArray(taskIDs) || !taskIDs.length) return true;
  const cachePath = ensureLockoutCachePathInitialized();
  if (!cachePath) return false;
  const raw = await safeReadString(fm, cachePath, "");
  const parsed = safeJSONParse(raw);
  const byID = parsed.ok && parsed.val?.ok !== false ? parsed.val?.reminderState?.byID : null;
  if (!byID || typeof byID !== "object") {
    addError("WARN: lockout cache missing successful reminderState.byID; treating task as incomplete.");
    return false;
  }
  const age = Date.now() - Date.parse(parsed.val.generatedAtISO);
  if (!(age >= 0 && age <= 90000)) {
    output.debug.taskCacheStale = true;
    return false;
  }
  return taskIDs.every((id) => {
    const metric = byID[String(id).trim()];
    return metric && metric.found !== false && metric.complete === true;
  });
}

function makeTaskResetterAction(entry, nextAlarmPayload) {
  const taskIDs = Array.isArray(entry?.taskIDs)
    ? entry.taskIDs.map((x) => String(x ?? "").trim()).filter((x) => x)
    : [];

  const payloadAlarm = nextAlarmPayload && typeof nextAlarmPayload === "object"
    ? nextAlarmPayload
    : {};
  const payload = {
    action: "task_alarm_reset",
    taskLoopMetricIDs: taskIDs,
    qrCodeID: String(entry?.qrCodeID ?? ""),
    alarmToDelete: {
      name: String(payloadAlarm?.name ?? ""),
      hh: String(payloadAlarm?.hh ?? ""),
      mm: String(payloadAlarm?.mm ?? ""),
    },
  };

  return {
    name: CALENDAR_ALARMS_ACTIONS,
    input: [JSON.stringify(payload)],
    silenceAlarm: false,
  };
}

function shouldSkipTaskCheckOnInitialFire(entry) {
  return entry?.checkTasksFirstTime === false && entry?.taskCheckFirstFireHandled !== true;
}

function shouldAppendTaskResetter(entry) {
  return !shouldSkipTaskCheckOnInitialFire(entry);
}

function buildTriggerActionsForTaskLoop(entry, nextAlarmPayload) {
  const actions = normalizeShortcutActionList(entry?.shortcutsOnTrigger);
  if (!shouldAppendTaskResetter(entry)) return actions;
  actions.unshift(makeTaskResetterAction(entry, nextAlarmPayload));
  return actions;
}

async function findConflictReadyAt(entry, fireEpoch) {
  const names = Array.isArray(entry.conflictingCalendars) ? entry.conflictingCalendars : [];
  if (!names.length) return null;

  try {
    const allCals = await Calendar.forEvents();
    const calByName = new Map(allCals.map((c) => [c.title, c]));
    let latestEnd = null;

    for (const name of names) {
      const cal = calByName.get(name);
      if (!cal) continue;

      const start = new Date((fireEpoch - 12 * 60 * 60) * 1000);
      const end = new Date((fireEpoch + 12 * 60 * 60) * 1000);
      const events = await CalendarEvent.between(start, end, [cal]);

      for (const ev of events) {
        const s = Math.floor(ev.startDate.getTime() / 1000);
        const e = Math.floor(ev.endDate.getTime() / 1000);
        if (fireEpoch >= s && fireEpoch < e) {
          if (latestEnd === null || e > latestEnd) latestEnd = e;
        }
      }
    }

    if (latestEnd === null) return null;
    return floorToMinute(latestEnd + CONFLICT_BUFFER_MIN * 60);
  } catch (e) {
    addError(`WARN: conflict check failed; treating as no conflict. (${String(e)})`);
    return null;
  }
}

async function computeRescheduleTime(entry, fireEpoch, currentFocus, currentLocation, includeTaskBaseline) {
  const candidates = [];
  const reschedRange = normalizeReschedMinutesRange(entry.reschedMinutes);
  const reschedMinutes = reschedRange.min;
  const reschedMax = reschedRange.max;

  // Conflicts can push later than baseline
  const conflictReady = await findConflictReadyAt(entry, fireEpoch);
  if (conflictReady !== null) {
    const conflictDelayMin = Math.max(0, Math.ceil((conflictReady - fireEpoch) / 60));
    if (conflictDelayMin <= reschedMax) candidates.push(conflictReady);
  }

  const taskLoopMin = Number(entry.taskLoopMin ?? 0);

  // Driving baseline
  const focus = String(currentFocus ?? "").trim().toLowerCase();
  if (String(entry.silenceIfDriving ?? "OFF").toUpperCase() === "ON" && focus === "driving" && reschedMinutes > 0) {
    candidates.push(floorToMinute(fireEpoch + reschedMinutes * 60));
  }

  // Task baseline (for task loops + task gating)
  if (includeTaskBaseline && taskLoopMin > 0) {
    candidates.push(floorToMinute(fireEpoch + taskLoopMin * 60));
  }

  // Location gating baselines (requires Scriptable location)
  const locationMode = String(entry.locationMode ?? "off").toLowerCase();
  const locs = Array.isArray(entry.locations) ? entry.locations : [];
  const defaultRadius = Number(entry.radiusMeters ?? 50);

  if ((locationMode === "whitelist" || locationMode === "blacklist") && locs.length > 0) {
    const cur = currentLocation; // null means the configured location gate fails closed
    if (cur) {
      let nearest = null;
      let nearestLat = null;
      let nearestLon = null;
      let nearestRadius = null;
      let insideAny = false;

      for (const pair of locs) {
        if (!Array.isArray(pair) || pair.length < 2) continue;
        const lat = Number(pair[0]), lon = Number(pair[1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        const radius = Number.isFinite(Number(pair[2])) ? Number(pair[2]) : defaultRadius;

        const d = haversineMeters(cur.lat, cur.lon, lat, lon);
        if (nearest === null || d < nearest) {
          nearest = d;
          nearestLat = lat;
          nearestLon = lon;
          nearestRadius = radius;
        }
        if (d <= radius) insideAny = true;
      }

      if (nearest !== null) {
        output.debug.location = {
          current: { lat: cur.lat, lon: cur.lon },
          nearest: {
            lat: nearestLat,
            lon: nearestLon,
            distanceMeters: Math.round(nearest),
            radiusMeters: Number.isFinite(nearestRadius) ? nearestRadius : null,
          },
          insideAny,
          mode: locationMode,
        };
      }

      if (locationMode === "whitelist") {
        if (!insideAny && nearest !== null) {
          const minutes = estimateDriveMinutes(cur.lat, cur.lon, nearestLat, nearestLon);
          if (minutes <= reschedMax) {
            const sec = Math.max(60, minutes * 60);
            candidates.push(floorToMinute(fireEpoch + sec));
          }
        }
      } else if (locationMode === "blacklist") {
        if (insideAny && reschedMinutes > 0) {
          candidates.push(floorToMinute(fireEpoch + reschedMinutes * 60));
        }
      }
    } else {
      setLocationDebug({
        current: null,
        nearest: null,
        insideAny: null,
        mode: locationMode,
        reason: "currentLocation unavailable",
        decision: "failClosed",
      });
      if (reschedMinutes > 0) {
        candidates.push(floorToMinute(fireEpoch + reschedMinutes * 60));
      }
    }
  }

  if (!candidates.length) return null;

  let next = candidates[0];
  for (let i = 1; i < candidates.length; i++) if (candidates[i] > next) next = candidates[i];

  const maxAllowed = floorToMinute(fireEpoch + RESCHED_CLAMP_FUTURE_SEC);
  if (next > maxAllowed) next = maxAllowed;

  const minAllowed = floorToMinute(fireEpoch) + 60;
  if (next < minAllowed) next = minAllowed;

  return next;
}

function entryUsesLocation(entry) {
  const locationMode = String(entry.locationMode ?? "off").toLowerCase();
  if (locationMode !== "whitelist" && locationMode !== "blacklist") return false;
  if (!Array.isArray(entry.locations) || entry.locations.length === 0) return false;
  if (entry.taskSatisfied === true) return false;
  if (String(entry.status ?? "ON").toUpperCase() !== "ON") return false;
  return true;
}

async function ensureInputLocationForEntry(input, entry) {
  if (!input || !entryUsesLocation(entry)) return;
  if (input.currentLocation || input.locationAttempted === true) return;
  input.locationAttempted = true;
  input.currentLocation = await getCurrentLocation();
}

function reportLocationFailureOutcome(input, entry, fireEpoch, nextFireTime, skippedReason) {
  if (!input || input.locationAttempted !== true || input.currentLocation || !entryUsesLocation(entry)) return;

  const name = String(entry.alarmName ?? "Unnamed alarm");
  if (Number.isFinite(nextFireTime)) {
    const delayMinutes = Math.max(1, Math.ceil((nextFireTime - fireEpoch) / 60));
    addError(
      `WARN: Location could not be fetched after ${LOCATION_MAX_ATTEMPTS} attempts for "${name}". ` +
      `This alarm was rescheduled for ${delayMinutes} minute${delayMinutes === 1 ? "" : "s"} later (${epochToHHMMString(nextFireTime)}).`
    );
    return;
  }

  addError(
    `WARN: Location could not be fetched after ${LOCATION_MAX_ATTEMPTS} attempts for "${name}". ` +
    `This alarm occurrence was skipped and no follow-up was scheduled${skippedReason ? ` (${skippedReason})` : ""}.`
  );
}

async function getCurrentLocation() {
  const cached = readLocationCache();
  let lastLocationError = null;

  for (let attempt = 1; attempt <= LOCATION_MAX_ATTEMPTS; attempt++) {
    try {
      Location.setAccuracyToHundredMeters();
      const loc = await withTimeout(Location.current(), LOCATION_TIMEOUT_MS);
      if (loc && Number.isFinite(loc.latitude) && Number.isFinite(loc.longitude)) {
        writeLocationCache(loc);
        return { lat: loc.latitude, lon: loc.longitude };
      }
      lastLocationError = new Error("INVALID_LOCATION_RESPONSE");
    } catch (e) {
      lastLocationError = e;
    }
  }

  setLocationDebug({
    current: null,
    reason: "currentLocation unavailable",
    decision: "failClosed",
    attempts: LOCATION_MAX_ATTEMPTS,
    cachedLocationAvailable: !!cached,
    lastError: lastLocationError ? String(lastLocationError) : "unknown",
  });
  return null;
}

function updateQRBackupAlarm(entry, baseEpoch, iosAlarms) {
  entry.qrFallbackFireTime = floorToMinute(baseEpoch) + QR_BACKUP_INTERVAL_SEC;
  entry.qrFallbackHHMM = epochToHHMMString(entry.qrFallbackFireTime);
  syncScannerPointers(entry);
  queueAddIOSIfMissing(iosAlarms, entry.alarmName, entry.qrFallbackFireTime);
}

function clearQRBackupAlarm(entry, iosAlarms) {
  const previous = ownedAlarmSlots(entry, true);
  entry.qrFallbackFireTime = 0;
  entry.qrFallbackHHMM = "";
  entry.qrBackupFireTime = 0;
  entry.qrBackupHHMM = "";
  retireReplacedAlarms(entry, previous, iosAlarms);
}

function scheduleQRLoop(entry, baseEpoch, iosAlarms) {
  const previous = ownedAlarmSlots(entry, true);
  const next = floorToMinute(baseEpoch) + QR_LOOP_INTERVAL_SEC;
  entry.qrRestartFireTime = next;
  entry.qrRestartHHMM = epochToHHMMString(next);
  updateQRBackupAlarm(entry, baseEpoch, iosAlarms);
  syncScannerPointers(entry);
  queueAddIOSIfMissing(iosAlarms, entry.alarmName, next);
  retireReplacedAlarms(entry, previous, iosAlarms);
  return next;
}

function continueActiveQRLoop(entry, baseEpoch, iosAlarms) {
  entry.prevFireTime = entry.nextFireTime;
  entry.prevFireHHMM = entry.nextFireHHMM;
  const next = scheduleQRLoop(entry, baseEpoch, iosAlarms);
  if (!hasTaskLoop(entry)) entry.nextFireTime = next;
  output.qrLoop = true;
  output.nextLoopStart = epochToShortcutTimestamp(next);
}

function beginQRLoop(entry, baseEpoch, iosAlarms) {
  if (!entry.qrActive) {
    entry.firstQRFireTime = nowEpoch();
    entry.qrGeneration = (Number(entry.qrGeneration) || 0) + 1;
  }
  entry.qrActive = true;
  entry.qrPending = false;
  entry.qrPendingSince = 0;
  continueActiveQRLoop(entry, baseEpoch, iosAlarms);
}

function deferQRLoop(entry, baseEpoch, iosAlarms) {
  const previous = ownedAlarmSlots(entry, true);
  const pendingSince = entry.qrPendingSince || nowEpoch();
  cancelQRLoop(entry);
  entry.qrPending = true;
  entry.qrPendingSince = pendingSince;
  entry.qrRestartFireTime = floorToMinute(baseEpoch) + QR_LOOP_INTERVAL_SEC;
  entry.qrRestartHHMM = epochToHHMMString(entry.qrRestartFireTime);
  syncScannerPointers(entry);
  queueAddIOSIfMissing(iosAlarms, entry.alarmName, entry.qrRestartFireTime);
  retireReplacedAlarms(entry, previous, iosAlarms);
  return entry.qrRestartFireTime;
}

function serializeExistingQRLoops(registryArr, iosAlarms) {
  const active = registryArr.filter((entry) => entry.qrActive === true)
    .sort((a, b) => Number(a.firstQRFireTime) - Number(b.firstQRFireTime));
  for (const entry of active.slice(1)) deferQRLoop(entry, nowEpoch(), iosAlarms);
}

// ---------- Fast-path ----------

async function isRescheduledForContextGates(entry, fireEpoch, input) {
  const focus = String(input.currentFocus ?? "").trim().toLowerCase();
  if (String(entry.silenceIfDriving ?? "OFF").toUpperCase() === "ON" && focus === "driving") return true;

  const conflictReady = await findConflictReadyAt(entry, fireEpoch);
  if (conflictReady !== null) return true;

  const locationMode = String(entry.locationMode ?? "off").toLowerCase();
  if (
    (locationMode === "whitelist" || locationMode === "blacklist") &&
    Array.isArray(entry.locations) &&
    entry.locations.length > 0
  ) {
    const cur = input.currentLocation;

    // If location is required for gating but unavailable, do NOT treat that as "passed".
    // This keeps task loops from starting when location could not be verified.
    if (!cur) return true;

    const defaultRadius = Number(entry.radiusMeters ?? 50);
    let insideAny = false;

    for (const pair of entry.locations) {
      if (!Array.isArray(pair) || pair.length < 2) continue;
      const lat = Number(pair[0]), lon = Number(pair[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const radius = Number.isFinite(Number(pair[2])) ? Number(pair[2]) : defaultRadius;
      const d = haversineMeters(cur.lat, cur.lon, lat, lon);
      if (d <= radius) insideAny = true;
    }

    if (locationMode === "whitelist" && !insideAny) return true;
    if (locationMode === "blacklist" && insideAny) return true;
  }

  return false;
}

async function processFiredAlarm(input, registryAfter, fired, allowQR) {
  const now = nowEpoch();
  const entry = registryAfter[fired.registryIndex];

  const name = entry.alarmName;
  const firedHH = fired.ios.hh;
  const firedMM = fired.ios.mm;
  const fireEpoch = Number(fired.firedEpoch ?? 0) || Number(entry.nextFireTime ?? 0) || now;

  // Always honor "taskSatisfied" latch: if it's satisfied, the next time it fires we should delete and stop
  // (should be rare, but safe).
  if (entry.taskSatisfied === true) {
    output.alarmsToDelete.push({ name, hh: firedHH, mm: firedMM });
    return { handled: true };
  }

  const hasQR = String(entry.qrCodeID ?? "").trim() !== "";
  const taskIDs = Array.isArray(entry.taskIDs) ? entry.taskIDs : [];
  const hasTask = taskIDs.length > 0;

  const purposes = fired.purposes || (fired.firedSource === "qrBackupFireTime" ? ["qrBackup"] : [hasTask ? "task" : "calendar"]);
  const qrOnly = hasQR && !purposes.includes("task") &&
    purposes.some((x) => ["qrRestart", "qrBackup", "pendingQR"].includes(x));
  if (qrOnly) {
    output.alarmsToDelete.push({name, hh: firedHH, mm: firedMM});
    if (!entry.qrActive && !entry.qrPending) return {handled: true};
    if (!allowQR) deferQRLoop(entry, now, input.iosAlarms);
    else beginQRLoop(entry, now, input.iosAlarms);
    return {handled: true};
  }

  await ensureInputLocationForEntry(input, entry);
  if (hasTask) {
    const previous = ownedAlarmSlots(entry, true);
    const taskLoopMin = Number(entry.taskLoopMin) || 0;
    const loopsRemaining = Math.max(0, Math.trunc(Number(entry.maxReschedules) || 0));
    const contextGated = await isRescheduledForContextGates(entry, now, input);
    if (contextGated) {
      output.alarmsToDelete.push({name, hh: firedHH, mm: firedMM});
      const next = loopsRemaining > 0 ? await computeRescheduleTime(
        entry, now, input.currentFocus, input.currentLocation, false) : null;
      setTaskCheck(entry, Number.isFinite(next) ? next : 0);
      cancelQRLoop(entry);
      if (Number.isFinite(next)) {
        entry.maxReschedules = loopsRemaining - 1;
        queueAddIOSIfMissing(input.iosAlarms, name, next);
      }
      reportLocationFailureOutcome(input, entry, fireEpoch, next, "no valid context reschedule was available");
      retireReplacedAlarms(entry, previous, input.iosAlarms);
      return {handled: true};
    }

    entry.taskLoopEligible = true;
    const skip = shouldSkipTaskCheckOnInitialFire(entry);
    const complete = !skip && await checkTaskIDsCompleteFailOpen(taskIDs);
    if (hasQR || complete || entry.silenceAlarm) output.alarmsToDelete.push({name, hh: firedHH, mm: firedMM});
    if (complete || taskLoopMin <= 0) {
      if (complete) entry.taskSatisfied = true;
      else addError(`ERR: taskIDs set but taskLoopMin<=0 for "${name}". Task loop cannot continue.`);
      entry.taskCheckFirstFireHandled = true;
      setTaskCheck(entry, 0);
      cancelQRLoop(entry);
      retireReplacedAlarms(entry, previous, input.iosAlarms);
      return {handled: true};
    }

    let payload = null;
    if (loopsRemaining > 0) {
      const next = await computeRescheduleTime(entry, now, input.currentFocus, input.currentLocation, true);
      setTaskCheck(entry, next ?? now + taskLoopMin * 60);
      entry.maxReschedules = loopsRemaining - 1;
      queueAddIOSIfMissing(input.iosAlarms, name, entry.taskCheckFireTime);
      payload = {name, ...epochToHHMM(entry.taskCheckFireTime)};
    } else setTaskCheck(entry, 0);
    const actions = skip ? normalizeShortcutActionList(entry.shortcutsOnTrigger)
      : buildTriggerActionsForTaskLoop(entry, payload);
    if (!entry.qrPending) queueTriggerShortcuts(actions);
    entry.taskCheckFirstFireHandled = true;
    if (hasQR) {
      if (allowQR) beginQRLoop(entry, now, input.iosAlarms);
      else deferQRLoop(entry, now, input.iosAlarms);
    }
    retireReplacedAlarms(entry, previous, input.iosAlarms);
    return {handled: true};
  }

  // Determine if any gating applies (driving/conflict/location) and whether to reschedule.
  // If gated: delete fired alarm, maybe reschedule, decrement maxReschedules.
  // If not gated: this fire is allowed to proceed.

  // Gating check
  const reschedRange = normalizeReschedMinutesRange(entry.reschedMinutes);
  const reschedMinutes = reschedRange.min;
  const reschedMax = reschedRange.max;
  let gated = false;

  const focus = String(input.currentFocus ?? "").trim().toLowerCase();
  if (String(entry.silenceIfDriving ?? "OFF").toUpperCase() === "ON" && focus === "driving") gated = true;

  const conflictReady = await findConflictReadyAt(entry, now);
  if (conflictReady !== null) {
    const conflictDelayMin = Math.max(0, Math.ceil((conflictReady - now) / 60));
    if (conflictDelayMin <= reschedMax) gated = true;
  }

  const locationMode = String(entry.locationMode ?? "off").toLowerCase();
  if ((locationMode === "whitelist" || locationMode === "blacklist") && Array.isArray(entry.locations) && entry.locations.length > 0) {
    const cur = input.currentLocation;
    if (cur) {
      const defaultRadius = Number(entry.radiusMeters ?? 50);
      let insideAny = false;
      let nearest = null;
      let nearestLat = null;
      let nearestLon = null;
      let nearestRadius = null;
      for (const pair of entry.locations) {
        if (!Array.isArray(pair) || pair.length < 2) continue;
        const lat = Number(pair[0]), lon = Number(pair[1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        const radius = Number.isFinite(Number(pair[2])) ? Number(pair[2]) : defaultRadius;
        const d = haversineMeters(cur.lat, cur.lon, lat, lon);
        if (nearest === null || d < nearest) {
          nearest = d;
          nearestLat = lat;
          nearestLon = lon;
          nearestRadius = radius;
        }
        if (d <= radius) insideAny = true;
      }
      if (nearest !== null) {
        setLocationDebug({
          current: { lat: cur.lat, lon: cur.lon },
          nearest: {
            lat: nearestLat,
            lon: nearestLon,
            distanceMeters: Math.round(nearest),
            radiusMeters: Number.isFinite(nearestRadius) ? nearestRadius : null,
          },
          insideAny,
          mode: locationMode,
        });
      }
      if (locationMode === "whitelist" && !insideAny && nearest !== null) {
        gated = true;
      }
      if (locationMode === "blacklist" && insideAny) gated = true;
    } else {
      setLocationDebug({
        current: null,
        nearest: null,
        insideAny: null,
        mode: locationMode,
        reason: "currentLocation unavailable",
        decision: "failClosed",
      });
      gated = true;
    }
  }

  if (gated) {
    output.alarmsToDelete.push({ name, hh: firedHH, mm: firedMM });

    if (reschedMinutes > 0 && Number(entry.maxReschedules ?? 0) > 0) {
      entry.maxReschedules = Math.max(0, Math.trunc(Number(entry.maxReschedules)) - 1);
      const next = await computeRescheduleTime(entry, now, input.currentFocus, input.currentLocation, true);
      entry.prevFireTime = entry.nextFireTime;
      entry.prevFireHHMM = entry.nextFireHHMM;
      entry.nextFireTime = floorToMinute(next ?? (now + reschedMinutes * 60));
      entry.nextFireHHMM = epochToHHMMString(entry.nextFireTime);
      queueAddIOSIfMissing(input.iosAlarms, name, entry.nextFireTime);
      reportLocationFailureOutcome(input, entry, fireEpoch, entry.nextFireTime, "");
    } else {
      const reason = reschedMinutes <= 0 ? "rescheduling is disabled" : "no reschedules remaining";
      reportLocationFailureOutcome(input, entry, fireEpoch, null, reason);
    }

    return { handled: true };
  }

  // Only run shortcutOnTrigger/silence behavior after this alarm has passed all gates.
  // If this fire was gated (driving/conflict/location), we returned earlier and did not queue shortcuts.
  if (entry.qrPending !== true) queueTriggerShortcuts(entry.shortcutsOnTrigger);

  // silenceAlarm always deletes the just-fired alarm once it has reached trigger handling.
  // (Gated/rescheduled alarms are already deleted in the gated block above.)
  if (entry.silenceAlarm === true) {
    output.alarmsToDelete.push({ name, hh: firedHH, mm: firedMM });
  }

  // QR minute-loop (non-task)
  if (hasQR) {
    // Always delete the just-fired instance (we own it)
    output.alarmsToDelete.push({ name, hh: firedHH, mm: firedMM });

    if (!allowQR) {
      deferQRLoop(entry, now, input.iosAlarms);
      return { handled: true };
    }

    // Determine whether the just-fired alarm corresponds to the *real* calendar fire.
    const firedEpoch = Number(entry.nextFireTime ?? 0);                  // "the one that should exist" == the one that fired
    const calcEpoch  = floorToMinute(Number(entry.calcFireTime ?? 0));   // intended calendar fire minute (if known)

    const calcKnown = Number.isFinite(calcEpoch) && calcEpoch > 0;
    const firedKnown = Number.isFinite(firedEpoch) && firedEpoch > 0;

    const isCalendarFire = calcKnown && firedKnown && (!(Number(entry.firstQRFireTime) > 0) || firedEpoch === calcEpoch);

    if (entry.qrActive !== true) {
      // If it's NOT the calendar fire, this is almost certainly a leftover minute-tick
      // that fired after the user already scanned. Do NOT re-arm and do NOT schedule another tick.
      if (!isCalendarFire && entry.qrPending !== true) {
        // Optional: clear scheduling pointers so verifier can cleanly re-establish later
        entry.prevFireTime = entry.nextFireTime;
        entry.prevFireHHMM = entry.nextFireHHMM;
        entry.nextFireTime = 0;
        entry.nextFireHHMM = "";
        clearQRBackupAlarm(entry, input.iosAlarms);
        output.qrLoop = false;
        return { handled: true };
      }

      // This IS the calendar fire: begin ringing loop
      entry.firstQRFireTime = now;
      entry.qrGeneration = (Number(entry.qrGeneration) || 0) + 1;
      entry.qrActive = true;
      entry.qrPending = false;
      entry.qrPendingSince = 0;

    }

    // Continue ringing (minute tick)
    continueActiveQRLoop(entry, now, input.iosAlarms);
    return { handled: true };
  }


  return { handled: false };
}

async function tryFastPath(input, registryAfter) {
  const firedAlarms = inferFiredOwnedAlarms(input.iosAlarms, registryAfter, nowEpoch());
  if (!firedAlarms.length) return { handled: false };

  let qrOwnerIndex = registryAfter.findIndex((entry) => entry?.qrActive === true);
  if (qrOwnerIndex < 0) {
    const qrCandidates = firedAlarms.filter(({ registryIndex }) =>
      String(registryAfter[registryIndex]?.qrCodeID ?? "").trim() !== ""
    );
    qrCandidates.sort((a, b) => {
      const ae = registryAfter[a.registryIndex];
      const be = registryAfter[b.registryIndex];
      const ap = Number(ae?.qrPendingSince ?? 0) || a.firedEpoch;
      const bp = Number(be?.qrPendingSince ?? 0) || b.firedEpoch;
      return ap - bp || a.registryIndex - b.registryIndex;
    });
    if (qrCandidates.length) qrOwnerIndex = qrCandidates[0].registryIndex;
  }

  for (const fired of firedAlarms) {
    const deleteStart = output.alarmsToDelete.length;
    const entry = registryAfter[fired.registryIndex];
    const hasQR = String(entry?.qrCodeID ?? "").trim() !== "";
    const previous = ownedAlarmSlots(entry, true);
    const starts = [output.alarmsToDelete.length, output.alarmsToAdd.length, output.triggerShortcutsToRunDetailed.length];
    await processFiredAlarm(input, registryAfter, fired, !hasQR || fired.registryIndex === qrOwnerIndex);
    entry.lastHandledFireTime = fired.firedEpoch;
    retireReplacedAlarms(entry, previous, input.iosAlarms);
    [output.alarmsToDelete, output.alarmsToAdd, output.triggerShortcutsToRunDetailed].forEach((list, i) => {
      for (const op of list.slice(starts[i])) op._ownerKey = registryKey(entry);
    });

    if (!fired.iosUnique && !DELETE_DUPLICATE_ALARMS) {
      output.alarmsToDelete.splice(
        deleteStart,
        output.alarmsToDelete.length - deleteStart,
        ...output.alarmsToDelete.slice(deleteStart).filter((alarm) =>
          !(alarm.name === fired.ios.name && alarm.hh === fired.ios.hh && alarm.mm === fired.ios.mm)
        )
      );
      addError(`WARN: fired iOS alarm not unique; actions ran but deletion was skipped for "${fired.ios.name}" @ ${fired.ios.hh}:${fired.ios.mm}`);
    }
  }

  return { handled: true };
}

// ---------- Verifier ----------
async function buildExpectedAlarms(nowSec, calcMinSec, calcMaxSec) {
  // still fetch events ±7 days because offsets can pull calcFireTime into our window
  const start = new Date((nowSec - 7 * 86400) * 1000);
  const end = new Date((nowSec + 7 * 86400) * 1000);

  let events = [];
  try {
    events = await fetchEventsForAlarmSource(start, end);
  } catch (e) {
    addError(`ERR: Calendar fetch failed; verifier incomplete. (${String(e)})`);
    return null;
  }

  const expected = new Map(); // key -> expectedEntry

  for (const ev of events) {
    const notes = String(ev.notes ?? "");

    const hasAlarmName = /\balarmName\b/i.test(notes);
    const hasOffsetMin = /\boffsetMin\b/i.test(notes);
    const hasBrackets = notes.includes("[") && notes.includes("]");

    const sub = extractFirstAlarmJSONArraySubstring(notes); // your stricter extractor
    if (!hasAlarmName) {
      if (hasOffsetMin) {
        addError(`WARN: event "${ev.title}" (${formatEventDateShort(ev.startDate)}) alarm JSON invalid.`);
      }
      continue;
    }

    if (hasBrackets && !sub) {
      addError(`WARN: event "${ev.title}" (${formatEventDateShort(ev.startDate)}) alarm JSON invalid.`);
      continue;
    }

    if (!sub) continue;

    const parsed = safeJSONParse(sub);
    if (!parsed.ok || !Array.isArray(parsed.val)) {
      addError(`WARN: event "${ev.title}" (${formatEventDateShort(ev.startDate)}) alarm JSON invalid.`);
      continue;
    }

    for (const rawObj of parsed.val) {
      const norm = normalizeCalendarAlarmObject(rawObj);
      if (!norm.ok) {
        addError(`WARN: ${norm.err} (event: "${ev.title}", ${formatEventDateShort(ev.startDate)})`);
        continue;
      }

      const a = norm.val;
      if (a.status !== "ON") continue;

      const baseEpoch = Math.floor(((a.reference === "end" ? ev.endDate : ev.startDate).getTime()) / 1000);
      const calcFireTime = floorToMinute(baseEpoch + a.offsetMin * 60);

      // ✅ only include alarms whose *calcFireTime* is within the caller's window
      if (calcFireTime < calcMinSec || calcFireTime > calcMaxSec) continue;

      const key = `${a.alarmName}|||${calcFireTime}`;
      if (expected.has(key)) {
        addError(`WARN: duplicate expected alarm in Calendar for "${a.alarmName}" @ calcFireTime=${calcFireTime}; keeping first.`);
        continue;
      }

      expected.set(key, {
        ...a,
        calcFireTime,
        prevFireTime: 0,
        prevFireHHMM: "",
        nextFireTime: calcFireTime,
        nextFireHHMM: epochToHHMMString(calcFireTime),
        firstQRFireTime: "",
        qrActive: false,
        taskSatisfied: false,
        taskCheckFirstFireHandled: false,
        taskLoopEligible: false,
        qrBackupFireTime: 0,
        qrBackupHHMM: "",
      });
    }
  }

  return expected;
}

async function runVerifier(input, registryAfter) {
  const now = nowEpoch(), nowMinute = floorToMinute(now);
  const expected = await buildExpectedAlarms(now, now - TTL_HARD_SEC, now + WINDOW_FUTURE_SEC);
  // A failed fetch is not evidence that calendar definitions were removed.
  if (expected === null) return registryAfter;
  const registry = new Map(dropRegistryDuplicatesRandom(registryAfter).map((e) => [registryKey(e), e]));
  const calendarFields = ["status", "offsetMin", "reference", "qrCodeID", "qrSoundPath", "qrSoundLen", "qrVol",
    "qrShortcutsOnScan", "shortcutsOnTrigger", "silenceAlarm", "locationMode", "locations", "radiusMeters",
    "silenceIfDriving", "conflictingCalendars", "reschedMinutes", "taskLoopMin", "taskIDs", "checkTasksFirstTime"];
  for (const [key, entry] of registry) {
    const previous = ownedAlarmSlots(entry, true);
    const qrExpired = entry.qrActive && (!(Number(entry.firstQRFireTime) > 0) || now - Number(entry.firstQRFireTime) > QR_TIMEOUT_SEC);
    const exp = expected.get(key);
    if (entry.calcFireTime < now - TTL_HARD_SEC || qrExpired || (!exp && !entry.qrActive && !entry.qrPending)) {
      for (const slot of previous.concat(entry.retiredAlarmTimes || [])) {
        queueDeleteIOSByStoredHHMMIfUnique(input.iosAlarms, entry.alarmName, slot.hhmm, slot.epoch);
      }
      registry.delete(key);
      continue;
    }
    if (exp) {
      const hadTask = hasTaskLoop(entry), hadQR = !!entry.qrCodeID;
      for (const field of calendarFields) entry[field] = exp[field];
      if (!hadTask && hasTaskLoop(entry)) {
        const firstCheck = entry.qrActive || entry.qrPending
          ? (entry.taskLoopMin > 0 ? nowMinute + entry.taskLoopMin * 60 : 0) : entry.nextFireTime;
        setTaskCheck(entry, firstCheck);
      } else if (hadTask && !hasTaskLoop(entry)) {
        entry.taskCheckFireTime = 0;
        entry.taskCheckHHMM = "";
        if (entry.taskLoopEligible && !entry.qrActive && !entry.qrPending) {
          entry.nextFireTime = 0;
          entry.nextFireHHMM = "";
        }
      }
      if (hadQR && !entry.qrCodeID) cancelQRLoop(entry);
      entry.maxReschedules = Math.min(Number(entry.maxReschedules), Number(exp.maxReschedules));
    }
    if (entry.taskSatisfied) {
      setTaskCheck(entry, 0);
      cancelQRLoop(entry);
    } else if (entry.qrActive && (!entry.qrRestartFireTime || entry.qrRestartFireTime < nowMinute)) {
      scheduleQRLoop(entry, now, input.iosAlarms);
    }
    syncScannerPointers(entry);
    retireReplacedAlarms(entry, previous, input.iosAlarms);
    for (const slot of ownedAlarmSlots(entry)) {
      if (slot.epoch < nowMinute) queueDeleteIOSByStoredHHMMIfUnique(input.iosAlarms, entry.alarmName, slot.hhmm, slot.epoch);
      else if (!entry.taskSatisfied && slot.epoch >= now && slot.epoch <= now + WINDOW_FUTURE_SEC) {
        // Refresh timezone mirrors and retire Clock times created before travel.
        const currentHHMM = epochToHHMMString(slot.epoch);
        if (slot.hhmm !== currentHHMM) {
          if (!entry.retiredAlarmTimes.some((x) => x.hhmm === slot.hhmm)) entry.retiredAlarmTimes.push(slot);
          queueDeleteIOSByStoredHHMMIfUnique(input.iosAlarms, entry.alarmName, slot.hhmm, slot.epoch);
        }
        queueAddIOSIfMissing(input.iosAlarms, entry.alarmName, slot.epoch);
      }
    }
    for (const [field, mirror] of [["nextFireTime", "nextFireHHMM"], ["taskCheckFireTime", "taskCheckHHMM"],
      ["qrRestartFireTime", "qrRestartHHMM"], ["qrFallbackFireTime", "qrFallbackHHMM"]]) {
      entry[mirror] = entry[field] > 0 ? epochToHHMMString(entry[field]) : "";
    }
    syncScannerPointers(entry);
    cleanupRetiredAlarms(entry, input.iosAlarms);
  }
  for (const [key, exp] of expected) {
    if (registry.has(key) || exp.calcFireTime < now) continue;
    const entry = ensureRegistryEntryShape(deepClone(exp));
    registry.set(key, entry);
    queueAddIOSIfMissing(input.iosAlarms, entry.alarmName, entry.nextFireTime);
  }
  return Array.from(registry.values());
}

// ---------- MAIN ----------
const fm = getFileManager();

let baseDir;
try {
  const shortcutsRoot = resolveShortcutsRootOrThrow(fm);
  baseDir = resolveOpenHabitsDirs(fm, shortcutsRoot).calendarAlarms;
} catch (e) {
  addError(`ERR: ${String(e)}`);
  output.errorRegistry = errors.join("\n");
  Script.setShortcutOutput(JSON.stringify(output));
  Script.complete();
  return;
}

const registryPath = fm.joinPath(baseDir, FILES.registry);
const lockPath = fm.joinPath(baseDir, FILES.lock);
const scannerLastOpenedPath = fm.joinPath(baseDir, FILES.scannerLastOpened);
const menuLastOpenedPath = fm.joinPath(baseDir, FILES.menuLastOpened);
const menuOpenStatusPath = fm.joinPath(baseDir, FILES.menuOpenStatus);
const settingsPath = fm.joinPath(baseDir, SETTINGS_FILENAME);

// Phase A — Setup files
await ensureFile(fm, registryPath, "[]");
await ensureFile(fm, lockPath, "");
await ensureFile(fm, scannerLastOpenedPath, new Date(0).toISOString());
await ensureFile(fm, menuLastOpenedPath, new Date(0).toISOString());
await ensureFile(fm, menuOpenStatusPath, "false");

// Settings are maintained by the Calendar Alarms Shortcut, so read but do not create the file.
disabledCalendarNames = await loadDisabledCalendarNames(fm, settingsPath);

// Load registry
let registryBefore = await loadRegistry(fm, registryPath);
registryBefore = dropRegistryDuplicatesRandom(registryBefore);
let registryAfter = deepClone(registryBefore);

// Parse input
const input = parseEngineInput(args.shortcutParameter);
registryAfter = expireRegistryEntries(registryAfter, input.iosAlarms);
await applyTaskLogCompletions(input, registryAfter);
cleanupScannedQRLoops(registryAfter, input.iosAlarms);
serializeExistingQRLoops(registryAfter, input.iosAlarms);

// Phase B — Fast-path
const fast = await tryFastPath(input, registryAfter);

// Phase C — Verifier if fast-path didn't handle
if (!fast.handled) {
  registryAfter = await runVerifier(input, registryAfter);
}

// Write registry back under lock using diff patch
let committedRegistry = registryBefore;
let commitOK = true;
if (registryMigrationNeeded || !registryEquals(registryBefore, registryAfter)) {
  const patch = computeRegistryPatch(registryBefore, registryAfter);
  const lock = await acquireLock(fm, lockPath);

  if (lock.ok) {
    const onDiskNow = await loadRegistry(fm, registryPath);
    const merged = applyRegistryPatch(onDiskNow, patch, input.iosAlarms);
    const cleaned = dropRegistryDuplicatesRandom(merged);

    try {
      commitOK = await safeWriteString(fm, registryPath, JSON.stringify(cleaned));
      if (commitOK) committedRegistry = cleaned;
    } finally {
      await releaseLock(fm, lockPath);
    }
  } else commitOK = false;
} else committedRegistry = registryAfter;
if (!commitOK) {
  output.alarmsToAdd = [];
  output.alarmsToDelete = [];
  output.triggerShortcutsToRunDetailed = [];
  output.qrLoop = false;
} else {
  filterOutputAgainstCommittedSchedule(committedRegistry, input.iosAlarms);
  output.qrLoop = committedRegistry.some((entry) => entry.qrActive);
  const nextQR = committedRegistry.filter((entry) => entry.qrActive && entry.qrRestartFireTime > 0)
    .map((entry) => entry.qrRestartFireTime).sort((a, b) => a - b)[0];
  output.nextLoopStart = nextQR ? epochToShortcutTimestamp(nextQR) : "";
}

// Finalize output
dedupeOutputOps();
function finalizeErrorRegistry(errLines) {
  if (!Array.isArray(errLines) || errLines.length === 0) return "";

  let s = errLines.join("\n");

  // normalize newlines, strip zero-width/BOM, and remove trailing/leading whitespace
  s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(ZERO_WIDTH_RE, "").trim();

  // if it became empty after cleanup, ensure it's EXACTLY ""
  return s;
}

output.errorRegistry = finalizeErrorRegistry(errors);
Script.setShortcutOutput(JSON.stringify(output));
Script.complete();
