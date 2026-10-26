// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: teal; icon-glyph: magic;
// CA_qrScanner_core.js  (Scriptable)
//
// Mode A (no input): choose active QR alarm name (earliest firstQRFireTime) + decide if menu should show.
// Mode B (input=qrCodeID): acquire lock, set matching active QR alarms qrActive=false,
//                          return owned QR alarm deletions + scan actions.
//
// IMPORTANT:
// - This script NEVER writes scannerLastOpened.txt.
//   Only Shortcuts should update scannerLastOpened.txt when the user presses "silence" or opens the scanner.

const BOOKMARK_NAME = "Shortcuts";
const OPENHABITS_DIRNAME = "OpenHabits";
const CALENDAR_ALARMS_DIRNAME = "Calendar Alarms";

const LOCK_STALE_SEC = 30;
const LOCK_RETRY_DELAY_MS = 500;
const LOCK_HARD_TIMEOUT_MS = 3000;
// Keep work after lock acquisition short too. Filesystem calls are synchronous
// and cannot be interrupted, so check again before committing alarm changes.
const SCANNER_WORK_BUDGET_MS = 4500;
const scannerDeadlineMs = Date.now() + SCANNER_WORK_BUDGET_MS;

const MENU_DEDUPE_SEC = 9;        // avoid duplicate menu overlays
const MENU_STALE_SEC = 120;        // stuck-rescue

const FILES = {
  registry: "registry.txt",
  lock: "registryLock.txt",
  scannerLastOpened: "scannerLastOpened.txt", // exists, but we do NOT write it here
  menuLastOpened: "menuLastOpened.txt",
  menuOpenStatus: "menuOpenStatus.txt",
};

const ZERO_WIDTH_RE = /[\u200B-\u200D\uFEFF]/g;
const errors = [];

function addError(line) {
  if (line === null || typeof line === "undefined") return;
  const s = String(line).replace(ZERO_WIDTH_RE, "");
  if (s.trim() === "") return;
  errors.push(s);
}

function finalizeErrorRegistry(errLines) {
  if (!Array.isArray(errLines) || errLines.length === 0) return "";
  let s = errLines.join("\n");
  s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(ZERO_WIDTH_RE, "").trim();
  return s;
}

function normalizeShortcutInputArray(raw) {
  if (Array.isArray(raw)) {
    return raw
      .map((x) => String(x ?? "").trim())
      .filter((x) => x !== "");
  }
  if (typeof raw === "string") {
    const t = raw.trim();
    return t ? [t] : [];
  }
  return [];
}

function normalizeShortcutAction(raw) {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    const input = normalizeShortcutInputArray(raw.input);
    return { name, input };
  }
  return { name: "", input: [] };
}

function normalizeShortcutActionList(raw) {
  if (Array.isArray(raw)) {
    return raw.map((x) => normalizeShortcutAction(x)).filter((x) => x.name);
  }
  const single = normalizeShortcutAction(raw);
  return single.name ? [single] : [];
}

function sleep(ms) {
  // Scriptable Timer intervals are milliseconds.
  return new Promise((resolve) => Timer.schedule(Math.max(0, Number(ms)), false, () => resolve()));
}

function nowEpoch() {
  return Math.floor(Date.now() / 1000);
}

function pad2(n) {
  const s = String(Math.trunc(n));
  return s.length === 1 ? "0" + s : s;
}

function epochToHHMM(epochSec) {
  const d = new Date(epochSec * 1000);
  return { hh: pad2(d.getHours()), mm: pad2(d.getMinutes()) };
}

function safeJSONParse(str) {
  try {
    return { ok: true, val: JSON.parse(str) };
  } catch (e) {
    return { ok: false, err: String(e) };
  }
}

function getFileManager() {
  return FileManager.iCloud();
}

