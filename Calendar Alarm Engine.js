// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: red; icon-glyph: magic;
// Calendar Alarms Engine — Scriptable (UPDATED per your notes)
//
// Key changes integrated:
// 1) No fallback path: if Scriptable cannot resolve the iCloud Drive/Shortcuts bookmark, we STOP and return an error.
// 2) Input parsing preserves index alignment (no per-section filtering).
// 3) Lock staleness uses real-time "now" each retry (not a frozen timestamp).
// 4) Verifier no longer deletes “not expected” registry entries just because they’re in-window.
//    It only deletes per the cleanup/TTL rules (plus duplicate-registry cleanup).
// 5) NEW taskIDs behavior (your correction):
//    - taskIDs length>0 causes a repeating loop until the task is complete.
//    - For QR alarms + taskIDs:
//        * While ringing (qrActive true): QR loop until scan sets qrActive=false (qrScanner).
//        * After scan: a “post-scan tick” schedules a cooldown alarm at now+taskLoopMin.
//        * When that cooldown alarm fires: QR re-arms and starts ringing again if still incomplete.
//        * When the task becomes complete: it stops (no more reschedules), and the entry is latched as taskSatisfied=true
//          so Verifier won’t re-schedule it even though Calendar still defines it.
//    - For non-QR alarms + taskIDs:
//        * Every time it fires: if incomplete -> reschedule at now+taskLoopMin (no maxReschedules decrement).
//        * If complete -> stop and latch taskSatisfied=true.
//
// IMPORTANT: This introduces registry-only keys:
// - taskSatisfied (boolean): suppresses future scheduling for that calendar alarm until TTL cleanup.
// - taskCooldownScheduled (boolean): QR+task internal state to distinguish post-scan tick vs cooldown-fire.
// - qrBackupFireTime (number): backup QR loop fire time (failsafe alarm).
//
// Input: args.shortcutParameter string: labels "\n" ... + ":;:" + hours "\n" ... + ":;:" + minutes "\n" ... + ":;:" + currentFocus
// Output: JSON string set via Script.setShortcutOutput()

const DELIM = ":;:";
const BOOKMARK_NAME = "Shortcuts"; // MUST exist as Scriptable File Bookmark pointing to iCloud Drive/Shortcuts

// Optional TaskRow endpoint (interface defined; you can fill later)
// Should return boolean-like complete/incomplete; FAIL-OPEN requirement applies only for network errors.
// NOTE: Your new requirement is NOT fail-open; it wants a loop until complete.
// But if the query fails, your original spec says treat as complete. You did not retract that.
// So: network failure => treat as COMPLETE (stops task loop) + warning logged.
const TASK_WEBAPP_ID = ""; // e.g. "webappid"
const TASK_ENDPOINT_BASE_URL = TASK_WEBAPP_ID
  ? `https://script.google.com/macros/s/${TASK_WEBAPP_ID}/exec`
  : "";

// Constants
const CONFLICT_BUFFER_MIN = 10;
const LOCATION_TIME_MULTIPLIER_SEC_PER_KM = 150; // “middle ground”
const LOCK_STALE_SEC = 30;
const LOCK_RETRY_DELAY_MS = 500;
const LOCK_HARD_TIMEOUT_MS = 30000;

const WINDOW_PAST_SEC = 60 * 60;        // now - 1h
const WINDOW_FUTURE_SEC = 24 * 60 * 60; // now + 24h
const TTL_HARD_SEC = 24 * 60 * 60;      // calcFireTime older than 24h => purge
const QR_TIMEOUT_SEC = 60 * 60;         // qrActive for >60m => purge
const QR_LOOP_MINUTES = 1;              // 1/2/3 minute loop interval (dev-tunable)
const QR_LOOP_INTERVAL_SEC = QR_LOOP_MINUTES * 60;
const QR_BACKUP_MULTIPLIER = 3;
const QR_BACKUP_INTERVAL_SEC = QR_LOOP_INTERVAL_SEC * QR_BACKUP_MULTIPLIER;
const RESCHED_CLAMP_FUTURE_SEC = 4 * 60 * 60;

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
  qrLoop: false,
  debug: {},
  errorRegistry: "",
};

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

