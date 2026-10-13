# Rescheduling

[Feature Reference](../Feature%20Reference.md) · [Alarm Editor](https://copperpanman.github.io/Calendar-Alarms-for-iOS/)

Rules are checked **when the alarm fires**, not continuously in the background. If a rule blocks the alarm, Calendar Alarms dismisses that fire and can schedule another attempt. Trigger actions and initial QR prompting run only after the conditions pass.

## Choose timing and limits

Open **Advanced Settings → Rescheduling Rules** and turn on **Turn on Rescheduling**. New alarms start with the switch off. Turning it off preserves the driving, location, and calendar rules in exported notes so they can be restored later. Task looping has its own settings.

Set **Maximum follow-ups** under **Advanced Settings → Rescheduling and Task Loop Limit**.

| Setting | Behavior |
| --- | --- |
| Fixed | A blocked alarm retries after the exact **Reschedule interval (minutes)**, then checks conditions again. Meeting and arrival estimates do not change this interval. |
| Smart | Uses arrival and meeting-end estimates. **Minimum reschedule interval (minutes)** is a lower bound and supplies another check when there is no prediction, such as Driving Focus remaining active. Zero allows calculated estimates only. |
| Rescheduling window (minutes) | No context retry or task repetition can be scheduled beyond this many minutes after the **original alarm time**. It never moves forward with a retry. Default for new timing: 120 minutes; range 0–1440. |
| Maximum follow-ups | Shared count of condition-based reschedules and task repetitions, from 0 to 10. The original alarm does not count. QR-only restarts and backups do not consume it. |

For an original alarm at 9:00, a 15-minute interval and a 120-minute window, Fixed proposes 9:15 when blocked. Smart might propose 9:50 based on arrival or a meeting, but never sooner than 9:15. No follow-up can be scheduled after 11:00. A calculated time of 11:10 stops that occurrence; it is not shortened to fit. An attempt exactly at 11:00 is allowed. Clock alarms use whole minutes, so an interval following a launch partway through a minute rounds up.

Every attempt checks the situation again. Once the count is exhausted, or no valid time fits the window, no further task/context attempt is scheduled. A blocked alarm is dismissed rather than forced to run in the blocked situation. An already-active QR instance can still require a scan.

Imported configurations without a new timing mode show **Keep existing timing**. Their numeric or range settings remain unchanged until you choose Fixed or Smart. The legacy number supplies a fallback, not an exact Fixed interval; its effective conflict/travel maximum is at least 45 minutes. Legacy ranges keep their existing fallback/maximum behavior and four-hour per-attempt clamp. They have no new overall window. Choosing a new mode uses the displayed interval and window for future attempts. Update the Engine script before using the new fields or saved disabled rules; older scripts do not understand them.

## Reschedule while Driving Focus is active

Set **Reschedule if in Driving → ON** and use a positive interval. Detection uses the phone's active **Driving** Focus; it does not independently detect vehicle movement or predict when a trip ends. Enable Driving Focus automatically or manually in iOS.

For example, use ten minutes to retry “Review my day” while Driving Focus is active. For a short test, use two minutes, turn on Driving Focus, and schedule an alarm a few minutes ahead. Expect it to be replaced without running its trigger actions. Turn Driving Focus off before the next attempt and confirm normal behavior resumes.

## Reschedule after meetings

Choose **+ Add Conflicting Calendar** and enter the exact calendar name shown in Apple Calendar. Add each calendar whose events should block the alarm. The calendar must be available on the phone.

In **Smart** mode, the Engine checks the final proposed time against all selected calendars, including after an arrival estimate or the minimum interval moves it later. Each meeting reserves its time plus a ten-minute buffer. Consecutive meetings retain the full buffer after the last meeting, even if a short meeting ends before the initial candidate. If the first suitable time is outside the overall window, the occurrence stops. All-day events can conflict too, so choose calendars deliberately.

In **Fixed** mode, meetings block the current fire but do not change the retry interval. A later attempt can intentionally land during a meeting and check again.

To test Smart mode, place the original alarm inside a short meeting and create another meeting covering its initial retry or buffer. Confirm that it moves ten minutes after the final meeting, provided that time fits the overall window.

**Conflicting calendars** delay alarms. **Ignored calendars** exclude alarm definitions from those calendars. These are separate settings; see [Calendar settings](../Feature%20Reference.md#calendar-settings-and-sharing).

## Run only at, or away from, a location

Choose a **Location Mode**, then **+ Add Location**:

| Mode | Meaning |
| --- | --- |
| Run only at these locations (`whitelist`) | Run only inside at least one listed location. Smart estimates arrival at the nearest listed location when outside. Fixed retries at its interval. |
| Avoid these locations (`blacklist`) | Do not run inside any listed location. Retry at the interval. |
| Ignore location (`off`) | Do not apply location checks. |

Supply **Lat**, **Long**, and **Radius m**. Copy decimal coordinates from a map's location details; latitude is first and longitude second. For example, latitude `40.0907`, longitude `-82.8767`, and radius `200` describe a 200-meter circle. Replace the example with your own location. **Name** is only an Editor label.

The Engine accepts a radius from **1 to 500 meters**. Grant Scriptable location access on the first unlocked test. Smart arrival timing is a rough distance-based estimate with 14 minutes of overhead, not live traffic or routing. The minimum interval still applies. If the arrival estimate is beyond the original-time window, the occurrence stops instead of retrying earlier.

If location cannot be obtained, a configured location rule blocks the fire. A positive interval and remaining allowance schedule another check within the window; otherwise the occurrence stops. Task Loop Min supplies the task cadence after context checks pass, not the missing-location interval.

To test, use an allowed location outside your current radius and confirm postponement. Then move its coordinates to your current location and confirm that conditions pass. Test each rule alone before combining them.

## Combine rules and task looping

Driving, location and calendar rules must pass before trigger actions run. Smart chooses a time satisfying its minimum interval, arrival estimate and calendar buffers. Fixed makes periodic checks. Both use the original-time window and shared allowance.

Task repetitions retain **Task Loop Min**, rather than the context interval, but use the same original-time window and follow-up count. Smart also checks future task candidates against the selected calendars when context rules are enabled. QR prompting retains its separate scan-to-dismiss behavior. See [OpenHabits Integration](OpenHabits%20Integration.md).

For raw fields and limits, see [JSON Alarm Reference](../JSON%20Alarm%20Reference.md). For unexpected timing, see [Troubleshooting](Troubleshooting%20and%20Maintenance.md#an-alarm-is-delayed-or-does-not-run).
