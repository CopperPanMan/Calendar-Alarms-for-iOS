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
   [*(Here are some to get started with.)*](https://github.com/CopperPanMan/Calendar-Alarms-for-iOS/tree/main/qr%20alarm%20ringtones)

## C) Scriptable setup

### 1. Create a File Bookmark to the “Calendar Alarms” folder

Scriptable must be able to resolve a File Bookmark named **“Shortcuts”** pointing to:

`iCloud Drive/Shortcuts/Calendar Alarms`

To do this:  
Go to **Scriptable → Settings → File Bookmarks → Add (+)** and select the **Calendar Alarms** folder.

### 2. Add 2 scripts to Scriptable

- [`Calendar Alarm Engine.js`](https://github.com/CopperPanMan/Calendar-Alarms/blob/main/Calendar)
- [`Calendar Alarm QR Scanner.js`](https://github.com/CopperPanMan/Calendar-Alarms/blob/main/Calendar)

**Instructions:** For each of these scripts, copy/paste the code from its link into a new blank Scriptable script, then rename the script to the correct name.
- near the top of the script, you can optionally fill in DISABLED_CALENDAR_NAMES = ["name1","name2"...] with a list of calendars that you want the code to ignore completely.
- near the same place, the optional "TASK_WEBAPP_ID" should be configured if task looping functionality is desired. More on that below.

## D) Shortcuts setup

While a few are optional, it is recommended that you add these **5 Shortcuts** (each one linked) in the Shortcuts app, in the order in which they appear. You can put these in a new folder for better organization:

- [**Calendar Alarms Engine**](https://www.icloud.com/shortcuts/3ec04ab520464aa9bcd615039cef53bd) (the “main” shortcut)  
  - *Special Instructions:* Make sure that the Scriptable action block inside this shortcut is set to run **“Calendar Alarm Engine”**
- [**Calendar Alarms qrScanner**](https://www.icloud.com/shortcuts/88e08ee731cf49c48ec0013eeefb100d) (required for any QR functionality)  
  - *Special Instructions:* Make sure that the Scriptable action block inside this shortcut is set to run **“Calendar Alarm QR Scanner”**
- [**CA qrClockCloser**](https://www.icloud.com/shortcuts/739b3b24b40b4226ae1e11bf3c27ce90) *(optional)*  
  - Returns you to the Home Screen if you open the Clock app while a QR alarm is active, to prevent turning it off by “cheating”.  
  - QR alarms work by rescheduling another alarm for one minute into the future, which re-triggers the shortcut to run again at that time, which reschedules again, all in a loop. Due to that, you can illegitimately get around scanning a QR code by opening the Clock app and turning off the “next” scheduled alarm. This shortcut prevents that.
- [**CA qrCodeMaker**](https://www.icloud.com/shortcuts/3161ca079dff4f069cff0aa117ca6ddf) *(optional)*  
  - Generates QR codes from links for easy printing.  
  - Watch out: some QR code generators create “dynamic” codes that encode their redirect link instead of your actual URL. That won’t work here.
- [**CA Wake Times**](https://www.icloud.com/shortcuts/3a03d2452e784f7189a57fb1ba508919) *(optional)*  
  - Quickly change tomorrow’s wake-up alarm by adjusting the end time of your “Sleep” calendar event.  
  - Requires a calendar event titled **“Sleep”** with an alarm set to:  
    `{"offsetMin": 0, "reference": "end"}`
<img width="129" height="279" alt="image" src="https://github.com/user-attachments/assets/86da3868-ab83-4783-864c-ce484d2a27cc" />

## E) Automations

While a few are optional, it is recommended that you create these **5 automations** in the Shortcuts app (tap **Automation** at the bottom, then the **+** sign):

1. **Time of Day (any time)** → run shortcut **Calendar Alarms Engine**  
   - *What it does:* Schedules your alarms for the day, one time per day at the time of your choice.

2. **When any alarm goes off** → run shortcut **Calendar Alarms Engine**  
   - *What it does:* Runs the brains of the system. It schedules new alarms, deletes old ones, and manages QR and reschedule loops where applicable.

3. *(Optional)* **When any alarm goes off** → run shortcut **Calendar Alarms QR Scanner**  
   - *What it does:* Presents a menu with scan options when QR alarms run that makes scanning codes easier, so you don’t have to manually open the camera.

4. *(Optional)* **When “Calendar” is closed** → run shortcut **Calendar Alarms Engine**  
   - *What it does:* If you edited any calendar events, this reschedules their alarms immediately upon closing the Calendar app.

5. *(Optional)* **When “Clock” is closed** → run shortcut **Calendar Alarms qrClockCloser**  
   - *What it does:* Prevents users from opening the Clock app when a QR alarm is active, stopping them from “breaking the rules” by disabling active QR alarms without scanning.

---

# 2) How to Use: Creating an alarm

Alarms are created via JSON code in the Notes section of a Calendar event. Think of JSON as a specific way of writing out a list of settings. It’s picky about punctuation, but the rules are simple. For more detailed information, you can check out [this article](https://stackoverflow.blog/2022/06/02/a-beginners-guide-to-json-the-data-format-for-the-internet/) from StackOverflow.

---

## Example Alarm Template

For our purposes, a JSON alarm looks like the template below. This JSON block includes **two alarms**—but any number is possible. The one with “all keys” includes all available settings (called “keys”), and the second shows a pared-down alarm that omits settings the user doesn’t care about.

```json
[
  {
    "alarmName": "your alarm name here",
    "status": "ON or OFF",
    "offsetMin": "number of minutes from the start or end of the event. Neg=before, Pos=after. Also accepts a string like “2h”, “-6d”, “+15m” (no decimals)",
    "reference": "START or END",

    "qrCodeID": "your_ID_here",
    "qrSoundPath": "filename.mp3",
    "qrVol": "volume, 1 to 100",
    "qrShortcutsOnScan": [{"name": "optional shortcut name here", "input": ["optional input 1", "optional input 2"]}],

    "shortcutsOnTrigger": [{"name": "optional shortcut name here", "input": ["optional input 1"]}],
    "silenceAlarm": "set to true or false, useful for silently running a shortcut"

    "locationMode": "whitelist, blacklist, or off -> whitelist = reschedule if not here, blacklist = reschedule if here",
    "locations": [[0, 0, 0], [0, 0, 0]],

    "silenceIfDriving": "ON",
    "conflictingCalendars": ["work meetings", "vacation"],
    "reschedMinutes": "reschedule_interval_in_minutes",
    "taskIDs": ["task_ID", "task_ID"],
    "taskLoopMin": "minutes_between_repeat_checks",
    "maxReschedules": "max_number_of_reschedules"
  },
  {
    "alarmName": "your second alarm name here",
    "status": "ON or OFF",
    "offsetMin": "number of minutes from the start or end of the event",
    "reference": "START or END"
  }
]
```

`Tip: add a calendar name to DISABLED_CALENDAR_NAMES (see scriptable step above), and keep a daily recurring event in that calendar with this template for easy copy/pasting. This is useful as most alarms will not use all properties.`

## What are the Formatting Rules?
- General Rules
  - You can delete unwanted settings: alarmName is required, but you can delete any other "key": "value" pair (setting) you don’t want. Missing keys are filled with safe defaults (usually equivalent to “off” for optional features). Just don’t change the names of any keys.

  - Unlimited lists: If a value is shown in brackets (like locations), you can include as many values as you want, separated by commas.
  - You can also have as many alarms as you want on one event by copying/pasting the {} alarm objects, with commas between each, as shown above.

  - Avoid duplicates: Don’t create a Calendar Alarm with the exact same name + time as a normal (non-calendar) alarm. Failure to do so can lead to old alarms not being properly deleted due to ambiguity over what is “owned” by Calendar Alarms.

- JSON Punctuation Rules
  - Keys and text values are in quotes, but number values are not. Use regular quotes (" ") NOT smart quotes (“ ”).

  - Commas separate all key/value pairs, all items in arrays [], and all objects {}. Watch out for missing or trailing commas. Extra spaces don’t matter.

  - Do not write comments inside the outer brackets [] of the JSON block. Write other notes above or below.

  - The shortcut will notify you of an error if any of these are wrong. When in doubt, your problem is commas or quotes (missing, misplaced, or extra).

- Shortcut action format
  - Preferred format: use objects like `{"name": "Shortcut Name", "input": ["item1", "item2"]}` for `qrShortcutsOnScan`, and objects like `{"name": "Shortcut Name", "input": ["item1"]}` inside `shortcutsOnTrigger`.
  - `input` should be a real JSON array (not a string that contains brackets).
  - Required format: `qrShortcutsOnScan` and `shortcutsOnTrigger` should be arrays of objects with `name` and `input`. Use top-level `silenceAlarm` (default `false`) once per alarm.

## Example Single Alarm for Completing a task called “Plan Workday” on an event called “Work” (includes all possible keys)
json
Copy code
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
    "taskIDs": ["plan_workday", "check_tasks"],
    "taskLoopMin": 5,
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

- Task looping logic

  - If the user has not completed all configured taskIDs (from a separate Google Sheets habits system), this loop checks again every taskLoopMin minutes (5 minutes in this example).

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
    "taskRow": 15,
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

## Advanced: Using QR Alarms
- Every QR alarm needs a matching QR code. QR codes are just text stored in an image. In this system, the “text” is a Shortcuts URL that launches the QR Scanner shortcut with an input value. Multiple alarms can share the same code.

- QR code format (copy/paste): Replace YOUR_ID with your chosen qrCodeID, and make sure it matches the qrCodeID in your alarm JSON. Your qrCodeID can be anything you want, but it can’t include spaces.

  - ```shortcuts://run-shortcut?name=Calendar%20Alarms%20QR%20Scanner&input=YOUR_ID```
- How to turn off a QR alarm: Scan the code using either the iPhone Camera app, or the Calendar Alarms QR Scanner shortcut directly.

- Reliability note (iOS limitation): On low battery or under heavy system load, iOS may silently decide not to run an alarm-triggered automation. If that happens, a QR alarm may stop re-triggering after a few minutes, even though it hasn’t been scanned yet.

  - Mitigation: the system uses a backup alarm to increase reliability, but it’s not foolproof.

  - Stale alarms: unattended QR loops expire after 1 hour, after which the system will automatically delete them.

## Advanced: Using “TaskIDs” to make repeat-until-complete alarms
- This feature requires the use of the “Google Sheets Habits” shortcut system.

- If taskIDs is not empty, the alarm becomes a repeat-until-complete loop (it keeps coming back until the task is complete).

- Repeat-until-complete can work for both QR and non-QR alarms.

- Logic Flow:
  - alarm rings → you scan QR → after taskLoopMin minutes it checks again → if still incomplete it re-arms QR and rings again → stops once complete.

  - Example usage: make your wakeup alarm continue triggering every 5 minutes until you have logged that you brushed your teeth.
