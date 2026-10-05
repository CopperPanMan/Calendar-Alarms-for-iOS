# Shortcut action readouts

These manual rebuild instructions accompany [Calendar Alarms Runtime.js](../Calendar%20Alarms%20Runtime.js). The Engine readout includes the subsequent [QR scheduling update](../Development/QR%20Scheduling%20Fixes.md); other readouts retain their checkpoint status. Read [Development](../Development/README.md) for version notes and unresolved native wiring. These are not exported Shortcut files or a verified dump of the current shared links. Normal users should start with the [Setup Guide](../Setup%20Guide.md).

| Shortcut | Readout |
| --- | --- |
| Calendar Alarm Engine | [Actions](Calendar%20Alarm%20Engine.md) |
| CA qrClockCloser | [Actions](CA%20qrClockCloser.md) |
| Calendar Alarms QR Scanner | [Actions](Calendar%20Alarms%20QR%20Scanner.md) |
| Calendar Alarms Actions | [Actions](Calendar%20Alarms%20Actions.md) |
| CA Wake Times | [Actions](CA%20Wake%20Times.md) |

Keep the established Shortcut names. Retain a separate qrClockCloser automation on iOS 26 and iOS 27. No new Shortcut sharing links are included.

The Engine readout uses cached native audio, numeric QR flags, and the QR scheduling update's stop/deletion block. The Scanner readout preserves its earlier JSON/Boolean wiring and cancellation-state caveats; the proposed menu cooldown has not been applied. The older Wake Times readout does not yet capture the owner's on-phone duration-preservation fix; see its [version note](../Development/README.md#wake-times-version-note).

The inline setup source is [Calendar Alarms Installer.js](../Inline%20Scriptable/Calendar%20Alarms%20Installer.js). Its `VERSION = "main"` includes the merged runtime and QR fixes. It downloads missing files only; follow [existing-installation updates](../Guides/Troubleshooting%20and%20Maintenance.md#update-an-existing-installation) to replace older scripts and native actions.
