# Calendar Alarms — Requirements & Spec (Markdown)

## 0) Purpose and operating model

### Purpose

Use iOS Calendar as the **single source of truth** for defining alarms via JSON stored in **event Notes**. The system converts those definitions into iOS Clock alarms, and enforces runtime behavior (QR loops, reschedules, conflict silencing) via a local **registry file**.

### Operating model

- An automation runs **Calendar Alarms Engine**:
    1. **once per day**, and
    2. **every time any iOS alarm goes off**.
- Calendar is **read-only**. Nothing ever writes to Calendar.
- Runtime state is stored in a separate **registry** to avoid sync concerns and to make “editing around” QR alarms harder.
- iOS shortcuts should be shortened where possible by calling Scriptable.

### Golden rule

Any time an alarm is added/deleted in one domain, attempt the paired action in the other:

- Add/delete **registry** entry AND corresponding **iOS Clock alarm**.
- If only one exists (user manually changed Clock), reconcile safely:
    - If found only in registry → delete registry entry (unless protected by QR/reschedule rules below).
    - If found only in iOS and not “owned” by this system → ignore it.

---

## 1) Dependencies

### Apps

- Apple Shortcuts
- Scriptable

### Files (Shortcuts folder)

- `registry.txt` — JSON list of registry alarm objects
- `registryLock.txt` — lock to prevent concurrent writes
- `scannerLastOpened.txt` — timestamp used to mute QR sound for a short window after scanner/menu open
- `menuLastOpened.txt` — timestamp used to prevent duplicate menu overlays
- `menuOpenStatus.txt` — boolean-ish flag indicating a QR menu is currently open

### Scriptable storage rule (no fallback)

Scriptable must use the iCloud Drive **Shortcuts** folder for all files.

If that folder cannot be resolved (bookmark missing / iCloud unavailable), Scriptable must:

- fail gracefully,
- return a meaningful message in `errorRegistry`,
- and **must not** fall back to Scriptable’s local Documents directory.

---

## 2) Data model

### 2.1 Calendar Notes JSON (source of truth)

Calendar event Notes may include a JSON **array** of alarm objects:

```json
[
{"alarmName":"Scan Contacts in 5 minutes","status":"ON","...":"..."},
{"alarmName":"Another Alarm","...":"..."}
]

```

### Required key

- `alarmName` (string, must exist)

### Optional keys (all must be defaulted if missing)

General scheduling:

- `status` (default `"ON"`, must be `"ON"` or `"OFF"`, case-insensitive)
- `offsetMin` (default `0`, integer, min `-10080`, max `10080`)
- `reference` (default `"start"`, must be `"start"` or `"end"`, case-insensitive)

QR alarm keys:

- `qrCodeID` (default `""`, if non-empty: must not contain spaces)
- `qrSoundPath` (default `"/shortcuts/ringtone.mp3"`, valid path)
- `qrSoundLen` (default `2.13`, number > 0)
- `qrVol` (default `40`, integer `1..100`)
- `qrShortcutsOnScan` (default `[]`, array of objects: `name` string + `input` string array)
- `shortcutsOnTrigger` (default `[]`, array of objects: `name` string + `input` string array)
- `silenceAlarm` (default `false`, boolean; applies once per alarm)

Location gating:

- `locationMode` (default `"off"`, must be `"whitelist" | "blacklist" | "off"`, case-insensitive)
- `locations` (default `[]`, list of `[lat, lon, radiusMeters]` triplets)
    - `lat` and `lon` are numbers
    - `radiusMeters` is integer `1..500`

Conflict / reschedule controls:

- `silenceIfDriving` (default `"OFF"`, must be `"ON"` or `"OFF"`, case-insensitive)
- `conflictingCalendars` (default `[]`, list of calendar names)
- `reschedMinutes` (default `0`, integer `0..500`)
- `maxReschedules` (default `1`, integer `1..10`)

Task controls:

