# Calendar Alarms runtime checkpoint — 2026-10-05

This is a development checkpoint of the runtime and manual Shortcut rebuild work. It is not a release or a claim that QR playback is reliable. The Engine and QR Scanner core scripts are unchanged. The proposed scheduling and menu-state redesigns below are not implemented.

## Files

| File | Purpose |
| --- | --- |
| [Calendar Alarms Runtime.js](../Calendar%20Alarms%20Runtime.js) | Scriptable helper for playback coordination, Clock guard, settings, action planning, QR input parsing, and Wake Times |
| [Calendar Alarms Installer.js](../Inline%20Scriptable/Calendar%20Alarms%20Installer.js) | Inline installer for the two existing core scripts, the runtime, and six tones |
| [Shortcut Actions](../Shortcut%20Actions/README.md) | All five manual action readouts, with the latest cached-audio Engine section |
| [Runtime tests](../tests/calendar-alarms-runtime.test.cjs) | Mocked Scriptable behavior, QR stop reasons, ownership, reservation expiry, subfolder paths, settings, actions, and wake planning |
| [Installer tests](../tests/calendar-alarms-installer.test.cjs) | Missing-file installation, existing-file preservation, and failed-download reporting |
| [Transport tests](../tests/calendar-alarms-runtime-contracts.test.cjs) | Existing Engine delimiter input and task-completion JSON transport |

These are textual readouts, not exported `.shortcut` files or a verified dump of the current phone. The Scanner readout retains the earlier flow with its known wiring issues called out explicitly; documentation of a proposed correction is not evidence that it has been applied on-device.

## Implemented at this checkpoint

- Scriptable script name: **Calendar Alarms Runtime**. Its repository filename has spaces because the installer downloads `Calendar Alarms Runtime.js`.
- QR `stop` and `play` are actual numeric 0/1 values. Sessions accept dictionaries or JSON-serialized dictionaries. Set request field `session` to Dictionary in Shortcuts.
- Stopped Poll/Permit results include a reason: `invalid_session`, `owner_missing`, `superseded`, `deadline_expired`, `no_active_qr_alarm`, or `clip_exceeds_remaining_time`.
- A session has an absolute three-minute deadline beginning at `engine_begin`. It includes scheduling and triggered actions. This is cooperative: checks cannot interrupt a stalled native action or force iOS to keep running the Shortcut.
- A device-local ownership record lets an older run stop at its next checkpoint after a newer run begins. This requires the newer run to actually launch.
- A separate device-local playback reservation expires after the audio duration plus **1,000 ms**. A successor preserves it. This estimates playback state; it is not an atomic cross-process lock or proof that sound is still playing.
- `qr_poll` returns `fileName` as a path relative to **Alarm Tones**, preserving subfolders. It does not read/download the audio or return Base64. It still reads the live registry and scanner timestamp.
- Supported QR path prefixes are stripped once: `Alarm Tones/`, `OpenHabits/Calendar Alarms/Alarm Tones/`, and `Shortcuts/OpenHabits/Calendar Alarms/Alarm Tones/`. For example, `Alarm Tones/Nature/ocean.mp3` becomes `Nature/ocean.mp3`.
- QR audio in the Engine readout is loaded with the working native Get File action. `CachedSoundPath` starts empty; the first playable Poll loads the file and duration, and only a path change reloads them. Permit and Play Sound use the named cached variables. The loop retains its native one-second Wait.
- QR sounds must reside inside Alarm Tones or its subfolders for that readout. Files are not moved automatically. The legacy default is still `ringtone.mp3`; the installer does not provide it. Configure an installed tone or supply that file under Alarm Tones.
- `scanner_touch` writes the current scanner timestamp and clears `menuOpenStatus.txt` when Silence or Scan Code is selected. Dismissing the menu does not execute that operation.
- Action planning, settings read/write, scan-input parsing, and Wake Times helpers are retained. Other Boolean output conversions in the experimental readouts still require native validation; numeric QR flags do not establish that all Boolean-to-Number conversions are sound.
- The inline installer downloads missing core/runtime scripts and six tones (marimba, ocean, siren, sonar, marimba electric, spring forest). Existing files are never overwritten.

## Reported on-device results

| Observation | What it establishes |
| --- | --- |
| Poll originally returned `invalid_session`; changing the request's session field from Text to Dictionary fixed it | Input-type wiring mattered. Runtime also accepts serialized session text now. |
| Base64 reconstruction yielded Duration 00:00 | That native flow did not provide usable duration in the test. Mock tests did not cover it. |
| Native Get File yielded about six seconds for ocean.mp3 and enabled playback | The working native file route was identified. |
| Caching that file removed the reported Play Sound action errors | Keep caching; it did not eliminate all timeouts or playback gaps. |
| Playback still has irregular extra gaps of roughly 1, 5, and sometimes 30 seconds; some runs still time out | Overall runtime reliability remains unresolved. |
| An ordinary non-task QR alarm also timed out | Apps Script/task refresh is not required for a timeout. |
| Opening Clock did not reliably invoke Engine during a QR loop; separate qrClockCloser ran | Retain qrClockCloser on both iOS 26 and iOS 27. The exact launch/concurrency rule is unconfirmed. |
| Scanner menu sometimes fails to appear | Its stale menu state and output wiring need correction and phone testing. |

