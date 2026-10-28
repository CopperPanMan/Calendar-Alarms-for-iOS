# QR alarms

[Feature Reference](../Feature%20Reference.md) · [Setup Guide](../Setup%20Guide.md)

A QR alarm keeps prompting you to scan a matching code. Use it to get out of bed or go to a particular place. Shortcuts can pause, time out, or miss a trigger, so continuous sound and dismissal prevention are not guaranteed.

## Set one up

1. In the [Alarm Editor](https://copperpanman.github.io/Calendar-Alarms-for-iOS/), add an alarm and set its time relative to the event.
2. Open **Advanced Settings → QR Alarm Properties**. Enter a **QR Code ID**, such as `bathroom`. Use letters, numbers, or `- . _ ~`, without spaces.
3. Choose a **QR alarm sound** from the dropdown and set **QR Volume**. Start with **Marimba** at `40` while testing.
4. Select **Show QR Code**, then download or print the code and put it where you want to scan it. The code launches **Calendar Alarms QR Scanner**, so keep that Shortcut's name unchanged.
5. Copy the generated configuration into the event's notes and close Calendar, or run **Calendar Alarm Engine** to sync.

The six installed tones are **marimba, ocean, siren, sonar, marimba electric, and spring forest**. The Editor's preview plays a tone in your browser; the installer supplies the corresponding file on your phone.

Playback measures the loaded audio file's duration automatically. There is no sound-length setting. The Editor discards obsolete `qrSoundLen` values when importing old configurations.

Choose **Custom sound…** to reveal the filename field for your own MP3. Built-in sounds are installed during setup; custom files must be added to the Alarm Tones folder. Switching to a built-in sound and back preserves your custom filename while editing.

## Test the scan

Schedule the alarm a few minutes ahead and keep the code visible on another device or on paper. When it fires, tap the QR notification, then choose **Scan QR Code** in the menu. You can also scan the code with the iPhone Camera app and tap its Shortcuts link.

A matching active alarm produces vibration feedback and stops that QR instance. Codes are case-sensitive. Several alarms can share an ID; scanning it stops all currently active QR alarms with that ID. Use different IDs if they need separate dismissal.

To run something after scanning, choose **+ Add QR Action on Scan** under **QR Alarm Properties**. See [Actions and custom Shortcuts](Actions.md). These actions run for matching active alarms, rather than every time you scan an idle code.

## What happens while it is active?

The current Engine schedules a restart **two minutes later** and a backup **four minutes later**. Each successful QR restart renews those times. The sound repeats between triggers, subject to iOS execution delays.

Engine attempts a regular Scriptable notification once per run after the first sound finishes and its completion is acknowledged by the next existing Runtime call. It respects an intervening Scan/Silence interaction. Tap the notification body to open **Scan QR Code**, **Silence for 15 seconds**, or **Dismiss**. The banner disappears normally, but the notification can remain in Notification Center. If it is missing, open Scanner manually or scan with Camera. Enable Scriptable notifications and grant the required Shortcut permissions. Optional notification API failures do not block otherwise valid playback or hide the Scanner's known active alarms.

**Silence for 15 seconds** pauses new clips without completing the alarm. A new notification is scheduled after **10 seconds**, rather than reopening the menu. Opening the camera briefly mutes new playback too. A clip already playing finishes normally. Dismiss does not complete or silence the alarm. Expanded notification buttons are not used.

The Engine corrects media volume before its first eligible clip, then after at least **20 seconds** since the previous Set Volume completed, or when the selected alarm requests a different volume. Checks happen between clips, so turning down the volume can buy temporary silence and actual spacing can be longer. Avoid extremely short tones when testing: they execute more native actions per minute. No fixed Apple volume-action quota has been established.

The October 26 native Engine uses a tunable **five-second restart buffer**, measured against the next scheduled two-minute restart. A clip whose full duration plus the existing one-second allowance cannot fit before the buffered deadline is not started. It makes one initial `qr_poll` call, then one combined `qr_step` call per iteration after native preparation. That call acknowledges the preceding completed sound and checks fresh playback state before authorizing another clip. It has no unconditional wait after a successful clip. There is still normal native/Scriptable overhead between clips. The leading two Number actions in the Engine control buffer and volume-correction seconds independently. Neither changes the restart or backup schedule. See the [exact October 26 reductions](../Development/October%2026%20Reliability%20Update.md); the older published iCloud links are not updated by these source/readout changes.

Keep the separate **CA qrClockCloser** Shortcut and Clock-open automation on both iOS 26 and iOS 27 if you want Clock to send you Home during an active QR alarm. This discourages disabling upcoming retries; it is not a tamper-proof lock.

After scanning, the Scanner Shortcut deletes the owned QR restart and backup even when Engine has already stopped. It preserves any Clock alarm that also serves a task check or another live occurrence. Successful scans no longer make a separate notification-cleanup call before Clock deletion and scan actions; a delivered banner can remain until later Engine work, and the remaining camera-silence window can persist. If a native deletion action fails, a later Engine run retries cleanup using the retained schedule pointers. A sound already handed to the native playback action can still play. An active QR instance expires after an hour; expiration is applied when the system next runs.

When [task looping](OpenHabits%20Integration.md#repeat-until-a-task-is-complete) is also enabled, scanning stops the current QR prompt **without completing the task**. Its separate task check stays scheduled and can start another QR instance if the task remains incomplete. A task check that shares a Clock time with a QR retry is intentionally retained.

The automatic alarm path presents a notification rather than waiting for a menu. Direct Camera/QR-ID scans remain available while task reset/trigger work is running. Legacy Scanner core menu operations remain compatible for older native flows, but they are not used by this setup.

## Reliability limits observed on device

On October 26, after reducing Engine from 155 to 148 actions and its recurring Scriptable calls from two to one, the user reported consecutive QR looping without the previous every-other-execution failure. The buffer also changed from twenty to five seconds, so this test does not isolate which change produced the improvement. A few Shortcuts timeout messages still appeared around three minutes after starting. Their exact action and cause remain unresolved; they have not been attributed solely to iOS or to application code. Scanner and completion-scope phone tests were not reported with that looping result.

Earlier trials observed an unrelated Clock alarm, or another QR-related alarm firing close to an existing run, interrupt playback and the following restart. The Runtime now defers playback ownership transfer until a replacement has prepared a playable clip; the overlapping-alarm case still needs separate device validation. The existing native flow can delete the current Clock alarm before trigger actions and custom audio succeed. The four-minute backup is recovery assistance, not a guarantee. Keep native action count and repeated Scriptable invocations as primary reliability constraints: extensive device observations associate extra work with failed launches and timeouts. The precise Apple scheduling/cooldown mechanism remains undocumented. Do not add diagnostic actions or helper calls to the normal loop without evaluating their cost.

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