- `taskIDs` (default `[]`, list of string task IDs)
    - example: `"taskIDs":["taskID1","taskID2"]`
- `taskLoopMin` (default = `0`, integer `0..500`)

### JSON recognition and parsing rules (IMPORTANT)

Users may write other notes above or below the JSON; Scriptable must still detect the alarm JSON.

**Selection rule to prevent false positives:**

When searching Notes for a JSON array, Scriptable must only accept a JSON array that:

- is empty (`[]`), **or**
- contains at least one **non-array object** (`{...}`).

This prevents mistakenly treating arrays like `locations: [[...],[...]]` as the alarm array.

### Validation and “alarm-JSON likely present” rule

- Invalid JSON must not crash.
- If an alarm object is malformed (missing required key, wrong types/ranges), record an entry in `errorRegistry` and skip or disable that alarm (do not schedule it).
- If Notes contain the substring `alarmName`, and Notes contain `[` and `]`, but no valid alarm array can be parsed, record a generic formatting warning in `errorRegistry`.
- If Notes do not contain `alarmName`, but do contain the substring `offsetMin`, record the same generic formatting warning in `errorRegistry`.
- Otherwise, treat Notes as unrelated and do nothing.

### Uniqueness warning (user-facing assumption)

Users should use **unique `alarmName`** values across all alarms; duplicates can create ambiguity because iOS alarms lack stable IDs.

---

### 2.2 Registry file JSON (`registry.txt`)

`registry.txt` is a JSON array of registry alarm objects. Each includes all calendar keys (after defaults) plus registry-only keys:

Registry-only keys (must exist for any registry entry):

- `calcFireTime` (epoch seconds; computed from calendar event start/end + `offsetMin`; set when verifier runs. Refers to the original intended time)
- `prevFireTime` (epoch seconds; prior scheduled fire time for cleanup)
- `nextFireTime` (epoch seconds; next scheduled fire time that should exist as an iOS alarm)
- `firstQRFireTime` (epoch seconds or empty; only set when QR alarm first actually triggers)
- `qrActive` (boolean; true while QR loop is active)
- `qrBackupFireTime` (epoch seconds; backup scheduled fire time that should exist as an iOS alarm when QR loop is active)

Task-loop runtime keys (registry-only):

- `taskSatisfied` (boolean; once true, prevents any further scheduling/reschedules for that alarm)
- `taskCooldownScheduled` (boolean; true when QR was scanned and the alarm is in the “cooldown until next check” phase)

---

## 3) Alarm ownership and safe behavior

### Owned alarms

The system must only add/delete iOS alarms that are “owned” by this system:

- Owned if it matches a registry entry (name + time derived from `nextFireTime` or `qrBackupFireTime`), or
- Owned if it matches a validated expected alarm from Calendar during verifier reconciliation.

### Never delete unrelated alarms

If an iOS alarm cannot be confidently identified as owned, Engine must not modify it. Duplicate alarms in iOS with the same name and time should be kept untouched, and an error should be recorded.

---

## 4) Time representation rules (epoch + HH:MM)

### Internal representation

- Registry uses **epoch seconds** for all comparisons, TTLs, and reschedule calculations.

### iOS representation

- iOS alarms are minute-resolution and effectively store **(name, HH:MM)**.

### Normalization (required)

- Any epoch values used to create/match iOS alarms must be normalized to **minute boundaries** (consistent rounding policy, e.g., floor to minute).

### HH:MM ↔ epoch conversion policy

- Because HH:MM has no date, Scriptable must infer date when needed:
    - When Engine runs due to an alarm trigger, any HH:MM from iOS must be converted into candidate epochs for **yesterday/today/tomorrow**, choosing the candidate closest to “now”.
    - When scheduling iOS alarms, epoch → HH:MM is straightforward after minute-normalization.

---

## 5) Concurrency and locking (`registryLock.txt`)

### Goal

Prevent corrupted registry writes when Engine and qrScanner run concurrently.

### Lock acquisition contract

