# Native Shortcut interface v1

The full readouts under [Shortcut Actions](../Shortcut%20Actions/README.md) define the supported native interface. Version 1 is a compatibility baseline for future script releases, not a new required request field. Install matching scripts/native flows for this migration; once adopted, preserve these calls across code updates.

Future changes must retain existing command names, required keys, field types, units, and meanings. New fields must be optional with compatible defaults. Additional output keys are allowed. Put a truly incompatible operation behind a new command while keeping the old adapter working. A script release version alone does not require a new Shortcut. New native capabilities or iOS action changes can still require a targeted native edit.

## Transport and return types

| Script/call | Stable interface |
| --- | --- |
| Engine input | Dictionary containing aligned `labels`, `hours`, `minutes`, `isEnabled` Lists, plus `currentFocus` and `taskLogResponse` Text |
| Engine result | JSON Text; native Get Dictionary converts it. `alarmsToDelete`, `alarmsToAdd`, `triggerShortcutsToRunDetailed` are Lists; `completionOnly` and `qrLoop` are Booleans; `errorRegistry` is Text |
| Runtime requests | Dictionary, or JSON Text encoding it, with the existing `op` and its documented fields |
| Runtime `engine_begin` | `clock` and `completionOnly` Numbers 0/1; `cleanInput` Text; normal playback also returns a `session` Dictionary |
| Runtime `clock_guard` | `activeCount` Number and `notification` Text |
| Runtime `trigger_check` / `trigger_finish` | `run` / `ok` Number 0/1. Forward the whole trigger Dictionary; preserve unknown metadata |
| Runtime `qr_poll` / `qr_permit` / `qr_step` | `stop` and `play` Numbers 0/1; deletion plans remain Lists. Pass the whole session Dictionary; serialized session JSON remains accepted. Legacy poll/permit commands remain available |
| Runtime `action` | `refresh`, `speak`, `show`, `ok`, and `allComplete` are Booleans when present; `kind` is Text; successful task planning returns `engineInput` JSON Text |
| Runtime `sound_file` | File/path output consumed by native Play Sound, not a Dictionary |
| Scanner core input/result (legacy menu adapter) | Empty input requests the legacy menu; a QR ID requests scan completion. Output is JSON Text; `shouldShowMenu`, `hasActiveQR`, and `vibrate` are Booleans |

`fileName` is relative to Alarm Tones; audio duration is seconds and playback volume is 0–1. The existing native branches for `kind` remain supported. Implement new behavior using existing native operations where possible. For a new device capability, a separately configured custom Shortcut can preserve the Engine's existing named-Shortcut dispatch.

## Optional QR playback and notification extensions (October 2026)

Existing operations and their defaults remain supported. Updated native flows opt in with these additions:

| Call/field | Meaning |
| --- | --- |
| `qr_poll.completedPlaybackToken` / `qr_step.completedPlaybackToken` (optional Text) | Acknowledges a completed native Play Sound. Only a matching instance/token reservation can be released; stale tokens cannot clear a newer clip's lease. Omission retains expiry-based fallback. After the first valid acknowledgement, the same call can attempt the QR banner before the final fresh state read. |
| `qr_permit.playbackToken` / `qr_step.playbackToken` (additional Text output) | Save it only after native Play Sound completes, and send it on the next existing poll/step. |
| `qr_step` | Combines acknowledgement, the next plan and final permission. Pass `session`, prepared `alarmKey`, cached relative `fileName`, last requested `volume`, actual native `duration` in seconds, and `completedPlaybackToken`. Changed preparation returns `play: 0` plus the replacement plan; prepare it before a later grant. |
| `qr_poll.notificationPollIndex` (legacy field) | No longer controls banner timing. Callers may still send it; the first banner follows an acknowledged completed clip. The October 26 flow omits this field. |
| `session.deadline` | Epoch milliseconds. Updated native Engine replaces its own session deadline with `(nextLoopStart Unix seconds - Restart Buffer Seconds) * 1000`. Permit/Step require the complete clip plus the existing one-second allowance to fit. |
| `session.pending` / `session.ticket` | Opaque ownership fields from `engine_begin`; forward the whole session unchanged apart from the documented deadline. A replacement takes playback ownership only when its final permit/step succeeds after preparation. Starting another session alone does not displace the current player. |
| `scanner_menu` | Returns `activeCount` Number, `activeName` Text, `error` Text, and timing seconds. Removes this system's notification. It does not claim the old blocking-menu lease or renew mute. |
| `scanner_silence` | Mutes new playback for 15 seconds and schedules a notification after 10 seconds; returns the absolute millisecond deadlines. |
| `scanner_scan_begin` | Temporarily mutes new playback and cancels the pending menu reminder before native Camera scanning. |
| `scanner_scan_finished` | Clears QR UI state if no active QR remains, otherwise posts a notification for remaining alarms. The reduced Scanner retains this only for invalid-code cleanup in its manual-camera branch, not after a successful core scan. |
| `qr_notification` | Compatible explicit notification operation. Normal playback invokes it internally after the first completed sound is acknowledged, without another native Scriptable action. Existing completion-only cleanup remains separate. |

The shared notification identifier is `calendar-alarms-qr-menu-v1`; only that notification's pending/delivered entries are removed. UX state lives in Scriptable local cache, separate from the shared alarm registry. Runtime constants `QR_UX.notificationReturnSeconds` and `QR_UX.silenceSeconds` set 10/15 seconds. The old `scanner_touch` and no-input Scanner core menu remain for older shortcuts. Task-loop disablement in newer repository sources remains honored.

The native Scanner uses Runtime `scanner_menu` for a user-invoked menu and the Scanner core only for QR IDs. No Scanner Any Alarm Goes Off automation is used. There is no native menu polling loop or native wait during Silence. Legacy `qrMenuAfterPlayback`/`shouldShowMenu` handshakes still support older native callers; they are not an instruction to restore the automatic menu.

Optional notification API failures return known active-alarm details with `notificationWarning`, rather than inventing an empty active set. Required registry/silence-state failures remain errors. The notification allowance is 1200 ms. Engine banner bookkeeping and optional cleanup must not block otherwise valid audio or a known Clock cleanup plan.

Scanner lock acquisition has a 3000 ms retry budget within a cooperative 4500 ms work budget, retains the existing stale-lock rules, and returns a retry message without registry/scan changes if acquisition fails. A synchronous file operation may exceed the budget because it cannot be cancelled by that timer. Scriptable's `Timer.schedule` argument is milliseconds; both core scripts now use milliseconds and explicitly complete after setting output. Existing unreadable/undownloaded state is an error, not an empty registry to overwrite. Engine settings validation precedes setup writes and does not start an iCloud download; absent settings retain the documented default. Completion-only cleanup does not require settings.

Completion reports preserve `alarmOccurrence` when present, otherwise a valid `completionScope` from the server or a fresh local cache. The Engine confines cancellation to that occurrence/tracking-day window. Legacy unscoped reports may suppress only past occurrences within the fallback window, not future ones. See [completion scope](October%2026%20Reliability%20Update.md#completion-scope).

`tests/fixtures/native-shortcut-v1.json` records native request examples. `tests/native-shortcut-compatibility.test.cjs` executes the public script entry points and checks the return fields/types consumed by installed native actions. Scheduling/menu regressions cover the state transitions; native audio and iOS execution limits still need device verification. Change these fixtures only for an intentional, documented native migration, not to accommodate an accidental breaking script change.
