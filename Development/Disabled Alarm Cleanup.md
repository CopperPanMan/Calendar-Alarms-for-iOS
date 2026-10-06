# Disabled alarm cleanup

The Engine uses the Clock alarm's enabled toggle to distinguish a fired, disabled alarm from an enabled alarm serving a future occurrence. Disabled owned alarms are removed on every successful Engine pass, including the fast path. If a future registry occurrence needs the same name/time, deletion and creation of one enabled replacement are returned together.

## Updating the Shortcut

Update **Calendar Alarm Engine.js** and the Engine Shortcut's input block together. Replace the delimiter-based Text action with the Dictionary in the [Engine action readout](../Shortcut%20Actions/Calendar%20Alarm%20Engine.md). There is no legacy delimiter-input support. This update does not require changes to the Runtime or QR Scanner scripts, playback actions, output handling, or task-log producers.

Pass a native Dictionary with these exact keys:

```json
{
  "labels": ["Morning Snack Time"],
  "hours": [10],
  "minutes": [30],
  "isEnabled": [false],
  "currentFocus": "",
  "taskLogResponse": ""
}
```

`labels`, `hours`, `minutes`, and `isEnabled` are Lists from the same Find Alarms result, in the same order and of equal length. Preserve unlabeled alarms in the source lists so all indexes remain aligned; their empty labels are ignored after validation. Use four empty Lists when no alarms exist. Do not join list values into newline-separated Text or independently filter a list.

Labels are Text. Hours are integers from 0 to 23 and minutes from 0 to 59; numeric Text is also accepted. Enabled values are Booleans, with explicit support for Shortcuts conversions to 0/1 or Text `true`/`false`/`0`/`1`. Other values are rejected, rather than treated as truthy or disabled.

`currentFocus` and `taskLogResponse` are Text. Use empty Text when there is no Focus or task-log response. Pass the existing task-log response unchanged, including its JSON-as-Text format. Its completion parsing is unchanged. Invalid input returns an error with no Clock mutations, trigger actions, or registry writes.

## Cleanup and replacement

- Only alarms identified by registry-owned names and Clock times are eligible. Retired times and entries removed in the current pass remain identifiable; unrelated Clock alarms are untouched.
- Routine cleanup protects an unsilenced ordinary alarm for **five minutes after its stored scheduled firing time**, including retired task-alarm times. A protected Clock alarm is not replaced for a future occurrence during that grace period. At five minutes it becomes eligible; cleanup occurs on the next successful Engine invocation. No timer is added.
- Explicit silencing, QR cancellation, task completion, and context-gate deletion retain their immediate runtime behavior. QR restart intervals, task deadlines, trigger actions, and fired-alarm recognition are unchanged.
- An enabled alarm needed for a future occurrence is kept. A disabled alarm needed for a future occurrence is deleted and recreated enabled after any applicable grace. A disabled owned alarm with no future requirement is deleted without replacement.
- A pending deletion makes its Clock alarm unavailable for creation checks. The final committed-schedule filter permits required replacements and deduplicates output. Shortcuts must continue applying deletions before creations.
- Failed registry commits emit no native mutations or trigger actions. Rejected concurrent schedules do not clean up using their stale Clock snapshots. A failed Calendar fetch does not prevent cleanup of known disabled alarms from the existing registry.

No creation acknowledgments, creation timestamps, or additional registry schema are needed. An older leftover whose name/time is already absent from registry ownership cannot be safely identified by this change.

## Verification

```sh
TZ=America/New_York node --test tests/*.test.js tests/*.test.cjs
```

Regression tests model native one-shot alarms turning off at their firing times. They cover next-day overlaps, enabled future alarms, disabled future alarms, the five-minute boundary, retired task alarms, cleanup during fast-path handling, explicit runtime deletion, duplicates, unrelated alarms, input validation, and unchanged task-log Text.

On the phone, let an ordinary alarm fire and confirm that routine Engine runs leave it alone for five minutes. Run the Engine afterward and confirm the disabled alarm disappears, or is replaced by one enabled alarm if the next occurrence needs that name/time. Also confirm QR scanning and task completion still cancel their alarms immediately. The tests simulate native Clock plans; phone verification checks the actual enabled-toggle input and native creation/deletion actions.
