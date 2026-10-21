# CA Wake Times

Full replacement action readout, 2026-10-19, for Calendar Alarms Runtime in this branch. It uses the existing short runtime-based flow, including exact disabled-calendar matching and preservation of the original Sleep event duration. Updating this file does not update the published iCloud Shortcut.

`→ Name` names an action's magic variable; it is not an additional Set Variable action. Use actual magic variables in request fields, with the types shown. Named caches must use Set Variable, as written. Unless specified otherwise, Run Script means Scriptable, Run in App Off, Output Type Dictionary. Clear parameters explicitly where specified.

The guard count is a **Number**. The helper still returns the legacy `endFirst` Boolean, but native editing must always set Start Date first and End Date last. `wake_info` filters complete calendar names after trimming configured names, with the shared Shortcut's ten-hour lookback. `wake_plan` now preserves the event's actual elapsed duration, including daylight-saving changes. Native actions below edit Calendar and Clock; the Runtime handles selection, arithmetic, and messages. Turn Off Alarms opens Clock for manual control. Install the matching Runtime before rebuilding.

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
IF: SleepError is not [blank]
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
    IF: SleepWarning is not [blank]
        GET CURRENT FOCUS:
            → ReportingFocus
        IF: ReportingFocus (Name) is Do Not Disturb
            SHOW NOTIFICATION:
                Body: SleepWarning
        OTHERWISE
            SPEAK TEXT:
                Text: SleepWarning
                Wait Until Finished: On
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
        → CustomWakeText
    SET VARIABLE: WakeTime to CustomWakeText
OTHERWISE
    SET VARIABLE: WakeTime to Choice (Text)
END IF
DICTIONARY:
    op: wake_plan (Text)
    sleep: Sleep (Dictionary)
    time: WakeTime (Text)
    → PlanRequest
RUN SCRIPT: Calendar Alarms Runtime
    Parameter: PlanRequest
    → Wake
GET DICTIONARY VALUE:
    Dictionary: Sleep
    Key: start
    → SleepStartISO (Text)
DATE: Specified Date = SleepStartISO (Date coercion)
    → SleepStart (Date)
GET DICTIONARY VALUE:
    Dictionary: Sleep
    Key: end
    → SleepEndISO (Text)
DATE: Specified Date = SleepEndISO (Date coercion)
    → SleepEnd (Date)
GET DICTIONARY VALUE:
    Dictionary: Sleep
    Key: calendar
    → SleepCalendar (Text)
ADJUST DATE: Subtract 1 second from SleepStart
    → SearchLower
ADJUST DATE: Add 1 second to SleepStart
    → SearchUpper
FIND CALENDAR EVENTS:
    All true:
        Start Date is between SearchLower and SearchUpper
        Title is Sleep
        Calendar is SleepCalendar
    Limit: Off
    → Candidates
NOTHING
SET VARIABLE: MatchingSleepEvents to Nothing
REPEAT WITH EACH: Candidates
    GET DETAILS OF CALENDAR EVENTS: Start Date of Repeat Item
        → CandidateStart
    GET DETAILS OF CALENDAR EVENTS: End Date of Repeat Item
        → CandidateEnd
    GET DETAILS OF CALENDAR EVENTS: Calendar of Repeat Item
        → CandidateCalendar
    TEXT: [CandidateCalendar]
        → CandidateCalendarText
    GET DETAILS OF CALENDAR EVENTS: Title of Repeat Item
        → CandidateTitle
    GET TIME BETWEEN DATES: SleepStart and CandidateStart, Seconds
        → StartDifference
    GET TIME BETWEEN DATES: SleepEnd and CandidateEnd, Seconds
        → EndDifference
    IF: StartDifference is 0
        IF: EndDifference is 0
            IF: CandidateCalendarText is SleepCalendar
                IF: CandidateTitle is Sleep
                    ADD TO VARIABLE: MatchingSleepEvents = Repeat Item
                END IF
            END IF
        END IF
    END IF
END REPEAT
COUNT: MatchingSleepEvents
    → MatchingSleepCount (Number)
IF: MatchingSleepCount is not 1
    SHOW NOTIFICATION:
        Body: Sleep event changed while choosing wake time. Run CA Wake Times again.
    STOP THIS SHORTCUT
END IF
GET ITEM FROM LIST:
    List: MatchingSleepEvents
    Item: First Item
    → SleepEvent (Calendar Event)
GET DICTIONARY VALUE:
    Dictionary: Wake
    Key: endFirst
    → WakeEndFirst (Boolean)
GET DICTIONARY VALUE:
    Dictionary: Wake
    Key: start
    → WakeStartISO (Text)
DATE: Specified Date = WakeStartISO (Date coercion)
    → WakeStart (Date)
GET DICTIONARY VALUE:
    Dictionary: Wake
    Key: end
    → WakeEndISO (Text)
DATE: Specified Date = WakeEndISO (Date coercion)
    → WakeEnd (Date)
// Native Start Date editing also shifts the end. Apply the intended end LAST.
// Both actions target the saved SleepEvent; do not chain the first edit output.
EDIT CALENDAR EVENT:
    Event: SleepEvent
    Start Date: WakeStart
EDIT CALENDAR EVENT:
    Event: SleepEvent
    End Date: WakeEnd
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
IF: WarningMessage is not [blank]
    GET CURRENT FOCUS:
        → WarningFocus
    IF: WarningFocus (Name) is Do Not Disturb
        SHOW NOTIFICATION:
            Body: WarningMessage
    OTHERWISE
        SPEAK TEXT:
            Text: WarningMessage
            Wait Until Finished: On
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
        Input: none — explicitly clear this field
END IF
STOP THIS SHORTCUT
```

The bounded candidate search avoids the observed native combined start/end-equality filter failure while retaining exact title/calendar/dates and exactly-one matching-event checks. The start-first/end-last sequence matches the original shortcut and prevents repeated wake changes from enlarging duration. An already-enlarged event must be corrected manually once.
