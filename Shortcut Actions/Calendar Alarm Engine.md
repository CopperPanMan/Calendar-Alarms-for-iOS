# Calendar Alarm Engine

> This dated readout describes the October 26 flow. The current 143-action native-playback variant and its canonical script requirements are documented in [Native playback release](../Development/Native%20playback%20release.md). Public iCloud links are updated separately.

Action readout, 2026-10-26, for the approved installed **148-action Engine**, derived from the restored 155-action October 26 baseline. This readout describes that flow with its matching Engine and Runtime scripts, not the older published iCloud Shortcut. Updating this file does not update a published Shortcut. The user reported consecutive looping without the previous every-other-execution failure; a few timeout messages around three minutes remain unresolved. See the [exact changes and verification limits](../Development/October%2026%20Reliability%20Update.md).

`→ Name` names an action's magic variable; it is not an additional Set Variable action. Use actual magic variables in request fields, with the types shown. Named caches must use Set Variable, as written. Run Script means Scriptable, Run in App Off. Runtime calls return a Dictionary; retain each explicit Get Dictionary from Input shown below. Clear parameters explicitly where specified.

Install the matching Engine and Runtime scripts when rebuilding. Empty input or `Calendar` runs the normal Engine; a metric/task response runs completion cleanup and returns before triggers or playback. `Clock` uses the guard only. All four Clock lists below must come from the same Find Alarms result. Delimiter-based Engine input is no longer accepted.

The Engine core returns JSON **Text**; the explicit Get Dictionary action is required. Runtime returns a Dictionary. `clock`, `completionOnly`, `run`, `lastInGroup`, and QR `stop`/`play` are **Numbers** (0/1). Preserve `CurrentTrigger` as a Dictionary, including its occurrence/invocation metadata. Finish the last action in each group even if it was skipped. Speak Text actions in called Shortcuts must have **Wait Until Finished On** to delay QR sound until speech completes.

There is one initial `qr_poll` before Repeat and one `qr_step` per iteration after native preparation. `LoopState` supplies the next alarm key, relative sound path and requested volume. Cache the file and duration when its path changes; duration is in seconds. `qr_step` acknowledges the preceding completed clip, rereads live state, and permits audio only when the prepared alarm key, path and volume still match. A changed plan is returned with `play = 0` for preparation on the following iteration. The stop path removes QR retries while preserving future task checks.

The two leading Numbers are the tuning controls: **Restart Buffer Seconds = 5** and **Volume Correction Interval Seconds = 20**. The buffer shortens only the local playback session, not the two-minute Clock restart schedule. Runtime admits complete clips within that deadline. The single volume condition uses **Any are true (OR)**: the correction is due, or the requested volume differs from `Prepared Volume`. Record `Prepared Volume` immediately after Set Volume succeeds. The first correction is already due because its initial date is yesterday; no separate initialization action is needed. Later corrections are measured from Set Volume completion. There is no Get Current Volume action, unconditional wait after successful playback, or trace logger. Denied/stopped playback waits one second; a returned stop is handled at the beginning of the following iteration.

`Completed Playback Token` is initially empty and changes only after native Play Sound returns successfully. The following `qr_step` can perform bounded notification upkeep after acknowledging that clip; the initial poll does not request a pre-audio notification. No extra native notification call is added to playback. Existing Clock deletion/addition order, task refreshes, trigger actions and awaited speech are retained. Completion-only notification cleanup remains in its original branch. Keep the non-QR outputs used by other shortcuts; the ordinary QR stop is a plain Stop This Shortcut.

