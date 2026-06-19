# Calendar Alarms for iOS

## What is this?

Calendar Alarms for iOS combines a powerful list of features in a way no other "app" has - and it's not even an app.

Instead, it's a totally free and open source collection of apple shortcuts and automations that lets you create real iOS Clock alarms directly from iOS calendar events, then keeps those alarms synced as the events change. It runs entirely on your own device and iCloud account.

You choose which events have alarms, configure those alarms with the [**Alarm Editor**](https://copperpanman.github.io/Calendar-Alarms-for-iOS/), and paste the generated settings into the event’s **Notes** field. The Calendar Alarm Engine shortcut then syncs the matching alarms into the iOS Clock app, and manages configured behavior when those alarms go off.

## What Can This Do?

- **Shift multiple alarms by shifting one event**  
  Move all 5 of your staggered wakeup alarms forward or back in time at the same time, just by moving the event they live on.

- **Force yourself out of bed with QR alarms**  
  Require yourself to scan a QR code in the bathroom before your alarm will stop.

- **Set alarms months in advance, right on the event that matters**  
  Add multiple alarms to leave for a flight in 6 months, remind you to follow up on a meeting next week, or prepare for a doctor's appointment, directly inside that calendar event. When the time comes, they will be scheduled automatically in the clock app.

- **Run your own shortcuts when alarms go off**  
  Turn on lights with your wakeup alarm, start a 60 minute timer for your lunch break, have siri tell you verbally to take your medicine at 10AM, or more.

- **Keep the Clock app clean automatically**  
  If an event is deleted or in the past, it's outdated alarms are automatically deleted. If the event is moved, or you change timezones, its alarms are updated to the new correct local time for you.

- **Get notified ONLY when it makes sense**  
  Using rescheduling features, you can make alarms automatically reschedule themselves if you’re driving, in a conflicting meeting, or not yet at the right location. With an OpenHabits integration, alarms can even repeat on a cadence until you have logged that you completed a task.

## How do I Use it?

Once [setup](https://github.com/CopperPanMan/Calendar-Alarms/blob/main/Setup%20Guide.md) is finished, you use the [**Alarm Editor**](https://copperpanman.github.io/Calendar-Alarms-for-iOS/) to configure alarms for a calendar event.

Each event gets one JSON block, even if that event has multiple alarms. The editor generates that block for you, and you paste it into the event’s Notes field. Calendar Alarms then reads the event notes, creates the matching alarms in the iOS Clock app, and keeps them updated when the event changes.

To edit an event’s alarms later, paste that same JSON block back into the editor, make your changes, and replace the old block in the event notes.

> [!NOTE]
> *You can also give your AI-of-choice the link to [this github repo](https://github.com/CopperPanMan/Calendar-Alarms-for-iOS) and describe what alarms you want, and have it generate all of the JSON for you, which works suprisingly well (at least on GPT 5.5). You can always take it back into Alarm Editor to edit.*
> *You can also use that trick for setup help, use-case ideation, and debugging, or even give it to codex/claude code to add or edit any feature you want.*

## Why?

This project allows you to automate your attention and life in a way that wasn't possible before.

*I (Mike, found of [Sierra Mille](https://www.sierramille.com/)) created this as part of my OpenHabits project, a task tracking/time management system that I created to get my life back on track, and to create a reliable way of controlling my future decisions and behavior. Put simply, It grew out of a broader interest in designing environments, digital and physical, that make the right behavior easier than the wrong one.*

<br>

### Next Step >> [Setup Guide](https://github.com/CopperPanMan/Calendar-Alarms/blob/main/Setup%20Guide.md)

<br>

*  *note: advanced QR and shortcut launching may not function correctly on devices older than iphone 15.*
