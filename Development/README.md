# Calendar Alarms development

For installation and feature setup, start with [Setup Guide](../Setup%20Guide.md) and [Feature Reference](../Feature%20Reference.md). This directory records implementation details, history, and remaining verification work.

## Current components

| Component | Responsibility |
| --- | --- |
| [Calendar Alarm Engine.js](../Calendar%20Alarm%20Engine.js) | Parse calendar definitions, reconcile owned Clock schedules, context gates, independent task/QR deadlines, completion and cleanup |
| [Calendar Alarm QR Scanner.js](../Calendar%20Alarm%20QR%20Scanner.js) | Match codes, stop active QR state, queue scan actions, and return its native deletion plan; retains the existing menu lease |
| [Calendar Alarms Runtime.js](../Calendar%20Alarms%20Runtime.js) | Playback polling/permission, Clock guard, settings, action planning, reminders, and Wake Times helpers |
| [Inline installer](../Inline%20Scriptable/Calendar%20Alarms%20Installer.js) | Download missing root scripts and six tones; never overwrite existing files |
| [Shortcut action readouts](../Shortcut%20Actions/README.md) | Native action wiring and manual rebuild material; not exported Shortcuts or a verified dump of every shared link |
| [docs](../docs/index.html) | Live Alarm Editor; the folder name does not mean it is an obsolete documentation tree |

The **Shortcuts** Scriptable bookmark points to **iCloud Drive/Shortcuts**. Calendar Alarms settings and registry files live under `OpenHabits/Calendar Alarms`. Metrics integration reads `OpenHabits/OpenHabits Metrics/lockoutCache.json`. Playback ownership and reservation records are device-local cache files. Each phone has its own execution and Clock alarms.

## Current behavior and contracts

- [QR Scheduling Fixes](QR%20Scheduling%20Fixes.md) describes +2/+4 retries, independent task checks, scan cleanup, migration, and the required Engine Shortcut update.
- [JSON Alarm Reference](../JSON%20Alarm%20Reference.md) defines user-supplied event fields; registry fields are not event configuration.
- [Actions JSON Schema](../Calendar%20Alarms%20Actions%20Schema.md) defines one action per invocation. Native operations execute in the Actions Shortcut after runtime planning.
- [Runtime Checkpoint](Runtime%20Checkpoint.md) is historical. Its pending scheduling proposals were superseded by the QR fix; its Scanner menu cancellation and native wiring caveats still matter.
- [Archive](Archive/README.md) preserves the superseded requirements and older inline helpers.

## Wake Times version note

The owner reports that the current **CA Wake Times** Shortcut was corrected to preserve the original Sleep event's duration. User documentation describes that behavior. The repository's older [Wake Times readout](../Shortcut%20Actions/CA%20Wake%20Times.md) still uses `wake_plan.start`, and the checked-in runtime calculates that as eight hours before the selected end.

Do not rebuild that older flow and assume it includes the on-phone fix. The corrected native flow or matching runtime update must be captured before publishing an updated readout. This documentation change does not modify the runtime or invent an export of the owner's Shortcut.

## Verification

Run from the repository root with Node.js:

```sh
TZ=America/New_York node --test tests/*.test.js tests/*.test.cjs
```

The tests cover the actual scripts in a mocked Scriptable environment and Editor model helpers. They do not establish native audio duration, continuous playback, automation launch reliability, type conversion, permissions, recurring-event editing, or shared Shortcut contents.

Before distributing a version, update and verify the sharing links separately for iOS 26 and iOS 27. Check script names, Run Shortcut connections, the inline installer, playback stop/deletion wiring, Scanner output conversion, and the corrected Wake Times duration. Keep separate qrClockCloser automations on both versions. Test the basic demo and each enabled advanced feature on a phone. Rerunning the missing-file installer is not an upgrade of existing scripts.
