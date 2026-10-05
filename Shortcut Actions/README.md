# Shortcut action readouts

Development checkpoint, 2026-10-05. These manual rebuild instructions accompany [Calendar Alarms Runtime.js](../Calendar%20Alarms%20Runtime.js). Read the [checkpoint notes and unresolved issues](../Development/Runtime%20Checkpoint.md) before testing. They are not an installation-ready release or exported Shortcut files.

| Shortcut | Readout |
| --- | --- |
| Calendar Alarm Engine | [Actions](Calendar%20Alarm%20Engine.md) |
| CA qrClockCloser | [Actions](CA%20qrClockCloser.md) |
| Calendar Alarms QR Scanner | [Actions](Calendar%20Alarms%20QR%20Scanner.md) |
| Calendar Alarms Actions | [Actions](Calendar%20Alarms%20Actions.md) |
| CA Wake Times | [Actions](CA%20Wake%20Times.md) |

Keep the established Shortcut names. Retain a separate qrClockCloser automation on iOS 26 and iOS 27. No new Shortcut sharing links are included.

The Engine readout uses cached native audio files and the runtime's numeric QR flags. The Scanner readout preserves the earlier flow and explicitly identifies its JSON/Boolean wiring and cancellation-state problems. Proposed Scanner cooldown and Engine scheduling redesigns are documented separately and have not been applied.

The inline setup source is [Calendar Alarms Installer.js](../Inline%20Scriptable/Calendar%20Alarms%20Installer.js). It downloads missing files only. Before merging, choose this branch in its VERSION constant to test the new runtime.
