# Calendar Alarms Feature Reference

Use this reference after completing the [Setup Guide](Setup%20Guide.md) to explore alarm options, set up wake times, and troubleshoot common questions.

## Basic Alarms

Basic alarms are the default alarm type. In the Editor, select **Add Alarm** and complete the top row:

- **Alarm Name**
- **Status**
- **Offset Minutes**
- **Reference**

If you stop there, you have a standard alarm tied to that calendar event.

Use basic alarms for simple reminders such as:

- Leave for the airport in five minutes.
- Join a meeting.
- Wake up at the end of a **Sleep** event.

---

## QR Alarms

Use a QR alarm when you want to require physical action to turn off an alarm.

In the Editor, open **Advanced Settings** and complete **QR Alarm Properties**. Once enabled, the alarm will keep looping until you scan the correct QR code with the iPhone Camera app or the on-screen prompt displayed during a QR alarm.

- Each QR alarm has a matching QR code that turns it off. In the Editor, enter the alarm’s `qrCodeID` and select **Show QR Code** to preview, download, or print the matching code. Multiple alarms can share a code.
- QR codes store text in image form. Here, that text is a Shortcuts URL that launches **Calendar Alarms QR Scanner** with the `qrCodeID` as input.

Good use cases include:

- Forcing yourself out of bed.
- Making yourself go to your desk, open your task manager, and scan the code on a task named “Plan your workday.”
- Requiring yourself to reach a physical location before dismissing the alarm.

### How QR Alarms Stay Active

QR alarms create a repeating sequence of iOS Clock alarms until you scan the correct QR code.

When a QR alarm goes off, Calendar Alarms schedules another alarm shortly in the future. If you don’t scan the code, that alarm triggers and another is scheduled, keeping the QR alarm active until you complete it.

Manually disabling the upcoming alarm in the Clock app would break the QR loop without a scan. While a QR alarm is active, Calendar Alarms therefore prevents the Clock app from being used to bypass it.

Once you scan the correct QR code, the loop ends and the remaining QR alarm is removed automatically.

---

## Trigger Shortcuts and Silent Alarms

Use **Trigger & Silence Properties** when you want an alarm to do more than ring.

This feature lets you:

- Run one or more shortcuts when the alarm goes off.
- Make the alarm silence itself while still running those actions.

It is useful for spoken reminders, notifications, timers, lights, and custom automations.

---

## Rescheduling

Use **Rescheduling Properties** when an alarm should go off at the right time rather than only at its originally scheduled time.

Depending on your configuration, the alarm can wait and try again later if:

- You are driving.
- You are in a conflicting calendar event.
- You have not reached the required location.
- You are at a location where the alarm should not go off.

This is useful for context-dependent reminders such as “Review my day plan once I get to work.”

---

## Task Looping

Use **Task Looping** when an alarm should keep returning until you complete one or more tasks.

- This feature uses [OpenHabits Metrics](https://github.com/CopperPanMan/OpenHabits-Metrics), a habit-tracking and app-lockout system that lets you log metrics and habits to Google Sheets. You must install OpenHabits Metrics to use this feature.
- Any alarm type can loop when a task (that is, a metric) has not been completed, up to the configured `maxReschedules` limit.
  - **Example 1:** Remind me every 30 minutes to feed the dog until I log that I fed it.
  - **Example 2:** Loop a QR alarm that makes me go to my computer until I log that I planned my workday.
  - **Example 3:** Remind me to go to bed until I log that I flossed.
- If you log metric completion in your OpenHabits Google Sheet from anywhere other than iOS Shortcuts—such as Notion or the Sheet itself—**Calendar Alarms Actions** refreshes the OpenHabits state and resets the next task-loop alarm. A separate **Task Alarm Resetter** shortcut is not required.

---

## Combining Features

You can combine multiple behaviors in a single alarm. For example, one alarm can:

- Require a QR scan.
- Run shortcuts when triggered.
- Reschedule while you are driving.
- Keep looping until a task is complete.

For most users, the best approach is to start simply, test the alarm once, and then add advanced behavior as needed.

---

## Wake Times

**CA Wake Times** lets you change your next wake time without manually moving every alarm. It finds the **Sleep** event that ends the following day, asks you to choose a suggested wake time or enter a custom one, and then shifts the entire event so that it ends at your chosen time. Because the event’s start and end move together, Calendar Alarms also moves every alarm attached to it.

### Set Up Your Sleep Event

1. Create a timed calendar event named exactly **Sleep** that spans your usual sleep period—for example, from 11:00 p.m. to 7:00 a.m. The shortcut will not find an event with a different name.
2. Make the event repeat on the nights when you normally sleep so that your wake schedule recurs. **CA Wake Times** will not work if it cannot find a **Sleep** event for the current night.
3. Use the [Calendar Alarm Editor](https://copperpanman.github.io/Calendar-Alarms-for-iOS/) to add alarms to the event:
   - Reference the event’s **end** for wake-up alarms. An offset of `0` makes the alarm go off at the selected wake time; negative or positive offsets place alarms before or after it.
   - Reference the event’s **start** for bedtime reminders or actions.
4. Paste the generated alarm configuration into the **Sleep** event’s notes.
5. Run **CA Wake Times** and follow its setup prompts.

### Change Your Next Wake Time

Run **CA Wake Times** and select one of the suggested wake times or enter a custom time. The shortcut finds the **Sleep** event that ends the following day and shifts both its start and end so that the event ends at your selected wake time. This preserves the event’s duration and keeps its bedtime and wake-up alarms in the same positions relative to the event. Calendar Alarms then syncs the updated alarms with the Clock app.

For faster access, add **CA Wake Times** to your Home Screen or use it as a widget. You can then move your next sleep and wake alarms together without opening Calendar or editing each alarm individually.

> [!TIP]
> You can attach several alarms to the same **Sleep** event—for example, a bedtime reminder, a wake-up alarm, and a follow-up alarm. Because their times are relative to the event’s start or end, they all move together when you change your wake time.

---

## FAQ

### What Are Some Uses for Launching Shortcuts from Alarms?

- When your wake-up alarm goes off, turn your lights on, fan off, thermostat up, and coffee maker on. Because the alarm is tied to a calendar event, you can change your wake time and all the actions move with it.
- Schedule a sequence of timer and spoken-text actions to pace your morning or evening routine without touching your phone.
- Get the travel time to work before your morning commute.
- Send a text to a group of people reminding them to check in for a flight. The flight can be six months away; when the alarm time arrives, the messages will be sent automatically.

### Why Was an Alarm Action Delayed or Skipped?

This is an iOS limitation rather than a Calendar Alarms scheduling limitation. Native apps have substantially more control over their execution than Apple provides to personal Shortcuts automations. iOS may not run an automation and does not always report that it skipped it. As a result, an alarm may occasionally run late, a configured action may not execute, or a QR loop may need its backup trigger. Calendar Alarms includes redundancy and cleanup logic to mitigate this behavior, but it cannot eliminate the underlying limitation.

### Why Do I Sometimes See Two Alarms for an Active QR Alarm?

iOS sometimes doesn’t run Shortcuts automations when expected. The second alarm is a backup trigger in case that happens.

### What If I Can’t Scan the Code to Turn Off My QR Alarm?

If you cannot scan the code, turn your phone off and back on. Then open the Clock app and disable the next scheduled QR alarm before the Clock app closes. The alarm will be marked as complete automatically after one hour. This process is intentionally inconvenient; otherwise, the QR alarm would not enforce the intended behavior.