function resolveShortcutsRootOrThrow(fm) {
  let p = null;
  try {
    if (typeof fm.bookmarkedPath === "function") p = fm.bookmarkedPath(BOOKMARK_NAME);
  } catch (_) {}
  try {
    if (!p && typeof FileManager.bookmarkedPath === "function") p = FileManager.bookmarkedPath(BOOKMARK_NAME);
  } catch (_) {}

  if (!p || typeof p !== "string" || !p.trim()) {
    throw new Error(
      `Missing Scriptable File Bookmark "${BOOKMARK_NAME}". Create it pointing to iCloud Drive/Shortcuts.`
    );
  }
  // A folder displayed as "Shortcuts" in Files can be backed by an iCloud app
  // container whose security-scoped path ends in "Documents". Trust the
  // selected bookmark rather than rejecting it based on that internal name.
  return p;
}

function resolveCalendarAlarmsDir(fm, shortcutsRoot) {
  return fm.joinPath(
    fm.joinPath(shortcutsRoot, OPENHABITS_DIRNAME),
    CALENDAR_ALARMS_DIRNAME
  );
}

function checkWorkBudget() {
  if (Date.now() >= scannerDeadlineMs) {
    throw new Error("Scanner took too long. No alarm changes were made. Please scan again.");
  }
}

function requireDownloaded(fm, path, allowMissing = false) {
  const name = String(path).split("/").pop();
  if (!fm.fileExists(path)) {
    if (allowMissing) return false;
    throw new Error(`${name} is missing. Run Calendar Alarm Engine before scanning. No alarm changes were made.`);
  }
  if (typeof fm.isFileDownloaded === "function" && !fm.isFileDownloaded(path)) {
    throw new Error(`${name} is not downloaded. Download the Calendar Alarms folder in Files, then scan again. No alarm changes were made.`);
  }
  return true;
}