## Scanner issues and pending corrections

The unchanged Scanner core returns JSON text via `Script.setShortcutOutput(JSON.stringify(result))`. Its `shouldShowMenu` and `vibrate` fields are Booleans. The earlier replacement readout used Number/is 1 comparisons and omitted explicit JSON conversion. Restore Get Dictionary from Output where the Run Script action does not already convert JSON, and use Boolean/is Yes for those fields. These are identified wiring corrections, not confirmed phone fixes at this checkpoint.

The core claims the menu slot before the Choose from Menu action. Selecting a branch lets `scanner_touch` release it. Canceling/dismissing the menu ends the Shortcut before either branch runs, leaving the open flag set until the **120-second** stale timeout. The Shortcut's 50-second deadline does not clean up an invocation that has already ended.

The original Silence branch updated the mute timestamp but did not release the menu flag; the replacement releases it when that option is selected. That fixes branch-based release only, not cancellation.

Proposed, not implemented: stop using the open flag to gate menus and use the existing nine-second timestamp cooldown instead. This permits recovery without post-cancellation cleanup but can present a duplicate menu or interfere with an open scanner after the cooldown. A short lease on the flag has the same fundamental tradeoff. Cancellation still requires a later invocation to reopen the menu.

## Engine scheduling work still pending

The current core uses a one-minute ordinary QR restart and a three-minute backup. Task QR alarms take the task branch and, while task reschedules remain, schedule a task follow-up plus backup rather than the ordinary QR restart. A 21-minute task cadence explains the initial +3 backup and +21 task follow-up. The reported +12 alarm was not conclusively identified.

Backup/restart fires entering task handling can consume reschedules and shift the task follow-up; an earlier scheduled follow-up can remain. Separate QR playback restarts from task checks, and account for all scheduled alarm cleanup on scan/completion.

Desired direction, not implemented:

- Regular active QR: restart at +2 minutes and backup provisionally at +4 minutes.
- Task QR: those two alarms plus an independent task-check deadline.
- Coalesce coincident times into one Clock alarm while handling each due purpose.
- QR restarts/backups should not consume task reschedules, move the task deadline, or rerun task-trigger actions just to restart playback.
- Scanning should silence the QR instance and clear its QR restart/backup while preserving a pending task check.

Changing the constants alone is insufficient: the registry currently shares scheduling fields across these purposes.

## Reliability hypotheses and design boundary

Unmeasured possibilities include Scriptable call overhead, waiting for iCloud-backed state, a stalled native action, and automation launch suppression while the same Shortcut is already running. No Apple rule about duration-based cooldown or same-shortcut exclusion has been confirmed.

Known intentional delays include the 13-second scanner mute window, the one-second loop Wait, and the estimated playback reservation. Repeated scanner touches can extend mute time. A successor claims ownership before it finishes scheduling/actions, so handoff can create silence. These facts do not prove the cause of a particular 30-second gap.

A proposed 60–90-second run followed by a +2-minute restart was discussed but is not implemented. It trades dependence on long execution for dependence on successful relaunch. Better results on one phone would not establish reliability across devices, battery states, temperatures, and OS updates.

Decision at this checkpoint: preserve useful repeated QR prompting and fix deterministic code/wiring bugs; do not claim seamless playback or dependable dismissal enforcement. Avoid treating additional coordination logic as a guarantee against platform failures.

## Testing this branch

Run from the repository root with Node.js:

```sh
TZ=America/New_York node --test tests/*.test.js tests/*.test.cjs
```

The runtime test contains 80 mocked behavior assertions. These tests cannot exercise native audio decoding/duration, Play Sound, automation launches, menu dismissal, Shortcuts type coercion, permissions, or recurring-event editing.

The installer defaults to `VERSION = "main"`. Before this checkpoint is merged, set VERSION to `checkpoint/calendar-alarms-runtime-2026-10-05` when testing the inline installer, or install the runtime manually. Main does not contain the new runtime yet. Existing scripts are skipped; manually replace an existing runtime when testing an update. Do not delete a user's existing scripts merely to force an update.

Scriptable core output JSON conversion, remaining Boolean comparisons, named cache updates, audio durations in seconds, and recurring Sleep event edits still require on-phone verification. No new shared Shortcut links or updated production installation guide are supplied by this checkpoint.
