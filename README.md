# Calendar Alarms for iOS

**Calendar Alarms for iOS lets you place real iOS Clock alarms onto your calendar events.**

You can add multiple alarms to any event, and each alarm can be made to go off at any time before, at, or after the start or end of the event. Move the event, and its alarms move with it. Delete the event, and its alarms are deleted, too. It works with any calendar, as long as it’s shared with your Apple Calendar app.

Alarms can also do things ordinary Clock alarms can't: require a QR code to turn off, intelligently reschedule if you're driving, at the wrong location, or in a meeting, show notifications, start timers, change settings, or even run your own Apple Shortcuts.

Calendar Alarms is totally free and combines capabilities that are spread across multiple subscription-based iOS alarm apps (and several that aren't available in them at all) in one system. This doesn’t change your ability to use your Clock or Calendar apps like you normally do.

## How Does This Work?

1. Choose an event you wish to add alarms to.
2. Configure the alarms for that event using the online [**Alarm Editor**](https://copperpanman.github.io/Calendar-Alarms-for-iOS/).
3. Paste the alarm configuration it generates into your event’s **Notes** field.

And you’re done!

The shortcuts automatically sync the matching alarms into your iOS Clock app and handle their behavior when they go off. Alarms for each day are automatically scheduled around midnight and deleted after they have triggered. You can edit alarms at any time by pasting the configuration back into the Editor.

Once installed, it’s dead simple to use.

## What Am I Installing?

Calendar Alarms is not an app. Instead, it's a set of four Apple Shortcuts, a few paired automations, and a free helper app called Scriptable that lets the Shortcuts handle the more complex logic. Everything runs on your own iPhone and iCloud account.

You don't need to understand or write any code. Once installed, the system is your copy: you can inspect it, modify it, build on it, or ignore the technical parts entirely.

It takes about 5–10 minutes to install, and another optional 10–15 minutes afterward to run through a demo that lets you verify that everything is working correctly.

## Feature Highlights

- **Shift multiple alarms by shifting one event**

  Move all five of your staggered wake-up alarms forward or back in time at the same time, just by moving the event they live on.

- **Force yourself to physically go to a location**

  Require yourself to scan a QR code in the bathroom before your wake alarm will stop.

- **Set alarms months in advance, right on the event that matters**

  Add multiple alarms to leave for a flight in six months, remind you to follow up on a meeting next week, or prepare for a doctor's appointment, directly inside that calendar event. On the day of the alarm, it will be automatically scheduled in the Clock app and deleted afterward.

- **Run actions or your own shortcuts when alarms go off**

  Configure actions directly in the Editor—such as custom notifications, timers, Focus and display settings, opening apps, and much more—or run a custom Apple Shortcut to set your thermostat when you wake up, turn your lights on at the end of your commute, or do almost anything else Shortcuts can control.

- **Keep the Clock app clean automatically**

  If an event is deleted or in the past, its outdated alarms are automatically deleted. If the event is moved, or you change time zones, its alarms are updated to the correct new local time for you.

- **Get notified only when it makes sense**

  Using rescheduling features, you can make alarms automatically reschedule themselves if you’re driving, in a conflicting meeting, or not yet at the right location. With an OpenHabits integration, alarms can even repeat on a cadence until you have logged that you completed a task.

## You Can Go Much Further Than the Editor

The Alarm Editor is meant to make Calendar Alarms usable without understanding the machinery underneath it. But the alarm configuration is ultimately just structured JSON, which also makes it very easy for AI to create.

For example, you can give an AI a link to [this repository](https://github.com/CopperPanMan/Calendar-Alarms-for-iOS) plus a trip itinerary, explain how you want to be paced through the trip, and ask it to generate an importable calendar file containing the events, alarms, reminders, timers, and other actions for the entire trip.

You can then paste any individual event’s alarms back into the Editor to adjust them visually.

## Ready to Install?

Installation takes approximately 5–10 minutes, and you do not need to understand the underlying code.

The guide walks through each installation step, followed by an optional 10–15 minute tutorial and test event so you can learn the basic workflow and verify that everything is working correctly before relying on it.

### [**→ Setup Guide**](Setup%20Guide.md)

<details>
<summary><strong>Read more about Calendar Alarms</strong></summary>

## Want the Full OpenHabits System?

If you want one comprehensive productivity "OS," I recommend you use this with its sibling, [OpenHabits Metrics](https://github.com/CopperPanMan/OpenHabits-Metrics).

OpenHabits Metrics is a task and data tracker (and optional screen-time manager) that lets you log and read data from a Google Sheet using your iPhone, Notion, and much more.

When integrated, Calendar Alarms can check whether OpenHabits tasks have been completed. An alarm can keep reminding you until a task is done, or skip itself entirely if you've already completed it. OpenHabits can also use the same data to control app and website access across your devices.

## Why Did I Make This?

Hi, I’m Mike, founder of [Sierra Mille](https://www.sierramille.com/). I struggled to control my attention and wanted a way to build my own personal “Jarvis”—a system that could passively help keep me on track and let me make decisions for my future self while I was thinking clearly, instead of relying on willpower in the moment.

OpenHabits Metrics and Calendar Alarms both live under the OpenHabits umbrella. Development grew out of a broader interest in designing environments, digital and physical, that make the right behavior easier than the wrong one.

## Future Development, Android Support, and Licensing

### Future development

Calendar Alarms currently does everything I built it to do, so I don't have a roadmap of planned new features. I'll continue maintaining it for my own use, and contributions are welcome.

### Android support

There is currently no Android version. If a community member wants to build one, I'd be happy to link to it here!

### Licensing

Calendar Alarms is licensed under the **PolyForm Perimeter 1.0.1** license. The source is publicly available and may be used, modified, and shared subject to that license. Calendar Alarms is free and source-available, rather than OSI-defined open source.

**Paid services around Calendar Alarms are welcome.** Consulting, installation, configuration, training, and support are all encouraged. The restriction is intended to prevent Calendar Alarms itself (or a derivative of it) from being repackaged and offered as a competing product without separate permission.

Third-party services should make clear that they are independent and should not imply that they are official Calendar Alarms products or services.

</details>
