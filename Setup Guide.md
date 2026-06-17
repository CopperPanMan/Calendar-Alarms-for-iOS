### Quick Links
- [Calendar Alarm Editor](https://copperpanman.github.io/Calendar-Alarms-for-iOS/) — create and edit alarms with a simple interface
- [Calendar Alarms AI Helper](link) — has access to this repo's docs, so a great optional tool if you have questions about setup or features, or want help creating alarms (it can even create them from raw JSON)

<br>
<br>

# 1) One-time setup (15–30 minutes)

## A) Install apps

- Install [**Apple Shortcuts**](https://apps.apple.com/us/app/shortcuts/id1462947752)
- Install [**Scriptable**](https://apps.apple.com/us/app/scriptable/id1405459188)

## B) Create the iCloud “Shortcuts” folder + required files

1. In the **Files** app → **iCloud Drive** → make sure a folder named **Shortcuts** exists.  
   Inside it, create a new folder called **Calendar Alarms**.  
   If either do not exist, create them.
   
<img width="173" height="374" alt="image" src="https://github.com/user-attachments/assets/58f12814-71cb-4d39-9b42-5794b483c82b" /><img width="173" height="374" alt="image" src="https://github.com/user-attachments/assets/b81003dd-1bdd-4f57-a489-9141e58a64dc" />

2. The system will create/maintain these several files that store runtime data inside:

`iCloud Drive/Shortcuts/Calendar Alarms`

3. If you intend on using QR functionality, you will need to put at least one alarm tone `.mp3` file in this folder.
   [*(Here are some to get started with. I like marimba.mp3 and ocean.mp3 → these are needed for one of the demos below)*](https://github.com/CopperPanMan/Calendar-Alarms-for-iOS/tree/main/qr%20alarm%20ringtones)

## C) Scriptable setup

### 1. Create a File Bookmark to the “Calendar Alarms” folder

Scriptable must be able to resolve a File Bookmark named **“Shortcuts”** pointing to:

`iCloud Drive/Shortcuts/Calendar Alarms`

To do this:  
Go to **Scriptable → Settings → File Bookmarks → Add (+)** and select the **Calendar Alarms** folder.

### 2. Add 2 scripts to Scriptable (from this repo):

- `Calendar Alarm Engine.js`
- `Calendar Alarm QR Scanner.js`

**Instructions:** Copy/paste the code from this repository for Calendar Alarm Engine.js into a new blank Scriptable script, and then name that script "Calendar Alarm Engine.js". Do the same for Calendar Alarm QR Scanner.js.
- at the top of the script, you can optionally fill in DISABLED_CALENDAR_NAMES = ["name1","name2"...] with a list of calendars that you want the code to ignore completely. This is useful if somebody with alarms (like a spouse) shares a calendar event with you, so their alarms are not scheduled on your phone.
  
## D) Shortcuts setup

While a few are optional, it is recommended that you add these **5 Shortcuts** (each one linked) in the Shortcuts app, in the order in which they appear. You can put these in a new folder for better organization:

- [**Calendar Alarms Engine**](https://www.icloud.com/shortcuts/0c09f1d1a93d4353a3d86ba5cb12c006) *(required - this is the "brains")*
  - *Special Instructions:* Make sure that the Scriptable action block inside this shortcut is set to run **“Calendar Alarm Engine”**
- [**Calendar Alarms qrScanner**](https://www.icloud.com/shortcuts/c0e862fb087b40c091b788cd9f6b89f7) *(required for any QR functionality)*
  - *Special Instructions:* Make sure that the Scriptable action block inside this shortcut is set to run **“Calendar Alarm QR Scanner”**
- [**CA qrClockCloser**](https://www.icloud.com/shortcuts/b9f7a10faaa34f1c88068b444d804ccd) *(optional, recommended for any QR functionality)*  
  - Returns you to the Home Screen if you open the Clock app while a QR alarm is active, to prevent turning it off by “cheating”.  
  - QR alarms work by rescheduling another alarm for one minute into the future, which re-triggers the shortcut to run again at that time, which reschedules again, all in a loop. Due to that, you can illegitimately get around scanning a QR code by opening the Clock app and turning off the “next” scheduled alarm. This shortcut prevents that.
- [**CA qrCodeMaker**](https://www.icloud.com/shortcuts/81a70ef19d3c4bee8f904aa79503f3ed) *(optional, recommended for any QR functionality)*  
  - Generates QR codes from links for easy printing.  
  - Watch out: some QR code generators create “dynamic” codes that encode their redirect link instead of your actual URL. That won’t work here.
- [**CA Wake Times**](https://www.icloud.com/shortcuts/64f042cca3564d5f8980de743ae5cc4b) *(optional)*
  - Quickly change tomorrow’s wake-up alarm by adjusting the end time of your “Sleep” calendar event.
  - Recommended: Once created, open the shortcut to edit, click the shortcut name, click "Add to Homescreen". Now you can edit your alarm from the homescreen.
  - Requires a calendar event titled **“Sleep”** with an alarm set to 0 offset, referencing the event end. More on that below.

- Accessory Shortcuts *(optional - these are not part of the system, but are great for running with alarms. Needed for the Demo step below)*
   - [**Speak Text**](https://www.icloud.com/shortcuts/1338bc99babe425ca9c816200885f6db)
   - [**Start Timer for Input**](https://www.icloud.com/shortcuts/2e5c366cf69542849c6ef3c02568bf06)
   - [**Cancel Timer**](https://www.icloud.com/shortcuts/204292428733453d8e776607d8b24d2b)
   - [**Show Input Notification**](https://www.icloud.com/shortcuts/f44f611e912d402f807b197227c2f856)
<img width="129" height="279" alt="image" src="https://github.com/user-attachments/assets/86da3868-ab83-4783-864c-ce484d2a27cc" />

## E) Automations

While a few are optional, it is recommended that you create these **5 automations** in the Shortcuts app (tap **Automation** at the bottom, then the **+** sign):

1. *(Required)* **Time of Day (any time, I picked 12:10AM)** → repeat daily, run immediately → run shortcut **Calendar Alarms Engine**  
   - *What it does:* Schedules your alarms for the day, one time per day at the time of your choice.

2. *(Required)* **Alarm** → When any alarm goes off, run immediately → run shortcut **Calendar Alarms Engine**
   - *What it does:* Runs the brains of the system. It schedules new alarms, deletes old ones, and manages QR and reschedule loops where applicable.
   - *Timezone note:* If you travel across timezones, the engine uses the phone’s current local Calendar times for new alarms and cleans up the prior local Clock alarms it created.

3. *(Optional)* **Alarm** → When any alarm goes off, run immediately → run shortcut **Calendar Alarms QR Scanner**
   - *What it does:* Presents a menu with scan options when QR alarms run that makes scanning codes easier, so you don’t have to manually open the camera.

4. *(Optional)* **App** → When “Calendar” is closed, run immediately → run shortcut **Calendar Alarms Engine**
   - *What it does:* If you edited any calendar events, this reschedules their alarms immediately upon closing the Calendar app.
   - *NOTE* you can swap this to a different calendar app of your choice, but this automation may not work correctly if the event you are editing hasn't yet been synced to your iOS calendar app when you close calendar.

5. *(Optional)* **App** → When “Clock” is closed, run immediately → run shortcut **Calendar Alarms qrClockCloser**
   - *What it does:* Prevents users from opening the Clock app when a QR alarm is active, stopping them from “breaking the rules” by disabling active QR alarms without scanning.

> [!NOTE]
> *iOS will ask you to grant permissions the first time these shortcuts run. You will need to grant them all (ie always allow. always delete, allow access, etc) in order for the system to work as expected.*

You have now completed the one-time setup!

<br>

---

<br>

# 2) Let's Test it Out

To start, you should know that alarms are created via JSON code in the notes section of a calendar event. Don't worry! You don't have to know how JSON works beyond copy/pasting it.

I recommend using the [Calendar Alarm Editor](https://copperpanman.github.io/Calendar-Alarms-for-iOS/) to create and edit alarms from a simple interface. Tip - put a link to this editor in the notes of a recurring Calendar Event to always have easy access.

> [!Note]
> *Whether you make 1 or 100 alarms on an event, they will live inside **one** JSON code block. Copy/Pasting multiple JSON code blocks to schedule multiple alarms will *not* work - they need to be made and pasted as one block.*
> *You can use whatever calendar app you want, but the calendar you are using must be synced to the iOS calendar app.*

<details>
<summary>Optional: What is JSON, and How does this Work?</summary>
<br>

JSON is a structured way to label information in `"key":"value"` pairs so a computer can read it reliably. It’s not instructions, it’s *storage*. Think of it like a set of boxes, where the **key** is the label and the **value** is what’s inside.

The JSON in your calendar event stores settings that the **Calendar Alarm Engine** shortcut uses to schedule alarms in the iOS clock app. The JSON itself *does not do anything* - remember, it is a *storage medium*.

More info can be found in [this article](https://stackoverflow.blog/2022/06/02/a-beginners-guide-to-json-the-data-format-for-the-internet/) from Stack Overflow. If you're feeling advanced, you can always create and edit alarms directly in JSON.

</details>


## Demo Time!

To get you accustomed to how this system works, let’s implement 4 test alarms on a demo event. These alarms will go off one after another every minute, lasting 4 minutes total, and will demonstrate various features of the system. The code and further explanations are in the toggle below the instructions. The first run-through could be buggy due to permissions requests, so we'll have you do this twice. 

### Demo Instructions

Pre-Steps
   1. Make sure you either:
      - Have all of the shortcuts and automations from above installed (including the accessory shortcuts), and that you have another device nearby that can display the below QR code.
      - OR use the [Alarm Editor](https://copperpanman.github.io/Calendar-Alarms-for-iOS/) to remove the last alarm (the QR alarm) and/or the shortcuts that are configured to run on alarms 2 and 3.*
   2. If possible, plug your device in if your battery is below 50%. This will make things go smoother. See FAQ for more info.

Main Steps
   1. In your calendar app, make a new event called “demo” anytime today.
   2. Copy/Paste the DEMO JSON code from the toggle below into its notes section. Explanations of what these alarms do are also there, but you can also load the code into the [Calendar Alarm Editor](https://copperpanman.github.io/Calendar-Alarms-for-iOS/) to better understand their settings.
   3. Then, set the event start time to 2 minutes from now. Example - if it is currently 3:07pm, set it to 3:09pm. If you did this from a Mac - make sure this event has synced to your iPhone.
   4. Close your calendar app to schedule these alarms (approve permissions if needed - always allow, always delete, always access, etc), and open the clock app. You should have 4 new alarms, all separated by a minute, with the first starting at event_start + 2 minutes.
   5. Let these alarms run through over the next 4-6 minutes, and approve permissions when asked.
   6. Once finished, run the alarms again by repeating steps 3-5. This time the experience should be smoother and more representative of normal use.
   7. Optional: feel free to play around with the values inside the code using the Alarm Editor to get a feel for what things do!

<details>
<summary>Demo Event Alarm Explanations and Code</summary>
<br>

- Alarm 1: regular alarm, like you would find in the clock app.
- Alarm 2: alarm that starts a timer, and displays a custom notification.
- Alarm 3: silent alarm that cancels the prior timer and speaks text.
- Alarm 4: QR alarm that loops marimba.mp3 until the QR code below is scanned. (If marimba.mp3 does not exist in the Calendar Alarms folder, it is a generic notification sound)
    1. When this alarm goes off, a menu should pop up to scan the code below. If it doesn't (sometimes it won't), you can *always* scan the QR code with your regular camera app.
    2. Feel free to watch what happens if you don’t interact with your phone for a minute or two while the alarm runs. Another alarm will trigger, which will extend the loop until you scan the code. With no user involvement, this cycle will automatically stop after an hour.
  
<br>

<img width="150" height="150" alt="image" src="https://github.com/user-attachments/assets/11fb4111-eaa3-4d8f-8027-b7e0dd954c9d" />
<br>
<em>This QR code was generated in the CA qrCodeMaker shortcut using qrCodeID = "wakeup". Find more on configuring QR alarms in the QR Alarm section of Feature Reference, below.</em>

<br>  
<br>

Demo Event JSON:

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
        "name": "Start Timer for Input",
        "input": [1.1]
      },
      {
        "name": "Show Input Notification",
        "input": ["Demo: Leave for Work in 1 minute"]
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
        "name": "Cancel Timer",
        "input": []
      },
      {
        "name": "Speak Text",
        "input": ["Remember to do that task"]
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



<br>

---

<br>

# 3) Feature Reference

## Basic Alarms

Basic alarms are the default type of alarm. In the editor, just click **Add Alarm** and fill in the top row:

- **Alarm Name**
- **Status**
- **Offset Minutes**
- **Reference**

If you stop there, you have a standard alarm tied to that calendar event.

Use this for simple reminders like:

- leave for the airport in 5 minutes
- join a meeting
- wake up - at the end of a Sleep event

---

## QR Alarms

Use a QR alarm when you want the alarm to require physical action to turn off.

In the editor, open **Advanced Settings** and fill in **QR Alarm Properties**. Once enabled, the alarm will keep looping until the correct QR code is scanned by the iPhone Camera app or the Prompt that shows on-screen during a QR alarm.

- Each QR alarm will have a matching QR code that turns it off. Generate that matching QR code by putting the qrCodeID from the alarm into the CA qrCodeMaker apple shortcut, or using its URL format. Multiple alarms can share the same code. Scan that code to turn the alarm off.
- Since QR codes are just text stored in image form, in this system, the “text” is a Shortcuts URL that launches the *Calendar Alarms QR Scanner* shortcut with your "qrCodeID" as input.

Good use cases:

- forcing yourself out of bed
- making yourself go to your desk, open your task manager app, and scan the code on a task titled "plan your workday"
- requiring yourself to reach a real location before dismissing the alarm

---

## Trigger Shortcuts and Silent Alarms

Use **Trigger & Silence Properties** when you want an alarm to do something beyond just ring.

This lets you:

- run one or more shortcuts when the alarm goes off
- make the alarm self-silence while still running those actions

This is useful for things like spoken reminders, notifications, timers, lights, or custom automations.

---

## Rescheduling

Use **Rescheduling Properties** when an alarm should go off at the right time, not just the original time.

Depending on how you configure it, the alarm can wait and try again later if:

- you are driving
- you are in a conflicting calendar event
- you are not yet at the right location
- you are at a location where the alarm should not fire

This is useful for context-dependent reminders like “review my day plan once I actually get to work.”

---

## Task Looping
- Use **Task Looping** when an alarm should keep coming back until one or more tasks are completed.
- This feature uses [OpenHabits](https://github.com/CopperPanMan/OpenHabits-Habit-Tracker-and-Focus-Protector), the habit tracking & app lockout system I designed which allows you to log metrics/habits to google sheets. You'll have to install that for this to work.
- Alarms of all types can be set to loop if a task (ie metric) has not been completed, a maximum number of *maxReschedules* times.
   - example 1: keep reminding me every 30 minutes to feed the dog until I log that I fed the dog.
   - example 2: keep looping a QR alarm that forces me to go to my computer until I have logged that I planned my workday.
   - example 3: keep reminding me to go to bed until I have logged that I flossed.
- In the event that you intend on logging metric completion to your OpenHabits google sheet from anywhere other than iOS shortcuts (like notion, the sheet itself, etc), you will need the [Task Alarm Resetter](https://www.icloud.com/shortcuts/99422f7805cd4f7185e8769d89b66975) shortcut, since your phone's local metric cache may not always be up to date with the sheet. Follow the instructions inside the shortcut.

---

## Combining Features

You can combine multiple behaviors on the same alarm.

For example, one alarm can:

- require a QR scan
- run shortcuts on trigger
- reschedule if you are driving
- keep looping until a task is complete

For most users, the best approach is to start simple, test it once, and then add more advanced behavior when needed.

---

# 4) FAQ
- What are some use cases for launching shortcuts from alarms?
    - when your wakeup alarm goes off, turn your lights on, fan off, thermostat up, and coffee maker on. Because it's tied to a calendar event, you can change your wake time and it all moves with it.
    - schedule a cascade of create timer/delete timer shortcuts and speak text shortcuts to “pace” your morning or night routine, while never having to touch your phone.
    - get travel time to work before your commute in the morning
    - send a text to a set of phone numbers (your friends perhaps) to remind them to check in for their flight. This flight can be in 6 months, and when the alarm time comes, it will send those texts automatically.
- Can I send multiple inputs to a shortcutOnTrigger, etc?
   - Yes. Place your input in a JSON format, and then in the shortcut, use the “get dictionary from input” and "get dictionary value" actions to parse it out.
- My alarm didn't delete itself and/or a shortcut didn't run, even though it was configured to. Or it worked, but it was delayed.
   - iOS sometimes quietly decides to not run automations based on low battery percentage and/or high cpu load, and that can cause shortcuts to occasionally run late or not at all. Unfortunately, this is an apple thing, and means that advanced features can be less reliable on low power, hot cpu, old devices, etc, and can occasionally cause QR alarms to not start immediately, QR or silent alarms to not be auto-deleted, or configured shortcuts to not be run.
- Why do I sometimes see two alarms for an active QR alarm?
   - same reason as above - iOS sometimes doesn't run shortcuts from automations even when it should. This second alarm is a backup trigger in case that happens.
- What if I can't scan the code to turn my QR alarm off?
   - If you ever find yourself with no ability to scan the code, turn your phone off and back on, then open the clock app and turn off the next scheduled QR alarm before the clock app closes. The alarm will be automatically marked as complete after an hour. This is intentionally annoying to do, because otherwise it doesn't enforce behavior.


