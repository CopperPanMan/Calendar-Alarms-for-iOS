# CA qrClockCloser

Full action readout, 2026-10-14, for Calendar Alarms Runtime in this branch. The guard flow is unchanged. Updating this file does not update the published iCloud Shortcut.

`→ Name` names an action's magic variable; it is not an additional Set Variable action. Use actual magic variables in request fields, with the types shown. Named caches must use Set Variable, as written. Unless specified otherwise, Run Script means Scriptable, Run in App Off, Output Type Dictionary. Clear parameters explicitly where specified.

Retain this separate shortcut on **both iOS 26 and iOS 27**. Testing found that opening Clock did not reliably invoke an already-running Engine, while qrClockCloser ran. This is an observation, not a confirmed Apple concurrency rule.

```jsx
DICTIONARY:
    op: clock_guard (Text)
    → Request
RUN SCRIPT: Calendar Alarms Runtime
    Parameter: Request
    → Guard
GET DICTIONARY VALUE:
    Dictionary: Guard
    Key: activeCount
    → GuardActiveCount (Number)
IF: GuardActiveCount is greater than 0
    GO TO HOME SCREEN
    GET DICTIONARY VALUE:
        Dictionary: Guard
        Key: notification
        → GuardNotification (Text)
    SHOW NOTIFICATION:
        Body: GuardNotification
END IF
STOP AND OUTPUT:
    Output: GuardActiveCount
```
