# Calendar Alarms Feature Reference

Use this reference after completing the [Setup Guide](Setup%20Guide.md) to explore alarm options, set up wake times, and troubleshoot common questions.

## Choose What You Want to Do

| I want to… | Read |
| --- | --- |
| Create, edit, disable, or delete an ordinary alarm | [Basic Alarms](#basic-alarms) |
| Require a QR scan or use my own tone | [QR Alarms guide](Guides/QR%20Alarms.md) |
| Run notifications, timers, settings, or my own Shortcut | [Actions guide](Guides/Actions.md) |
| Wait until I stop driving, finish a meeting, or reach a location | [Rescheduling guide](Guides/Rescheduling.md) |
| Repeat until a task is complete or announce habit reminders | [OpenHabits Integration guide](Guides/OpenHabits%20Integration.md) |
| Move my next sleep and wake alarms together | [Wake Times](#wake-times) |
| Choose calendars or share alarms | [Calendar Settings and Sharing](#calendar-settings-and-sharing) |
| Fix a problem, update, or uninstall | [Troubleshooting and Maintenance](Guides/Troubleshooting%20and%20Maintenance.md) |

For hand-written configurations, use [JSON Alarm Reference](JSON%20Alarm%20Reference.md) and [Actions JSON Schema](Calendar%20Alarms%20Actions%20Schema.md). You do not need those references to use the Editor.

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

For example, reference **start** with an offset of `-15` to ring fifteen minutes before an event. Reference **end** with offset `0` to ring when it ends. **ON/OFF** controls that alarm's status; an event can contain several alarms.

### Everyday Changes

- **Create:** Copy the Editor's output into your event's notes, then close Calendar or run **Calendar Alarm Engine**. Keep one configuration block per event; ordinary notes can sit outside it.
- **Edit:** Load the event's existing notes or configuration in the Editor. Replace the old block with the revised one rather than appending another block.
- **Disable:** Set an alarm to **OFF**, copy the revised block back, and sync.
- **Delete:** Remove the alarm in the Editor and replace the block. To remove every alarm for an event, remove its block or delete the event, then sync.

The Engine schedules the next 24 hours of alarms. If an edit was made on another device, wait until it reaches Apple Calendar on your phone and run Engine to sync it. An already-active QR instance keeps separate runtime state; scan it to stop its current prompt.

---

## QR Alarms

Use a QR alarm when you want to require physical action to turn off an alarm.

In the Editor, open **Advanced Settings** and complete **QR Alarm Properties**. Once enabled, the alarm prompts you to scan the correct QR code with the iPhone Camera app or the on-screen prompt displayed during a QR alarm. Playback can pause or miss restarts when iOS delays an automation.

- Each QR alarm has a matching QR code that turns it off. In the Editor, enter the alarm’s `qrCodeID` and select **Show QR Code** to preview, download, or print the matching code. Multiple alarms can share a code.
- QR codes store text in image form. Here, that text is a Shortcuts URL that launches **Calendar Alarms QR Scanner** with the `qrCodeID` as input.

Good use cases include:

- Forcing yourself out of bed.
- Making yourself go to your desk, open your task manager, and scan the code on a task named “Plan your workday.”
- Requiring yourself to reach a physical location before dismissing the alarm.

### How QR Alarms Stay Active

QR alarms create a repeating sequence of iOS Clock alarms until you scan the correct QR code.

When a QR alarm goes off, Calendar Alarms schedules another alarm shortly in the future. If you don’t scan the code, that alarm triggers and another is scheduled, keeping the QR alarm active until you complete it.

Manually disabling upcoming retries in Clock can interrupt the loop. The separate **CA qrClockCloser** automation sends you Home while a QR alarm is active, discouraging this on both iOS versions.

The current Engine schedules a restart at **+2 minutes** and a backup at **+4 minutes**. Scanning stops the current QR instance and initiates retry cleanup. An incomplete task's independent follow-up remains scheduled. Active QR instances expire after one hour when the system next processes them.

See the [QR Alarms guide](Guides/QR%20Alarms.md) for complete setup, custom sounds and subfolders, scan actions, and testing.

---

## Trigger Shortcuts and Silent Alarms

Use **Trigger & Silence Properties** when you want an alarm to do more than ring.

This feature lets you:

- Run one or more shortcuts when the alarm goes off.
- Make the alarm silence itself while still running those actions.

It is useful for spoken reminders, notifications, timers, lights, and custom automations.

Choose built-in actions or **Run Custom Shortcut** from the Editor's action list. See the [Actions guide](Guides/Actions.md) for available actions, inputs, ordering, and an example. You can also run actions after a QR scan.

---

## Rescheduling

Use **Rescheduling Properties** when an alarm should go off at the right time rather than only at its originally scheduled time.

Depending on your configuration, the alarm can wait and try again later if:

- You are driving.
- You are in a conflicting calendar event.
- You have not reached the required location.
- You are at a location where the alarm should not go off.

This is useful for context-dependent reminders such as “Review my day plan once I get to work.”

See the [Rescheduling guide](Guides/Rescheduling.md) for each condition, location coordinates, retry limits, and tests. Range Min/Max are context settings; they do not select a random delay.

---

## Task Looping

Use **Task Looping** when an alarm should keep returning until you complete one or more tasks.

- This feature uses [OpenHabits Metrics](https://github.com/CopperPanMan/OpenHabits-Metrics), a habit-tracking system with optional app protection that lets you log metrics and habits to Google Sheets. You must connect OpenHabits Metrics to use this feature.
- Any alarm type can loop when a task (that is, a metric) has not been completed, up to the configured `maxReschedules` limit.
  - **Example 1:** Remind me every 30 minutes to feed the dog until I log that I fed it.
  - **Example 2:** Loop a QR alarm that makes me go to my computer until I log that I planned my workday.
  - **Example 3:** Remind me to go to bed until I log that I flossed.
- **Calendar Alarms Actions** refreshes task state when handling a task fire. An iOS recording hook can also notify Engine promptly; editing the Sheet or Notion does not launch an iPhone Shortcut by itself. A separate **Task Alarm Resetter** Shortcut is not required.

See [OpenHabits Integration](Guides/OpenHabits%20Integration.md) for connection steps, metric IDs, completion behavior, and tests. The same guide covers **OpenHabits Reminder** actions, which report task status without enabling a loop.

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

**CA Wake Times** lets you change your next wake time without manually moving every alarm. It finds your nearby **Sleep** event, asks you to choose a suggested wake time or enter a custom one, and then shifts the entire event so that it ends at your chosen time. Because the event’s start and end move together, Calendar Alarms also moves every alarm attached to it.

### Set Up Your Sleep Event

1. Create a timed calendar event named exactly **Sleep** that spans your usual sleep period—for example, from 11:00 p.m. to 7:00 a.m. The shortcut will not find an event with a different name.
2. Make the event repeat on the nights when you normally sleep so that your wake schedule recurs. **CA Wake Times** will not work if it cannot find a **Sleep** event for the current night.
3. Use the [Calendar Alarm Editor](https://copperpanman.github.io/Calendar-Alarms-for-iOS/) to add alarms to the event:
   - Reference the event’s **end** for wake-up alarms. An offset of `0` makes the alarm go off at the selected wake time; negative or positive offsets place alarms before or after it.
   - Reference the event’s **start** for bedtime reminders or actions.
4. Paste the generated alarm configuration into the **Sleep** event’s notes.
5. Run **CA Wake Times** and follow its setup prompts.

Keep only one matching **Sleep** event in the nearby search period and use a calendar Calendar Alarms is allowed to read. The current repository helper looks for event starts between nine hours ago and fourteen hours ahead.

### Change Your Next Wake Time

Run **CA Wake Times** and select one of the suggested wake times or enter a custom time. The shortcut shifts both the **Sleep** event's start and end so that it ends at your selected wake time. This preserves the event’s duration and keeps its bedtime and wake-up alarms in the same positions relative to the event. Calendar Alarms then syncs the updated alarms with the Clock app.

For faster access, add **CA Wake Times** to your Home Screen or use it as a widget. You can then move your next sleep and wake alarms together without opening Calendar or editing each alarm individually.

> [!TIP]
> You can attach several alarms to the same **Sleep** event—for example, a bedtime reminder, a wake-up alarm, and a follow-up alarm. Because their times are relative to the event’s start or end, they all move together when you change your wake time.

---

## Calendar Settings and Sharing

Run **Calendar Alarms Actions** without input to change which calendars it ignores. Choose **Input Calendars to Ignore**, enter their exact Apple Calendar names separated by commas, or submit a blank value to include all calendars. **Skip** keeps existing settings. Run Engine after changing them to reconcile scheduled alarms.

To share alarms, share a calendar using your calendar provider's sharing controls. Each person who wants alarms needs their own Calendar Alarms installation, access to that calendar in Apple Calendar, and settings that include it. Anyone with edit access can add or change alarm-configured events. Edits reach each phone after calendar sync and its next Engine run; sharing does not directly create a remote Clock alarm.

For QR alarms, each recipient needs the configured sound file and access to the code. Any referenced custom Shortcut must exist on their phone too. Use exclusions if a shared calendar's configured alarms are intended for someone else.

---

## FAQ

### What Are Some Uses for Launching Shortcuts from Alarms?

- When your wake-up alarm goes off, turn your lights on, fan off, thermostat up, and coffee maker on. Because the alarm is tied to a calendar event, you can change your wake time and all the actions move with it.
- Schedule a sequence of timer and spoken-text actions to pace your morning or evening routine without touching your phone.
- Get the travel time to work before your morning commute.
- Send a text to a group of people reminding them to check in for a flight. The flight can be six months away; when the alarm time arrives, the messages will be sent automatically.

### Why Was an Alarm Action Delayed or Skipped?

Check the alarm's conditions, permissions, and automation first. iOS can also delay, skip, or terminate Shortcut execution, so actions can run late and QR playback can pause. Backup triggers improve recovery but cannot guarantee it. See [Troubleshooting](Guides/Troubleshooting%20and%20Maintenance.md#an-alarm-is-delayed-or-does-not-run).

### Why Do I Sometimes See Two Alarms for an Active QR Alarm?

The current Engine schedules a two-minute restart and a four-minute backup. A QR task alarm can also have an independent task check; coincident purposes share one Clock alarm. See [QR behavior](Guides/QR%20Alarms.md#what-happens-while-it-is-active).

### What If I Can’t Scan the Code to Turn Off My QR Alarm?

Use the [recovery instructions](Guides/Troubleshooting%20and%20Maintenance.md#i-cannot-reach-the-code) to temporarily disable Clock protection and stop identified retries. Task follow-ups are separate from QR instance expiration.
