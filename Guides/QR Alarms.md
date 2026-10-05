# QR alarms

[Feature Reference](../Feature%20Reference.md) · [Setup Guide](../Setup%20Guide.md)

A QR alarm keeps prompting you to scan a matching code. Use it to get out of bed or go to a particular place. Shortcuts can pause, time out, or miss a trigger, so continuous sound and dismissal prevention are not guaranteed.

## Set one up

1. In the [Alarm Editor](https://copperpanman.github.io/Calendar-Alarms-for-iOS/), add an alarm and set its time relative to the event.
2. Open **Advanced Settings → QR Alarm Properties**. Enter a **QR Code ID**, such as `bathroom`. Use letters, numbers, or `- . _ ~`, without spaces.
3. Choose a **QR Sound File** from the built-in list and set **QR Volume**. Start with `marimba.mp3` at `40` while testing.
4. Select **Show QR Code**, then download or print the code and put it where you want to scan it. The code launches **Calendar Alarms QR Scanner**, so keep that Shortcut's name unchanged.
5. Copy the generated configuration into the event's notes and close Calendar, or run **Calendar Alarm Engine** to sync.

The six installed tones are **marimba, ocean, siren, sonar, marimba electric, and spring forest**. The Editor's preview plays a tone in your browser; the installer supplies the corresponding file on your phone.

**QR Sound Length** is a legacy setting still shown by the Editor. The current Engine action readout measures the loaded file's duration automatically; you do not need to calculate it for that flow. Older Shortcut versions may still use the field.

## Test the scan

Schedule the alarm a few minutes ahead and keep the code visible on another device or on paper. When it fires, choose **Scan Code** in the menu. You can also scan the code with the iPhone Camera app and tap its Shortcuts link.

A matching active alarm produces vibration feedback and stops that QR instance. Codes are case-sensitive. Several alarms can share an ID; scanning it stops all currently active QR alarms with that ID. Use different IDs if they need separate dismissal.

To run something after scanning, choose **+ Add QR Action on Scan** under **QR Alarm Properties**. See [Actions and custom Shortcuts](Actions.md). These actions run for matching active alarms, rather than every time you scan an idle code.

## What happens while it is active?

The current Engine schedules a restart **two minutes later** and a backup **four minutes later**. Each successful QR restart renews those times. The sound repeats between triggers, subject to iOS execution delays.

**Silence for 12s** pauses playback briefly without completing the alarm. Opening the scanner also briefly mutes playback so you can scan. Dismissing the menu does not complete the alarm; the current menu state can suppress another menu for up to two minutes. Use Camera if the menu is missing.

Keep the separate **CA qrClockCloser** Shortcut and Clock-open automation on both iOS 26 and iOS 27 if you want Clock to send you Home during an active QR alarm. This discourages disabling upcoming retries; it is not a tamper-proof lock.

After scanning, the Scanner and the Engine's playback cleanup remove QR retries. If the Engine has already stopped, additional cleanup depends on its next successful run. A sound already handed to the native playback action can still play. An active QR instance expires after an hour; expiration is applied when the system next runs.

When [task looping](OpenHabits%20Integration.md#repeat-until-a-task-is-complete) is also enabled, scanning stops the current QR prompt **without completing the task**. Its separate task check stays scheduled and can start another QR instance if the task remains incomplete. A task check that shares a Clock time with a QR retry is intentionally retained.

## Use your own sound

1. Put an MP3 in **iCloud Drive → Shortcuts → OpenHabits → Calendar Alarms → Alarm Tones**. You can create subfolders there.
2. Enter its path relative to **Alarm Tones** in **QR Sound File**.
3. Test once with the phone unlocked to grant file access and confirm playback.

| File location inside Alarm Tones | Enter in the Editor |
| --- | --- |
| `chime.mp3` | `chime.mp3` |
| `Nature/ocean.mp3` | `Nature/ocean.mp3` |

The Editor may add `Alarm Tones/` to the exported JSON; the runtime understands that prefix. Use exact folder and file names. Custom sounds are not uploaded by the Editor and have no browser preview. A missing file causes an error; there is no generic-tone fallback in the current cached-file playback flow. Choose an installed tone instead of leaving the sound blank.

For recovery steps, see [QR troubleshooting](Troubleshooting%20and%20Maintenance.md#qr-alarm-problems). For raw fields, see [JSON Alarm Reference](../JSON%20Alarm%20Reference.md).
