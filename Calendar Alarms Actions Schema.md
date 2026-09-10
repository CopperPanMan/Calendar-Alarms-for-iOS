# Calendar Alarms Actions JSON Schema

`Calendar Alarms Actions` performs one logical action per invocation. Calendar Alarm Engine passes exactly one serialized JSON object as one string in the Shortcut input array. To sequence actions, add multiple entries to `shortcutsOnTrigger` or `qrShortcutsOnScan`.

```json
{
  "name": "Calendar Alarms Actions",
  "input": ["{\"action\":\"timer\",\"operation\":\"start\",\"minutes\":15}"]
}
```

The Alarm Editor creates this transport representation automatically. Custom Apple Shortcuts continue to use the same `{ "name", "input" }` format directly.

## Actions

### Notification

```json
{ "action": "notification", "message": "Leave in 15 minutes", "mode": "both", "title": "Commute" }
```

- `message`: required non-empty string.
- `mode`: optional `show`, `speak`, or `both`; defaults to `show`.
- `title`: optional string used for displayed notifications; defaults to empty and is not spoken.

### Timer

```json
{ "action": "timer", "operation": "start", "minutes": 15 }
```

`operation` is `start` or `cancel`. `minutes` is required and greater than zero only for `start`; decimal minutes are supported.

### Focus

```json
{ "action": "focus", "name": "Work", "state": "on" }
```

`name` is the exact Focus name and `state` is `on` or `off`.

### Display

```json
{ "action": "display", "operation": "color_filters", "state": "on" }
{ "action": "display", "operation": "brightness", "percent": 30 }
{ "action": "display", "operation": "appearance", "mode": "dark" }
```

- `color_filters` turns the Color Filters setting on or off. The user chooses the actual filter in iOS Settings.
- `brightness` accepts `percent` from 0 through 100. Calendar Alarms Actions converts it to the native 0–1 brightness value.
- `appearance` accepts `light` or `dark`.

### Open

```json
{ "action": "open", "operation": "app", "appName": "Notion" }
{ "action": "open", "operation": "url", "url": "notion://..." }
{ "action": "open", "operation": "home_screen" }
{ "action": "open", "operation": "lock_screen" }
```

### OpenHabits Reminder

```json
{ "action": "openhabits_reminder", "metricIDs": ["floss_time"], "mode": "both" }
```

`metricIDs` must contain one or more non-empty strings. `mode` is optional and defaults to `show`.

### Audio

```json
{ "action": "audio", "operation": "volume", "percent": 60 }
{ "action": "audio", "operation": "silent_mode", "state": "on" }
```

`volume` controls media volume and accepts a percentage from 0 through 100. `silent_mode` accepts `on` or `off`.

### Cue

```json
{ "action": "cue", "operation": "haptic" }
{ "action": "cue", "operation": "sound", "file": "chime.mp3" }
```

### Internal task-alarm reset

Calendar Alarm Engine generates this action for task-loop alarms. It is reserved for the engine and is intentionally absent from the Alarm Editor.

```json
{
  "action": "task_alarm_reset",
  "taskLoopMetricIDs": ["floss_time"],
  "qrCodeID": "morning",
  "alarmToDelete": { "name": "Morning Tasks", "hh": "07", "mm": "30" }
}
```

## Validation

Calendar Alarms Actions validates the entire object before performing the requested behavior. Invalid JSON, non-object input, unknown actions or operations, missing or incorrectly typed fields, and out-of-range numbers must show a clear error and stop. Values are not silently coerced. Defaults apply only to the optional fields documented above.

An invocation must not contain multiple actions. Operation-specific payloads should contain only fields relevant to that operation.