function safeReadString(fm, path, fallback) {
  try {
    // A fallback is only for a genuinely absent optional file. A failed read
    // must never become an empty registry or an apparently unlocked lock.
    if (!requireDownloaded(fm, path, fallback !== undefined)) return fallback;
    const value = fm.readString(path);
    if (typeof value !== "string") {
      throw new Error("The file could not be read as text.");
    }
    return value;
  } catch (e) {
    throw new Error(`Read failed (${String(path).split("/").pop()}): ${String(e)}`);
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

function parseBoolish(s) {
  const t = String(s ?? "").trim().toLowerCase();
  if (t === "true" || t === "1" || t === "yes" || t === "y") return true;
  if (t === "false" || t === "0" || t === "no" || t === "n") return false;
  return false;
}

// Accepts epoch seconds/ms or ISO; returns epoch seconds (int) or 0.
function parseTimestampToEpochSec(s) {
  const t = String(s ?? "").trim();
  if (!t) return 0;

  if (/^-?\d+(\.\d+)?$/.test(t)) {
    const n = Number(t);
    if (!Number.isFinite(n)) return 0;
    if (Math.abs(n) > 1e12) return Math.trunc(n / 1000);
    return Math.trunc(n);
  }

  const ms = Date.parse(t);
  if (!Number.isFinite(ms)) return 0;
  return Math.trunc(ms / 1000);
}

async function loadRegistry(fm, registryPath) {
  const raw = await safeReadString(fm, registryPath);
  checkWorkBudget();
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
    if (!e || typeof e !== "object") continue;
    if (typeof e.alarmName !== "string" || !e.alarmName.trim()) continue;
    out.push(e);
  }
  return out;
}

// ---------- Locking ----------
async function acquireLock(fm, lockPath) {
  const myId = `${nowEpoch()}-${Math.floor(Math.random() * 1e9)}`;
  const deadlineMs = Date.now() + LOCK_HARD_TIMEOUT_MS;
  const remainingMs = () => Math.max(0, deadlineMs - Date.now());

  while (remainingMs() > 0) {
    const raw = await safeReadString(fm, lockPath, "");
    // Never start a claim after a slow local read exhausted the budget.
    if (remainingMs() === 0) break;
    let lockObj = null;

    if (raw && raw.trim()) {
      const p = safeJSONParse(raw);
      if (!p.ok || !p.val || typeof p.val !== "object" || Array.isArray(p.val) ||
          typeof p.val.id !== "string" || !p.val.id ||
          typeof p.val.timestamp !== "number" || !Number.isFinite(p.val.timestamp)) {
        throw new Error("registryLock.txt is invalid. No alarm changes were made. Run Calendar Alarm Engine, then scan again.");
      }
      lockObj = p.val;
    }

    const now = nowEpoch();
    const ts = Number(lockObj?.timestamp ?? 0);
    const age = now - ts;

    if (lockObj && Number.isFinite(ts) && age < LOCK_STALE_SEC) {
      await sleep(Math.min(LOCK_RETRY_DELAY_MS, remainingMs()));
      continue;
    }

    const claim = { id: myId, timestamp: now };
    if (!(await safeWriteString(fm, lockPath, JSON.stringify(claim)))) return { ok: false, id: null };

    let verifyRaw;
    try {
      await sleep(Math.min(LOCK_RETRY_DELAY_MS, remainingMs()));
      verifyRaw = safeReadString(fm, lockPath, "");
    } catch (e) {
      releaseLock(fm, lockPath, myId);
      throw e;
    }
    const verify = safeJSONParse(verifyRaw);
    if (verify.ok && verify.val && verify.val.id === myId) {
      if (Date.now() <= deadlineMs) return { ok: true, id: myId };
      // A delayed verification must not leave our expired claim behind.
      // Verification and this write are synchronous: do not yield ownership
      // between confirming our ID and clearing the expired claim.
      fm.writeString(lockPath, "");
      break;
    }
  }

  addError("Alarm data is busy. Please scan the QR code again. No alarm changes were made.");
  return { ok: false, id: null };
}

function ownsLock(fm, lockPath, id) {
  const parsed = safeJSONParse(safeReadString(fm, lockPath, ""));
  return !!(parsed.ok && parsed.val && parsed.val.id === id);
}

function releaseLock(fm, lockPath, id) {
  try {
    // No await between checking ownership and clearing the claim. Never erase
    // a successor's lock, or write when the current claim cannot be read.
    if (ownsLock(fm, lockPath, id)) fm.writeString(lockPath, "");
  } catch (e) {
    addError(`ERR: Could not release scanner lock: ${String(e)}`);
  }
}

function pickActiveQRAlarm(registryArr) {
  const active = [];
  for (const a of registryArr) {
    if (!a || typeof a !== "object") continue;
    if (a.qrActive !== true) continue;
    active.push(a);
  }
  if (!active.length) return null;

  const now = nowEpoch();
  active.sort((x, y) => {
    const tx =
      typeof x.firstQRFireTime === "number" && Number.isFinite(x.firstQRFireTime) ? x.firstQRFireTime : now;
    const ty =
      typeof y.firstQRFireTime === "number" && Number.isFinite(y.firstQRFireTime) ? y.firstQRFireTime : now;
    return tx - ty;
  });

  return active[0];
}

function waitingForPlayback(entry) {
  // Opt-in state from the updated Engine. Older registry entries keep their
  // existing menu behavior; direct scans never depend on this handshake.
  if (!hasTaskLoop(entry) || entry.qrMenuAfterPlayback !== true) return false;
  const local = FileManager.local();
  const ownerPath = local.joinPath(local.cacheDirectory(), "calendar-alarms-loop-owner-v1.json");
  // Legacy native playback has no Runtime session. An ended session also must
  // not hide the recovery menu indefinitely if native playback never started.
  if (!local.fileExists(ownerPath)) return false;
  const owner = safeJSONParse(local.readString(ownerPath)).val;
  if (!owner || Number(owner.deadline) <= Date.now()) return false;
  // A task interval may fire while the preceding QR instance is still active.
  // Its old playback marker must not release a menu before Engine handles it.
  if (Number(entry.taskCheckFireTime) > 0 && Number(entry.taskCheckFireTime) <= nowEpoch()) return true;
  const playbackPath = local.joinPath(local.cacheDirectory(), "calendar-alarms-playback-v1.json");
  if (!local.fileExists(playbackPath)) return true;
  const parsed = safeJSONParse(local.readString(playbackPath));
  const playback = parsed.ok && parsed.val;
  const key = JSON.stringify([entry.alarmName, entry.calcFireTime || 0,
    entry.firstQRFireTime, entry.qrGeneration || 0, entry.qrCodeID]);
  return !playback || playback.instanceID !== owner.id ||
    playback.alarmKey !== key || playback.triggerID !== (entry.triggerActionID || "");
}

function menuDeferred(active) {
  return {mode: "menu", hasActiveQR: true, activeName: String(active.alarmName ?? ""), shouldShowMenu: false};
}

async function runModeA(fm, paths) {
  const reg = await loadRegistry(fm, paths.registry);
  let active = pickActiveQRAlarm(reg);

  if (!active) {
    return { mode: "menu", hasActiveQR: false, activeName: "", shouldShowMenu: false };
  }
  if (waitingForPlayback(active)) return menuDeferred(active);

  const menuOpenRaw = await safeReadString(fm, paths.menuOpenStatus, "false");
  const menuOpen = parseBoolish(menuOpenRaw);

  const lastOpenedRaw = await safeReadString(fm, paths.menuLastOpened, new Date(0).toISOString());
  const lastOpened = parseTimestampToEpochSec(lastOpenedRaw);
  const age = nowEpoch() - lastOpened;

  // Stuck-rescue
  if (menuOpen && (age < 0 || age > MENU_STALE_SEC)) {
    await safeWriteString(fm, paths.menuOpenStatus, "false");
  }

  const menuOpenEffective = menuOpen && age >= 0 && age <= MENU_STALE_SEC;
  const openedRecently = age >= 0 && age <= MENU_DEDUPE_SEC;

  const shouldShowMenu = !(menuOpenEffective || openedRecently);

  // Refresh after the awaited menu-state reads. Task reset/scan can complete
  // during those reads; don't claim a menu for an alarm that has since stopped.
  active = pickActiveQRAlarm(await loadRegistry(fm, paths.registry));
  if (!active) return {mode: "menu", hasActiveQR: false, activeName: "", shouldShowMenu: false};
  if (waitingForPlayback(active)) return menuDeferred(active);

  if (shouldShowMenu) {
    checkWorkBudget();
    // Claim the menu slot
    await safeWriteString(fm, paths.menuOpenStatus, "true");
    await safeWriteString(fm, paths.menuLastOpened, new Date().toISOString());
  }

  return {
    mode: "menu",
    hasActiveQR: true,
    activeName: String(active.alarmName ?? ""),
    shouldShowMenu,
  };
}

function hasTaskLoop(entry) {
  return entry.taskLoopEnabled !== false && Array.isArray(entry.taskIDs) && entry.taskIDs.some((id) => typeof id === "string" && id.trim());
}

function clockSlot(epoch, storedHHMM) {
  const time = Number(epoch);
  if (!Number.isFinite(time) || time <= 0) return null;
  const match = /^(\d{2}):(\d{2})$/.exec(String(storedHHMM ?? ""));
  const { hh, mm } = match && Number(match[1]) < 24 && Number(match[2]) < 60
    ? { hh: match[1], mm: match[2] } : epochToHHMM(time);
  return { hh, mm };
}

function scanAlarmDeletions(registry, scannedEntries) {
  const qrFields = [["qrRestartFireTime", "qrRestartHHMM"],
    ["qrFallbackFireTime", "qrFallbackHHMM"], ["qrBackupFireTime", "qrBackupHHMM"]];
  const key = (name, slot) => `${name}|||${slot.hh}|||${slot.mm}`;
  const protectedTimes = new Set();
  const scanned = new Set(scannedEntries);
  for (const entry of registry) {
    if (!entry || typeof entry !== "object" || entry.taskSatisfied === true) continue;
    const task = hasTaskLoop(entry);
    const fields = [];
    if (task || (!scanned.has(entry) &&
        (entry.qrActive || entry.qrPending || !(Number(entry.firstQRFireTime) > 0)))) {
      fields.push(["nextFireTime", "nextFireHHMM"]);
    }
    if (task) fields.push(["taskCheckFireTime", "taskCheckHHMM"]);
    if (entry.qrActive || entry.qrPending) fields.push(...qrFields);
    for (const [time, mirror] of fields) {
      const slot = clockSlot(entry[time], entry[mirror]);
      if (slot) protectedTimes.add(key(entry.alarmName, slot));
    }
  }
  const deletions = new Map();
  for (const entry of scannedEntries) {
    const name = String(entry.alarmName ?? "").trim();
    if (!name) continue;
    const fields = hasTaskLoop(entry) ? qrFields : [...qrFields, ["nextFireTime", "nextFireHHMM"]];
    const slots = fields.map(([time, mirror]) => clockSlot(entry[time], entry[mirror]));
    if (Array.isArray(entry.retiredAlarmTimes)) {
      for (const retired of entry.retiredAlarmTimes) {
        if (retired) slots.push(clockSlot(retired.epoch, retired.hhmm));
      }
    }
    for (const slot of slots) {
      if (slot && !protectedTimes.has(key(name, slot))) deletions.set(key(name, slot), { name, ...slot });
    }
  }
  return Array.from(deletions.values());
}

async function runModeB(fm, paths, qrCodeID) {
  const out = {
    mode: "scan",
    identifiedAlarms: 0,
    shortcutsToRun: [],
    shortcutsToRunDetailed: [],
    shortcutToRun: "",
    shortcutToRunInput: [],
    notification: "",
    vibrate: false,
    alarmsToDelete: [],
  };

  // Do not create an empty registry during cold start or iCloud eviction.
  requireDownloaded(fm, paths.registry);
  checkWorkBudget();
  const lock = await acquireLock(fm, paths.lock);
  if (!lock.ok) return out;

  try {
    const regRaw = await safeReadString(fm, paths.registry);
    checkWorkBudget();
    const pj = safeJSONParse(regRaw);
    let reg = [];

    if (!pj.ok || !Array.isArray(pj.val)) {
      addError("ERR: registry.txt corrupt during scan; no changes made.");
      return out;
    } else {
      reg = pj.val;
    }

    const matchedNames = [];
    const remainingActive = [];
    const scannedEntries = [];

    for (const a of reg) {
      if (!a || typeof a !== "object") continue;
      if (a.qrActive !== true) continue;

      const name = String(a.alarmName ?? "").trim();
      const code = String(a.qrCodeID ?? "");

      if (code === qrCodeID) {
        a.qrActive = false;
        a.qrPending = false;
        a.qrPendingSince = 0;
        scannedEntries.push(a);
        out.identifiedAlarms += 1;
        if (name) matchedNames.push(name);

        const actions = normalizeShortcutActionList(a.qrShortcutsOnScan ?? a.qrShortcutOnScan);
        for (const action of actions) {
          out.shortcutsToRun.push(action.name);
          out.shortcutsToRunDetailed.push({ name: action.name, input: action.input });
        }
      } else {
        if (name) {
          remainingActive.push({ name, code });
        }
      }
    }

    // Keep the schedule pointers until Engine confirms native Clock deletion.
    // Protect shared task/occurrence times after every matching QR instance stops.
    out.alarmsToDelete = scanAlarmDeletions(reg, scannedEntries);
    out.vibrate = out.identifiedAlarms > 0;

    if (out.shortcutsToRunDetailed.length > 1) {
      const seen = new Set();
      out.shortcutsToRunDetailed = out.shortcutsToRunDetailed.filter((a) => {
        const key = `${a.name}|||${JSON.stringify(a.input)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      out.shortcutsToRun = out.shortcutsToRunDetailed.map((a) => a.name);
    }

    // ✅ UX: Always return an explicit success signal when correct code was scanned
    if (out.identifiedAlarms > 0) {
      let msg = `✅ cleared: ${matchedNames.length ? matchedNames.join(", ") : "alarm"}`
      if (remainingActive.length) {
        msg += `\n\nStill active:\n` + remainingActive.map(({ name, code }) => `please scan ${name} (ID = ${code})`).join("\n");
      }
      out.notification = msg;
    } else {
      // No matches: keep original "wrong code" guidance for any active alarms
      if (remainingActive.length) {
        out.notification = remainingActive.map(({ name, code }) => `wrong code. Please scan ${name} (ID = ${code})`).join("\n");
      } else {
        // No active QR alarms at all
        out.notification = "";
      }
    }

    if (!out.shortcutToRun) {
      out.shortcutToRun = out.shortcutsToRun[0] || "";
      out.shortcutToRunInput = out.shortcutsToRunDetailed[0]?.input || [];
    }

    const savedRegistry = JSON.stringify(reg);
    if (!ownsLock(fm, paths.lock, lock.id)) {
      throw new Error("Alarm data changed during scanning. No alarm changes were made. Please scan again.");
    }
    checkWorkBudget();
    // An unmatched scan has no registry changes to commit.
    if (out.identifiedAlarms === 0) return out;
    if (!(await safeWriteString(fm, paths.registry, savedRegistry))) {
      return { ...out, identifiedAlarms: 0, shortcutsToRun: [], shortcutsToRunDetailed: [],
        shortcutToRun: "", shortcutToRunInput: [], vibrate: false, alarmsToDelete: [],
        notification: "Could not save alarm cleanup. Please scan again." };
    }
  } finally {
    releaseLock(fm, paths.lock, lock.id);
  }

  return out;
}

// ---------- MAIN ----------
const result = {};

try {
  const fm = getFileManager();
  const shortcutsRoot = resolveShortcutsRootOrThrow(fm);
  const baseDir = resolveCalendarAlarmsDir(fm, shortcutsRoot);

  const paths = {
    registry: fm.joinPath(baseDir, FILES.registry),
    lock: fm.joinPath(baseDir, FILES.lock),
    scannerLastOpened: fm.joinPath(baseDir, FILES.scannerLastOpened),
    menuLastOpened: fm.joinPath(baseDir, FILES.menuLastOpened),
    menuOpenStatus: fm.joinPath(baseDir, FILES.menuOpenStatus),
  };

  const rawInput = String(args.shortcutParameter ?? "");
  const trimmed = rawInput.trim();

  if (!trimmed) Object.assign(result, await runModeA(fm, paths));
  else Object.assign(result, await runModeB(fm, paths, trimmed));
} catch (e) {
  addError(`ERR: CA_qrScanner_core failed: ${String(e)}`);
  result.mode = String(args.shortcutParameter ?? "").trim() ? "scan" : "menu";
  if (result.mode === "menu") {
    result.hasActiveQR = false;
    result.activeName = "";
    result.shouldShowMenu = false;
  } else {
    result.identifiedAlarms = 0;
    result.shortcutsToRun = [];
    result.shortcutsToRunDetailed = [];
    result.shortcutToRun = "";
    result.shortcutToRunInput = [];
    result.notification = "";
    result.vibrate = false;
    result.alarmsToDelete = [];
  }
}

result.errorRegistry = finalizeErrorRegistry(errors);
Script.setShortcutOutput(JSON.stringify(result));
Script.complete();
