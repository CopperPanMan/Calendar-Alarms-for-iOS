# QR scheduling fixes

The Engine now schedules a QR restart at **+2 minutes**, a fallback at **+4 minutes**, and an independent task check when configured. Restart and fallback times are measured from the most recent successful QR scheduling run. The existing task deadline does not move during those QR-only runs. Coincident purposes use one Clock alarm.

## Updating an existing installation

Update these three items together:

1. Replace the contents of the **Calendar Alarm Engine** Scriptable script with [Calendar Alarm Engine.js](../Calendar%20Alarm%20Engine.js).
2. Replace the contents of the **Calendar Alarms Runtime** Scriptable script with [Calendar Alarms Runtime.js](../Calendar%20Alarms%20Runtime.js).
3. Update the QR playback section of the **Calendar Alarm Engine** Shortcut from the [action readout](../Shortcut%20Actions/Calendar%20Alarm%20Engine.md). Its scheduling/deletion/actions section remains the same. In the playback section, Set Volume precedes Permit, `LoopState` caches Poll/Permit output, and one shared stop block deletes the returned `alarmsToDelete` before stopping.

The QR Scanner script and Shortcut readout are unchanged, including their menu lease. Existing installer behavior is also unchanged: it skips scripts that already exist, so rerunning it does not apply these updates. The action readout is a manual rebuild guide; no replacement shared `.shortcut` link is supplied.

Run the Engine once after updating, preferably with no active QR alarm. It migrates known registry schedules without deleting configuration or resetting remaining reschedules. Preserve your registry and settings. Clock alarms left by older bugs whose times are already absent from the registry cannot be identified safely; remove any such known obsolete alarms manually.

## Behavior

- QR-only restart and fallback fires restart playback without consuming task reschedules, shifting the task deadline, reading task completion cache, querying calendars, or rerunning task-trigger actions.
- A task-check fire checks completion and handles its task/trigger behavior once. If the task remains incomplete, it starts or continues the QR instance. Only a real task/context follow-up consumes a reschedule.
- A scan silences the current QR instance while preserving its future task check. Exhausting task reschedules does not prevent a scan from stopping the remaining QR instance.
- Replaced alarm times are deleted in the same scheduling pass. Their ownership remains in `retiredAlarmTimes` until a later Clock snapshot confirms deletion, allowing recovery from a failed native deletion action.
- Fired-alarm recognition accepts owned scheduled times up to 15 minutes overdue and never fires an alarm early. A consumed schedule is marked so a second invocation does not replay its actions.
- Task completion uses explicit `reminderState.byID[id].complete === true` flags for every configured ID. Cache older than 90 seconds defers completion to the fresh task reset action. Partial log responses combine their completed IDs with fresh cached completion for the remaining IDs; an explicitly incomplete ID prevents cancellation.
- A failed calendar fetch preserves existing schedules. A failed registry commit returns no Clock mutations or triggered actions. A stale Engine schedule is rejected if a newer run changed its scheduling state; a scan during calculation cancels the pending QR portion.
- The existing 60-minute QR timeout and 24-hour registry TTL also apply on the fast path. An unsilenced ordinary task alarm keeps its native sound in the current minute.
- Playback identity includes the QR generation. Permission reads mute state before the registry and checks the current instance immediately before reserving playback. Set Volume happens before permission to reduce the gap before Play Sound.

## Scanner compatibility

`nextFireTime` remains the task-check pointer for task alarms. The unchanged scanner preserves it. `qrBackupFireTime` aliases the fallback only when that fallback is not also a task check; the scanner therefore cannot delete a shared task alarm.

The additional QR restart is removed by the **Engine Shortcut's playback stop block**. Runtime Poll/Permit return its owned `alarmsToDelete` when the registry has no active QR alarm. They protect task checks and other active/pending schedules at the same Clock time. This cleanup does not write the registry; the next Engine pass clears stopped QR pointers and reconciles Clock state.

If the Engine is already stopped, stalled, or terminated when scanning succeeds, immediate deletion of that additional restart depends on the next successful Engine invocation. Its stale QR purpose is canceled before fired-alarm handling and cannot reactivate the scanned instance. Changing the scanner's reset path would be required to remove that dependency. Scanner menu suppression and its existing success-reporting behavior remain outside this change.

## Registry fields

| Field | Purpose |
| --- | --- |
| `scheduleVersion` | Version 2 migration marker |
| `taskCheckFireTime` / `taskCheckHHMM` | Independent task deadline and Clock mirror |
| `qrRestartFireTime` / `qrRestartHHMM` | QR restart or pending QR promotion |
| `qrFallbackFireTime` / `qrFallbackHHMM` | QR fallback deadline and Clock mirror |
| `nextFireTime` / `nextFireHHMM` | Scanner-compatible task pointer; ordinary alarm or QR restart for non-task entries |
| `qrBackupFireTime` / `qrBackupHHMM` | Scanner-compatible fallback alias, zero when shared with a task check |
| `qrGeneration` | QR instance identity for rejecting outdated playback requests |
| `lastHandledFireTime` | Consumed scheduled fire for idempotent delayed handling |
| `retiredAlarmTimes` | Owned obsolete Clock times awaiting deletion confirmation |

These are runtime fields. They are not additions to Calendar event JSON.

## Verification

Run from the repository root:

```sh
TZ=America/New_York node --test tests/*.test.js tests/*.test.cjs
```

The scheduling harness executes the actual Engine, unchanged Scanner, and Runtime scripts and applies their returned native Clock plans. It covers restarts, skipped restarts and fallback recovery, exhausted reschedules, partial and complete task reports, shared +2/+4 task times, concurrent scan cancellation, delayed/duplicate invocations, legacy migration, timezone reconciliation, calendar edits, and failed reads/writes. The existing runtime checks also cover ownership, playback reservations, mute windows, and duration budgets.

On the phone, verify:

1. A normal QR alarm schedules +2 and +4, and scanning removes both.
2. A QR task alarm with a longer interval schedules those retries plus the original task deadline. Scan and confirm only the task deadline remains.
3. Repeat with task intervals of 2 and 4 minutes. The shared Clock alarm must survive scanning and perform its task check once.
4. Let a restart run and confirm the task deadline and remaining task reschedules do not change. Let a fallback recover a skipped restart.
5. Scan near the start of a sound, and confirm stopped retries are cleaned up. Then complete all task IDs and confirm the task check is removed.

Mocked tests cannot validate native Play Sound, permission conversion, automation launches, Shortcut execution limits, or menu presentation. Permission remains cooperative: a native sound already queued after permission cannot be revoked atomically. The three-minute playback budget remains unchanged; this change does not establish an Apple automation cooldown rule.
