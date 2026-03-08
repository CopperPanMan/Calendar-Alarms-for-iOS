# 1) One-time setup (15–30 minutes)

## A) Install apps

- Install [**Apple Shortcuts**](https://apps.apple.com/us/app/shortcuts/id1462947752)
- Install [**Scriptable**](https://apps.apple.com/us/app/scriptable/id1405459188)

## B) Create the iCloud “Shortcuts” folder + required files

1. In the **Files** app → **iCloud Drive** → make sure a folder named **Shortcuts** exists.  
   Inside it, create a new folder called **Calendar Alarms**.  
   If either do not exist, create them.
   
<img width="173" height="374" alt="image" src="https://github.com/user-attachments/assets/58f12814-71cb-4d39-9b42-5794b483c82b" /><img width="173" height="374" alt="image" src="https://github.com/user-attachments/assets/b81003dd-1bdd-4f57-a489-9141e58a64dc" />

2. The system will create/maintain these several files that store runntime data inside:

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
  - Requires a calendar event titled **“Sleep”** with an alarm set to:  
    `{"offsetMin": 0, "reference": "end"}`
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

3. *(Optional)* **Alarm** → When any alarm goes off, run immediately → run shortcut **Calendar Alarms QR Scanner**
   - *What it does:* Presents a menu with scan options when QR alarms run that makes scanning codes easier, so you don’t have to manually open the camera.

4. *(Optional)* **App** → When “Calendar” is closed, run immediately → run shortcut **Calendar Alarms Engine**
   - *What it does:* If you edited any calendar events, this reschedules their alarms immediately upon closing the Calendar app.

5. *(Optional)* **App** → When “Clock” is closed, run immediately → run shortcut **Calendar Alarms qrClockCloser**
   - *What it does:* Prevents users from opening the Clock app when a QR alarm is active, stopping them from “breaking the rules” by disabling active QR alarms without scanning.

*NOTE: iOS will ask you to grant permissions the first time these shortcuts run. You will need to grant them all (ie always allow. always delete, allow access, etc) in order for the system to work as expected.*

## F) Let's Test it Out

To get you accustomed to how this system works, let’s implement a demo event with 4 alarms that will go off one after another every minute for 4 minutes. The first run through may be buggy since it will require you to grant various permissions, so you’ll want to run through this at least twice. You’ll also need the accessory shortcuts from above installed. 

If you would like to skip the QR alarm demo because you don't have another device with you to display the below QR code on, you can delete that alarm. To do so, delete everything shown below from the demo JSON (everything from the comma to the curly brace). Otherwise, skip this step:

```json
   ,
  {
    "alarmName": "Demo: QR Alarm - scan code: wakeup to turn off.",
    "status": "ON",
    "offsetMin": 3,
    "reference": "start",

    "qrCodeID": "wakeup",
    "qrSoundPath": "marimba.mp3",
    "qrVol": 50
  }
```

### Demo Event Alarm Explanations

- Alarm 1: regular alarm, like you would find in the clock app.
- Alarm 2: alarm that starts a timer, and opens the app “Chrome”
- Alarm 3: silent alarm that cancels the prior timer, speaks text, and displays a notification
- Alarm 4: QR alarm that loops a marimba sound (if the file exists in the folder, if not it is a generic notification sound) until the QR code below is scanned. (qrCodeID = “wakeup”, made using the CA qrCodeMaker shortcut)
    1. When this alarm goes off, a menu should pop up to scan the code. If it doesn't, you can *always* scan the QR code with your regular camera app.
    2. Watch what happens if you don’t interact with your phone for a minute or two while the alarm runs. Another alarm will trigger, which will extend the loop until you scan the code. With no user involvement, this cycle will automatically stop after an hour.

<img width="100" height="100" alt="image" src="https://github.com/user-attachments/assets/11fb4111-eaa3-4d8f-8027-b7e0dd954c9d" />

`Note: iOS sometimes quietly decides to not run automations based on low battery percentage and/or high cpu load, and that can cause shortcuts to occasionally run late or not at all, or cause a QR alarm to not start immediately. These are unfortunately not issues with this system, but rather apple not giving priority to user automations.`

### Demo Instructions

1. Make a new event called “demo” (pick any start time for now - the event name and end time do not matter. Copy/Paste the DEMO JSON code below into its notes section. Then, set the event start time to 2 minutes from now.
2. If you did this on a mac, make sure that this demo event has synced onto your phone’s calendar app. Once it has, close your calendar app to schedule these alarms (approve permissions if needed), and open the clock app. You should have 4 new alarms, all separated by a minute, with the first starting at event_start + 2 minutes.
3. Let these alarms run through over the next 4-6 minutes, and grant permissions when asked. The first run-through may be buggy due to these permission requests. Once finished, run the alarms again by editing the demo event's start time (again) to 2 minutes from now, and repeat steps 2 and 3.
4. Optional: feel free to play around with the values inside the code to get a feel for what things do!

## Demo Event JSON

```json
[
  {
    "alarmName": "Demo: This is a basic alarm.",
    "status": "ON",
    "offsetMin": 0,
    "reference": "start"
  },
  {
    "alarmName": "Demo: This alarm starts a 1.1 minute timer and sends a notification.",
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
    "alarmName": "Demo: This alarm silences itself in order to silently stop the current timer and speak text.",
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
    "alarmName": "Demo: QR Alarm - scan code: wakeup to turn off.",
    "status": "ON",
    "offsetMin": 3,
    "reference": "start",

    "qrCodeID": "wakeup",
    "qrSoundPath": "marimba.mp3",
    "qrVol": 50
  }
]
```

---

# 2) Digging Deeper, and Finishing Setup

## JSON Primer
As you have seen, Alarms are created via JSON code in the notes section of a Calendar event. Think of JSON as a specific way of writing out a list of settings in "key":"value" pairs, where a "key" represents the name of a setting, and the "value" represents the value you want that setting to be set to. JSON is picky about punctuation, but the rules are simple. More info can be found in [this article](https://stackoverflow.blog/2022/06/02/a-beginners-guide-to-json-the-data-format-for-the-internet/) from StackOverflow. 

For our purposes, an alarm looks like the blank template below. This JSON block includes **one alarm** with every available setting shown. Any number of alarms is possible by copy/pasting the inner alarm object {} - ie everything inside of the outer brackets[], and adding commas between each object.

## Setup a Blank Alarm Template
- To make new alarm setup easier, create an event that recurs daily. Copy and paste the blank template below into the notes section of that event. Then, under the JSON you just pasted, copy and paste the key explanations as well.
- Now, just copy/paste the JSON block from that event any time you want to create a new alarm. If an alarm already exists, just copy/paste everything but the outer brackets.
- You now have everything you need to get started with this system!

---

## Blank Alarm Template
```json
[
  {
    "alarmName": "Template",
    "status": "OFF",
    "offsetMin": 0,
    "reference": "start",

    "qrCodeID": "",
    "qrSoundPath": "",
    "qrVol": 50,
    "qrShortcutsOnScan": [
      {
        "name": "",
        "input": [""]
      }
    ],

    "shortcutsOnTrigger": [
      {
        "name": "",
        "input": [""]
      }
    ],
    "silenceAlarm": false,

    "locationMode": "off",
    "locations": [
      [0, 0, 50]
    ],

    "silenceIfDriving": "OFF",
    "conflictingCalendars": [],
    "reschedMinutes": 0,
    "maxReschedules": 2
  }
]
```

### Key explanations (JSON cheat-sheet: text goes in quotes, numbers and true/false do not, and the outermost '{}' are one alarm)
- alarmName: the name of your alarm
- status: ON or OFF
- offsetMin: number of minutes from the start or end of the event. Neg=before, Pos=after. Also accepts a string like “2h”, “-6d”, “+15m” (no decimals)
- reference: START or END
- qrCodeID: for qr alarms, this is the unique ID you place in CA qrCodeMaker. eg: your_ID_here (no spaces. Allowed characters: A–Z a–z 0–9 - . _ ~)
- qrSoundPath: for qr alarms, filename.mp3
- qrVol: for qr alarms, volume, 1 to 100,
- qrShortcutsOnScan: for qr alarms, run shortcuts when you scan the QR code. eg: [{"name": "optional shortcut name here", "input": ["optional input 1", "optional input 2"]}],
- shortcutsOnTrigger: run shortcuts when the alarm first goes off. eg: [{"name": "optional shortcut name here", "input": ["optional input 1"]}],
- silenceAlarm: true or false, useful for silently running a shortcut on trigger.
- locationMode: whitelist, blacklist, or off -> whitelist = ONLY run if at one of these locations (ie reschedule if not), blacklist = NEVER run if at one of these locations
- locations: [[lat1, long1, radiusMeters1], [lat2, long2, radiusMeters2], ...],
- silenceIfDriving: "ON",
- conflictingCalendars: if event from calendar here conflicts, reschedule alarm. eg: ["calendar name 1", "calendar name 2"],
- reschedMinutes: "reschedule_interval_in_minutes",
- maxReschedules: "max_number_of_reschedules"

---

# Examples and Further Context

## What are the Formatting Rules?
- General Rules
  - You can delete unwanted settings: alarmName is required, but you can delete any other "key": "value" pair (setting) you don’t want. Missing keys are filled with safe defaults (usually equivalent to “off” for optional features). Just don’t change the names of any keys.

  - Unlimited lists: If a value is shown in brackets[] (like locations) or braces{} (like alarms, shortcutsOnTrigger, etc), you can include as many of those objects as you want, separated by commas. Useful for multiple locations, multiple shortcuts, multiple alarms, etc.
  - You can also have as many alarms as you want on one event by copying/pasting the outer {} alarm object, with commas between each, as shown in an example below.

  - Avoid duplicates: Where possible, avoid creating a Calendar Alarm with the exact same name + time as any other alarm, calendar alarm or regular. Failure to do so can lead to old alarms not being properly deleted due to ambiguity over what is “owned” by Calendar Alarms, and can cause QR alarms to not loop correctly.

- JSON Punctuation Rules
  - Keys and text values are in quotes, but number values are not. Use regular quotes (" ") NOT smart quotes (“ ”).

  - Commas separate all key/value pairs, all items in arrays [], and all objects {}. Watch out for missing or trailing commas. Extra spaces don’t matter.

  - You can write notes above and below the JSON block, but do not write comments or notes inside of the JSON block itself (ie inside the outer brackets []).

  - The shortcut will notify you of an error if any of these are wrong. When in doubt, no matter what the error says, your problem is commas or quotes (missing, misplaced, or extra).
    

## Example Single Alarm for Completing a task called “Plan Workday” on an event called “Work” (includes all possible keys)
```json
[
  {
    "alarmName": "Scan Plan Workday At Computer",
    "status": "ON",
    "offsetMin": 30,
    "reference": "start",

    "qrCodeID": "plan_workday",
    "qrSoundPath": "wakeup_alarm_ringtone.mp3",
    "qrVol": 40,
    "qrShortcutsOnScan": [{"name": "Show Tasks", "input": ["plan_workday", "computer"]}],

    "shortcutsOnTrigger": [{"name": "Open Notion", "input": ["work"]}],
    "silenceAlarm": false,

    "locationMode": "whitelist",
    "locations": [[40.0907, -82.8767, 200]],

    "silenceIfDriving": "ON",
    "conflictingCalendars": ["work meetings", "vacation", "travel"],
    "reschedMinutes": 30,
    "maxReschedules": 3
  }
]
```
### What does this Alarm Do?
- General scheduling and QR settings

  - This alarm is turned on and will go off 30 minutes after the start of the event it’s on.

  - It will play the alarm tone "wakeup_alarm_ringtone.mp3" on loop until a QR code is scanned that contains the qrCodeID "plan_workday".

  - It will run the shortcut “Open Notion” when it triggers and pass the input array `["work"]`.

  - Optional: set `"silenceAlarm": true` for silent one-shot behavior (the alarm is deleted at trigger and only `shortcutsOnTrigger` runs).

  - It will run the shortcut “Show Tasks” when the correct QR code is scanned and pass `["plan_workday", "computer"]` as input.

  - These can be any user-made shortcuts, but names must be exact matches. Input can contain one item or many items.

- Rescheduling logic (effectively “snoozes” if it’s a bad time, up to maxReschedules times)

  - If this alarm triggers while inside a conflicting event from any calendars named "work meetings", "vacation", or "travel", it will reschedule to after the event ends plus a 10 minute buffer. It also respects reschedMinutes, whichever results in a later time.

  - If the user is not within 200 meters of the work coordinates, it will reschedule to 30 minutes from now and try again.
  - If locationMode was set to "blacklist", it would reschedule if the user was at work.

  - If the user is in the driving focus mode, it will reschedule based on an approximation of travel time to the whitelisted location.

## Example Double Alarm Sleep Event
```json
[
  {
    "alarmName": "Go to Bed in 1 hour",
    "status": "ON",
    "offsetMin": -60,
    "reference": "start"
  },
  {
    "alarmName": "Wake Up",
    "status": "ON",
    "offsetMin": 0,
    "reference": "end",

    "qrCodeID": "toothbrush",
    "qrSoundPath": "wakeup_alarm_ringtone.mp3",
    "qrSoundLen": 2.13,
    "qrVol": 40,
    "qrShortcutsOnScan": [{"name": "Show Morning Tasks", "input": ["wake"]}],

    "shortcutsOnTrigger": [{"name": "Turn Lights On", "input": ["bedroom", "50%"]}],
    "silenceAlarm": false,

    "silenceIfDriving": "ON",
    "conflictingCalendars": ["work meetings", "vacation"],
    "reschedMinutes": 30,
    "maxReschedules": 3
  }
]
```
### Notes on These Alarms
- These two alarms would exist on a hypothetical event called “Sleep” that begins at 11PM and ends at 7AM, and serve to notify the user to go to bed and to wake up, respectively.

- The first alarm will go off at 10PM to say “Go to Bed in 1 hour”.

- The second alarm will go off at 7AM and will require you to scan a QR code to turn off.

## C) How to manually schedule alarms
The automations above will automatically schedule any alarm(s) you make on your phone, and any alarm(s) that will run after today. However, if you make an alarm on another device that is intended to trigger today, you might need to manually schedule it.

To do so: run Calendar Alarms Engine once manually after adding or editing your alarm(s). This forces a sync. After it runs, any alarm scheduled to go off today (even from events ±7 days with offsetMin values that put them in range of today) should now exist in the Clock app.

## FAQ
- How do I manually schedule an alarm?
- Why launch shortcuts from alarms? Here’s some real-world use cases:
    - set a cascade of create timer/delete timer shortcuts and/or Show Input Notification shortcuts to silently “pace” your morning or night routine, while never having to touch your phone.
    - get travel time to work before your commute in the morning
    - send a text to the numbers you list to remind them to check in for their flight. This flight can be in 6 months, and when the alarm time comes, it will send those texts.
    - set your thermostat or lights when you leave home, when you return from work, or before you wake up or go to bed.
- Advanced Note: to use more than one input in a shortcut, you will need to place them in a comma separated list inside the brackets, ie [”1”,”2”,”3”] and then inside the shortcut, use the “get dictionary from input” action (long press the blank value to select shortcut input) and “repeat with each” action to parse the values out.
- Why are there 2 duplicate alarms for a QR alarm while it is active?

## Advanced: Using QR Alarms
- Every QR alarm needs a matching QR code. QR codes are just text stored in an image. In this system, the “text” is a Shortcuts URL that launches the QR Scanner shortcut with an input value. Multiple alarms can share the same code.

- QR code format (copy/paste): Replace "qrCodeID" with your chosen qrCodeID, and make sure it matches the qrCodeID in your alarm JSON. This ID can be anything you want, subject to the rules in the template bullet points.

  - ```shortcuts://run-shortcut?name=Calendar%20Alarms%20QR%20Scanner&input=YOUR_ID```
- How to turn off a QR alarm: Scan the code using either the iPhone Camera app, or the Calendar Alarms QR Scanner shortcut directly.

- Reliability note (iOS limitation): On low battery or under heavy system load, iOS may silently decide not to run an alarm-triggered automation. If that happens, a QR alarm may stop re-triggering after a few minutes, even though it hasn’t been scanned yet.

  - Mitigation: the system uses a backup alarm to increase reliability, but it’s not foolproof.

  - Stale alarms: unattended QR loops expire after 1 hour, after which the system will automatically delete them.