- Lock file stores `{id, timestamp}` (format is JSON).
- Acquire algorithm:
    1. If lock exists and timestamp is **< 30 seconds old**, wait 0.5s and retry.
    2. Otherwise write your `{id,timestamp}`.
    3. Wait 0.5s, re-read lock.
    4. If your id is not present, retry.
    5. Hard timeout (e.g., 30 seconds total): fail gracefully, log error to `errorRegistry`, and do not partially write registry.
        1. a note on `errorRegistry`: it should output all errors as one string, separated by \n newline characters.

### Lock release

- After registry write, clear the lock file.

### BONUS: Implement diff-based patch inside lock

1. Keep a deep copy of the registry as it existed *right after initial load* (`registryBefore`).
2. After running fast-path/verifier, you have `registryAfter`.
3. Under the lock, reload the current on-disk registry (`registryOnDiskNow`).
4. Apply only the *changes you actually made*:
    - Add keys that are new in `registryAfter`
    - Remove keys deleted in `registryAfter`
    - For keys that exist in both, only overwrite fields that changed between `registryBefore` and `registryAfter`

This preserves concurrent edits to other fields (especially `qrActive`) unless *you* explicitly changed them too.

## 6) Shortcuts

### 6.1 Calendar Alarms Engine

### Triggers

- Daily scheduled run
- “When any alarm goes off” run

### Input

- List of current iOS alarms (name + HH:MM)
- Calendar events (Scriptable fetch)
- Registry files

### Scriptable call contract

Engine calls Scriptable with the following text string input:

```
labels:;:hours:;:minutes:;:currentFocus[:;:lat:;:lon]

```

Example without location:

```
alarm1
alarm2:;:7
15:;:59
0:;:

```

Example with location:

```
alarm1
alarm2:;:7
15:;:59
0:;:39.1039:;:-84.5120

```

Notes:

- labels/hours/minutes are newline-delimited and index-aligned.
- labels may contain any characters except newline and the delimiter.
- Scriptable must preserve index alignment and must not filter one list without filtering the others identically.
- Location is only appended when Engine has explicitly fetched it for a run.

### Output JSON (Scriptable → Engine)

```json
{
"locationRequest":false,
"alarmsToDelete":[
{"name":"testAlarm1","hh":"15","mm":"25"}
],
"alarmsToAdd":[
{"name":"testAlarm3","hh":"16","mm":"25"}
],
"triggerShortcutsToRunDetailed":[{"name":"CAtester1","input":["item1","item2"]}],
"triggerShortcutsToRun":["CAtester1"],
"qrLoop":false,
"errorRegistry":"line1\nline2"
}

```

**Empty error rule:**

If no errors exist, `errorRegistry` must be **exactly** `""` (no whitespace, no hidden chars).

### Location request handshake (Engine behavior)

If Scriptable returns `"locationRequest": true`:

1. Engine fetches current location once.
2. Engine re-runs Scriptable immediately, appending `lat/lon` to the input.
3. Engine proceeds using only the second Scriptable output.
4. Engine must retry at most once per run.

## 6.2 Execution phases (Scriptable)

### Phase A — Setup

- Ensure files exist; create missing:
    - `registry.txt = []`
    - lock file empty
    - scanner/menu files initialized
- Load registry and iOS alarm list safely (empty/corrupt file must not crash; log error and treat as empty if needed).
- Scriptable must not use `setTimeout`; use Scriptable-compatible timing (e.g., `Timer.schedule`) for waits.

### Phase B — Fast-path (run first)

If a registry-owned alarm is inferred to have just fired, attempt:

1. QR loop handling (if applicable), or
2. Non-QR “silence/reschedule/task/location/conflict” handling (driving/conflict/location/task), and if handled, skip verifier.

### Phase C — Non-QR silence/reschedule logic

### Phase D — QR loop handling

---

## 6.3 Verifier (reconciliation) — Scriptable

