# Demo Alarms

[Setup Guide](../Setup%20Guide.md#run-the-demo) · [Feature Reference](../Feature%20Reference.md)

Use this page alongside the Setup Guide. Copy the configuration below into your demo event’s notes, then return to [Run the Demo](../Setup%20Guide.md#run-the-demo) to schedule and test it. Keep this page open for the alarm explanations and QR code.

## Only have your iPhone?

To skip the QR alarm, paste the configuration below into the [Calendar Alarm Editor](https://copperpanman.github.io/Calendar-Alarms-for-iOS/), delete the final alarm (**Demo 3**), and copy the updated configuration into your event’s notes. You will have two demo alarms instead of three.

Without the third alarm, the timer started by Demo 2 will ring after about a minute. Dismiss it normally; the spoken message about the next alarm stopping it applies only to the full three-alarm demo.

## Demo Event Configuration Block

You don’t need to understand or edit this code. Copy the entire block, including the opening `[` and closing `]`, into your event’s notes. Use the Editor if you want to change its settings.

```json
[
  {
    "alarmName": "Demo 1: This is a basic alarm.",
    "status": "ON",
    "offsetMin": 0,
    "reference": "start"
  },
  {
    "alarmName": "Demo 2: This alarm silently runs scheduled actions.",
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
        "input": ["{\"action\":\"notification\",\"message\":\"This alarm silenced itself and started a timer. The next alarm will stop it.\",\"mode\":\"both\"}"]
      }
    ],
    "silenceAlarm": true
  },
  {
    "alarmName": "Demo 3: Scan the QR code to complete the demo.",
    "status": "ON",
    "offsetMin": 2,
    "reference": "start",

    "shortcutsOnTrigger": [
      {
        "name": "Calendar Alarms Actions",
        "input": ["{\"action\":\"timer\",\"operation\":\"cancel\"}"]
      }
    ],
    "qrShortcutsOnScan": [
      {
        "name": "Calendar Alarms Actions",
        "input": ["{\"action\":\"notification\",\"message\":\"Calendar Alarms demo complete\",\"mode\":\"speak\"}"]
      }
    ],
    "qrCodeID": "wakeup",
    "qrSoundPath": "marimba.mp3",
    "qrVol": 50
  }
]
```

Return to [Run the Demo](../Setup%20Guide.md#run-the-demo) to set the event’s start time and schedule the alarms.

## What to Expect

1. **Alarm 1: A regular alarm.** It rings like an alarm you created in Clock. Dismiss it normally.
2. **Alarm 2: Automatically run actions.** One minute later, a self-silencing alarm starts a timer, displays a notification, and speaks a short explanation. You do not need to dismiss a ringing alarm.
3. **Alarm 3: Scan a QR code.** One minute after Alarm 2, the QR alarm cancels the timer and starts repeating `marimba.mp3`. Tap the QR notification and choose **Scan QR Code**, then scan the code below. You can also scan it with the iPhone Camera app and tap the Shortcuts link. Scanning the matching code completes the QR alarm and speaks a final confirmation. A sound already playing may finish.

## Demo QR Code

Scan this code when Demo 3 is active. If you skipped that alarm, you can skip this step too.

<img width="150" height="150" alt="QR code that completes the wakeup demo alarm" src="https://github.com/user-attachments/assets/11fb4111-eaa3-4d8f-8027-b7e0dd954c9d" />

This code matches the demo’s QR Code ID, `wakeup`. To create your own code, see [QR Alarms](QR%20Alarms.md#set-one-up).

If the notification or scan menu is missing, use the Camera method above or follow [QR troubleshooting](Troubleshooting%20and%20Maintenance.md#qr-alarm-problems). If the sound file is missing, rerun **Calendar Alarms Actions** to restore the built-in tones; see [sound troubleshooting](Troubleshooting%20and%20Maintenance.md#the-sound-is-missing-pauses-or-reports-a-file-error).

For retry timing and expiration behavior, see [What happens while it is active?](QR%20Alarms.md#what-happens-while-it-is-active).

After completing the demo, return to the [Setup Guide](../Setup%20Guide.md#run-the-demo) for the second run and next steps.
