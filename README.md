# iOS Calendar Alarms

## What is this?

Calendar Alarms for iOS is the most powerful alarm "app” available today, and it’s not even an app. Instead, it’s a handful of shortcuts and automations entirely owned by you, for free, forever.
In addition to your normal iOS clock app functionality, iOS Alarms can now be set using the notes section of your calendar events. For instance:

- **Never oversleep with the QR code scanning feature -** By setting QR code alarms, you can force yourself to go to any place, at any time.
- **Never miss a deadline** - set 3 staggered alarms for your flight in 3 months right from its calendar event so you never check in or leave late again!
- **Run custom shortucts from alarms** - run your own shortcuts upon a specific alarm going off or a qr alarm-code being scanned - like turning your lights on, or sending a text
- **Keep your clock app clutter free** - No more irrelevant old alarms. Class was cancelled? If the calendar alarm is outdated or the event no longer exists, the system deletes it from the clock app for you.
- **Get notified only when it counts** – this system can automatically reschedule alarms to a better time, like if you’re driving, if you have a conflicting meeting, if you aren’t at work or home yet, and even more.

## How does it work?



You write small JSON “alarm definitions” inside a Calendar event’s Notes. The system converts those into iOS Clock alarms, and maintain runtime behavior for some more complex features, such as optional QR-codes to turn off, and optional rescheduling behavior for things like calendar conflicts, driving, or location settings.

The important bit: this system does not effect normal usage of your calendar or clock app. It only adds functionality to what your phone can currently do. It runs entirely on your own device and using your own iCloud account - no 3rd party servers, here.

### Next Step >> [Setup Guide](https://github.com/CopperPanMan/Calendar-Alarms/blob/main/Setup%20Guide.md)

## Alarm JSON GUI Editor (GitHub Pages friendly)

This repo now includes a static web editor in `docs/` for creating and editing calendar alarm JSON with a form-based GUI (including advanced settings, add/delete alarm, paste/load existing JSON, and output/copy-to-clipboard support).

To publish it with GitHub Pages, set Pages to deploy from the **`/docs` folder on your branch** and open `docs/index.html`.
