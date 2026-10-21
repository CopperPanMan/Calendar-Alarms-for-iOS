# Calendar Alarms development

For installation and feature setup, start with [Setup Guide](../Setup%20Guide.md) and [Feature Reference](../Feature%20Reference.md). This directory records implementation details, history, and remaining verification work.

## Current components

| Component | Responsibility |
| --- | --- |
| [Calendar Alarm Engine.js](../Calendar%20Alarm%20Engine.js) | Parse calendar definitions, reconcile owned Clock schedules, context gates, independent task/QR deadlines, completion and cleanup |
| [Calendar Alarm QR Scanner.js](../Calendar%20Alarm%20QR%20Scanner.js) | Match codes, stop active QR state, queue scan actions, and return its native deletion plan; retains a legacy menu adapter for older shortcuts |
| [Calendar Alarms Runtime.js](../Calendar%20Alarms%20Runtime.js) | Playback polling/permission, Clock guard, settings, action planning, reminders, and Wake Times helpers |
| [Inline installer](../Inline%20Scriptable/Calendar%20Alarms%20Installer.js) | Download missing root scripts and six tones; never overwrite existing files |
| [Shortcut action readouts](../Shortcut%20Actions/README.md) | Native action wiring and manual rebuild material; not exported Shortcuts or a verified dump of every shared link |
| [docs](../docs/index.html) | Live Alarm Editor; the folder name does not mean it is an obsolete documentation tree |

The **Shortcuts** Scriptable bookmark points to **iCloud Drive/Shortcuts**. Calendar Alarms settings and registry files live under `OpenHabits/Calendar Alarms`. Metrics integration reads `OpenHabits/OpenHabits Metrics/lockoutCache.json`. Playback ownership and reservation records are device-local cache files. Each phone has its own execution and Clock alarms.

## Current behavior and contracts

- [QR Scheduling Fixes](QR%20Scheduling%20Fixes.md) describes +2/+4 retries, independent task checks, scan cleanup, migration, and the required Engine Shortcut update.
- [JSON Alarm Reference](../JSON%20Alarm%20Reference.md) defines user-supplied event fields; registry fields are not event configuration.
- [Actions JSON Schema](../Calendar%20Alarms%20Actions%20Schema.md) defines one action per invocation. Native operations execute in the Actions Shortcut after runtime planning.
- [Runtime Checkpoint](Runtime%20Checkpoint.md) is historical. Its scheduling proposals and automatic Scanner menu were superseded; use the current native readouts for production wiring.
- [Archive](Archive/README.md) preserves the superseded requirements and older inline helpers.

## Wake Times version note

Use the current [Wake Times readout](../Shortcut%20Actions/CA%20Wake%20Times.md): preserve actual elapsed duration, search bounded start-date candidates and validate each snapshot individually, require exactly one match, then edit Start Date first and End Date last on the saved event. The native combined date filter and end-first edit order both failed controlled reproductions. Runtime retains its legacy `endFirst` return field for compatibility, but this readout does not use it to order edits.

## QR production configuration, October 2026

Use the clean Engine directly from the alarm automation, no trace caller, and no automatic Scanner menu. The first existing QR poll posts the notification. Buffer and volume-correction controls default to 20 seconds, two-minute restart/four-minute backup remain unchanged, and native playback completion is acknowledged on the next poll. See [QR reliability limits](../Guides/QR%20Alarms.md#reliability-limits-observed-on-device). Automated script tests do not simulate native audio, OS suspension, alarm automation lifecycle, or notification permission behavior.

## Verification

Run from the repository root with Node.js:

```sh
TZ=America/New_York node --test tests/*.test.js tests/*.test.cjs
```

The tests cover the actual scripts in a mocked Scriptable environment and Editor model helpers. They do not establish native audio duration, continuous playback, automation launch reliability, type conversion, permissions, recurring-event editing, or shared Shortcut contents.

Before distributing a version, update and verify the sharing links separately for iOS 26 and iOS 27. Check script names, Run Shortcut connections, the inline installer, playback stop/deletion wiring, Scanner output conversion, and the corrected Wake Times duration. Keep separate qrClockCloser automations on both versions. Test the basic demo and each enabled advanced feature on a phone. Rerunning the missing-file installer is not an upgrade of existing scripts.