function safeJSONParse(str) {
  try {
    return { ok: true, val: JSON.parse(str) };
  } catch (e) {
    return { ok: false, err: String(e) };
  }
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

function resolveShortcutsDirOrThrow(fm) {
  let p = null;
  try {
    if (typeof fm.bookmarkedPath === "function") {
      p = fm.bookmarkedPath(BOOKMARK_NAME);
    }
  } catch (_) {}
  try {
    if (!p && typeof FileManager.bookmarkedPath === "function") {
      p = FileManager.bookmarkedPath(BOOKMARK_NAME);
    }
  } catch (_) {}

  if (!p || typeof p !== "string" || !p.trim()) {
    throw new Error(
      `Missing Scriptable File Bookmark "${BOOKMARK_NAME}". Create a bookmark pointing to iCloud Drive/Shortcuts.`
    );
  }
  return p;
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
// labels:;:hours:;:minutes:;:currentFocus
function parseEngineInput(inputStr) {
  const raw = String(inputStr ?? "");
  const parts = raw.split(DELIM);

  const labelsPart = parts[0] ?? "";
  const hoursPart  = parts[1] ?? "";
  const minsPart   = parts[2] ?? "";
  const focusPart  = parts[3] ?? "";

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
    currentLocation: null,
  };
}


function findIOSMatches(iosAlarms, name, hh, mm) {
  let count = 0;
  for (const a of iosAlarms) {
    if (a.name === name && a.hh === hh && a.mm === mm) count++;
  }
  return count;
}

function queueDeleteIOSIfUnique(iosAlarms, name, epochSec) {
  const { hh, mm } = epochToHHMM(epochSec);
  const c = findIOSMatches(iosAlarms, name, hh, mm);
  if (c === 1) {
    output.alarmsToDelete.push({ name, hh, mm });
    return true;function sleep(ms) {
  const seconds = Math.max(0, Number(ms) / 1000);
  return new Promise((resolve) => {
    Timer.schedule(seconds, false, () => resolve());
  });
}

  }
  if (c > 1) addError(`ERR: duplicate iOS alarms found (won't delete): "${name}" @ ${hh}:${mm}`);
  return false;
}

function queueAddIOSIfMissing(iosAlarms, name, epochSec) {
  const { hh, mm } = epochToHHMM(epochSec);
  const c = findIOSMatches(iosAlarms, name, hh, mm);
  if (c === 0) {
    output.alarmsToAdd.push({ name, hh, mm });
    return true;
  }
  if (c > 1) addError(`ERR: duplicate iOS alarms exist (won't add): "${name}" @ ${hh}:${mm}`);
  return false;
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
    const k = `${a.name}|||${a.hh}|||${a.mm}`;
    if (seenAdd.has(k)) return false;
    seenAdd.add(k);
    return true;
  });

  const seenT = new Set();
  const t = [];
  for (const s of output.triggerShortcutsToRun) {
    const name = String(s ?? "").trim();
    if (!name) continue;
    if (seenT.has(name)) continue;
    seenT.add(name);
    t.push(name);
  }
  output.triggerShortcutsToRun = t;
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
  const num = (v, def) => (Number.isFinite(Number(v)) ? Number(v) : def);

  const status = upper(rawObj.status, "ON");
  if (status !== "ON" && status !== "OFF") return { ok: false, err: `${errPrefix}status must be ON/OFF` };

  const reference = lower(rawObj.reference, "start");
  if (reference !== "start" && reference !== "end") return { ok: false, err: `${errPrefix}reference must be start/end` };

  const offsetMin = intInRange(rawObj.offsetMin, 0, -10080, 10080);

  const qrCodeID = typeof rawObj.qrCodeID === "string" ? rawObj.qrCodeID.trim() : "";
  if (qrCodeID.includes(" ")) return { ok: false, err: `${errPrefix}qrCodeID must not contain spaces` };

  const qrSoundPath = typeof rawObj.qrSoundPath === "string" ? rawObj.qrSoundPath : "/shortcuts/ringtone.mp3";
  const qrSoundLen = num(rawObj.qrSoundLen, 2.13);
  const qrVol = intInRange(rawObj.qrVol, 40, 1, 100);

  const qrShortcutOnScan = typeof rawObj.qrShortcutOnScan === "string" ? rawObj.qrShortcutOnScan : "";
  const shortcutOnTrigger = typeof rawObj.shortcutOnTrigger === "string" ? rawObj.shortcutOnTrigger : "";

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

  const reschedMinutes = intInRange(rawObj.reschedMinutes, 0, 0, 500);
  const taskLoopMin = intInRange(rawObj.taskLoopMin, 0, 0, 500);
  const taskIDs = Array.isArray(rawObj.taskIDs)
    ? rawObj.taskIDs.filter((x) => typeof x === "string" && x.trim())
    : [];
  const maxReschedules = intInRange(rawObj.maxReschedules, 1, 1, 10);

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
      qrShortcutOnScan,
      shortcutOnTrigger,
      locationMode,
      locations,
      radiusMeters,
      silenceIfDriving,
      conflictingCalendars,
      reschedMinutes,
      taskLoopMin,
      taskIDs,
      maxReschedules,
    },
  };
}

// ---------- Registry shape / identity ----------
function registryKey(entry) {
  return `${String(entry?.alarmName ?? "")}|||${String(entry?.calcFireTime ?? "")}`;
}

