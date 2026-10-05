# Rescheduling

[Feature Reference](../Feature%20Reference.md) · [Alarm Editor](https://copperpanman.github.io/Calendar-Alarms-for-iOS/)

Rescheduling checks the situation when an alarm fires. If a configured condition blocks it, Calendar Alarms deletes that fire and may schedule another attempt. Its actions and QR prompting wait until the alarm passes the checks.

## Set the retry limits

Open **Advanced Settings → Rescheduling Properties**. For a first test, use **Range Min `10`**, **Range Max `45`**, and **Max Reschedules `2`**. Configure one condition below, then paste the updated configuration into the event and sync.

| Setting | Actual behavior |
| --- | --- |
| Range Min | Fallback delay for driving, being at a blacklisted location, or an unavailable location. `0` disables that fallback. |
| Range Max | Largest calendar-conflict delay or estimated travel delay the Engine will consider. It is not a random upper bound or a universal cap on task intervals. |
| Fixed Minutes | Legacy single-number form. It supplies the fallback delay; its effective maximum is at least 45 minutes. It does not force every context delay to equal that number. |
| Max Reschedules | Number of future task/context attempts allowed, from 0 to 10. QR-only restarts and backups do not consume it. |

The Engine chooses the latest applicable candidate, rather than a random number between Min and Max. Multiple conditions and task looping share the reschedule allowance. Once that allowance is exhausted, no further task/context attempt is scheduled. A blocked alarm is silenced, rather than forced to run in the blocked situation; an already-active QR instance can still require a scan.

## Wait until you stop driving

Set **Silence If Driving → ON** and use a positive fallback delay. Detection uses the phone's active **Driving** Focus; it does not independently detect vehicle movement. Enable Driving Focus automatically or manually in iOS.

For example, use a ten-minute fallback to postpone “Review my day” while Driving Focus is active. For a short test, use a two-minute fallback, turn on Driving Focus, and schedule an alarm a few minutes ahead. Expect it to be replaced by a later attempt without running its trigger actions. Turn Driving Focus off before that attempt and confirm normal behavior resumes.

## Wait until a meeting ends

Choose **+ Add Conflicting Calendar** and enter the exact calendar name shown in Apple Calendar. Add each calendar whose events should block the alarm. The calendar must be available on the phone.

An event covering the alarm's fire time causes a candidate retry at the latest conflicting event's end **plus ten minutes**, provided that delay fits within Range Max. A conflict beyond that maximum is not used to postpone the alarm. All-day events can conflict too, so choose calendars deliberately.

To test, create a short meeting on the named calendar and place your alarm inside it. Use a Range Max large enough to include its end and the ten-minute buffer. Confirm that the replacement alarm has that later time.

**Conflicting calendars** delay alarms. **Ignored calendars** exclude alarm definitions from those calendars. These are separate settings; see [Calendar settings](../Feature%20Reference.md#calendar-settings-and-sharing).

## Run only at, or away from, a location

Choose a **Location Mode**, then **+ Add Location**:

| Mode | Meaning |
| --- | --- |
| `whitelist` | Run only inside at least one listed location. Outside them, estimate a retry from distance to the nearest location. |
| `blacklist` | Do not run inside any listed location. Use the fallback delay to try again. |
| `off` | Ignore location checks. |

Supply **Lat**, **Long**, and **Radius m**. Copy decimal coordinates from a map's location details; latitude is first and longitude second. For example, latitude `40.0907`, longitude `-82.8767`, and radius `200` describe a 200-meter circle around that point. Replace the example with your own location. **Name** is only an Editor label.

The Engine accepts a radius from **1 to 500 meters**. Use a practical radius rather than an exact building outline. Grant Scriptable location access on the first unlocked test. Whitelist travel time is a rough distance-based estimate, not a live traffic or route calculation. If the estimate exceeds Range Max, it is not used as a candidate; an ordinary non-task alarm can still use its positive fallback delay.

If the current location cannot be obtained, a configured location gate blocks the fire. A positive fallback and remaining retries allow another attempt; without them, it is dropped. Task Loop Min supplies the task cadence after context checks pass, not the missing-location fallback.

To test a whitelist, use your current location and confirm the alarm runs. Change the center to a nearby place outside the radius and confirm it is postponed. For a blacklist, use your current location and confirm postponement. Test each condition alone before combining them.

## Combine conditions

An alarm can wait for Driving Focus to end, a meeting to finish, and arrival at work. It must pass its applicable checks before trigger actions run. A task alarm then checks task completion; see [OpenHabits Integration](OpenHabits%20Integration.md).

For raw fields and limits, see [JSON Alarm Reference](../JSON%20Alarm%20Reference.md). For unexpected timing, see [Troubleshooting](Troubleshooting%20and%20Maintenance.md#an-alarm-is-delayed-or-does-not-run).
