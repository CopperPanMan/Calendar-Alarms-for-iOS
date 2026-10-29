# Calendar Alarms Setup Guide

## Quick Links

- [Calendar Alarm Editor](https://copperpanman.github.io/Calendar-Alarms-for-iOS/) — create and edit alarms with a simple interface

## 1) One-Time Setup (5–10 Minutes)

### A) Install Apps to your iPhone

- Install [**Apple Shortcuts**](https://apps.apple.com/us/app/shortcuts/id1462947752).
- Install [**Scriptable**](https://apps.apple.com/us/app/scriptable/id1405459188).

### B) Create a Scriptable Bookmark

On your iPhone, go to **Scriptable → Settings → File Bookmarks → Add (+)** and select **iCloud Drive → Shortcuts**. Make sure the bookmark is named exactly **Shortcuts**. This tells the system where to look for the relevant files.

### C) Download the Shortcuts

Shortcuts are small visual programs that perform actions on your iPhone. Calendar Alarms uses several shortcuts because some are designed to run automatically in the background, while others are tools you can run yourself.

Setup differs slightly between iOS 26 and iOS 27. Expand the section for your version below.

<details>
<summary><strong>iOS 27 and Newer</strong></summary>

Add these **three required shortcuts** and **two optional but recommended shortcuts** to the Shortcuts app:

- **[Calendar Alarm Engine](https://www.icloud.com/shortcuts/94dfd0d1eab94c5b946a0a3af3666f76)**
  - The core of the system. It keeps your calendar alarms synced with the Clock app and manages their behavior when they trigger. Run it manually to force an immediate sync.
- **[Calendar Alarms QR Scanner](https://www.icloud.com/shortcuts/549b8a24d92640a7a3bf4bb452ef8398)**
  - Handles QR alarm interactions, including displaying the scanning interface and verifying scanned codes.
- **[Calendar Alarms Actions](https://www.icloud.com/shortcuts/d0728203fbd24bd5a7cf1b1f2c90fea3)**
  - Houses Calendar Alarms settings and the built-in actions that alarms can perform. Run it manually to change settings.
- **[CA Wake Times](https://www.icloud.com/shortcuts/492ae0379a6a42f19a772edc90a8684f)** *(recommended)*
  - Quickly change your next wake time with a time picker by shifting a recurring **Sleep** calendar event and its attached alarms.
  - **Why use it?** It lets you use Calendar Alarms for your wake-up alarm and move multiple sleep and wake alarms with one tap, without leaving your Home Screen. See the [Wake Times Reference](Feature%20Reference.md#wake-times) for setup instructions.
- **[CA qrClockCloser](https://www.icloud.com/shortcuts/5af9813c91af4577b8083300bee917e1)** *(recommended)*
  - Returns you to the Home Screen if you open Clock while a QR alarm is active, discouraging you from disabling its upcoming retries.
  - **Why use it?** QR alarms schedule a restart two minutes later and a backup four minutes later. **CA qrClockCloser** makes it harder to break this loop by disabling upcoming alarms in Clock. See [QR Alarms](Guides/QR%20Alarms.md) for behavior and limitations.

You can place the shortcuts in a folder called **Calendar Alarms** to keep them organized.

</details>

<details>
<summary><strong>iOS 26 and Earlier</strong></summary>

Add these **three required shortcuts** and **two optional but recommended shortcuts** to the Shortcuts app:

- **[Calendar Alarm Engine](https://www.icloud.com/shortcuts/d440cb27296540289a2e5b75f9e21090)**
  - The core of the system. It keeps your calendar alarms synced with the Clock app and manages their behavior when they trigger. Run it manually to force an immediate sync.
- **[Calendar Alarms QR Scanner](https://www.icloud.com/shortcuts/549b8a24d92640a7a3bf4bb452ef8398)**
  - Handles QR alarm interactions, including displaying the scanning interface and verifying scanned codes.
- **[Calendar Alarms Actions](https://www.icloud.com/shortcuts/14c0ce3005a849918beeb2ce1312c45e)**
  - Houses Calendar Alarms settings and the built-in actions that alarms can perform. Run it manually to change settings.
- **[CA Wake Times](https://www.icloud.com/shortcuts/492ae0379a6a42f19a772edc90a8684f)** *(recommended)*
  - Quickly change your next wake time with a time picker by shifting a recurring **Sleep** calendar event and its attached alarms.
  - **Why use it?** It lets you use Calendar Alarms for your wake-up alarm and move multiple sleep and wake alarms with one tap, without leaving your Home Screen. See [Wake Times](Feature%20Reference.md#wake-times) for setup instructions.
- **[CA qrClockCloser](https://www.icloud.com/shortcuts/ba752cdb8368467f81b21fc62abc5f1d)** *(recommended)*
  - Returns you to the Home Screen if you open Clock while a QR alarm is active, discouraging you from disabling its upcoming retries.
  - **Why use it?** QR alarms schedule a restart two minutes later and a backup four minutes later. **CA qrClockCloser** makes it harder to break this loop by disabling upcoming alarms in Clock. See [QR Alarms](Guides/QR%20Alarms.md) for behavior and limitations.

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
- **CA qrClockCloser** (recommended)
  - **When Clock Is Opened** — discourages disabling upcoming QR retries

Once you’ve turned on the three core automations—and the fourth if you installed **CA qrClockCloser**—you’re finished with this section.

</details>

<details>
<summary><strong>iOS 26 and Earlier</strong></summary>

Create the first **three automations** below in the Shortcuts app by tapping **Automation** at the bottom, followed by the **+** button. If you installed **CA qrClockCloser**, create the optional fourth automation as well:

1. **Time of Day (12:10 a.m.)** → **Repeat Daily** → **Run Immediately** → run **Calendar Alarm Engine**
   - Performs a daily backup sync.
2. **Alarm** → **When Any Alarm Goes Off** → **Run Immediately** → run **Calendar Alarm Engine**
   - Handles active alarm behavior.
3. **App** → when **Calendar** is closed → **Run Immediately** → run **Calendar Alarm Engine**
   - Syncs Calendar changes to Clock.
   - **Note:** You can use a different calendar app for this automation, but it may not work correctly if your edited event has not yet synced to Apple Calendar when you close that app.
4. *(Optional, recommended for QR alarms)* **App** → when **Clock** is opened → **Run Immediately** → run **CA qrClockCloser**
   - Discourages disabling upcoming QR retries in Clock.

Once you’ve created the first three automations—and the fourth if you installed **CA qrClockCloser**—you’re finished with this section.

</details>

### E) Run “Calendar Alarms Actions” to Finish Installation.

> [!NOTE]
> iOS will ask you to grant permissions the first time these shortcuts run. Grant every requested permission—such as **Always Allow**, **Always Delete**, and **Allow Access**—for the system to work as expected.

Run **Calendar Alarms Actions**, optionally input any calendars to ignore, and then select "I'm Finished" to finish installation. It will automatically install the required Scriptable scripts and create a new **OpenHabits** folder in `iCloud Drive/Shortcuts` for files the system needs.

If you want to use Calendar Alarms for your wake-up alarm, run **CA Wake Times** and follow its setup steps.

You have finished the installation! Next, test how it works.

---

## 2) Test It Out (10 Minutes)

Run the demo to see Calendar Alarms in action and finish granting permissions. You’ll try a regular alarm, an alarm that automatically runs actions, and a QR alarm that you dismiss by scanning a code.

If possible, keep this guide open on a computer or tablet so your iPhone is free to scan the demo QR code. If you only have your iPhone, the demo page explains how to skip the QR alarm.

> [!IMPORTANT]
> **About reliability:** Calendar Alarms rely on Apple's Shortcuts app, which can sometimes silently delay or skip your automations. The result is that sometimes, an alarm may sound without running its configured actions, or QR alarm sounds may alternate between two minutes of playback and two minutes of silence. Keep these known issues in mind during the demo.

<details>
<summary><strong>More about reliability and known Shortcuts bugs</strong></summary>

Shortcuts sometimes silently delays or skips automations, particularly when the battery is low, the system is under heavy load, or the device is older. Calendar Alarms includes workarounds wherever possible, but it cannot force iOS to run an automation that the system delays or skips.

The specific failures below are caused by bugs and limitations in Apple’s Shortcuts app, not by errors in Calendar Alarms’ shortcuts or code. These issues need to be fixed by Apple.

- **Configured actions occasionally fail to run after an alarm goes off.** The alarm sounds, but its follow-up actions do not run. This is uncommon, but possible.
- **A QR alarm’s repeating sounds alternate between two minutes of silence and two minutes of playback.** This is very common and was first observed after the iOS 27 update.

</details>

### Run the Demo

1. In **Apple Calendar on your iPhone**, create an event named **Demo** that starts at any time today. Use a calendar that Calendar Alarms is not set to ignore.
2. Open [**Demo Alarms**](Guides/Demo%20Alarms.md) in another tab and copy the configuration block into the event’s notes. **You don’t need to understand or edit the code**—it just contains the settings for the demo alarms. Keep the demo page open for the alarm explanations and QR code.
3. Set the event’s start time to **two minutes from now**. For example, if it is currently 3:07 p.m., set it to 3:09 p.m.
4. Return to your Home Screen to trigger the calendar sync. Approve any permission requests, choosing **Always Allow**, **Always Delete**, or **Allow Access** when offered. Then open the **Clock** app. You should see three new alarms—or two if you skipped the QR alarm—each one minute apart, starting at the event’s start time. If they do not appear, follow [No alarm appears in Clock](Guides/Troubleshooting%20and%20Maintenance.md#no-alarm-appears-in-clock) before continuing.
5. Let the alarms run and approve any additional permission requests. Follow the explanations on the demo page, and scan its QR code to finish the QR alarm if you included it.
6. **Run the demo a second time:** move the event’s start time to two minutes from now, return to your Home Screen, and let the alarms run again. With the initial permissions granted, this run should be smoother and more representative of normal use.

You’re ready to create alarms for your own events! Use the [**Calendar Alarm Editor**](https://copperpanman.github.io/Calendar-Alarms-for-iOS/) to create or change an alarm configuration, then paste it into your event’s notes.

### Creating Your Own Alarms

- **One event = one configuration block.** All of an event’s alarms belong in the same block. To add another alarm, open the existing block in the Editor rather than pasting a second block into the event.
- You can keep other notes in the event—just place them outside the configuration block.
- You can use another calendar app or service, provided its events sync with Apple Calendar. See the automation setup above if you want syncing to run when you close a different calendar app. You can also run **Calendar Alarm Engine** manually after an event has synced to Apple Calendar.

> [!NOTE]
> The demo covers permissions used by the features you tested. If you skipped the QR alarm, test one separately before relying on it. **OpenHabits reminders and task-based alarms** may also request additional permissions because they access files and send data off-device. Test those features once with your iPhone unlocked and approve every request before relying on them while it is locked.

## Learn More

Installation and testing are complete. Choose your next feature in the [Feature Reference and FAQ](Feature%20Reference.md), which links to QR alarms, actions, rescheduling, OpenHabits integration, and wake-time setup. For problems or existing-installation updates, use [Troubleshooting and Maintenance](Guides/Troubleshooting%20and%20Maintenance.md).
