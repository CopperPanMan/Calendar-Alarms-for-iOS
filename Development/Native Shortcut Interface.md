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
| Runtime `qr_poll` / `qr_permit` | `stop` and `play` Numbers 0/1; deletion plans remain Lists. Pass the whole session Dictionary; serialized session JSON remains accepted |
| Runtime `action` | `refresh`, `speak`, `show`, `ok`, and `allComplete` are Booleans when present; `kind` is Text; successful task planning returns `engineInput` JSON Text |
| Runtime `sound_file` | File/path output consumed by native Play Sound, not a Dictionary |
| Scanner input/result | Empty input requests the menu; a QR ID requests scan completion. Output is JSON Text; `shouldShowMenu`, `hasActiveQR`, and `vibrate` are Booleans |

`fileName` is relative to Alarm Tones; audio duration is seconds and playback volume is 0–1. The existing native branches for `kind` remain supported. Implement new behavior using existing native operations where possible. For a new device capability, a separately configured custom Shortcut can preserve the Engine's existing named-Shortcut dispatch.

## Ownership and menu handoff

The Engine marks new task QR instances with registry-only `qrMenuAfterPlayback`. While a Runtime playback session is live, the Scanner defers automatic menus until the Runtime grants playback permission for that occurrence, QR generation, and trigger group. The existing local playback reservation carries the alarm/group identity; a superseded owner's reservation cannot release a menu. Native Play Sound immediately follows permission, so this is a handoff signal, not proof that iOS emitted audible sound. Legacy native playback without a Runtime owner retains its existing menu; an expired/abandoned session releases the menu for recovery rather than hiding it indefinitely.

No new native actions or request fields are required for this handshake. The Scanner readout's existing wait limits become 180 seconds/90 iterations so it can wait through a slow reset without exiting after roughly 20 seconds. Manual/direct scans remain available while the automatic menu is deferred. Older registry entries without the marker keep their prior menu behavior. Menu cancellation retains the existing bounded lease behavior.

`tests/fixtures/native-shortcut-v1.json` records native request examples. `tests/native-shortcut-compatibility.test.cjs` executes the public script entry points and checks the return fields/types consumed by installed native actions. Scheduling/menu regressions cover the state transitions; native audio and iOS execution limits still need device verification. Change these fixtures only for an intentional, documented native migration, not to accommodate an accidental breaking script change.