function ensureRegistryEntryShape(entry) {
  if (!entry || typeof entry !== "object") return null;
  if (typeof entry.alarmName !== "string" || !entry.alarmName) return null;

  const cft = Number(entry.calcFireTime);
  if (!Number.isFinite(cft)) return null;

  entry.calcFireTime = floorToMinute(Math.trunc(cft));

  const nf = Number(entry.nextFireTime);
  entry.nextFireTime = floorToMinute(Number.isFinite(nf) ? Math.trunc(nf) : entry.calcFireTime);

  const pf = Number(entry.prevFireTime);
  entry.prevFireTime = Number.isFinite(pf) ? floorToMinute(Math.trunc(pf)) : 0;

  if (entry.firstQRFireTime === "" || typeof entry.firstQRFireTime === "undefined") {
    entry.firstQRFireTime = "";
  } else {
    const fq = Number(entry.firstQRFireTime);
    entry.firstQRFireTime = Number.isFinite(fq) ? Math.trunc(fq) : "";
  }

  entry.qrActive = !!entry.qrActive;
  const qb = Number(entry.qrBackupFireTime);
  entry.qrBackupFireTime = Number.isFinite(qb) ? floorToMinute(Math.trunc(qb)) : 0;

  // NEW registry-only task keys
  entry.taskSatisfied = !!entry.taskSatisfied;              // suppress scheduling when true
  entry.taskCooldownScheduled = !!entry.taskCooldownScheduled; // QR+task internal state

  // Fill calendar-derived fields best-effort
  if (typeof entry.status !== "string") entry.status = "ON";
  if (typeof entry.reference !== "string") entry.reference = "start";
  if (!Number.isFinite(Number(entry.offsetMin))) entry.offsetMin = 0;

  if (typeof entry.qrCodeID !== "string") entry.qrCodeID = "";
  if (typeof entry.qrSoundPath !== "string") entry.qrSoundPath = "/shortcuts/ringtone.mp3";
  if (!Number.isFinite(Number(entry.qrSoundLen))) entry.qrSoundLen = 2.13;
  if (!Number.isFinite(Number(entry.qrVol))) entry.qrVol = 40;
  if (typeof entry.qrShortcutOnScan !== "string") entry.qrShortcutOnScan = "";
  if (typeof entry.shortcutOnTrigger !== "string") entry.shortcutOnTrigger = "";

  if (typeof entry.locationMode !== "string") entry.locationMode = "off";
  if (!Array.isArray(entry.locations)) entry.locations = [];
  if (!Number.isFinite(Number(entry.radiusMeters))) entry.radiusMeters = 50;

  if (typeof entry.silenceIfDriving !== "string") entry.silenceIfDriving = "OFF";
  if (!Array.isArray(entry.conflictingCalendars)) entry.conflictingCalendars = [];
  if (!Number.isFinite(Number(entry.reschedMinutes))) entry.reschedMinutes = 0;
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
  if (!Number.isFinite(Number(entry.maxReschedules))) entry.maxReschedules = 1;

  return entry;
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

  return { adds, removes, fieldUpdates };
}