```jsx
NUMBER: 5
SET VARIABLE: Restart Buffer Seconds to Number
NUMBER: 20
SET VARIABLE: Volume Correction Interval Seconds to Number
DICTIONARY:
    op: engine_begin (Text)
    input: Shortcut Input
    → BeginRequest
RUN SCRIPT: Calendar Alarms Runtime
    Parameter: BeginRequest
    → BeginRaw
GET DICTIONARY FROM INPUT: BeginRaw
    → Begin
GET DICTIONARY VALUE:
    Dictionary: Begin
    Key: clock
    → BeginClock (Number)
IF: BeginClock is 1
    GET DICTIONARY VALUE:
        Dictionary: Begin
        Key: activeCount
        → BeginActiveCount (Number)
    IF: BeginActiveCount is greater than 0
        GO TO HOME SCREEN
        GET DICTIONARY VALUE:
            Dictionary: Begin
            Key: notification
            → BeginNotification (Text)
        SHOW NOTIFICATION:
            Body: BeginNotification
    END IF
    STOP AND OUTPUT:
        Output: BeginActiveCount
END IF

FIND ALARMS:
    Filters: none (all alarms)
    Limit: Off
    → Alarms
GET CURRENT FOCUS:
    → Focus
GET DICTIONARY VALUE:
    Dictionary: Begin
    Key: cleanInput
    → BeginCleanInput (Text)
DICTIONARY:
    labels: Alarms → Label (List)
    hours: Alarms → Hours (List)
    minutes: Alarms → Minutes (List)
    isEnabled: Alarms → Is Enabled (List)
    currentFocus: Focus → Name (Text; empty when no Focus is active)
    taskLogResponse: BeginCleanInput (Text)
    // All four lists come from the same Alarms result, in the same order.
    // Keep taskLogResponse as the existing text; do not convert it to a Dictionary.
    → EngineInput
RUN SCRIPT: Calendar Alarm Engine
    Parameter: EngineInput
    Output Type: Text
    → EngineJSON
GET DICTIONARY FROM INPUT: EngineJSON
    → Engine

GET DICTIONARY VALUE:
    Dictionary: Engine
    Key: alarmsToDelete
    → EngineAlarmsToDelete (List)
REPEAT WITH EACH: EngineAlarmsToDelete
    GET DICTIONARY VALUE:
        Dictionary: Repeat Item
        Key: name
        → ItemName (Text)
    GET DICTIONARY VALUE:
        Dictionary: Repeat Item
        Key: hh
        → ItemHh (Number)
    GET DICTIONARY VALUE:
        Dictionary: Repeat Item
        Key: mm
        → ItemMm (Number)
    FIND ALARMS:
        All true:
            Label is ItemName
            Hours is ItemHh
            Minutes is ItemMm
        Limit: Off
        → MatchingAlarms
    IF: MatchingAlarms has any value
        DELETE ALARMS: MatchingAlarms
    END IF
END REPEAT
GET DICTIONARY VALUE:
    Dictionary: Engine
    Key: alarmsToAdd
    → EngineAlarmsToAdd (List)
REPEAT WITH EACH: EngineAlarmsToAdd
    GET DICTIONARY VALUE:
        Dictionary: Repeat Item
        Key: time
        → ItemTime (Text)
    GET DICTIONARY VALUE:
        Dictionary: Repeat Item
        Key: name
        → ItemName2 (Text)
    CREATE ALARM:
        Time: ItemTime
        Label: ItemName2
        Repeat: Never
        Snooze: Off
END REPEAT

GET DICTIONARY VALUE:
    Dictionary: Engine
    Key: errorRegistry
    → EngineErrorRegistry (Text)
IF: EngineErrorRegistry is not [blank]
    SHOW NOTIFICATION:
        Body: EngineErrorRegistry
END IF
GET DICTIONARY VALUE:
    Dictionary: Begin
    Key: completionOnly
    → BeginCompletionOnly (Number)
IF: BeginCompletionOnly is 1
    DICTIONARY:
        op: qr_notification (Text)
        cleanupOnly: Yes (Boolean)
        → Completion Notification Cleanup Request
    RUN SCRIPT: Calendar Alarms Runtime
        Parameter: Completion Notification Cleanup Request
        → Completion Notification Cleanup Raw
    GET DICTIONARY FROM INPUT: Completion Notification Cleanup Raw
        → Completion Notification Cleanup
    STOP AND OUTPUT:
        Output: Engine (Dictionary)
END IF

GET MY SHORTCUTS:
    Folder: All Shortcuts
    → MyShortcuts
NUMBER: 1
SET VARIABLE: ContinueActions to Number
GET DICTIONARY VALUE:
    Dictionary: Engine
    Key: triggerShortcutsToRunDetailed
    → EngineTriggerShortcutsToRunDetailed (List)
REPEAT WITH EACH: EngineTriggerShortcutsToRunDetailed
    SET VARIABLE: CurrentTrigger to Repeat Item (Dictionary)
    DICTIONARY:
        op: trigger_check (Text)
        trigger: CurrentTrigger (Dictionary)
        → TriggerCheckRequest
    RUN SCRIPT: Calendar Alarms Runtime
        Parameter: TriggerCheckRequest
        → TriggerCheckRaw
    GET DICTIONARY FROM INPUT: TriggerCheckRaw
        → TriggerCheck
    GET DICTIONARY VALUE:
        Dictionary: TriggerCheck
        Key: run
        → TriggerRun (Number)
    IF: TriggerRun is 1
        IF: ContinueActions is 1
            GET DICTIONARY VALUE:
                Dictionary: CurrentTrigger
                Key: name
                → ItemName3 (Text)
            IF: MyShortcuts (Names) contains ItemName3
                GET DICTIONARY VALUE:
                    Dictionary: CurrentTrigger
                    Key: input
                    → ItemInput (List)
                RUN SHORTCUT:
                    Shortcut: ItemName3
                    Input: ItemInput
                    → CalledResult
                IF: CalledResult is Stop Running Shortcuts
                    NUMBER: 0
                    SET VARIABLE: ContinueActions to Number
                END IF
            OTHERWISE
                SHOW NOTIFICATION:
                    Body: Shortcut “[ItemName3]” not found.
            END IF
        END IF
    END IF
    GET DICTIONARY VALUE:
        Dictionary: CurrentTrigger
        Key: lastInGroup
        → TriggerLastInGroup (Number)
    IF: TriggerLastInGroup is 1
        DICTIONARY:
            op: trigger_finish (Text)
            trigger: CurrentTrigger (Dictionary)
            → TriggerFinishRequest
        RUN SCRIPT: Calendar Alarms Runtime
            Parameter: TriggerFinishRequest
            → TriggerFinishRaw
        GET DICTIONARY FROM INPUT: TriggerFinishRaw
            → TriggerFinish
    END IF
END REPEAT

// Apply the buffer once to the existing runtime session deadline.
// Continue checking the live registry; ownership and duration checks stay in Runtime.
GET DICTIONARY VALUE:
    Dictionary: Begin
    Key: session
    → BeginSession (Dictionary)
GET DICTIONARY VALUE:
    Dictionary: Engine
    Key: nextLoopStart
    → Next Scheduled QR Restart (Text)
IF: Next Scheduled QR Restart is [blank]
    STOP AND OUTPUT: Engine (Dictionary)
END IF
GET TIME BETWEEN DATES:
    From: 1970-01-01T00:00:00Z
    To: Next Scheduled QR Restart (Date coercion)
    Unit: Seconds
    → Restart Unix Seconds
CALCULATE EXPRESSION: ([Restart Unix Seconds] - [Restart Buffer Seconds]) * 1000
    → Buffered Session Deadline (Number; epoch milliseconds)
SET DICTIONARY VALUE:
    Dictionary: BeginSession
    Key: deadline
    Value: Buffered Session Deadline (Number)
    → QR Session With Buffer (Dictionary)
TEXT:
    [empty — leave the text field blank]
SET VARIABLE:
    Name: CachedSoundPath
    Value: preceding empty Text
CURRENT DATE:
    → Volume Schedule Start
ADJUST DATE:
    Subtract 1 day from Volume Schedule Start
    → Initial Volume Correction Due
SET VARIABLE: Next Volume Correction At to Initial Volume Correction Due
TEXT: [empty]
SET VARIABLE: Completed Playback Token to preceding empty Text
DICTIONARY:
    op: qr_poll (Text)
    session: QR Session With Buffer (Dictionary)
    completedPlaybackToken: Completed Playback Token (Text)
    → PollRequest
RUN SCRIPT: Calendar Alarms Runtime
    Parameter: PollRequest
    → PollRaw
GET DICTIONARY FROM INPUT: PollRaw
    → Poll
SET VARIABLE: LoopState to Poll
REPEAT: 180 times
    GET DICTIONARY VALUE:
        Dictionary: LoopState
        Key: stop
        → LoopStop (Number)
    IF: LoopStop is 1
        GET DICTIONARY VALUE:
            Dictionary: LoopState
            Key: alarmsToDelete
            → LoopAlarmsToDelete (List)
        REPEAT WITH EACH: LoopAlarmsToDelete
            GET DICTIONARY VALUE:
                Dictionary: Repeat Item
                Key: name
                → CleanupName (Text)
            GET DICTIONARY VALUE:
                Dictionary: Repeat Item
                Key: hh
                → CleanupHh (Number)
            GET DICTIONARY VALUE:
                Dictionary: Repeat Item
                Key: mm
                → CleanupMm (Number)
            FIND ALARMS:
                All true:
                    Label is CleanupName
                    Hours is CleanupHh
                    Minutes is CleanupMm
                Limit: Off
                → CleanupAlarms
            IF: CleanupAlarms has any value
                DELETE ALARMS: CleanupAlarms
            END IF
        END REPEAT
        STOP THIS SHORTCUT
    END IF
    GET DICTIONARY VALUE:
        Dictionary: LoopState
        Key: fileName
        → PollSoundPath (Text)
    IF: PollSoundPath is not CachedSoundPath
        GET FILE FROM FOLDER:
            Folder: Shortcuts
            Path: OpenHabits/Calendar Alarms/Alarm Tones/[PollSoundPath]
            Error If Not Found: On
            → LoadedAudioFile (File)
        SET VARIABLE:
            Name: CachedAudioFile
            Value: LoadedAudioFile
        GET DETAILS OF MUSIC:
            Detail: Duration
            Input: CachedAudioFile
            → LoadedDuration
        SET VARIABLE:
            Name: CachedDuration
            Value: LoadedDuration (Number; seconds)
        SET VARIABLE:
            Name: CachedSoundPath
            Value: PollSoundPath
    END IF
    GET DICTIONARY VALUE:
        Dictionary: LoopState
        Key: alarmKey
        → PollAlarmKey (Text)
    GET DICTIONARY VALUE:
        Dictionary: LoopState
        Key: volume
        → PollVolume (Number)
    CURRENT DATE:
        → Volume Check Time
    IF: Any are true (OR)
        Volume Check Time is after Next Volume Correction At
        PollVolume (Number) is not Prepared Volume (Number)
        SET VOLUME:
            Media volume: PollVolume
        SET VARIABLE: Prepared Volume to PollVolume
        CURRENT DATE:
            → Volume Correction Finished
        ADJUST DATE:
            Add Volume Correction Interval Seconds to Volume Correction Finished
            → Next Volume Correction Due
        SET VARIABLE: Next Volume Correction At to Next Volume Correction Due
    END IF
    DICTIONARY:
        op: qr_step (Text)
        alarmKey: PollAlarmKey (Text)
        fileName: CachedSoundPath (Text)
        volume: Prepared Volume (Number)
        duration: CachedDuration (Number)
        session: QR Session With Buffer (Dictionary)
        completedPlaybackToken: Completed Playback Token (Text)
        → PermitRequest
    RUN SCRIPT: Calendar Alarms Runtime
        Parameter: PermitRequest
        → PermitRaw
    GET DICTIONARY FROM INPUT: PermitRaw
        → Permit
    SET VARIABLE: LoopState to Permit
    GET DICTIONARY VALUE:
        Dictionary: Permit
        Key: play
        → PermitPlay (Number)
    IF: PermitPlay is 1
        PLAY SOUND: CachedAudioFile
        GET DICTIONARY VALUE:
            Dictionary: Permit
            Key: playbackToken
            → Completed Native Playback Token (Text)
        SET VARIABLE: Completed Playback Token to Completed Native Playback Token
    OTHERWISE
        WAIT: 1 second
    END IF
END REPEAT
STOP AND OUTPUT:
    Output: Engine (Dictionary)
```