Verifier runs when fast-path does not handle a fired alarm, and on daily run.

### Calendar candidate set

- Fetch calendar events within **±7 days** (still required to capture offsets that pull `calcFireTime` into the active window).
- Parse notes; validate & default each alarm.
- Compute:
    - `calcFireTime = eventStartOrEnd + offsetMin` (minute-normalized)
    - expected default: `nextFireTime = calcFireTime`

### Scheduling policy

### A) Calendar alarms that should be scheduled (new entries)

Scriptable should **create/schedule** registry + iOS alarms only for calendar alarms whose:

- `calcFireTime` is within the **next 24 hours**:
    - `now <= calcFireTime <= now + 24h`
- AND `status == "ON"`

### B) Calendar alarms in the last 24 hours (reschedule continuation)

Calendar alarms whose:

- `now - 24h <= calcFireTime < now`

should **not be created fresh** if missing.

However, they may be **kept** if:

- a matching registry entry exists (match by `(alarmName, calcFireTime)`), AND
- that registry entry has `nextFireTime` in the future (meaning it is actively rescheduled forward).

### C) QR-active alarms override the Calendar window

A registry entry is allowed to exist and be scheduled even if its `calcFireTime` is in the past, provided:

- `qrActive == true`, AND
- `firstQRFireTime` is within the last 60 minutes.

### Duplicate registry error

- If registry contains duplicates with same `(alarmName, calcFireTime)`, output a warning in `errorRegistry` and delete all but one at random.

### Immediate cleanup rules

### 1) Delete fired owned iOS alarms immediately

- Any **owned** iOS alarm whose scheduled time is in the **past** should be deleted immediately.
- Exception: do not delete the alarm instance that “just fired this minute” (to avoid interfering with fast-path silencing/handling).

### 2) Delete registry entries no longer related to Calendar

If a registry entry does not match a Calendar alarm by `(alarmName, calcFireTime)`, it should be deleted **unless**:

- `qrActive == true` and QR timeout window is still valid, OR
- it is actively rescheduled forward under rule B (same-name matching calendar alarm exists and nextFireTime is still in the future)

### 3) Hard TTL safety rule

No alarm should exist whose original intended time is >24h ago:

- If `calcFireTime < now - 24h`:
    - delete from registry
    - delete corresponding owned iOS alarm if present

### 4) QR timeout rule

- If `qrActive == true` and `(now - firstQRFireTime) > 60 minutes`:
    - delete from registry and iOS

### Replaced alarm rule

If a user edits a Calendar alarm such that `(alarmName, calcFireTime)` changes (e.g., offset change), the old alarm should be treated as replaced and cleaned up immediately:

- Delete the old registry entry and its paired owned iOS alarm
- Do not wait for TTL
- Exception: do not delete if the registry entry is currently:
    - `qrActive == true`, or
    - `taskCooldownScheduled == true`

---

## 7) Reschedule time computation

### General approach

When rescheduling, compute candidate “readyAt” times depending on gating causes, choose max, and clamp.

### Candidate readyAt sources

- Calendar conflicts: `readyAt = conflictedEventEnd + buffer` (buffer = 10 minutes)
- Driving focus gating: baseline derived from `reschedMinutes`
- Not at whitelist locations: `readyAt = distanceToNearestkm * timeMultiplier` (timeMultiplier = a good middle ground constant to approximate driving time over 10 to 20 minute driving time distances)
    - “nearest” must be computed using each location’s own radiusMeters (inside/outside checks use the per-location radius)
- At blacklist location: use `reschedMinutes` (distance-based would be too small)
- Task not completed: use `taskLoopMin`
    - Task completion is determined via querying a Google Apps Script endpoint with one taskID per call
    - If the query fails, treat as completed, and log a warning in `errorRegistry`

### Selection and clamp

- `nextFireTime = max(readyAt candidates)`
- Clamp so `nextFireTime <= now + 4 hours`

If `reschedMinutes == 0`, then alarms silenced by a rule do not reschedule.

