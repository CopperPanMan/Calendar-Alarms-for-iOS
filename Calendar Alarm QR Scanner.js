// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: teal; icon-glyph: magic;
// CA_qrScanner_core.js  (Scriptable)
//
// Mode A (no input): choose active QR alarm name (earliest firstQRFireTime) + decide if menu should show.
// Mode B (input=qrCodeID): acquire lock, set matching active QR alarms qrActive=false,
//                          return shortcutsToRun + notifications.
//
// IMPORTANT:
// - This script NEVER writes scannerLastOpened.txt.
//   Only Shortcuts should update scannerLastOpened.txt when the user presses "silence" or opens the scanner.

const BOOKMARK_NAME = "Calendar Alarms";

const LOCK_STALE_SEC = 30;
const LOCK_RETRY_DELAY_MS = 500;
const LOCK_HARD_TIMEOUT_MS = 30000;

const MENU_DEDUPE_SEC = 20;        // avoid duplicate menu overlays
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
  const seconds = Math.max(0, Number(ms) / 1000);
  return new Promise((resolve) => Timer.schedule(seconds, false, () => resolve()));
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

function resolveShortcutsDirOrThrow(fm) {
  let p = null;
  try {
    if (typeof fm.bookmarkedPath === "function") p = fm.bookmarkedPath(BOOKMARK_NAME);
  } catch (_) {}
  try {
    if (!p && typeof FileManager.bookmarkedPath === "function") p = FileManager.bookmarkedPath(BOOKMARK_NAME);
  } catch (_) {}

  if (!p || typeof p !== "string" || !p.trim()) {
    throw new Error(
      `Missing Scriptable File Bookmark "${BOOKMARK_NAME}". Create a bookmark pointing to iCloud Drive/Shortcuts/Calendar Alarms.`
    );
  }
  return p;
}

async function ensureFile(fm, path, defaultContent) {
  try {
    if (!fm.fileExists(path)) fm.writeString(path, defaultContent);
  } catch (e) {
    addError(`ERR: ensureFile failed (${path}): ${String(e)}`);
  }
}

async function safeReadString(fm, path, fallback) {
  try {
    if (!fm.fileExists(path)) return fallback;
    if (fm.isFileStoredIniCloud && fm.isFileStoredIniCloud(path)) {
      if (!fm.isFileDownloaded(path)) await fm.downloadFileFromiCloud(path);
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
    if (!e || typeof e !== "object") continue;
    if (typeof e.alarmName !== "string" || !e.alarmName.trim()) continue;
    out.push(e);
  }
  return out;
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
      if (p.ok && p.val && typeof p.val === "object") lockObj = p.val;
      else {
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
    if (verify.ok && verify.val && verify.val.id === myId) return { ok: true, id: myId };
  }

  addError("ERR: registry lock timeout (30s). No registry write performed.");
  return { ok: false, id: null };
}

async function releaseLock(fm, lockPath) {
  await safeWriteString(fm, lockPath, "");
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

async function runModeA(fm, paths) {
  const reg = await loadRegistry(fm, paths.registry);
  const active = pickActiveQRAlarm(reg);

  if (!active) {
    return { mode: "menu", hasActiveQR: false, activeName: "", shouldShowMenu: false };
  }

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

  if (shouldShowMenu) {
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

  const lock = await acquireLock(fm, paths.lock);
  if (!lock.ok) return out;

  try {
    const regRaw = await safeReadString(fm, paths.registry, "[]");
    const pj = safeJSONParse(regRaw);
    let reg = [];

    if (!pj.ok || !Array.isArray(pj.val)) {
      addError("ERR: registry.txt corrupt during scan; no changes made.");
      reg = [];
    } else {
      reg = pj.val;
    }

    const matchedNames = [];
    const remainingActive = [];

    for (const a of reg) {
      if (!a || typeof a !== "object") continue;
      if (a.qrActive !== true) continue;

      const name = String(a.alarmName ?? "").trim();
      const code = String(a.qrCodeID ?? "");

      if (code === qrCodeID) {
        a.qrActive = false;
        out.identifiedAlarms += 1;
        if (name) matchedNames.push(name);

        const actions = normalizeShortcutActionList(a.qrShortcutsOnScan ?? a.qrShortcutOnScan);
        for (const action of actions) {
          out.shortcutsToRun.push(action.name);
          out.shortcutsToRunDetailed.push({ name: action.name, input: action.input });
        }

        if (name) {
          const taskIDs = Array.isArray(a.taskIDs)
            ? a.taskIDs.filter((x) => typeof x === "string" && x.trim())
            : [];
          const hasTaskLoop = taskIDs.length > 0;

          // Non-task QR loops should stop all pending local alarms immediately on scan.
          // Task-loop alarms keep nextFireTime because the engine pre-schedules the follow-up nag there.
          if (!hasTaskLoop) {
            const nextFire = Number(a.nextFireTime ?? 0);
            if (Number.isFinite(nextFire) && nextFire > 0) {
              const { hh, mm } = epochToHHMM(nextFire);
              out.alarmsToDelete.push({ name, hh, mm });
            }
          }

          const backup = Number(a.qrBackupFireTime ?? 0);
          if (Number.isFinite(backup) && backup > 0) {
            const { hh, mm } = epochToHHMM(backup);
            out.alarmsToDelete.push({ name, hh, mm });
          }
        }
      } else {
        if (name) {
          remainingActive.push({ name, code });
        }
      }
    }

    out.vibrate = out.identifiedAlarms > 0;

    if (out.alarmsToDelete.length > 1) {
      const seen = new Set();
      out.alarmsToDelete = out.alarmsToDelete.filter((a) => {
        const key = `${a.name}|||${a.hh}|||${a.mm}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
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

    await safeWriteString(fm, paths.registry, JSON.stringify(reg));
  } finally {
    await releaseLock(fm, paths.lock);
  }

  return out;
}

// ---------- MAIN ----------
const result = {};
const fm = getFileManager();

try {
  const baseDir = resolveShortcutsDirOrThrow(fm);

  const paths = {
    registry: fm.joinPath(baseDir, FILES.registry),
    lock: fm.joinPath(baseDir, FILES.lock),
    scannerLastOpened: fm.joinPath(baseDir, FILES.scannerLastOpened),
    menuLastOpened: fm.joinPath(baseDir, FILES.menuLastOpened),
    menuOpenStatus: fm.joinPath(baseDir, FILES.menuOpenStatus),
  };

  await ensureFile(fm, paths.registry, "[]");
  await ensureFile(fm, paths.lock, "");
  await ensureFile(fm, paths.scannerLastOpened, new Date(0).toISOString());
  await ensureFile(fm, paths.menuLastOpened, new Date(0).toISOString());
  await ensureFile(fm, paths.menuOpenStatus, "false");

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
  }
}

result.errorRegistry = finalizeErrorRegistry(errors);
Script.setShortcutOutput(JSON.stringify(result));
