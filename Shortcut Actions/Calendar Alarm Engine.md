# Calendar Alarm Engine

Checkpoint readout, 2026-10-05. See [checkpoint status and known issues](../Development/Runtime%20Checkpoint.md) before rebuilding.

`→ Name` names an action's magic variable; it is not an additional Set Variable action. Use actual magic variables in request fields, with the types shown. Named caches must use Set Variable, as written. Unless specified otherwise, Run Script means Scriptable, Run in App Off, Output Type Dictionary. Clear parameters explicitly where specified.

The QR section includes the latest cached-file update. `fileName` is a subfolder-preserving path relative to Alarm Tones. Load file/duration on the first playable Poll and only when this path changes. There are no Base64 actions. QR stop/play outputs are actual Numbers (0/1); other Boolean-to-Number mappings remain part of the experimental readouts. The core returns JSON text; verify output conversion on the Run Script action.

```jsx
DICTIONARY:
    op: engine_begin (Text)
    input: Shortcut Input
    → BeginRequest
RUN SCRIPT: Calendar Alarms Runtime
    Parameter: BeginRequest
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
    Label: is anything
    → Alarms
GET CURRENT FOCUS:
    → Focus
GET DICTIONARY VALUE:
    Dictionary: Begin
    Key: cleanInput
    → BeginCleanInput (Text)
TEXT:
    [Alarms → Label]:;:[Alarms → Hours]:;:[Alarms → Minutes]:;:[Focus → Name]:;:[BeginCleanInput]
    // Preserve the existing newline-separated list formatting in each section.
    → EngineInput
RUN SCRIPT: Calendar Alarm Engine
    Parameter: EngineInput
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
END REPEAT

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
    IF: ContinueActions is 1
        GET DICTIONARY VALUE:
            Dictionary: Repeat Item
            Key: name
            → ItemName3 (Text)
        IF: MyShortcuts (Names) contains ItemName3
            GET DICTIONARY VALUE:
                Dictionary: Repeat Item
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
END REPEAT
GET DICTIONARY VALUE:
    Dictionary: Engine
    Key: errorRegistry
    → EngineErrorRegistry (Text)
IF: EngineErrorRegistry has any value
    SHOW NOTIFICATION:
        Body: EngineErrorRegistry
END IF

// No nextLoopStart cutoff. The runtime checks actual ownership and elapsed time.
// Check the live registry even when a verifier run returned qrLoop=false.
GET DICTIONARY VALUE:
    Dictionary: Begin
    Key: session
    → BeginSession (Dictionary)
TEXT:
    [empty — leave the text field blank]
SET VARIABLE:
    Name: CachedSoundPath
    Value: preceding empty Text
REPEAT: 180 times
    DICTIONARY:
        op: qr_poll (Text)
        session: BeginSession (Dictionary)
        → PollRequest
    RUN SCRIPT: Calendar Alarms Runtime
        Parameter: PollRequest
        → Poll
    GET DICTIONARY VALUE:
        Dictionary: Poll
        Key: stop
        → PollStop (Number)
    IF: PollStop is 1
        STOP THIS SHORTCUT
    END IF
    GET DICTIONARY VALUE:
        Dictionary: Poll
        Key: play
        → PollPlay (Number)
    IF: PollPlay is 1
        GET DICTIONARY VALUE:
            Dictionary: Poll
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
            Dictionary: Poll
            Key: alarmKey
            → PollAlarmKey (Text)
        DICTIONARY:
            op: qr_permit (Text)
            alarmKey: PollAlarmKey (Text)
            duration: CachedDuration (Number)
            session: BeginSession (Dictionary)
            → PermitRequest
        RUN SCRIPT: Calendar Alarms Runtime
            Parameter: PermitRequest
            → Permit
        GET DICTIONARY VALUE:
            Dictionary: Permit
            Key: stop
            → PermitStop (Number)
        IF: PermitStop is 1
            STOP THIS SHORTCUT
        END IF
        GET DICTIONARY VALUE:
            Dictionary: Permit
            Key: play
            → PermitPlay (Number)
        IF: PermitPlay is 1
            GET DICTIONARY VALUE:
                Dictionary: Poll
                Key: volume
                → PollVolume (Number)
            SET VOLUME:
                Media volume: PollVolume
            PLAY SOUND: CachedAudioFile
        END IF
    END IF
    WAIT: 1 second
END REPEAT
```
