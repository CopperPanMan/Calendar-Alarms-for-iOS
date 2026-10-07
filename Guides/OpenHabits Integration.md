# OpenHabits integration

[Feature Reference](../Feature%20Reference.md) · [OpenHabits Metrics](https://github.com/CopperPanMan/OpenHabits-Metrics)

Calendar Alarms works on its own. Connect OpenHabits Metrics when you want reminders about your tracked tasks or alarms that return until those tasks are complete. App blocking is optional.

## Connect once

1. Finish [OpenHabits Metrics setup](https://github.com/CopperPanMan/OpenHabits-Metrics/blob/main/Repo%20Docs/setup.md) and successfully log one metric.
2. Install **Update Lockout Cache** and the Metrics Scriptable runtime/evaluator using [its Calendar Alarms integration instructions](https://github.com/CopperPanMan/OpenHabits-Metrics/blob/main/Repo%20Docs/guides/calendar-alarms.md#connect-once). Keep the **Shortcuts** bookmark. You do not need blocking rules or app-open automations.
3. Run **Update Lockout Cache** without input. It uses your existing Insights connection settings; no second web app deployment or secret is needed.
4. Test a reminder or task alarm below with the phone unlocked, approving the file and network permissions it requests.

The shared cache lives at `iCloud Drive/Shortcuts/OpenHabits/OpenHabits Metrics/lockoutCache.json`. Calendar Alarms Actions invokes **Update Lockout Cache** when a refresh is needed. Keep that exact Shortcut name.

## Find your metric IDs

Open your OpenHabits configuration editor and look under **Metrics → Metric ID**. Copy that ID, not the display name or Sheet row number. It must match exactly and exist in your applied configuration. See [Create and log metrics](https://github.com/CopperPanMan/OpenHabits-Metrics/blob/main/Repo%20Docs/guides/metrics.md).

For example, **Started Day** can have the ID `started_day`. Examples here work only if those IDs exist in your configuration.

## Repeat until a task is complete

1. In the [Alarm Editor](https://copperpanman.github.io/Calendar-Alarms-for-iOS/), create an alarm and open **Advanced Settings → Task Looping**.
2. Choose **+ Add Metric ID** and enter the metric ID. Expand **Where to find your Metric ID** in the Editor for copying instructions. Add more IDs if every listed task must be completed.
3. Set **Task Loop Min** to a positive interval, such as `30` minutes. Under **Rescheduling Properties**, set **Max Reschedules** to the number of follow-ups you want, such as `2`.
4. Leave **Check Tasks First Time** checked to skip an alarm whose tasks are already complete. Uncheck it to make the initial eligible fire run without a completion check; later task checks still check completion.
5. Paste the configuration into the calendar event and sync.

With an interval of 30 and two reschedules, an incomplete task can prompt initially and twice more, roughly 30 minutes apart, provided no context gates alter the schedule. It does not repeat indefinitely. All listed IDs must have explicit complete status; a missing metric or failed refresh does not establish completion.

Completion comes from Metrics' effective-day completion state. A nonempty logged value can count as complete, including `0`; a numeric target is not automatically a completion rule. Use a dedicated completion or timestamp metric for “I did this task.”

### Test it

Use an uncompleted test metric, a two-minute task interval, and one reschedule. Schedule the alarm a few minutes ahead. Let the first fire run, then log that metric using its iOS logger. If your Insights Shortcut has the Calendar Alarms recording hook, it passes the recording response to Engine so the follow-up can be removed promptly.

Without that hook, or after editing through the Sheet or Notion, the fresh check performed by **Calendar Alarms Actions** on a task fire can clear the remaining task alarm. Logging off-device does not itself launch an iPhone Shortcut. To check sooner, run **Update Lockout Cache**, then **Calendar Alarm Engine**. Confirm that a completed task no longer repeats, then test your real interval.

### Combine task looping with QR

Add QR properties as described in [QR Alarms](QR%20Alarms.md). Scanning stops the **current QR instance**, while the independent task check remains scheduled. If the task is incomplete at that check, it can start another QR instance.

The two-minute QR restart and four-minute backup maintain prompting; they do not consume task reschedules or move the task deadline. If a retry and task check coincide, one Clock alarm serves both purposes. Scanning intentionally preserves that shared task check. Completing all task IDs stops the task chain; scanning alone does not log completion.

## Show or speak a reminder

Add an **OpenHabits Reminder** action on trigger or on QR scan. Enter the **Metric IDs** separated by commas, for example `exercise_time, floss_time`, and choose **Show**, **Speak**, or **Speak + Show**. Spaces after commas are fine; use IDs from your own configuration. The field's **?** icon explains the format, and **Example and setup** expands a sample message and connection guidance. This action reports incomplete tasks; it does not enable task looping by itself.

For example, a silent non-QR alarm with an OpenHabits Reminder for `started_day` can announce that you still need to start your day. Depending on the metric's configuration, the message includes points, a streak, or time remaining until its deadline. Completed, unscheduled, expired, and unknown metrics are omitted. An empty reminder can therefore produce no message. Do Not Disturb displays the message instead of speaking it.

Test with an incomplete scheduled metric, then log it and refresh the cache. Confirm it disappears from the next reminder. Reminder output uses fresh cached state where possible, with automatic refresh when stale or missing.

You do not need a separate **Task Alarm Resetter** Shortcut or the old inline reminder/completion scripts. The current **Calendar Alarms Actions** and **Calendar Alarms Runtime** handle those operations.

For connection problems, see [OpenHabits troubleshooting](Troubleshooting%20and%20Maintenance.md#openhabits-reminders-or-task-checks-fail). For direct action calls, see the [Actions JSON Schema](../Calendar%20Alarms%20Actions%20Schema.md#openhabits-reminder).