---

## 8) QR sound looping requirements (deterministic)

### Requirement: exact sound length must be known

To support `scannerLastOpened` muting without buggy timing, the system must know the exact duration of the QR sound file.

### Acceptable implementation (deterministic)

- User must provide `qrSoundLen` in calendar JSON.

---

## 9) Engine shortcut actions after Scriptable returns

Given output JSON:

1. If `locationRequest == true`:
    - fetch location
    - re-run Scriptable with `lat/lon` appended
    - use only the second output JSON
2. For each entry in `alarmsToDelete`:
    - delete the matching iOS alarm (by name + HH:MM)
3. For each entry in `alarmsToAdd`:
    - create the iOS alarm (name + HH:MM)
4. For each action in `triggerShortcutsToRunDetailed`:
    - run shortcut by `action.name`
    - pass `action.input` as the shortcut input array (supports one or many items)
    - ignore actions with empty names

### Engine QR sound loop (post-processing)

If `qrLoop != null`:

- The loop duration is a dev-controlled constant `qrLoopMin` (1, 2, or 3 minutes).
- `iterationCount = floor((qrLoopMin * 60) / qrSoundLen)`
- Repeat `iterationCount` times:
    - Load `registry.txt`
    - If any alarm has `qrActive == true`:
        - Read `scannerLastOpened.txt`, compute seconds since timestamp
        - If >= 13 seconds:
            - set volume to `qrVol`
            - play file at `qrSoundPath`
        - Else:
            - wait `qrSoundLen` seconds
- Loop stops naturally when registry `qrActive` is set false or entry is deleted.
- This must handle multiple active QR alarms. In that event:
    - this loop must not exceed the configured duration
    - the alarm whose sound file is played should be the one with the earliest `firstQRFireTime`.

---

## 10) Calendar Alarms qrScanner shortcut

### Mode A: No input (runs when any alarm goes off)

Purpose: show menu to mute/scan without stacking menus.

Steps:

1. Wait 3 seconds
2. Read `registry.txt` and find active QR alarms (`qrActive == true`)
    - If none, stop shortcut
    - Choose activeName for menu (if multiple, choose earliest `firstQRFireTime`)
3. Set `scannerLastOpened.txt = now ISO` (each iteration)
4. Menu dedupe control:
    - Before showing menu:
        - write `menuOpenStatus.txt = true`
        - write `menuLastOpened.txt = now ISO`
    - After menu resolves:
        - write `menuOpenStatus.txt = false`
5. Show list:
    - “silence for 12s”
    - “scan [activeName]”
6. If “scan …” selected:
    - open QR/barcode scanner
    - stop shortcut
7. If silence selected:
    - wait 10 seconds

### Mode B: With input (runs from QR code)

Purpose: set matching active QR alarm(s) to `qrActive=false` (Engine handles deletion later).

Steps:

1. Acquire `registryLock.txt`
2. Load `registry.txt`
3. `qrCodeID = shortcutInput`
4. For each alarm where `qrActive == true`:
    - If `alarm.qrCodeID == qrCodeID`:
        - set `alarm.qrActive = false`
        - vibrate device
        - append `alarm.qrShortcutsOnScan` actions to `shortcutsToRun`
        - increment `identifiedAlarms`
    - Else:
        - append error message “wrong code. Please scan [alarmName]”
5. Write registry back
6. Release lock
7. If `shortcutsToRun` non-empty: run each action
8. If errorMessage non-empty: show notification
9. If `identifiedAlarms == 0`: show “no matching alarms” notification

---

## 11) Calendar Alarms qrClockCloser shortcut

Trigger: automation when Clock app is opened.

Follow this rough pseudo code:

```jsx
get filefromShortcuts at path registry.txt
new variable scanNotification ="please scan "

variable x =0
for all alarminfile:

if alarm.qrActive:
		x +=1
		scanNotification += alarm.alarmName
if x >1:
			scanNotification +="\n"

if x >0:
	go to homescreen
	show notification scanNotification

```

