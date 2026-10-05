# CA Wake Times

Checkpoint readout, 2026-10-05. See [checkpoint status and known issues](../Development/Runtime%20Checkpoint.md) before rebuilding.

`→ Name` names an action's magic variable; it is not an additional Set Variable action. Use actual magic variables in request fields, with the types shown. Named caches must use Set Variable, as written. Unless specified otherwise, Run Script means Scriptable, Run in App Off, Output Type Dictionary. Clear parameters explicitly where specified.

```jsx
DICTIONARY:
    op: clock_guard (Text)
    → GuardRequest
RUN SCRIPT: Calendar Alarms Runtime
    Parameter: GuardRequest
    → Guard
GET DICTIONARY VALUE:
    Dictionary: Guard
    Key: activeCount
    → GuardActiveCount (Number)
IF: GuardActiveCount is greater than 0
    SHOW NOTIFICATION:
        Body: An active QR alarm needs to be scanned first.
    STOP THIS SHORTCUT
END IF

DICTIONARY:
    op: wake_info (Text)
    → InfoRequest
RUN SCRIPT: Calendar Alarms Runtime
    Parameter: InfoRequest
    → Sleep
GET DICTIONARY VALUE:
    Dictionary: Sleep
    Key: error
    → SleepError (Text)
IF: SleepError has any value
    SHOW RESULT: SleepError
    STOP THIS SHORTCUT
END IF
IF: Shortcut Input has any value
    GET DICTIONARY VALUE:
        Dictionary: Sleep
        Key: notification
        → SleepNotification (Text)
    SHOW NOTIFICATION:
        Body: SleepNotification
    VIBRATE DEVICE
    GET DICTIONARY VALUE:
        Dictionary: Sleep
        Key: warning
        → SleepWarning (Text)
    IF: SleepWarning has any value
        GET CURRENT FOCUS:
            → ReportingFocus
        IF: ReportingFocus (Name) is Do Not Disturb
            SHOW NOTIFICATION:
                Body: SleepWarning
        OTHERWISE
            SPEAK TEXT: SleepWarning
        END IF
    END IF
    STOP THIS SHORTCUT
END IF

LIST:
    6:30
    7:30
    8:30
    Other
    Turn Off Alarms
    → WakeChoices
CHOOSE FROM LIST:
    List: WakeChoices
    Prompt: Wake Time
    Select Multiple: Off
    → Choice
IF: Choice is Turn Off Alarms
    OPEN APP: Clock
    STOP THIS SHORTCUT
END IF
IF: Choice is Other
    ASK FOR INPUT:
        Type: Time
        Prompt: Wake Time
        → CustomWakeTime
    FORMAT DATE:
        Input: CustomWakeTime
        Format: Custom
        Format String: HH:mm
OTHERWISE
    TEXT: Choice
END IF
// The preceding If Result is the selected HH:mm text.
DICTIONARY:
    op: wake_plan (Text)
    sleep: Sleep (Dictionary)
    time: If Result (Text)
    → PlanRequest
RUN SCRIPT: Calendar Alarms Runtime
    Parameter: PlanRequest
    → Wake
GET DICTIONARY VALUE:
    Dictionary: Sleep
    Key: start
    → SleepStart (Date)
GET DICTIONARY VALUE:
    Dictionary: Sleep
    Key: end
    → SleepEnd (Date)
GET DICTIONARY VALUE:
    Dictionary: Sleep
    Key: calendar
    → SleepCalendar (Text)
FIND CALENDAR EVENTS:
    All true:
        Title is Sleep
        Start Date is SleepStart
        End Date is SleepEnd
        Calendar is SleepCalendar
    → SleepEvent
GET DICTIONARY VALUE:
    Dictionary: Wake
    Key: endFirst
    → WakeEndFirst (Number)
GET DICTIONARY VALUE:
    Dictionary: Wake
    Key: start
    → WakeStart (Date)
GET DICTIONARY VALUE:
    Dictionary: Wake
    Key: end
    → WakeEnd (Date)
IF: WakeEndFirst is 1
    EDIT CALENDAR EVENT:
        Event: SleepEvent
        End Date: WakeEnd
        → UpdatedEvent1
    EDIT CALENDAR EVENT:
        Event: UpdatedEvent1
        Start Date: WakeStart
OTHERWISE
    EDIT CALENDAR EVENT:
        Event: SleepEvent
        Start Date: WakeStart
        → UpdatedEvent2
    EDIT CALENDAR EVENT:
        Event: UpdatedEvent2
        End Date: WakeEnd
END IF
// Use the existing shortcut's recurring-event scope: this occurrence.
RUN SHORTCUT: Calendar Alarm Engine
    Input: none — explicitly clear this field

GET DICTIONARY VALUE:
    Dictionary: Wake
    Key: hh
    → WakeHh (Number)
FIND ALARMS:
    All true:
        Hours is less than WakeHh
        Is Enabled is Yes
    → EarlierHours
COUNT: EarlierHours
    → Count1
GET DICTIONARY VALUE:
    Dictionary: Wake
    Key: mm
    → WakeMm (Number)
FIND ALARMS:
    All true:
        Hours is WakeHh
        Minutes is less than WakeMm
        Is Enabled is Yes
    → EarlierMinutes
COUNT: EarlierMinutes
    → Count2
GET DICTIONARY VALUE:
    Dictionary: Wake
    Key: wakeTime
    → WakeWakeTime (Text)
DICTIONARY:
    op: wake_warning (Text)
    count1: Count1 (Number)
    count2: Count2 (Number)
    wakeTime: WakeWakeTime
    → WarningRequest
RUN SCRIPT: Calendar Alarms Runtime
    Parameter: WarningRequest
    → Warning
GET DICTIONARY VALUE:
    Dictionary: Warning
    Key: message
    → WarningMessage (Text)
IF: WarningMessage has any value
    GET CURRENT FOCUS:
        → WarningFocus
    IF: WarningFocus (Name) is Do Not Disturb
        SHOW NOTIFICATION:
            Body: WarningMessage
    OTHERWISE
        SPEAK TEXT: WarningMessage
    END IF
    OPEN APP: Clock
END IF
GET DICTIONARY VALUE:
    Dictionary: Wake
    Key: notification
    → WakeNotification (Text)
SHOW NOTIFICATION:
    Body: WakeNotification
GET MY SHORTCUTS:
    Folder: All Shortcuts
    → MyShortcuts
IF: MyShortcuts (Names) contains Log Sleep Time
    RUN SHORTCUT: Log Sleep Time
        Input: none
END IF
```
