# Calendar Alarms Setup Guide

## Quick Links

- [Calendar Alarm Editor](https://copperpanman.github.io/Calendar-Alarms-for-iOS/) — create and edit alarms with a simple interface

## 1) One-Time Setup (5–10 Minutes)

### A) Install Apps

- Install [**Apple Shortcuts**](https://apps.apple.com/us/app/shortcuts/id1462947752).
- Install [**Scriptable**](https://apps.apple.com/us/app/scriptable/id1405459188).

### B) Create a Scriptable Bookmark

Go to **Scriptable → Settings → File Bookmarks → Add (+)** and select the **Shortcuts** folder. This tells the system where to look for the relevant files.

### C) Download the Shortcuts

Shortcuts are small visual programs that perform actions on your iPhone. Calendar Alarms uses several shortcuts because some are designed to run automatically in the background, while others are tools you can run yourself.

Setup differs slightly between iOS 26 and iOS 27. Expand the section for your version below.

<details>
<summary><strong>iOS 27 and Newer</strong></summary>

Add these **three required shortcuts** and **one optional shortcut** to the Shortcuts app:

- **Calendar Alarm Engine**
  - The core of the system. It keeps your calendar alarms synced with the Clock app and manages their behavior when they trigger. Run it manually to force an immediate sync.
- **Calendar Alarms QR Scanner**
  - Handles QR alarm interactions, including displaying the scanning interface and verifying scanned codes.
- **Calendar Alarms Actions**
  - Houses Calendar Alarms settings and the built-in actions that alarms can perform. Run it manually to change settings.
- **CA Wake Times** *(optional, recommended)*
  - Quickly change your next wake time with a time picker by shifting a recurring **Sleep** calendar event and its attached alarms.
  - **Why use it?** It lets you use Calendar Alarms for your wake-up alarm and move multiple sleep and wake alarms with one tap, without leaving your Home Screen. See [Wake Times](Feature%20Reference.md#wake-times) for setup instructions.

You can place the shortcuts in a folder called **Calendar Alarms** to keep them organized.

</details>

<details>
<summary><strong>iOS 26 and Earlier</strong></summary>

Add these **three required shortcuts** and **two optional, recommended shortcuts** to the Shortcuts app:

- **Calendar Alarm Engine**
  - The core of the system. It keeps your calendar alarms synced with the Clock app and manages their behavior when they trigger. Run it manually to force an immediate sync.
- **Calendar Alarms QR Scanner**
  - Handles QR alarm interactions, including displaying the scanning interface and verifying scanned codes.
- **Calendar Alarms Actions**
  - Houses Calendar Alarms settings and the built-in actions that alarms can perform. Run it manually to change settings.
- **CA Wake Times** *(optional, recommended)*
  - Quickly change your next wake time with a time picker by shifting a recurring **Sleep** calendar event and its attached alarms.
  - **Why use it?** It lets you use Calendar Alarms for your wake-up alarm and move multiple sleep and wake alarms with one tap, without leaving your Home Screen. See [Wake Times](Feature%20Reference.md#wake-times) for setup instructions.
- **iOS 26 Only: CA qrClockCloser** *(recommended)*
  - Returns you to the Home Screen if you open the Clock app while a QR alarm is active, preventing you from turning it off without scanning.
  - **Why use it?** QR alarms work by scheduling another alarm for one minute in the future. That alarm triggers the shortcut again, which schedules another alarm, and so on until the code is scanned. **CA qrClockCloser** prevents you from breaking this loop by opening the Clock app and disabling the next scheduled alarm. Scanning the code remains the only way to turn off the QR alarm.

You can place the shortcuts in a folder called **Calendar Alarms** to keep them organized.

</details>

### D) Turn On the Automations

Automations tell your phone to run shortcuts at various times or under specific conditions. You’ll need a few to finish the installation.

<details>
<summary><strong>iOS 27 and Newer</strong></summary>

Turn on the automations inside the following two shortcuts. Open each shortcut, tap **Edit** to view its actions, expand each automation action, and turn it on.

- **Calendar Alarm Engine**
  - **When Any Alarm Goes Off** — handles active alarm behavior
  - **When Calendar Is Closed** — syncs Calendar changes to Clock
  - **At 12:10 a.m.** — performs a daily backup sync
  - **When Clock Is Opened** — prevents active QR alarms from being bypassed
- **Calendar Alarms QR Scanner**
  - **When Any Alarm Goes Off** — displays the QR controls when applicable

Once you’ve turned on all five automations, you’re finished with this section.

</details>

<details>
<summary><strong>iOS 26 and Earlier</strong></summary>

Create the first **four automations** below in the Shortcuts app by tapping **Automation** at the bottom, followed by the **+** button. If you installed **CA qrClockCloser**, create the optional fifth automation as well:

1. **Time of Day (12:10 a.m.)** → **Repeat Daily** → **Run Immediately** → run **Calendar Alarm Engine**
   - Performs a daily backup sync.
2. **Alarm** → **When Any Alarm Goes Off** → **Run Immediately** → run **Calendar Alarm Engine**
   - Handles active alarm behavior.
3. **Alarm** → **When Any Alarm Goes Off** → **Run Immediately** → run **Calendar Alarms QR Scanner**
   - Displays the QR controls when applicable.
4. **App** → when **Calendar** is closed → **Run Immediately** → run **Calendar Alarm Engine**
   - Syncs Calendar changes to Clock.
   - **Note:** You can use a different calendar app for this automation, but it may not work correctly if your edited event has not yet synced to Apple Calendar when you close that app.
5. *(Optional, recommended for QR alarms)* **App** → when **Clock** is opened → **Run Immediately** → run **Calendar Alarms qrClockCloser**
   - *(iOS 26 only)* Prevents active QR alarms from being bypassed.

Once you’ve created the first four automations—and the fifth if you installed **CA qrClockCloser**—you’re finished with this section.

</details>

### E) Run “Calendar Alarms Actions” to Finish Installation

> [!NOTE]
> iOS will ask you to grant permissions the first time these shortcuts run. Grant every requested permission—such as **Always Allow**, **Always Delete**, and **Allow Access**—for the system to work as expected.

Run **Calendar Alarms Actions** and answer each setup question. The shortcut will automatically install the required Scriptable scripts and create a new **OpenHabits** folder in `iCloud Drive/Shortcuts` for files the system needs.

If you want to use Calendar Alarms for your wake-up alarm, run **CA Wake Times** and follow its setup steps.

You have finished the installation! Next, test how it works.

---

## 2) Test It Out (10–15 Minutes)

### Demo Time!

To see how the system works and finish granting permissions, create a demo event with several demo alarms. Expand the section below to find the demo alarm configuration block.

> [!NOTE]
> **Recommended:** Keep this guide open on a computer or tablet during the demo so your iPhone is free to scan the QR code. If you only have your iPhone, remove the QR demo alarm using the [Calendar Alarm Editor](https://copperpanman.github.io/Calendar-Alarms-for-iOS/).

<details>
<summary><strong>Demo Event Alarm Explanations and Configuration</strong></summary>

1. **Alarm 1:** A regular alarm like one you would create in the Clock app.
2. **Alarm 2:** An alarm that starts a timer and displays a custom notification.
3. **Alarm 3:** A silent alarm that cancels the previous timer and speaks text.
4. **Alarm 4:** A QR alarm that loops `marimba.mp3` until the QR code below is scanned. If `marimba.mp3` does not exist in the Calendar Alarms folder, the alarm uses a generic notification sound.
   1. When this alarm goes off, a menu should appear so you can scan the code below. If it does not appear, you can *always* scan the QR code with the Camera app.
   2. Feel free to observe what happens if you don’t interact with your phone for a minute or two. Another alarm will trigger and extend the loop until you scan the code. Without user interaction, this cycle stops automatically after one hour.

<img width="150" height="150" alt="QR code that completes the wakeup demo alarm" src="https://github.com/user-attachments/assets/11fb4111-eaa3-4d8f-8027-b7e0dd954c9d" />

*This QR code was generated in the Calendar Alarm Editor with `qrCodeID` set to `"wakeup"`. See [QR Alarms](Feature%20Reference.md#qr-alarms) for more information.*

#### Demo Event Configuration Block

```json
[
  {
    "alarmName": "Demo 1: This is a basic alarm.",
    "status": "ON",
    "offsetMin": 0,
    "reference": "start"
  },
  {
    "alarmName": "Demo 2: This alarm starts a 1.1 minute timer and sends a notification.",
    "status": "ON",
    "offsetMin": 1,
    "reference": "start",

    "shortcutsOnTrigger": [
      {
        "name": "Calendar Alarms Actions",
        "input": ["{\"action\":\"timer\",\"operation\":\"start\",\"minutes\":1.1}"]
      },
      {
        "name": "Calendar Alarms Actions",
        "input": ["{\"action\":\"notification\",\"message\":\"Demo: Leave for Work in 1 minute\",\"mode\":\"show\"}"]
      }
    ]
  },
  {
    "alarmName": "Demo 3: This alarm silences itself in order to silently stop the current timer and speak text.",
    "status": "ON",
    "offsetMin": 2,
    "reference": "start",

    "shortcutsOnTrigger": [
      {
        "name": "Calendar Alarms Actions",
        "input": ["{\"action\":\"timer\",\"operation\":\"cancel\"}"]
      },
      {
        "name": "Calendar Alarms Actions",
        "input": ["{\"action\":\"notification\",\"message\":\"Remember to do that task\",\"mode\":\"speak\"}"]
      }
    ],
    "silenceAlarm": true
  },
  {
    "alarmName": "Demo 4: QR Alarm - scan code: wakeup to turn off.",
    "status": "ON",
    "offsetMin": 3,
    "reference": "start",

    "qrCodeID": "wakeup",
    "qrSoundPath": "marimba.mp3",
    "qrVol": 50
  }
]
```

</details>

### A Few Notes

1. This alarm configuration block may look intimidating. Don’t worry—you don’t need to understand it. That’s what the Editor is for.
2. **One event = one alarm configuration block.** Whether an event has one alarm or 100, all its alarms live inside a single block. Do not paste multiple configuration blocks into one event. Instead, reopen the existing block in the Editor and add the alarms there.
3. You can use any calendar service you want, including Google Calendar, Exchange, or Fantastical, but it must sync with Apple Calendar.

<details>
<summary><strong>Optional: How Does an Alarm Configuration Block Work?</strong></summary>

An alarm configuration is stored as a formatted JSON array. JSON is a *data-storage format*, not a set of instructions, so it doesn’t do anything on its own.

The JSON in your calendar event’s notes stores settings that the **Calendar Alarm Engine** shortcut uses to schedule alarms in the iOS Clock app.

Learn more in Stack Overflow’s [beginner’s guide to JSON](https://stackoverflow.blog/2022/06/02/a-beginners-guide-to-json-the-data-format-for-the-internet/). If you’re feeling advanced, you can create and edit alarms directly in JSON.

</details>

### Before You Start

1. Make sure you have installed all the shortcuts and automations described above.
2. If you don’t have another device nearby to display the demo QR code, paste the demo configuration into the [Calendar Alarm Editor](https://copperpanman.github.io/Calendar-Alarms-for-iOS/), delete the final alarm (the QR alarm), and then paste the updated configuration into your calendar event.
3. If possible, plug in your device when its battery is below 50% to help the demo run smoothly.

> [!IMPORTANT]
> **About reliability:** Calendar Alarms relies on iOS Shortcuts automations. iOS can occasionally delay or skip an automation, particularly when the battery is low, the system is under heavy load, or the device is older. Calendar Alarms includes backup and recovery behavior where possible, but some advanced features may occasionally run late.

### Run the Demo

1. In your calendar app, create an event named **Demo** that starts at any time today.
2. Copy and paste the demo alarm configuration block above into the event’s notes. You can add other notes as usual, as long as you don’t write inside the configuration’s outer square brackets (`[ ]`). You can also load the block into the [Calendar Alarm Editor](https://copperpanman.github.io/Calendar-Alarms-for-iOS/) to better understand each alarm’s settings.
3. Set the event’s start time to two minutes from now. For example, if it is currently 3:07 p.m., set it to 3:09 p.m. If you created the event on another device, make sure it has synced to your iPhone.
4. Swipe to your Home Screen—that is, close the calendar app—to schedule the alarms. Approve any permission requests by choosing options such as **Always Allow**, **Always Delete**, and **Allow Access**. Then open the Clock app. You should see four new alarms, each one minute apart, with the first scheduled for the event’s start time.
5. Let the alarms run over the next five minutes and approve every permission request that appears.
6. When they finish, repeat steps 3–5. The second run should be smoother and more representative of normal use.
7. *(Optional)* Experiment with the alarms in the Alarm Editor to learn what the settings do.

That finishes the demo! You’re now ready to create alarms for your own events.

> [!NOTE]
> The demo does not use every feature. Depending on the alarms you configure, you may receive additional permission requests in the future.

## Learn More

Installation and testing are complete. When you are ready to explore advanced alarm options, wake-time setup, and troubleshooting, continue to the [Feature Reference and FAQ](Feature%20Reference.md).
