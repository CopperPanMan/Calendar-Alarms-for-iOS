# JSON Alarm Reference

Advanced users may wish to directly create and edit alarms from raw JSON. This reference document is made for that.

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
    "reschedMinutes": { "min": 10, "max": 45 },
    "maxReschedules": 2

    "taskIDs": "",
    "taskLoopMin": 30,
    "checkTasksFirstTime": true,
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
- reschedMinutes: number OR { "min": number, "max": number }. Number mode is backward-compatible and treated as { "min": number, "max": 45 }.
  - `min` is the fallback delay for context gates such as driving, blacklist matches, or an unavailable current location. A value of `0` disables that fallback; `maxReschedules` does not supply a delay by itself.
  - `taskLoopMin` is only used after an alarm passes its context gates and its task is found incomplete. It is not used as the fallback when location cannot be fetched.
- maxReschedules: "max_number_of_reschedules"
- taskIDs: list of metrics, like: ["metricID1","metricID2"]
- taskLoopMin: the duration to loop at.
- checkTasksFirstTime: if false, the first non-rescheduled task-loop fire skips the task-completion check and is treated as incomplete; all other rescheduling logic still applies.

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
    "reschedMinutes": { "min": 30, "max": 90 },
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

  - If this alarm triggers while inside a conflicting event from any calendars named "work meetings", "vacation", or "travel", it will reschedule to after the event ends plus a 10 minute buffer **only if that delay is within reschedMinutes.max**.

  - If the user is not within 200 meters of the work coordinates, it estimates travel time and reschedules only when the estimate is within `reschedMinutes.max`.
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

To do so: run Calendar Alarms Engine once manually after adding or editing your alarm(s). This forces a sync. After it runs, any alarm scheduled to go off today (even from events ±7 days with offsetMin values that put them in range of today) should now exist in the Clock app. If you cross timezones, running the engine also lets Calendar Alarms clean up the old local Clock time it created and recreate/keep the alarm at the phone’s current local time.
