// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: light-brown; icon-glyph: magic;
//
// Reads the original openhabits_reminder action from args.shortcutParameter,
// loads the current OpenHabits cache, and returns a message suitable for
// Shortcuts to display or speak. The calling Shortcut owns cache freshness.

const CONFIG = {
  urgentAtMinutes: 20,
  criticalAtMinutes: 5,
  includeTodayPoints: true,
  includeYesterdayPoints: false,
  decimals: 1,
};

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
      const parsed = parseJSON(trimmed, "metricIDs");
      if (!Array.isArray(parsed)) throw new Error("JSON-encoded metricIDs must be an array.");
      return normalizeMetricIDs(parsed);
    }
    return trimmed.split(",").map((value) => value.trim()).filter(Boolean);
  }
  return raw == null ? [] : [String(raw).trim()].filter(Boolean);
}

function unique(values) {
  return [...new Set(values)];
}

function parseActionInput(raw) {
  if (raw == null) throw new Error("No openhabits_reminder action input received.");
  if (Array.isArray(raw)) {
    if (raw.length !== 1) throw new Error("Expected exactly one openhabits_reminder action.");
    [raw] = raw;
  }
  const action = parseJSON(raw, "openhabits_reminder action");
  if (!action || typeof action !== "object" || Array.isArray(action)) {
    throw new Error("openhabits_reminder action must be an object.");
  }
  if (action.action != null && action.action !== "openhabits_reminder") {
    throw new Error(`Expected action "openhabits_reminder", received "${String(action.action)}".`);
  }
  const metricIDs = unique(normalizeMetricIDs(action.metricIDs));
  if (!metricIDs.length) throw new Error("The openhabits_reminder action has no metricIDs.");
  return { action, metricIDs };
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

function selectReminderMetrics(cache, metricIDs) {
  const reminderState = cache.reminderState;
  const byID = reminderState?.byID;
  if (!byID || typeof byID !== "object" || Array.isArray(byID)) {
    throw new Error("The OpenHabits cache is missing reminderState.byID.");
  }
  return metricIDs.map((metricID) => {
    const cached = byID[metricID];
    if (!cached || typeof cached !== "object" || Array.isArray(cached)) {
      return { metricID, found: false, complete: false, scheduledToday: false };
    }
    return {
      ...cached,
      metricID: String(cached.metricID ?? "").trim() || metricID,
      todayPoints: cached.todayPoints ?? reminderState.todayPoints,
      yesterdayPoints: cached.yesterdayPoints ?? reminderState.yesterdayPoints,
    };
  });
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const factor = 10 ** CONFIG.decimals;
  return String(Math.round((number + Number.EPSILON) * factor) / factor);
}

function pointsPhrase(value) {
  const formatted = formatNumber(value);
  if (formatted == null || Number(formatted) <= 0) return null;
  return `${formatted} ${Number(formatted) === 1 ? "point" : "points"}`;
}

function streakValue(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : null;
}

function remainingPhrase(minutes) {
  const number = Number(minutes);
  if (!Number.isFinite(number)) return null;
  if (number <= 0) return "less than a minute";
  if (number === 1) return "1 minute";
  return `${Math.ceil(number)} minutes`;
}

function joinWithAnd(items) {
  if (!items.length) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function currentPointsSentence(metric) {
  if (!CONFIG.includeTodayPoints) return "";
  const points = formatNumber(metric.todayPoints);
  return points == null ? "" : `You currently have ${points} points.`;
}

function yesterdayPointsSentence(metric) {
  if (!CONFIG.includeYesterdayPoints) return "";
  const points = formatNumber(metric.yesterdayPoints);
  return points == null ? "" : `Yesterday you finished with ${points} points.`;
}

function normalMessage(metric, includePointTotal) {
  const name = metric.displayName || metric.metricID || "this metric";
  const reward = pointsPhrase(metric.points);
  const streak = streakValue(metric.streak);
  const due = metric.dueProperties || {};
  let first = `Log ${name}`;
  if (due.hasDeadline && due.dueTimeLocal) first += ` by ${due.dueTimeLocal}`;
  if (reward) first += ` for ${reward}`;
  const parts = [`${first}.`];
  if (includePointTotal) {
    const current = currentPointsSentence(metric);
    const yesterday = yesterdayPointsSentence(metric);
    if (current) parts.push(current);
    if (yesterday) parts.push(yesterday);
  }
  if (streak) parts.push(`Your current streak is ${streak} days.`);
  return parts.join(" ");
}

function urgentMessage(metric) {
  const name = metric.displayName || metric.metricID || "This metric";
  const reward = pointsPhrase(metric.points);
  const streak = streakValue(metric.streak);
  const time = remainingPhrase(metric.dueProperties?.minutesRemaining);
  const parts = [`${name} still isn't logged.`];
  if (time) parts.push(`${time} left.`);
  if (reward && streak) parts.push(`${reward} and your ${streak}-day streak are at stake.`);
  else if (reward) parts.push(`${reward} ${Number(formatNumber(metric.points)) === 1 ? "is" : "are"} at stake.`);
  else if (streak) parts.push(`Your ${streak}-day streak is at stake.`);
  return parts.join(" ");
}

function criticalMessage(metric) {
  const name = metric.displayName || metric.metricID || "this metric";
  const reward = pointsPhrase(metric.points);
  const streak = streakValue(metric.streak);
  const minutes = Number(metric.dueProperties?.minutesRemaining);
  const losses = [];
  if (reward) losses.push(`lose ${reward}`);
  if (streak) losses.push(`end your ${streak}-day streak`);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return losses.length
      ? `Final reminder. Log ${name} now or ${joinWithAnd(losses)}.`
      : `Final reminder. Log ${name} now.`;
  }
  const time = remainingPhrase(minutes);
  return losses.length
    ? `Final reminder. Log ${name} within ${time} or ${joinWithAnd(losses)}.`
    : `Final reminder. ${time} left to log ${name}.`;
}

function classify(metric) {
  const due = metric.dueProperties || {};
  if (!due.hasDeadline || due.status === "none") return { kind: "normal", priority: 1 };
  if (due.status === "expired") return { kind: "skip", priority: 99 };
  const remaining = Number(due.minutesRemaining);
  if (!Number.isFinite(remaining)) return { kind: "normal", priority: 1 };
  if (remaining <= CONFIG.criticalAtMinutes) return { kind: "critical", priority: 3 };
  if (remaining <= CONFIG.urgentAtMinutes) return { kind: "urgent", priority: 2 };
  return { kind: "normal", priority: 1 };
}

function composeReminder(metrics) {
  const eligible = metrics
    .filter((metric) => metric && metric.found !== false && metric.complete !== true && metric.scheduledToday !== false)
    .map((metric, index) => ({ metric, index, ...classify(metric) }))
    .filter((item) => item.kind !== "skip")
    .sort((a, b) => b.priority - a.priority || a.index - b.index);
  let pointTotalUsed = false;
  return eligible.map((item) => {
    if (item.kind === "critical") return criticalMessage(item.metric);
    if (item.kind === "urgent") return urgentMessage(item.metric);
    const includePointTotal = !pointTotalUsed;
    pointTotalUsed = true;
    return normalMessage(item.metric, includePointTotal);
  }).join("\n");
}

async function main() {
  try {
    const input = parseActionInput(args.shortcutParameter);
    const cache = await readOpenHabitsCache();
    const message = composeReminder(selectReminderMetrics(cache, input.metricIDs));
    Script.setShortcutOutput(message);
    console.log(message || "No reminder required.");
  } catch (error) {
    const message = `OpenHabits reminder error: ${error?.message ?? String(error)}`;
    Script.setShortcutOutput(message);
    console.error(message);
  } finally {
    Script.complete();
  }
}

await main();
