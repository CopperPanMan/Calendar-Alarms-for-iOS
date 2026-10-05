# JSON Alarm Reference

Use the [Alarm Editor](https://copperpanman.github.io/Calendar-Alarms-for-iOS/) for visual configuration. This reference is for writing JSON directly, generating configurations with AI, or understanding exported fields. For user instructions, start with [Feature Reference](Feature%20Reference.md).

## Structure and formatting

Put one JSON array in a calendar event's **Notes**. Each object in it is one alarm; use several objects for several alarms. Ordinary notes can go above or below the array. Do not put comments inside it or paste a second alarm block into the same event.

```json
[
  { "alarmName": "Prepare for meeting", "offsetMin": -15, "reference": "start" },
  { "alarmName": "Meeting ends", "offsetMin": 0, "reference": "end" }
]
```

Use straight double quotes for keys and text, unquoted numbers and Booleans, and commas between entries. Do not use trailing commas. **alarmName** is required; other fields can be omitted. Avoid an unrelated Clock alarm with the same name and time, because identical alarms cannot be distinguished reliably.

## Full editable template

This is valid JSON, with the alarm initially **OFF**. Remove unused fields; fill the relevant lists when enabling optional behavior. Choose an installed sound when using QR.

```json
[
  {
    "alarmName": "Template",
    "status": "OFF",
    "offsetMin": 0,
    "reference": "start",
    "qrCodeID": "",
    "qrSoundPath": "marimba.mp3",
    "qrVol": 40,
    "qrShortcutsOnScan": [],
    "shortcutsOnTrigger": [],
    "silenceAlarm": false,
    "locationMode": "off",
    "locations": [],
    "silenceIfDriving": "OFF",
    "conflictingCalendars": [],
    "reschedMinutes": { "min": 10, "max": 45 },
    "maxReschedules": 2,
    "taskIDs": [],
    "taskLoopMin": 30,
    "checkTasksFirstTime": true
  }
]
```

## Scheduling fields

These are defaults used by the Engine when a field is absent. The Editor and the template deliberately supply some different starting values, such as two reschedules and a 30-minute task interval.

| Field | Meaning | Engine default / limits |
| --- | --- | --- |
| `alarmName` | Label of the Clock alarm | Required nonempty text |
| `status` | Enable or disable the definition | `"ON"`; `"ON"` or `"OFF"` |
| `offsetMin` | Offset from the selected event boundary | `0`; integer minutes or integer unit text, such as `"-2h"`, `"+15m"`, or `"-6d"`; within ±7 days |
| `reference` | Event boundary used for the offset | `"start"`; `"start"` or `"end"` |

Calendar source events are searched around the current date to account for offsets. New Clock alarms are normally scheduled within the next 24 hours; future definitions remain in their events until relevant. After an edit has reached Apple Calendar, run **Calendar Alarm Engine** for an immediate sync, including after a timezone change.

## QR fields

See [QR Alarms](Guides/QR%20Alarms.md) for printing codes, testing, and custom sounds.

| Field | Meaning | Engine default / limits |
| --- | --- | --- |
| `qrCodeID` | Nonempty ID enables QR prompting | Empty; use URL-safe letters, numbers, `- . _ ~`, without spaces. IDs are case-sensitive. Generate the link/code in the Editor. |
| `qrSoundPath` | Sound inside Alarm Tones; subfolders supported | Legacy default `"ringtone.mp3"`, which is **not installed**. Supply an installed tone such as `"marimba.mp3"`. `"Nature/ocean.mp3"` and `"Alarm Tones/Nature/ocean.mp3"` identify a subfolder sound. |
| `qrVol` | QR media volume percentage | `40`; integer 1–100 |
| `qrShortcutsOnScan` | Ordered action/Shortcut entries after a matching active scan | `[]`; transport format below |
| `qrSoundLen` | Legacy duration in seconds | `2.13`; current cached-audio readouts measure the actual duration and do not rely on this value |

The current Engine uses a +2-minute restart and +4-minute backup. These are implementation settings, not calendar JSON keys. A scan stops the QR instance; an independent task follow-up can remain. Continuous playback is subject to Shortcut execution limits.

## Actions and silent alarms

| Field | Meaning | Default |
| --- | --- | --- |
| `shortcutsOnTrigger` | Ordered action/Shortcut entries after context checks pass | `[]` |
| `silenceAlarm` | Silence the native fire while its actions run | `false` |

Each Shortcut entry has an exact `name` and optional `input` list. Inputs are transported as text; a receiving Shortcut should convert numeric values if needed. For example:

```json
[
  {
    "alarmName": "Begin work",
    "shortcutsOnTrigger": [
      { "name": "Turn Desk Lights On", "input": ["work"] },
      {
        "name": "Calendar Alarms Actions",
        "input": ["{\"action\":\"timer\",\"operation\":\"start\",\"minutes\":25}"]
      }
    ],
    "silenceAlarm": true
  }
]
```

The built-in action payload is one serialized JSON object in one input string. The Editor handles escaping automatically. Use the same entry format in `qrShortcutsOnScan`. For action payloads, see [Actions JSON Schema](Calendar%20Alarms%20Actions%20Schema.md); for practical examples, see [Actions](Guides/Actions.md).

## Context and retry fields

See [Rescheduling](Guides/Rescheduling.md) for examples and the meaning of the Editor's Range/Fixed controls.

| Field | Meaning | Engine default / limits |
| --- | --- | --- |
| `locationMode` | `"whitelist"` runs only inside a listed location; `"blacklist"` blocks inside it | `"off"` |
| `locations` | Coordinate triples: `[[latitude, longitude, radiusMeters], ...]` | `[]`; radius 1–500 meters, default 50 when omitted |
| `silenceIfDriving` | Block the fire while Driving Focus is active | `"OFF"`; `"ON"` enables it |
| `conflictingCalendars` | Exact Apple Calendar names whose overlapping events can postpone the alarm | `[]` |
| `reschedMinutes` | Context fallback and maximum considered conflict/travel delay | Missing: `{ "min": 0, "max": 45 }`; values 0–500, with max at least min |
| `maxReschedules` | Shared allowance for future task/context follow-ups | `1`; integer 0–10 |

For example, `"reschedMinutes": { "min": 10, "max": 45 }` uses ten minutes for driving, blacklist matches, or unavailable location, and considers conflict/travel candidates within 45 minutes. The latest applicable candidate wins. This is **not a random range**. A calendar conflict candidate is the latest overlapping event's end plus ten minutes.

The legacy number form `"reschedMinutes": 30` is treated as `{ "min": 30, "max": 45 }`; its effective max is raised if min is greater. It is not a strict fixed delay for every condition. A zero fallback disables fallback retries. QR-only restarts do not spend `maxReschedules`. A blocked ordinary alarm with no available follow-up is silenced rather than forced to run.

## Task fields

Requires the [OpenHabits integration](Guides/OpenHabits%20Integration.md), including its cache refresh Shortcut.

| Field | Meaning | Engine default / limits |
| --- | --- | --- |
| `taskIDs` | Exact metric IDs; all must be complete to stop the chain | `[]`; array of strings, not a display name or row number |
| `taskLoopMin` | Minutes between task checks after context gates pass | `0`; supply a positive integer, up to 500, when task IDs are used |
| `checkTasksFirstTime` | Check completion at the initial eligible fire | `true`; `false` skips that first check only |

A missing metric, stale cache, or failed refresh does not prove completion. Current task checks use explicit completion flags in `reminderState.byID`. The runtime refreshes task state through **Calendar Alarms Actions**; do not configure a `TASK_WEBAPP_ID` in the Engine.

```json
[
  {
    "alarmName": "Plan my workday",
    "offsetMin": 0,
    "reference": "start",
    "taskIDs": ["started_day"],
    "taskLoopMin": 30,
    "maxReschedules": 2,
    "checkTasksFirstTime": true,
    "qrCodeID": "desk",
    "qrSoundPath": "marimba.mp3",
    "qrVol": 40
  }
]
```

This example requires `started_day` to exist in Metrics. If incomplete, it can prompt initially and schedule two task follow-ups. Scanning `desk` stops the current QR prompt without marking the metric complete or removing its independent task check.

## Sleep event example

Put this on a recurring timed event named **Sleep**. The corrected **CA Wake Times** Shortcut shifts the event while preserving its original duration.

```json
[
  {
    "alarmName": "Bedtime in one hour",
    "offsetMin": -60,
    "reference": "start"
  },
  {
    "alarmName": "Wake up",
    "offsetMin": 0,
    "reference": "end",
    "qrCodeID": "bathroom",
    "qrSoundPath": "ocean.mp3",
    "qrVol": 40
  }
]
```

For an 11 p.m.–7 a.m. event, these fire at 10 p.m. and 7 a.m. See [Wake Times](Feature%20Reference.md#wake-times) for event setup. Registry scheduling fields, playback session IDs, and task-reset payloads are internal runtime state; do not add them to event JSON.
