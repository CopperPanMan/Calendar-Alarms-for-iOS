# October 26 reliability update

The approved update reduces repeated native/Scriptable work and confines metric completion to the correct alarm occurrence. It preserves the intended task checks, cache refreshes, trigger order, awaited speech and configured speech/QR volumes. Intentional startup actions are not treated as a delay to remove.

## Exact native and call reductions

These deltas compare the installed October 26 pre-update flows with the approved installed reductions. They do not compare the older shortcuts still linked from the repository.

| Measure | Before | After |
| --- | ---: | ---: |
| Engine native actions | 155 | 148 |
| Scanner native actions | 91 | 88 |
| Engine recurring Scriptable calls per normal candidate clip | 2 | 1 |
| Engine initial playback-plan calls outside Repeat | 0 | 1 |
| Successful direct QR scan Scriptable calls | 2 | 1 |
| Successful first-attempt manual camera scan Scriptable calls, including nested scan | 5 | 4 |
| Restart buffer | 20 seconds | 5 seconds |
| Restart / backup interval | 2 / 4 minutes | Unchanged |
| Normal volume correction interval | 20 seconds | Unchanged |

Engine removes eight original action rows (102, 104–106 and 136–139) and adds one Set Variable after Set Volume, a net reduction of seven. That variable records the requested target; the existing volume condition also corrects immediately when that target changes. Scanner removes exactly original rows 58–60: its successful post-core notification-cleanup request, Scriptable call and Dictionary conversion. No replacement helper call or optional native diagnostic scaffolding is added. Production shortcut identities and automation bindings were preserved.

Engine still contains seven static Scriptable action sites. The initial `qr_poll` moved outside Repeat; recurring `qr_step` combines acknowledgement of the preceding completed sound, fresh-state checks, the next plan and final permission after native preparation. For twenty successful clips, the minimum call count changes from **42 to 23**, excluding trigger actions and additional idle/denied iterations. This is a path count, not a device timing measurement.

The fresh final check validates the alarm key, prepared file, requested volume, scan/completion state, silence, ownership and complete clip fit including its one-second allowance. Changed preparation returns a replacement plan without authorizing audio; the next iteration prepares it. A returned stop reaches cleanup after the existing one-second non-play wait. A new session takes playback ownership only after preparation and a valid final permit, not merely when startup begins. The initial notification follows an acknowledged successful sound within an existing call.

## Completion scope

Previously, a completion report could suppress tomorrow's alarm because it shared tonight's metric ID. The Engine now matches an exact `alarmOccurrence` when supplied, otherwise a valid `completionScope` covering the OpenHabits tracking day. The corresponding OpenHabits Metrics server change supplies the effective day window, including timezone and after-midnight extension. A fresh validated cache can supply scope for older callers. An unscoped legacy fallback only covers past occurrences within its bounded window; it does not authorize cancelling future occurrences. Invalid, stale or incomplete reports do not widen cancellation.

Regression tests cover tonight-versus-tomorrow, after-midnight boundaries, occurrence-specific cleanup, malformed/stale scope and tomorrow's subsequent QR playback. The October 26 phone looping result did not separately verify a live metric completion followed by inspection of tomorrow's alarm.

## Other JavaScript fixes

- Validate locally available settings before setup writes; avoid waiting for an iCloud settings download during alarm startup. Existing unreadable/invalid settings preserve alarm state and return no Clock mutation plan. Missing settings retain defaults, and completion-only cleanup does not require settings.
- Preserve required registry/lock state on read failures, use the correct millisecond timer units, and bound lock/location/Scanner work. Cooperative budgets cannot interrupt a synchronous platform call already in progress.
- Isolate optional notification API failures while retaining known active-alarm details. Required registry and silence-state failures remain errors; optional Engine banner bookkeeping does not stop otherwise valid audio or known Clock cleanup.
- Avoid rewriting an unchanged registry after an unmatched scan. A successful native Scanner result now reaches Clock cleanup and configured scan actions without a separate optional notification call intervening.

The Scanner tradeoff is delayed optional cleanup: a delivered banner may remain until subsequent Engine work, and the remainder of the fifteen-second camera-silence window can persist.

## Device result and remaining issue

The user reported that looping now continues without the previous every-other-execution failure. This is direct evidence that the combined reductions/settings helped on that phone; it does not isolate which change caused the improvement or establish Apple's hidden scheduling algorithm. Native action count and repeated Scriptable invocations remain primary design constraints.

A few Shortcuts timeout messages still appeared around **t+3 minutes**. Their exact action and cause remain unresolved. Do not attribute them solely to iOS or mark the timeout issue fixed. Future observations should record the named shortcut/action and sound/Clock behavior without adding diagnostic actions to the normal loop. Scanner and completion-scope phone validation have not yet been reported.

The existing Clock-deletion sequence remains: the current Clock alarm can be deleted before trigger actions and custom audio succeed. The optional `reliableQRHandoff` implementation is **not enabled** by the approved native flow. This update does not claim to eliminate all silent failures, overlapping-alarm problems or timeouts.

## Verification and distribution

Repository-compatible source passed **324/324 tests**. The installed source variant passed **317/325**; the same eight pre-existing task-loop-toggle failures reproduced against its before-update baseline because that installed variant lacks the newer repository feature. No new installed-version test failures were found. These tests do not simulate iPhone scheduling or audio.

Fresh production native exports matched the reviewed action contents/order after consistent identifier remapping. Engine's native editor also raised minimum-client metadata from 2025 to 3010 while saving the compound volume condition; Scanner metadata was unchanged. Existing production identities were retained.

The [Engine](../Shortcut%20Actions/Calendar%20Alarm%20Engine.md) and [Scanner](../Shortcut%20Actions/Calendar%20Alarms%20QR%20Scanner.md) readouts describe the installed flows. Publishing source/readouts does not change the older iCloud sharing links or any user's installed shortcuts. Matching scripts and the targeted native changes must be adopted together; the new Engine requires `qr_step`. The installer only supplies missing files. No further native shortcut changes are part of preparing this PR.