---

## 12) TaskIDs integration (Google Apps Script)

### TaskIDs meaning

If `taskIDs.length > 0`, it activates a “repeat until complete” loop:

- The system periodically re-checks task completion until complete.
- Task completion is determined by a Google Apps Script endpoint that returns boolean complete/incomplete for a given taskID.
- Completion requires **all taskIDs** to return complete (logical AND).

### Endpoint format and configuration

- Scriptable code must define a constant at the top: `TASK_WEBAPP_ID`
- For each taskID in `taskIDs`, Scriptable queries:

`https://script.google.com/macros/s/webappid/exec?metrics=%22[taskID]%22&key=%22isComplete%22`

Where `webappid` is `TASK_WEBAPP_ID` and `[taskID]` is the ID being queried.

### TaskIDs + QR combined UX (required)

Example flow:

1. Alarm triggers and rings (QR loop if configured).
2. User scans QR → sets `qrActive = false`.
3. After `taskLoopMin`, the alarm triggers again and checks task completion:
    - If incomplete: re-arm QR (`qrActive = true`) and continue looping.
    - If complete: stop rescheduling and allow cleanup (delete like a completed reschedule chain).

### TaskIDs requires a loop interval

- If `taskIDs.length > 0` and `taskLoopMin == 0`, log an error and disable task looping for that alarm.

### Missing TASK_WEBAPP_ID handling

- If `taskIDs.length > 0` and `TASK_WEBAPP_ID` is missing/empty, log an error and treat task completion as complete (fail-open).

### Fail-open rule (required)

If any task completion query fails (no internet / timeout / error):

- treat that taskID as **complete**
- log a warning in `errorRegistry`

---

## 13) Timezone constraint / mitigation

Known limitation:

- Device timezone changes can cause temporary mismatches between registry epochs and iOS HH:MM.

Mitigation:

- Engine runs whenever any alarm goes off; verifier will re-align future alarms under the new timezone.
- It is acceptable that one alarm may misfire during transition, but the system must converge afterward.

---

## 14) Edge cases that must not crash

- Empty or missing `registry.txt` → treat as `[]`
- Corrupt `registry.txt` → log error, treat as `[]`
- Calendar notes missing JSON, invalid JSON, non-array JSON → skip safely with errors logged
- Alarm objects missing `alarmName` key value → skip safely with errors logged
- Duplicate registry entries with same `(alarmName, calcFireTime)` → log warning; delete all but one at random
- Multiple active QR alarms → menu shows the earliest `firstQRFireTime` alarm
- Notes contain nested arrays like locations → must not be mistaken as the alarm array (see JSON selection rule)

---

## 15) Acceptance criteria (definition of done)

1. Daily verifier:
    - Creates owned iOS alarms for expected calendar alarms in the active scheduling window.
    - Deletes stale/invalid registry entries and paired owned iOS alarms.
    - Enforces hard TTL: no alarm with `calcFireTime < now - 24h` remains.
2. Alarm-trigger run:
    - Engine infers fired owned alarm by name + time and handles:
        - QR loop scheduling using configured `qrLoopMin`
        - QR backup scheduling at `qrLoopMin * 3` minutes
        - reschedules (decrement `maxReschedules`)
        - safe deletion (owned only)
        - task repeat-until-complete checks using `taskLoopMin` when `taskIDs` exist
        - location gating using `locations` triplets when configured, requesting location via `locationRequest` handshake when needed
3. QR loop:
    - Plays looping sound while `qrActive == true`
    - Can be muted briefly using `scannerLastOpened` timing
    - Stops when correct QR code is scanned (`qrActive=false`) and cleanup occurs
    - Maintains a primary and a backup future QR alarm while active
4. Concurrency safety:
    - Lock prevents corrupted registry writes during concurrent triggers.
5. No collateral damage:
    - Non-owned user alarms are never deleted or modified.
