# Shortcut action readouts

These are complete manual rebuild flows updated 2026-10-14 for the Engine, Scanner, and Runtime in this branch. They incorporate the audit of the current shared Shortcuts and the completion/trigger fixes. Replace the corresponding native action flows using these readouts; the repository retains older versions in Git history. The documents describe the corrected target flows, rather than a verbatim dump of the existing buggy exports. Published iCloud links and installed Shortcuts are not changed by editing these files. Native audio/automation behavior still needs device verification.

| Shortcut | Full readout |
| --- | --- |
| Calendar Alarm Engine | [Actions](Calendar%20Alarm%20Engine.md) |
| Calendar Alarms Actions | [Actions](Calendar%20Alarms%20Actions.md) |
| Calendar Alarms QR Scanner | [Actions](Calendar%20Alarms%20QR%20Scanner.md) |
| CA Wake Times | [Actions](CA%20Wake%20Times.md) |
| CA qrClockCloser | [Actions](CA%20qrClockCloser.md) |

Install matching scripts and native flows together. Calendar Alarms Actions uses the status-Dictionary return from Update Lockout Cache in [OpenHabits Metrics](https://github.com/CopperPanMan/OpenHabits-Metrics/pull/180). The Engine returns before playback for forwarded completion reports; trigger groups finish before their QR playback begins. The Scanner includes explicit JSON conversion, Boolean comparisons, and visible warnings. Wake Times preserves the original Sleep duration and uses exact disabled-calendar names.

Keep established Shortcut names and the separate qrClockCloser automation on iOS 26 and 27. Each readout identifies native field types and explicit inputs. `→ Name` labels a magic variable; Set Variable is an actual action. Comments and empty-field markers are instructions, not literal text to pass to a script.

Prefer fewer native actions and helper calls where they preserve the intended behavior. These are full proposed rebuild flows; the shared exports can still contain the working older native implementations. Adopt a helper flow when its overall reliability/maintenance benefit justifies rebuilding, rather than expanding a working Shortcut for a small isolated improvement. Wake Times keeps selection/date calculations in the Runtime; the Engine retains native Clock operations and cached playback.

The [installer source](../Inline%20Scriptable/Calendar%20Alarms%20Installer.js) installs missing files only. For an existing installation, replace the Scriptable scripts directly and rebuild the affected native flows; see [maintenance](../Guides/Troubleshooting%20and%20Maintenance.md#update-an-existing-installation). The [Setup Guide](../Setup%20Guide.md) remains the normal installation entry point. Older [Development notes](../Development/README.md) describe historical checkpoints; use these dated readouts for the current full action sequences.
