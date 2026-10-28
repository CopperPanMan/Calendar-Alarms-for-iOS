# Native playback release

The 143-action Engine uses the canonical **Calendar Alarm Engine** and **Calendar Alarms Runtime** Scriptable files. This release brings the previously isolated native-playback implementation into those files, preserving the current task-loop toggle fixes, speech-volume support and removal of obsolete sound-length configuration. Playback remains native; no additional Scriptable invocation is introduced.

## Shortcut contract

The installed Engine action count remains 143, including its introductory Comment. Four Scriptable cards remain:

| Action | Script | Request |
|---|---|---|
| 5 | Calendar Alarms Runtime | engine_begin, nativePlaybackV2: true |
| 21 | Calendar Alarm Engine | Existing EngineInput including nativePlaybackV2: true and restartBufferSeconds |
| 46 | Calendar Alarms Runtime | Existing completion-notification cleanup |
| 56 | Calendar Alarms Runtime | Existing per-trigger check |

Only the four fileName fields change when redirecting the established native-playback shortcut from the test-named scripts. All other action parameters and sequencing remain the same. The existing native owner filename `nativePlaybackTestOwner.txt` remains unchanged: changing it is not needed for script-name consolidation.

Ordinary QR restarts use two Scriptable calls before playback; completion-only invocations use three. Configured trigger/helper shortcuts add their existing work. Playback uses zero Scriptable calls. The 15-second Scanner mute, 20-second volume cadence, two-minute restarts, five-second buffer plus one-second clip allowance, measured audio duration, completion-scope protection and awaited trigger speech remain.

## Script behavior and compatibility

Engine supplies a numeric enabled/disabled nativePlaybackPlan only from committed registry state. A per-activation identifier survives restarts and changes on a new activation; it participates in concurrent schedule checks. Runtime skips unused playback-ticket/session allocation only when engine_begin explicitly requests nativePlaybackV2. Clock guards, completion classification and older session-based callers remain supported.

This is opt-in support: updating scripts alone does not convert an older shared shortcut to native playback. Existing public links remain unchanged in this PR. A new native-playback shared link must follow deployment of these scripts; the installer already downloads these canonical filenames from main. Running the installer before this PR is merged can overwrite a locally installed native-capable script with the older main version.

The native version still has its accepted tradeoffs: no automatic first-clip QR banner, sound/volume fixed for an invocation, simpler ownership with possible brief overlap, a possible extra clip when scanning races a playback check, and no in-loop repair of leftover Clock retries. Phone testing showed improvement, with occasional missed cycles/timeouts still reported; this is not a complete resolution of iOS automation timing.

## Verification

The canonical scripts pass the existing suite plus twelve native-playback checks: activation persistence/migration, new activation identity after scanning, committed-plan eligibility, failed writes, concurrent scans/replacements, completion protection for tomorrow, invalid inputs/paths, and native begin without tickets while retaining completion and Clock handling. Fresh before/after native exports are compared separately to confirm only the four script names changed, allowing native identifier remapping.