function applyRegistryPatch(regOnDiskNow, patch) {
  const diskMap = new Map();
  for (const e of regOnDiskNow) {
    const k = registryKey(e);
    if (!diskMap.has(k)) diskMap.set(k, e);
  }

  for (const k of patch.removes) diskMap.delete(k);
  for (const [k, e] of patch.adds.entries()) diskMap.set(k, e);

  for (const [k, upd] of patch.fieldUpdates.entries()) {
    if (!diskMap.has(k)) continue;
    const e = diskMap.get(k);
    for (const [f, v] of Object.entries(upd.updates)) e[f] = v;
    for (const f of upd.deletes) delete e[f];
  }

  return Array.from(diskMap.values());
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
function inferFiredOwnedAlarm(iosAlarms, registryArr, nowSec) {
  const likely = [];
  for (const a of iosAlarms) {
    const candEpoch = hhmmToClosestEpoch(a.hh, a.mm, nowSec);
    if (candEpoch === null) continue;
    const dist = Math.abs(candEpoch - nowSec);
    if (dist <= 180) likely.push({ ios: a, dist });
  }
  if (!likely.length) return null;

  let best = null;
  for (const cand of likely) {
    const { name, hh, mm } = cand.ios;

    // if duplicates exist in iOS for this name+time, inference is unsafe
    if (findIOSMatches(iosAlarms, name, hh, mm) !== 1) continue;

    for (let i = 0; i < registryArr.length; i++) {
      const r = registryArr[i];
      if (r.alarmName !== name) continue;

      const rt = epochToHHMM(r.nextFireTime);
      if (rt.hh !== hh || rt.mm !== mm) continue;

      const delta = Math.abs(r.nextFireTime - nowSec);
      if (delta > 15 * 60) continue;

      if (!best || delta < best.delta) best = { registryIndex: i, ios: cand.ios, delta };
      else if (best && delta === best.delta) best = { ambiguous: true };
    }
  }

  if (!best) return null;
  if (best.ambiguous) {
    addError("WARN: fired-alarm inference ambiguous; skipping fast-path.");
    return null;
  }
  return best;
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

async function checkTaskIDsCompleteFailOpen(taskIDs) {
  if (!Array.isArray(taskIDs) || taskIDs.length === 0) return true;

  if (!TASK_ENDPOINT_BASE_URL) {
    addError("WARN: taskIDs set but TASK_WEBAPP_ID not configured; treating as complete.");
    return true;
  }

  for (const rawID of taskIDs) {
    const taskID = String(rawID ?? "").trim();
    if (!taskID) continue;

    try {
      const metrics = `%22${encodeURIComponent(taskID)}%22`;
      const key = "%22isComplete%22";
      const url = `${TASK_ENDPOINT_BASE_URL}?metrics=${metrics}&key=${key}`;
      const req = new Request(url);
      req.timeoutInterval = 5;
      const resp = await req.loadString();
      const trimmed = String(resp ?? "").trim();

      const pj = safeJSONParse(trimmed);
      if (pj.ok) {
        const v = pj.val;
        if (typeof v === "boolean") {
          if (!v) return false;
          continue;
        }
        if (v && typeof v === "object") {
          if (typeof v.complete === "boolean") {
            if (!v.complete) return false;
            continue;
          }
          if (typeof v.done === "boolean") {
            if (!v.done) return false;
            continue;
          }
        }
      }

      if (/^true$/i.test(trimmed)) continue;
      if (/^false$/i.test(trimmed)) return false;

      addError("WARN: taskIDs endpoint returned unrecognized response; treating as complete.");
    } catch (e) {
      addError(`WARN: taskIDs query failed; treating as complete. (${String(e)})`);
    }
  }

  return true;
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

  // Conflicts can push later than baseline
  const conflictReady = await findConflictReadyAt(entry, fireEpoch);
  if (conflictReady !== null) candidates.push(conflictReady);

  const reschedMinutes = Number(entry.reschedMinutes ?? 0);
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
    const cur = currentLocation; // null means "ignore location features"
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
          const km = nearest / 1000;
          const sec = Math.max(60, Math.round(km * LOCATION_TIME_MULTIPLIER_SEC_PER_KM));
          candidates.push(floorToMinute(fireEpoch + sec));
        }
      } else if (locationMode === "blacklist") {
        if (insideAny && reschedMinutes > 0) {
          candidates.push(floorToMinute(fireEpoch + reschedMinutes * 60));
        }
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

function registryNeedsLocation(registryEntries) {
  if (!Array.isArray(registryEntries)) return false;
  return registryEntries.some(entryUsesLocation);
}

async function getCurrentLocation() {
  try {
    Location.setAccuracy(100);
    const loc = await Location.current();
    if (loc && Number.isFinite(loc.latitude) && Number.isFinite(loc.longitude)) {
      return { lat: loc.latitude, lon: loc.longitude };
    }
  } catch (e) {
    addError(`ERR: failed to fetch location (${String(e)})`);
  }
  return null;
}

function updateQRBackupAlarm(entry, baseEpoch, iosAlarms) {
  const base = floorToMinute(baseEpoch);
  const backup = base + QR_BACKUP_INTERVAL_SEC;

  const existing = Number(entry.qrBackupFireTime ?? 0);
  if (Number.isFinite(existing) && existing > 0 && existing !== backup) {
    queueDeleteIOSIfUnique(iosAlarms, entry.alarmName, existing);
  }

  entry.qrBackupFireTime = backup;
  queueAddIOSIfMissing(iosAlarms, entry.alarmName, backup);
}

function clearQRBackupAlarm(entry, iosAlarms) {
  const existing = Number(entry.qrBackupFireTime ?? 0);
  if (Number.isFinite(existing) && existing > 0) {
    queueDeleteIOSIfUnique(iosAlarms, entry.alarmName, existing);
  }
  entry.qrBackupFireTime = 0;
}

function scheduleQRLoop(entry, baseEpoch, iosAlarms) {
  const base = floorToMinute(baseEpoch);
  const next = base + QR_LOOP_INTERVAL_SEC;
  updateQRBackupAlarm(entry, base, iosAlarms);
  queueAddIOSIfMissing(iosAlarms, entry.alarmName, next);
  return next;
}


// ---------- Fast-path ----------
async function tryFastPath(input, registryAfter) {
  const now = nowEpoch();
  const fired = inferFiredOwnedAlarm(input.iosAlarms, registryAfter, now);
  if (!fired) return { handled: false };

  const entry = registryAfter[fired.registryIndex];
  const name = entry.alarmName;
  const firedHH = fired.ios.hh;
  const firedMM = fired.ios.mm;
  const fireEpoch = Number(entry.nextFireTime ?? 0) || now;

  // Only proceed if the fired iOS alarm is uniquely identifiable
  if (findIOSMatches(input.iosAlarms, name, firedHH, firedMM) !== 1) {
    addError(`WARN: fired alarm not unique in iOS list; skipping fast-path for "${name}" @ ${firedHH}:${firedMM}`);
    return { handled: false };
  }

  // Always honor "taskSatisfied" latch: if it's satisfied, the next time it fires we should delete and stop
  // (should be rare, but safe).
  if (entry.taskSatisfied === true) {
    output.alarmsToDelete.push({ name, hh: firedHH, mm: firedMM });
    return { handled: true };
  }

  const hasQR = String(entry.qrCodeID ?? "").trim() !== "";
  const taskIDs = Array.isArray(entry.taskIDs) ? entry.taskIDs : [];
  const hasTask = taskIDs.length > 0;

  // --- TASK LOOP (new behavior) ---
  if (hasTask) {
    const complete = await checkTaskIDsCompleteFailOpen(taskIDs);

    if (complete) {
      // Stop behavior: delete this instance and suppress future scheduling until TTL cleanup.
      entry.taskSatisfied = true;
      entry.qrActive = false;
      entry.taskCooldownScheduled = false;
      clearQRBackupAlarm(entry, input.iosAlarms);

      output.alarmsToDelete.push({ name, hh: firedHH, mm: firedMM });
      return { handled: true };
    }

    // Incomplete => continue looping
    const taskLoopMin = Number(entry.taskLoopMin ?? 0);
    if (taskLoopMin <= 0) {
      // Cannot loop without an interval
      addError(`ERR: taskIDs set but taskLoopMin==0 for "${name}". Task loop cannot continue.`);
      output.alarmsToDelete.push({ name, hh: firedHH, mm: firedMM });
      return { handled: true };
    }

    if (hasQR) {
      // QR + taskIDs combined loop:
      // - If qrActive true => stay in QR loop.
      // - If qrActive false:
      //     * If firstQRFireTime not set => initial ring (start QR loop).
      //     * Else if taskCooldownScheduled false => post-scan tick => schedule cooldown at now+taskLoopMin.
      //     * Else (taskCooldownScheduled true) => cooldown alarm fired => re-arm QR loop.

      const firstSet = typeof entry.firstQRFireTime === "number" && Number.isFinite(entry.firstQRFireTime);
      const initialRing = !firstSet;

      // delete the just-fired alarm always for QR-managed alarms
      output.alarmsToDelete.push({ name, hh: firedHH, mm: firedMM });

      if (entry.qrActive === true) {
        // Continue QR ringing minute-loop
        entry.prevFireTime = entry.nextFireTime;
        entry.nextFireTime = scheduleQRLoop(entry, now, input.iosAlarms);

        // Ensure firstQRFireTime present
        if (!firstSet) entry.firstQRFireTime = now;

        output.qrLoop = true;

        // Only run shortcutOnTrigger when QR becomes active initially
        // (initial ring case handled below)
        return { handled: true };
      }

      // qrActive is false
      if (initialRing) {
        // Initial ring: start QR loop
        entry.firstQRFireTime = now;
        entry.qrActive = true;
        entry.taskCooldownScheduled = false;

        entry.prevFireTime = entry.nextFireTime;
        entry.nextFireTime = scheduleQRLoop(entry, now, input.iosAlarms);

        output.qrLoop = true;

        const trig = String(entry.shortcutOnTrigger ?? "").trim();
        if (trig) output.triggerShortcutsToRun.push(trig);

        return { handled: true };
      }

      if (entry.taskCooldownScheduled === false) {
        // Post-scan tick: schedule cooldown at now+taskLoopMin (no QR loop)
        const next = await computeRescheduleTime(entry, fireEpoch, input.currentFocus, input.currentLocation, /* includeTaskBaseline */ true);
        entry.prevFireTime = entry.nextFireTime;
        entry.nextFireTime = floorToMinute(next ?? (now + taskLoopMin * 60));

        entry.qrActive = false;
        entry.taskCooldownScheduled = true;
        clearQRBackupAlarm(entry, input.iosAlarms);

        queueAddIOSIfMissing(input.iosAlarms, name, entry.nextFireTime);
        return { handled: true };
      }

      // Cooldown alarm fired: re-arm QR loop now
      entry.taskCooldownScheduled = false;
      entry.qrActive = true;

      // Do NOT reset firstQRFireTime; keep original for the 60-minute QR timeout safety net.
      entry.prevFireTime = entry.nextFireTime;
      entry.nextFireTime = scheduleQRLoop(entry, now, input.iosAlarms);

      output.qrLoop = true;

      const trig = String(entry.shortcutOnTrigger ?? "").trim();
      if (trig) output.triggerShortcutsToRun.push(trig);

      return { handled: true };
    }

    // Non-QR task loop: delete fired + reschedule at now+taskLoopMin (no decrement)
    output.alarmsToDelete.push({ name, hh: firedHH, mm: firedMM });

    const next = await computeRescheduleTime(entry, fireEpoch, input.currentFocus, input.currentLocation, /* includeTaskBaseline */ true);
    entry.prevFireTime = entry.nextFireTime;
    entry.nextFireTime = floorToMinute(next ?? (now + taskLoopMin * 60));

    queueAddIOSIfMissing(input.iosAlarms, name, entry.nextFireTime);
    return { handled: true };
  }

  // --- ORIGINAL silence/reschedule logic (non-task alarms) ---
  // Determine if any gating applies (driving/conflict/location) and whether to reschedule.
  // If gated: delete fired alarm, maybe reschedule, decrement maxReschedules.
  // If not gated and is QR: handle QR minute-loop.
  // If not gated and not QR: do nothing fast-path; verifier/daily will manage.

  // Gating check (excluding task)
  const reschedMinutes = Number(entry.reschedMinutes ?? 0);
  let gated = false;

  const focus = String(input.currentFocus ?? "").trim().toLowerCase();
  if (String(entry.silenceIfDriving ?? "OFF").toUpperCase() === "ON" && focus === "driving") gated = true;

  const conflictReady = await findConflictReadyAt(entry, now);
  if (conflictReady !== null) gated = true;

  const locationMode = String(entry.locationMode ?? "off").toLowerCase();
  if ((locationMode === "whitelist" || locationMode === "blacklist") && Array.isArray(entry.locations) && entry.locations.length > 0) {
    const cur = input.currentLocation;
    if (cur) {
      const defaultRadius = Number(entry.radiusMeters ?? 50);
      let insideAny = false;
      for (const pair of entry.locations) {
        if (!Array.isArray(pair) || pair.length < 2) continue;
        const lat = Number(pair[0]), lon = Number(pair[1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        const radius = Number.isFinite(Number(pair[2])) ? Number(pair[2]) : defaultRadius;
        if (haversineMeters(cur.lat, cur.lon, lat, lon) <= radius) insideAny = true;
      }
      if (locationMode === "whitelist" && !insideAny) gated = true;
      if (locationMode === "blacklist" && insideAny) gated = true;
    }
  }

  if (gated) {
    output.alarmsToDelete.push({ name, hh: firedHH, mm: firedMM });

    if (reschedMinutes > 0 && Number(entry.maxReschedules ?? 0) > 0) {
      const remaining = Math.max(0, Math.trunc(Number(entry.maxReschedules)) - 1);
      entry.maxReschedules = remaining;

      if (remaining > 0) {
        const next = await computeRescheduleTime(entry, fireEpoch, input.currentFocus, input.currentLocation, /* includeTaskBaseline */ true);
        entry.prevFireTime = entry.nextFireTime;
        entry.nextFireTime = floorToMinute(next ?? (now + reschedMinutes * 60));

        queueAddIOSIfMissing(input.iosAlarms, name, entry.nextFireTime);
      } else {
        entry.prevFireTime = entry.nextFireTime;
      }
    }

    return { handled: true };
  }

  // QR minute-loop (non-task)
  if (hasQR) {
    // Always delete the just-fired instance (we own it)
    output.alarmsToDelete.push({ name, hh: firedHH, mm: firedMM });

    // Determine whether the just-fired alarm corresponds to the *real* calendar fire.
    const firedEpoch = Number(entry.nextFireTime ?? 0);                  // "the one that should exist" == the one that fired
    const calcEpoch  = floorToMinute(Number(entry.calcFireTime ?? 0));   // intended calendar fire minute (if known)

    const calcKnown = Number.isFinite(calcEpoch) && calcEpoch > 0;
    const firedKnown = Number.isFinite(firedEpoch) && firedEpoch > 0;

    const isCalendarFire = calcKnown && firedKnown && (firedEpoch === calcEpoch);

    if (entry.qrActive !== true) {
      // If it's NOT the calendar fire, this is almost certainly a leftover minute-tick
      // that fired after the user already scanned. Do NOT re-arm and do NOT schedule another tick.
      if (!isCalendarFire) {
        // Optional: clear scheduling pointers so verifier can cleanly re-establish later
        entry.prevFireTime = entry.nextFireTime;
        entry.nextFireTime = 0;
        clearQRBackupAlarm(entry, input.iosAlarms);
        output.qrLoop = false;
        return { handled: true };
      }

      // This IS the calendar fire: begin ringing loop
      entry.firstQRFireTime = now;
      entry.qrActive = true;

      const trig = String(entry.shortcutOnTrigger ?? "").trim();
      if (trig) output.triggerShortcutsToRun.push(trig);
    }

    // Continue ringing (minute tick)
    entry.prevFireTime = entry.nextFireTime;
    entry.nextFireTime = scheduleQRLoop(entry, now, input.iosAlarms);
    output.qrLoop = true;
    return { handled: true };
  }


  return { handled: false };
}

// ---------- Verifier ----------
async function buildExpectedAlarms(nowSec, calcMinSec, calcMaxSec) {
  // still fetch events ±7 days because offsets can pull calcFireTime into our window
  const start = new Date((nowSec - 7 * 86400) * 1000);
  const end = new Date((nowSec + 7 * 86400) * 1000);

  let events = [];
  try {
    events = await CalendarEvent.between(start, end);
  } catch (e) {
    addError(`ERR: Calendar fetch failed; verifier incomplete. (${String(e)})`);
    return new Map();
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
        addError(`WARN: event "${ev.title}" alarm JSON invalid.`);
      }
      continue;
    }

    if (hasBrackets && !sub) {
      addError(`WARN: event "${ev.title}" alarm JSON invalid.`);
      continue;
    }

    if (!sub) continue;

    const parsed = safeJSONParse(sub);
    if (!parsed.ok || !Array.isArray(parsed.val)) {
      addError(`WARN: event "${ev.title}" alarm JSON invalid.`);
      continue;
    }

    for (const rawObj of parsed.val) {
      const norm = normalizeCalendarAlarmObject(rawObj);
      if (!norm.ok) {
        addError(`WARN: ${norm.err} (event: "${ev.title}")`);
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
        nextFireTime: calcFireTime,
        firstQRFireTime: "",
        qrActive: false,
        taskSatisfied: false,
        taskCooldownScheduled: false,
        qrBackupFireTime: 0,
      });
    }
  }

  return expected;
}

async function runVerifier(input, registryAfter) {
  const now = nowEpoch();
  const nowMinute = floorToMinute(now);

  registryAfter = dropRegistryDuplicatesRandom(registryAfter);

  // Calendar window for calcFireTime:
  // - include past 24h so we can keep/respect rescheduled alarms whose calcFireTime already passed
  // - include next 24h because that's all we want to schedule from Calendar
  const calcMin = now - TTL_HARD_SEC;          // past 24h
  const calcMax = now + WINDOW_FUTURE_SEC;     // next 24h

  const expected = await buildExpectedAlarms(now, calcMin, calcMax);

  // Split expected into upcoming vs recent (by calcFireTime)
  const expectedUpcomingKeys = new Set();
  const expectedRecentKeys = new Set();
  for (const [k, exp] of expected.entries()) {
    if (exp.calcFireTime >= now && exp.calcFireTime <= calcMax) expectedUpcomingKeys.add(k);
    else if (exp.calcFireTime >= calcMin && exp.calcFireTime < now) expectedRecentKeys.add(k);
  }

  const regMap = new Map();
  for (const e of registryAfter) regMap.set(registryKey(e), e);

  // --- Cleanup / TTL + QR timeout (hard rules) ---
  const keysToDelete = new Set();

  for (const [k, r] of regMap.entries()) {
    // Hard TTL: no alarm whose original intended time is >24h ago
    if (r.calcFireTime < now - TTL_HARD_SEC) {
      keysToDelete.add(k);
      continue;
    }

    // QR timeout rule
    if (r.qrActive === true) {
      if (!(typeof r.firstQRFireTime === "number" && Number.isFinite(r.firstQRFireTime))) {
        addError(`ERR: qrActive true but firstQRFireTime missing; purging "${r.alarmName}".`);
        keysToDelete.add(k);
        continue;
      }
      if ((now - r.firstQRFireTime) > QR_TIMEOUT_SEC) {
        keysToDelete.add(k);
        continue;
      }
      const backupTime = Number(r.qrBackupFireTime ?? 0);
      if (Number.isFinite(backupTime) && backupTime < nowMinute) {
        queueDeleteIOSIfUnique(input.iosAlarms, r.alarmName, backupTime);
        r.qrBackupFireTime = 0;
      }
    } else if (Number(r.qrBackupFireTime ?? 0) > 0) {
      queueDeleteIOSIfUnique(input.iosAlarms, r.alarmName, r.qrBackupFireTime);
      r.qrBackupFireTime = 0;
    }

    // ✅ Delete any owned iOS alarms that are in the past (but NOT this minute)
    // This keeps Clock tidy and prevents clutter from already-fired alarms.
    if (Number.isFinite(r.nextFireTime) && r.nextFireTime < nowMinute) {
      queueDeleteIOSIfUnique(input.iosAlarms, r.alarmName, r.nextFireTime);
    }

    // If QR is active and its nextFireTime somehow fell behind (device off / missed),
    // push it forward to the next minute so the loop continues cleanly.
    if (r.qrActive === true && r.nextFireTime < nowMinute) {
      r.prevFireTime = r.nextFireTime;
      r.nextFireTime = scheduleQRLoop(r, nowMinute, input.iosAlarms);
    }
  }

  // --- Reconcile Calendar UPCOMING alarms (calcFireTime in next 24h) ---
  for (const k of expectedUpcomingKeys) {
    const exp = expected.get(k);

    if (!regMap.has(k)) {
      regMap.set(k, deepClone(exp));
      queueAddIOSIfMissing(input.iosAlarms, exp.alarmName, exp.nextFireTime);
      continue;
    }

    const r = regMap.get(k);

    // Update calendar-derived keys (preserve runtime keys)
    r.status = exp.status;
    r.offsetMin = exp.offsetMin;
    r.reference = exp.reference;
    r.qrCodeID = exp.qrCodeID;
    r.qrSoundPath = exp.qrSoundPath;
    r.qrSoundLen = exp.qrSoundLen;
    r.qrVol = exp.qrVol;
    r.qrShortcutOnScan = exp.qrShortcutOnScan;
    r.shortcutOnTrigger = exp.shortcutOnTrigger;
    r.locationMode = exp.locationMode;
    r.locations = exp.locations;
    r.radiusMeters = exp.radiusMeters;
    r.silenceIfDriving = exp.silenceIfDriving;
    r.conflictingCalendars = exp.conflictingCalendars;
    r.reschedMinutes = exp.reschedMinutes;
    r.taskLoopMin = exp.taskLoopMin;
    r.taskIDs = exp.taskIDs;

    // Keep remaining maxReschedules conservative
    const newMax = Math.trunc(Number(exp.maxReschedules ?? 1));
    const oldRem = Math.trunc(Number(r.maxReschedules ?? newMax));
    r.maxReschedules = Math.min(oldRem, newMax);

    // Immediate cleanup on reschedule: delete old scheduled iOS alarm at prevFireTime
    if (Number(r.prevFireTime ?? 0) > 0 && r.prevFireTime !== r.nextFireTime) {
      queueDeleteIOSIfUnique(input.iosAlarms, r.alarmName, r.prevFireTime);
      r.prevFireTime = 0;
    }

    // Ensure iOS alarm exists for nextFireTime if it's within the next 24h (and not taskSatisfied)
    if (!r.taskSatisfied && r.nextFireTime >= now && r.nextFireTime <= calcMax) {
      queueAddIOSIfMissing(input.iosAlarms, r.alarmName, r.nextFireTime);
      if (r.qrActive === true) updateQRBackupAlarm(r, nowMinute, input.iosAlarms);
    }
  }

  // --- Reconcile Calendar RECENT alarms (calcFireTime in last 24h) ---
  // Keep them ONLY if they already exist in registry AND their nextFireTime is still in the future.
  for (const k of expectedRecentKeys) {
    if (!regMap.has(k)) continue; // do NOT create new past alarms

    const exp = expected.get(k);
    const r = regMap.get(k);

    // Update calendar-derived keys (same as above)
    r.status = exp.status;
    r.offsetMin = exp.offsetMin;
    r.reference = exp.reference;
    r.qrCodeID = exp.qrCodeID;
    r.qrSoundPath = exp.qrSoundPath;
    r.qrSoundLen = exp.qrSoundLen;
    r.qrVol = exp.qrVol;
    r.qrShortcutOnScan = exp.qrShortcutOnScan;
    r.shortcutOnTrigger = exp.shortcutOnTrigger;
    r.locationMode = exp.locationMode;
    r.locations = exp.locations;
    r.radiusMeters = exp.radiusMeters;
    r.silenceIfDriving = exp.silenceIfDriving;
    r.conflictingCalendars = exp.conflictingCalendars;
    r.reschedMinutes = exp.reschedMinutes;
    r.taskLoopMin = exp.taskLoopMin;
    r.taskIDs = exp.taskIDs;

    const newMax = Math.trunc(Number(exp.maxReschedules ?? 1));
    const oldRem = Math.trunc(Number(r.maxReschedules ?? newMax));
    r.maxReschedules = Math.min(oldRem, newMax);

    // If it’s not QR-active, and its nextFireTime is not in the future (excluding “this minute”), delete it.
    // This implements: "previously-fired alarms are deleted immediately."
    if (r.qrActive !== true && r.nextFireTime < nowMinute) {
      // iOS alarm at nextFireTime already queued for delete above; remove registry
      regMap.delete(k);
      continue;
    }

    // If it's rescheduled into the future, ensure iOS alarm exists (only if within next 24h)
    if (!r.taskSatisfied && r.nextFireTime >= now && r.nextFireTime <= calcMax) {
      queueAddIOSIfMissing(input.iosAlarms, r.alarmName, r.nextFireTime);
      if (r.qrActive === true) updateQRBackupAlarm(r, nowMinute, input.iosAlarms);
    }
  }

  // --- Apply TTL/QR-timeout deletions ---
  for (const k of keysToDelete) {
    const r = regMap.get(k);
    if (!r) continue;

    if (Number(r.prevFireTime ?? 0) > 0 && r.prevFireTime !== r.nextFireTime) {
      queueDeleteIOSIfUnique(input.iosAlarms, r.alarmName, r.prevFireTime);
    }
    queueDeleteIOSIfUnique(input.iosAlarms, r.alarmName, r.nextFireTime);
    if (Number(r.qrBackupFireTime ?? 0) > 0) {
      queueDeleteIOSIfUnique(input.iosAlarms, r.alarmName, r.qrBackupFireTime);
    }

    regMap.delete(k);
  }

  // --- Delete registry entries that are no longer calendar-related (within our ±24h calcFireTime window),
  // unless they are actively QR-ringing and still within its 60-minute timeout.
  for (const [k, r] of Array.from(regMap.entries())) {
    if (expected.has(k)) continue;

    const keepQR =
      r.qrActive === true &&
      typeof r.firstQRFireTime === "number" &&
      Number.isFinite(r.firstQRFireTime) &&
      (now - r.firstQRFireTime) <= QR_TIMEOUT_SEC;

    if (keepQR) {
      // ensure it stays scheduled in the future
      if (r.nextFireTime < nowMinute) {
        r.prevFireTime = r.nextFireTime;
        r.nextFireTime = scheduleQRLoop(r, nowMinute, input.iosAlarms);
      }
      updateQRBackupAlarm(r, nowMinute, input.iosAlarms);
      continue;
    }

    // delete its paired iOS alarm if present
    if (Number(r.prevFireTime ?? 0) > 0 && r.prevFireTime !== r.nextFireTime) {
      queueDeleteIOSIfUnique(input.iosAlarms, r.alarmName, r.prevFireTime);
    }
    queueDeleteIOSIfUnique(input.iosAlarms, r.alarmName, r.nextFireTime);
    if (Number(r.qrBackupFireTime ?? 0) > 0) {
      queueDeleteIOSIfUnique(input.iosAlarms, r.alarmName, r.qrBackupFireTime);
    }

    regMap.delete(k);
  }

  return Array.from(regMap.values());
}


// ---------- MAIN ----------
const fm = getFileManager();

let baseDir;
try {
  baseDir = resolveShortcutsDirOrThrow(fm);
} catch (e) {
  addError(`ERR: ${String(e)}`);
  output.errorRegistry = errors.join("\n");
  Script.setShortcutOutput(JSON.stringify(output));
  return;
}

const registryPath = fm.joinPath(baseDir, FILES.registry);
const lockPath = fm.joinPath(baseDir, FILES.lock);
const scannerLastOpenedPath = fm.joinPath(baseDir, FILES.scannerLastOpened);
const menuLastOpenedPath = fm.joinPath(baseDir, FILES.menuLastOpened);
const menuOpenStatusPath = fm.joinPath(baseDir, FILES.menuOpenStatus);

// Phase A — Setup files
await ensureFile(fm, registryPath, "[]");
await ensureFile(fm, lockPath, "");
await ensureFile(fm, scannerLastOpenedPath, new Date(0).toISOString());
await ensureFile(fm, menuLastOpenedPath, new Date(0).toISOString());
await ensureFile(fm, menuOpenStatusPath, "false");

// Load registry
let registryBefore = await loadRegistry(fm, registryPath);
registryBefore = dropRegistryDuplicatesRandom(registryBefore);
let registryAfter = deepClone(registryBefore);

// Parse input
const input = parseEngineInput(args.shortcutParameter);

if (registryNeedsLocation(registryAfter) && !input.currentLocation) {
  input.currentLocation = await getCurrentLocation();
  if (!input.currentLocation) {
    addError("ERR: location required but unavailable.");
  }
}

// Phase B — Fast-path
const fast = await tryFastPath(input, registryAfter);

// Phase C — Verifier if fast-path didn't handle
if (!fast.handled) {
  registryAfter = await runVerifier(input, registryAfter);
}

// Write registry back under lock using diff patch
if (!registryEquals(registryBefore, registryAfter)) {
  const patch = computeRegistryPatch(registryBefore, registryAfter);
  const lock = await acquireLock(fm, lockPath);

  if (lock.ok) {
    const onDiskNow = await loadRegistry(fm, registryPath);
    const merged = applyRegistryPatch(onDiskNow, patch);
    const cleaned = dropRegistryDuplicatesRandom(merged);

    await safeWriteString(fm, registryPath, JSON.stringify(cleaned));
    await releaseLock(fm, lockPath);
  }
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
