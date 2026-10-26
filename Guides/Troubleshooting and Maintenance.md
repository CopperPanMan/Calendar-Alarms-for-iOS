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

Run **Calendar Alarm Engine** from the alarm automation, and disable/remove the older automatic Scanner invocation. Tap the Scriptable notification body to open Scanner, or run Scanner manually. Check Scriptable notification permission and Notification Center. The current native menu has Scan, Silence for 15 seconds, and Dismiss, and runs only when requested; it does not loop inside the automation. Do not rename Scanner without regenerating its QR links.

If scanning reports “Alarm data is busy”, scan again after other alarm work finishes. The Scanner retries lock acquisition for up to three seconds within a cooperative 4.5-second work budget, returns a clear retry message if unsuccessful, and explicitly completes its Scriptable invocation. These budgets cannot interrupt a synchronous file operation already in progress. State files must be locally available; open Files to download them if an error identifies a missing local copy.

### The sound is missing, pauses, or reports a file error

Check the file at `Shortcuts/OpenHabits/Calendar Alarms/Alarm Tones`, its exact relative path, and QR Volume. Use an installed tone to rule out a custom-file problem. The current playback flow errors if the file is missing; rerunning setup restores missing built-in tones.

For the October 26 device result, five-second restart buffer and unchanged twenty-second volume cadence, see [QR reliability limits](QR%20Alarms.md#reliability-limits-observed-on-device). Consecutive looping improved in the reported test, but a few timeout messages remained around three minutes after starting. Record the exact shortcut/action and timing of a future message; its cause is unresolved. Sound can pause while the scan controls are used or an action stalls. The sound cache and fewer calls reduce repeated work, but continuous playback is not guaranteed. Follow the [update instructions](#update-an-existing-installation) for the specifically documented changes; do not add diagnostic actions to the playback loop.

### It rings again after a successful scan

If task looping is enabled, its future task check is intentionally retained. A scan stops the current QR instance; it does not record task completion. Complete every configured task to stop that chain.

The current Scanner deletes QR-only restarts and backups on scan, including those attached to task alarms. Replace an older **Calendar Alarm QR Scanner** Scriptable script to apply this fix. A queued clip or a failed native Clock deletion can still occur; run Engine to reconcile stopped retries. Known old alarms whose ownership was lost before the fix may require manual removal.

### I cannot reach the code

Temporarily disable the **Clock-open automation for CA qrClockCloser**, then disable/delete the identified QR retries in Clock. An active QR instance expires after an hour when the system next processes it; do not run Engine before expiration if you are trying to avoid recreating active retries. Task-loop follow-ups are separate and may also need to be disabled by editing that alarm's configuration. Restore the automation afterward.

## Actions fail or are not spoken

Run the action's Shortcut manually and grant permissions. Check exact Shortcut, app, and Focus names, plus sound paths. Test actions individually, then put them back in order. Opening an app or another destination may require an unlocked phone. **Do Not Disturb** intentionally turns spoken notifications and OpenHabits reminders into displayed text.

If a Shortcut was imported again, reselect its target in each affected **Run Shortcut** action. An action can show the expected name while retaining an old connection.

If an action's exported input contains `[object Object]`, rebuild it in the current Alarm Editor or restore a known-good configuration. Older Editor versions could corrupt action inputs during undo/redo or alarm duplication; the original payload cannot be recovered from that string.

## OpenHabits reminders or task checks fail

Run **Update Lockout Cache** without input and confirm it succeeds. Check that Insights uses the correct deployment ID and secret, that metric IDs match the applied configuration, and that the Metrics runtime/evaluator is installed. See [Connect once](OpenHabits%20Integration.md#connect-once).

Test with the phone unlocked. The integration reads `OpenHabits/OpenHabits Metrics/lockoutCache.json`; it needs a successful cache with reminder completion state. Unknown IDs and cache failures do not mean a task is complete. A reminder can be empty when its metrics are complete, unscheduled, or expired.

Completion cleanup now matches an exact alarm occurrence or a valid OpenHabits tracking-day window, rather than every future alarm with the same metric ID. This prevents tonight's completion from cancelling tomorrow's occurrence. See the [completion fix and validation limits](../Development/October%2026%20Reliability%20Update.md#completion-scope). Intentional task checks, cache refreshes and spoken trigger actions still run before QR sound; their startup time is not removed by this update.

## Wake Times cannot find Sleep

Use the exact event title **Sleep**, a timed event for your next sleep period, and a calendar that is not excluded. Avoid multiple nearby Sleep events. The repository helper currently searches event starts from ten hours ago to fourteen hours ahead. An event outside that search or several matching events produces an error.

Use the current [CA Wake Times readout](../Shortcut%20Actions/CA%20Wake%20Times.md). It validates candidate event dates individually rather than combining native start/end equality filters, then sets Start Date first and End Date last on the saved event. End-first editing was observed to enlarge duration. Restore any already-enlarged event manually once; the helper preserves its current elapsed duration.

## Update an existing installation

Rerunning **Calendar Alarms Actions** installs missing scripts and tones. **It does not overwrite existing files or update your installed Shortcut actions.**

1. Read the relevant change notes. For the current reductions, see [October 26 Reliability Update](../Development/October%2026%20Reliability%20Update.md). Earlier scheduling changes are documented in [QR Scheduling Fixes](../Development/QR%20Scheduling%20Fixes.md#updating-an-existing-installation).
2. Save copies of any Scriptable scripts or Shortcuts you customized.
3. Replace existing Scriptable source with the matching repository version, keeping its script name. For the October 26 changes, replace **Calendar Alarm Engine**, **Calendar Alarms Runtime**, and **Calendar Alarm QR Scanner**. The 148-action Engine requires a Runtime supporting `qr_step`; do not restore an older Runtime underneath that native flow.
4. Apply only the corresponding Engine/Scanner changes in the [manual action readouts](../Shortcut%20Actions/README.md), or use matching updated shared Shortcuts when available. Source changes in GitHub do not update a shared Shortcut automatically. The published iCloud links still identify older flows. Preserve existing shortcut identities and automation bindings when editing the current flows.
5. Reconnect imported **Run Shortcut** actions and confirm your version's automations. Run Engine once, preferably without an active QR alarm, then repeat the demo and test the features you use.

Preserve the registry, settings, and custom tones; do not delete them to force an update. The updated Engine migrates known QR schedules. A runtime script normally appears in Scriptable without its `.js` extension; for example, **Calendar Alarms Runtime**.

## Remove Calendar Alarms

1. Disable its alarm, Calendar-close, daily-sync, and Clock-open automations first.
2. Remove the Clock alarms you know belong to Calendar Alarms. Do not delete unrelated alarms.
3. Delete its five Shortcuts and three Scriptable scripts if you no longer use them. Keep Scriptable if other projects need it.
4. Optionally back up and remove `iCloud Drive/Shortcuts/OpenHabits/Calendar Alarms` and the alarm blocks in event notes.

Keep the rest of **OpenHabits** if you still use Metrics; it has separate settings and data. Removing an event's alarm block while the system is installed, then syncing, is the normal way to remove that event's alarms.
