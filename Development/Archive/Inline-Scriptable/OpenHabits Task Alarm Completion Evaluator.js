// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: light-brown; icon-glyph: check-circle;
//
// Reads the original task_alarm_reset action from args.shortcutParameter,
// evaluates its metrics against the OpenHabits cache, and returns JSON that is
// also compatible with Calendar Alarm Engine's fifth input field. The calling
// Shortcut owns cache freshness and all alarm-reset behavior.

const SHORTCUTS_BOOKMARK_NAME = "Shortcuts";
const CACHE_PATH_PARTS = ["OpenHabits", "OpenHabits Metrics", "lockoutCache.json"];

function parseJSON(value, description) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`Empty ${description} received.`);
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    throw new Error(`${description} is not valid JSON: ${error?.message ?? String(error)}`);
  }
}

function normalizeMetricIDs(raw) {
  if (Array.isArray(raw)) {
    return raw.map((value) => String(value ?? "").trim()).filter(Boolean);
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[")) {
      const parsed = parseJSON(trimmed, "taskLoopMetricIDs");
      if (!Array.isArray(parsed)) throw new Error("JSON-encoded taskLoopMetricIDs must be an array.");
      return normalizeMetricIDs(parsed);
    }
    return trimmed.split(",").map((value) => value.trim()).filter(Boolean);
  }
  return raw == null ? [] : [String(raw).trim()].filter(Boolean);
}

function parseActionInput(raw) {
  if (raw == null) throw new Error("No task_alarm_reset action input received.");
  if (Array.isArray(raw)) {
    if (raw.length !== 1) throw new Error("Expected exactly one task_alarm_reset action.");
    [raw] = raw;
  }
  const action = parseJSON(raw, "task_alarm_reset action");
  if (!action || typeof action !== "object" || Array.isArray(action)) {
    throw new Error("task_alarm_reset action must be an object.");
  }
  if (action.action != null && action.action !== "task_alarm_reset") {
    throw new Error(`Expected action "task_alarm_reset", received "${String(action.action)}".`);
  }
  const metricIDs = [...new Set(normalizeMetricIDs(action.taskLoopMetricIDs))];
  if (!metricIDs.length) throw new Error("The task_alarm_reset action has no taskLoopMetricIDs.");
  return metricIDs;
}

function resolveShortcutsRoot(fm) {
  let path = null;
  try {
    if (typeof fm.bookmarkedPath === "function") path = fm.bookmarkedPath(SHORTCUTS_BOOKMARK_NAME);
  } catch (_) {}
  try {
    if (!path && typeof FileManager.bookmarkedPath === "function") {
      path = FileManager.bookmarkedPath(SHORTCUTS_BOOKMARK_NAME);
    }
  } catch (_) {}
  if (typeof path !== "string" || !path.trim()) {
    throw new Error(`Missing Scriptable file bookmark "${SHORTCUTS_BOOKMARK_NAME}".`);
  }
  return path;
}

async function readOpenHabitsCache() {
  const fm = FileManager.iCloud();
  const root = resolveShortcutsRoot(fm);
  const cachePath = CACHE_PATH_PARTS.reduce((path, part) => fm.joinPath(path, part), root);
  if (!fm.fileExists(cachePath)) throw new Error(`OpenHabits cache was not found at ${cachePath}.`);
  if (
    typeof fm.isFileStoredIniCloud === "function" &&
    fm.isFileStoredIniCloud(cachePath) &&
    typeof fm.isFileDownloaded === "function" &&
    !fm.isFileDownloaded(cachePath)
  ) {
    await fm.downloadFileFromiCloud(cachePath);
  }
  const cache = parseJSON(fm.readString(cachePath), "OpenHabits cache");
  if (!cache || typeof cache !== "object" || Array.isArray(cache)) {
    throw new Error("The OpenHabits cache must contain a JSON object.");
  }
  if (cache.ok === false) throw new Error("The cached config_snapshot was unsuccessful.");
  return cache;
}

function evaluateTaskCompletion(cache, metricIDs) {
  const byID = cache.reminderState?.byID;
  if (!byID || typeof byID !== "object" || Array.isArray(byID)) {
    throw new Error("The OpenHabits cache is missing reminderState.byID.");
  }
  const metricsByID = metricIDs.map((metricID) => {
    const metric = byID[metricID];
    if (!metric || typeof metric !== "object" || Array.isArray(metric)) {
      return { metricID, found: false, complete: false };
    }
    return {
      metricID,
      found: metric.found !== false,
      complete: metric.found !== false && metric.complete === true,
    };
  });
  return {
    ok: true,
    allComplete: metricsByID.every((metric) => metric.complete === true),
    metricsByID,
  };
}

async function main() {
  try {
    const metricIDs = parseActionInput(args.shortcutParameter);
    const cache = await readOpenHabitsCache();
    const result = evaluateTaskCompletion(cache, metricIDs);
    const output = JSON.stringify(result);
    Script.setShortcutOutput(output);
    console.log(output);
  } catch (error) {
    const output = JSON.stringify({
      ok: false,
      allComplete: false,
      metricsByID: [],
      error: error?.message ?? String(error),
    });
    Script.setShortcutOutput(output);
    console.error(output);
  } finally {
    Script.complete();
  }
}

await main();
