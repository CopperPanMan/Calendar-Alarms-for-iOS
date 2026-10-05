# Actions and custom Shortcuts

[Feature Reference](../Feature%20Reference.md) · [Alarm Editor](https://copperpanman.github.io/Calendar-Alarms-for-iOS/)

Actions let an alarm show a reminder, start a timer, change a setting, or run a Shortcut you already use.

## Add actions to an alarm

Under **Advanced Settings → Trigger & Silence Properties**, choose **+ Add Action on Trigger** and select an **Action Type**. To run something after a QR scan instead, use **+ Add QR Action on Scan** under **QR Alarm Properties**. Fill in the fields for that action; add more actions and use the arrows to put them in order.

Copy the updated configuration back into the event's notes and sync it. Trigger actions run after the alarm passes any driving, location, or calendar gates. Task-check fires can run them again while the task is incomplete; QR-only playback restarts do not rerun them.

Enable **Silence Alarm** to have the native alarm silence itself while actions run. This requires its automation to execute, so it may ring briefly first. That setting does not replace the scan requirement for a QR alarm. For a silent scheduled action, use an alarm without a QR ID.

## Choose an action

| Action Type | Configure | Useful detail |
| --- | --- | --- |
| Notification | Message; Show, Speak, or Speak + Show; optional title | A title appears in the notification and is not spoken. Do Not Disturb changes spoken output to displayed text. |
| Timer | Start with a positive duration in minutes, or Cancel | Decimal minutes work. Cancel operates on the current timer, not a timer identified by this event. |
| Focus | Exact Focus name and On/Off | Create the Focus in iOS Settings first. On lasts until turned off. |
| Display | Color Filters, Brightness, or Appearance | Choose the actual color filter in iOS Settings first. Brightness is 0–100%; Appearance is Light/Dark. |
| Open App / URL / Screen | App, URL/deep link, Home Screen, or Lock Device | App names must match. Try the destination manually first; some destinations require an unlocked phone. |
| OpenHabits Reminder | Metric IDs and output mode | Requires the [OpenHabits integration](OpenHabits%20Integration.md#show-or-speak-a-reminder). |
| Volume / Audio | Media Volume or Silent Mode | Media volume is 0–100%; it is separate from the native Clock alarm's sound controls. Native action availability can vary by device. |
| Cue | Haptic or Sound | For a sound, supply a file in [Alarm Tones](QR%20Alarms.md#use-your-own-sound), such as `marimba.mp3`. A cue plays once. |
| Run Custom Shortcut | Shortcut name and optional inputs | Use the exact installed name. See below. |

These actions change the requested setting; they do not automatically restore its previous value. Add another scheduled action if you want to restore it later.

## Example: a silent work-session reminder

On an event called **Focused Work**, add an alarm at offset `0`, reference **start**, and enable **Silence Alarm**. Add these trigger actions in order:

1. **Focus:** Work → On.
2. **Timer:** Start → 25 minutes.
3. **Notification:** “Choose one task and begin.” → Speak + Show.

Test on an event a few minutes ahead with the phone unlocked. Expect the native alarm to be silenced, Work Focus to turn on, a timer to start, and the message to appear and/or be spoken according to your current Focus. Approve permissions and repeat the test before using it while locked.

## Run your own Shortcut

Select **Run Custom Shortcut** and enter the exact name of a Shortcut installed on your phone. For example, a Shortcut named **Turn Desk Lights On** can run at the start of a work event without any input.

If it needs input, add the input items in the Editor. One item supplies one value; several items supply a list. Read **Shortcut Input** in your receiving Shortcut. The Engine converts transported items to text, including numbers, so convert them inside your Shortcut if necessary.

A simple test Shortcut named **Show Alarm Input** can use **Show Result → Shortcut Input**. Add it to an alarm with an input of `work`; confirm it receives that value. Then replace the test Shortcut with your own action.

Run a custom Shortcut manually first to grant its permissions. Recheck its name if you rename it. For imported Shortcuts, a **Run Shortcut** action may need to be reconnected by selecting the installed Shortcut again.

For JSON payloads and direct calls to **Calendar Alarms Actions**, see the [Actions JSON Schema](../Calendar%20Alarms%20Actions%20Schema.md). An invocation performs one action; sequence several by adding separate action entries.
