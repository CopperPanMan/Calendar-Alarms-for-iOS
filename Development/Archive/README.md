# Historical implementation material

These files preserve earlier implementation work. They are not current installation instructions or authoritative runtime contracts.

- [System Requirements](System%20Requirements.md) describes the older sound loop, task endpoint, and native file handling. Current task checks use cached reminder completion state; do not add its `TASK_WEBAPP_ID` setting to the Engine.
- [Reminder Composer](Inline-Scriptable/OpenHabits%20Reminder%20Composer.js) and [Task Alarm Completion Evaluator](Inline-Scriptable/OpenHabits%20Task%20Alarm%20Completion%20Evaluator.js) are older standalone inline helpers. Current action readouts use **Calendar Alarms Runtime** for their roles. Their source is preserved unchanged for comparing or maintaining older customized Shortcuts.

The active [installer](../../Inline%20Scriptable/Calendar%20Alarms%20Installer.js) remains in **Inline Scriptable**. It installs three root scripts and six tones; it does not load these archived helpers. Moving the repository sources does not remove inline code already stored in a user's Shortcut.

For current development entry points, see [Development](../README.md); for normal installation, use the [Setup Guide](../../Setup%20Guide.md).
