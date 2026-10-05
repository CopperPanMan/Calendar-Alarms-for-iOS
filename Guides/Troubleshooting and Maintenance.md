# Troubleshooting and maintenance

[Feature Reference](../Feature%20Reference.md) · [Setup Guide](../Setup%20Guide.md)

## No alarm appears in Clock

1. Confirm the event has synced to Apple Calendar on your iPhone and contains one alarm configuration block. Check its alarm is **ON** and its start/end reference and offset are correct.
2. Run **Calendar Alarm Engine** manually with the phone unlocked. Grant requested permissions and read any error it reports.
3. Check that the event's calendar is not excluded in **Calendar Alarms Actions** settings.

The Engine normally schedules alarms within the next 24 hours; an alarm months away will not appear in Clock yet. Closing Calendar syncs edits, and the 12:10 a.m. automation supplies a daily sync. Edits from another device or calendar app may need time to reach Apple Calendar, followed by a manual Engine run.

Moving events or crossing time zones also requires a successful sync. Avoid giving an unrelated Clock alarm the same name and time as a Calendar Alarm: the system cannot reliably distinguish identical alarms.

## An alarm is delayed or does not run

First check [rescheduling settings](Rescheduling.md), task completion, calendar exclusions, and the relevant automation. Run the Shortcut manually with the phone unlocked to reveal permissions or configuration errors. Test a basic alarm without advanced settings to narrow the problem.

iOS can delay, skip, or terminate Shortcut executions. Backup triggers improve recovery but cannot guarantee it. Native Clock ringing and the automation that performs actions are separate: an alarm can ring even when its actions fail. A failed native deletion can leave an old Clock alarm until a later cleanup run.

## QR alarm problems

### The scan menu does not appear

Confirm the alarm-trigger automation runs **Calendar Alarms QR Scanner**. The current Scanner retains a menu-open flag after cancellation; it can suppress a later menu for up to two minutes. Scan with Camera and tap the Shortcuts link, or run the Scanner manually after that interval. Do not rename the Scanner without also regenerating its QR links.

### The sound is missing, pauses, or reports a file error

Check the file at `Shortcuts/OpenHabits/Calendar Alarms/Alarm Tones`, its exact relative path, and QR Volume. Use an installed tone to rule out a custom-file problem. The current playback flow errors if the file is missing; rerunning setup restores missing built-in tones.

Sound can pause while the scan controls are used, while a new execution starts, or when an action stalls. The sound cache reduces file work, but continuous playback is not guaranteed. Follow the [update instructions](#update-an-existing-installation) if your Engine Shortcut predates cached playback or the new cleanup block.

### It rings again after a successful scan

If task looping is enabled, its future task check is intentionally retained. A scan stops the current QR instance; it does not record task completion. Complete every configured task to stop that chain.

For a non-task alarm, a queued clip or a Clock retry awaiting cleanup can still occur. Run Engine to reconcile stopped retries. If it continues, verify that Engine, Runtime, and the Engine Shortcut playback section were updated together. Known old alarms whose ownership was lost before the fix may require manual removal.

### I cannot reach the code

Temporarily disable the **Clock-open automation for CA qrClockCloser**, then disable/delete the identified QR retries in Clock. An active QR instance expires after an hour when the system next processes it; do not run Engine before expiration if you are trying to avoid recreating active retries. Task-loop follow-ups are separate and may also need to be disabled by editing that alarm's configuration. Restore the automation afterward.

## Actions fail or are not spoken

Run the action's Shortcut manually and grant permissions. Check exact Shortcut, app, and Focus names, plus sound paths. Test actions individually, then put them back in order. Opening an app or another destination may require an unlocked phone. **Do Not Disturb** intentionally turns spoken notifications and OpenHabits reminders into displayed text.

If a Shortcut was imported again, reselect its target in each affected **Run Shortcut** action. An action can show the expected name while retaining an old connection.

## OpenHabits reminders or task checks fail

Run **Update Lockout Cache** without input and confirm it succeeds. Check that Insights uses the correct deployment ID and secret, that metric IDs match the applied configuration, and that the Metrics runtime/evaluator is installed. See [Connect once](OpenHabits%20Integration.md#connect-once).

Test with the phone unlocked. The integration reads `OpenHabits/OpenHabits Metrics/lockoutCache.json`; it needs a successful cache with reminder completion state. Unknown IDs and cache failures do not mean a task is complete. A reminder can be empty when its metrics are complete, unscheduled, or expired.

## Wake Times cannot find Sleep

Use the exact event title **Sleep**, a timed event for your next sleep period, and a calendar that is not excluded. Avoid multiple nearby Sleep events. The repository helper currently searches event starts from nine hours ago to fourteen hours ahead. An event outside that search or several matching events produces an error.

Keep the duration-preserving **CA Wake Times** version when updating. The repository's older manual readout still delegates dates to a helper that calculates eight hours; see [the developer version note](../Development/README.md#wake-times-version-note) before rebuilding it.

## Update an existing installation

Rerunning **Calendar Alarms Actions** installs missing scripts and tones. **It does not overwrite existing files or update your installed Shortcut actions.**

1. Read the relevant change notes. For the current QR update, see [QR Scheduling Fixes](../Development/QR%20Scheduling%20Fixes.md#updating-an-existing-installation).
2. Save copies of any Scriptable scripts or Shortcuts you customized.
3. Replace existing Scriptable source with the matching repository version, keeping its script name. For the QR update, replace **Calendar Alarm Engine** and **Calendar Alarms Runtime** together.
4. Install the corresponding updated shared Shortcuts when available, or apply the specified [manual action readout](../Shortcut%20Actions/README.md). Source changes in GitHub do not update a shared Shortcut automatically. Preserve the corrected Wake Times duration behavior if using its older readout.
5. Reconnect imported **Run Shortcut** actions and confirm your version's automations. Run Engine once, preferably without an active QR alarm, then repeat the demo and test the features you use.

Preserve the registry, settings, and custom tones; do not delete them to force an update. The updated Engine migrates known QR schedules. A runtime script normally appears in Scriptable without its `.js` extension; for example, **Calendar Alarms Runtime**.

## Remove Calendar Alarms

1. Disable its alarm, Calendar-close, daily-sync, and Clock-open automations first.
2. Remove the Clock alarms you know belong to Calendar Alarms. Do not delete unrelated alarms.
3. Delete its five Shortcuts and three Scriptable scripts if you no longer use them. Keep Scriptable if other projects need it.
4. Optionally back up and remove `iCloud Drive/Shortcuts/OpenHabits/Calendar Alarms` and the alarm blocks in event notes.

Keep the rest of **OpenHabits** if you still use Metrics; it has separate settings and data. Removing an event's alarm block while the system is installed, then syncing, is the normal way to remove that event's alarms.
