# Calendar Alarms Actions

Full replacement action readout, 2026-10-19, for Calendar Alarms Runtime in this branch and OpenHabits Runtime 1.2.2. It includes setup and every supported action kind. Updating this file does not update the published iCloud Shortcut.

`→ Name` names an action's magic variable; it is not an additional Set Variable action. Use actual magic variables in request fields, with the types shown. Named caches must use Set Variable, as written. Unless specified otherwise, Run Script means Scriptable, Run in App Off, Output Type Dictionary. Clear parameters explicitly where specified.

The installer source is [Calendar Alarms Installer.js](../Inline%20Scriptable/Calendar%20Alarms%20Installer.js). Paste its complete contents into the Run Inline Script action. It installs missing files only; it does not update existing scripts.

`refresh`, `speak`, `show`, `ok`, and `allComplete` are **Booleans**: use is Yes, not Number comparisons. `cacheOK` is a **Number**. Keep the original Shortcut Input bound in both action requests. Update Lockout Cache must return its status Dictionary as shown in the companion Metrics readout. It must not call the normal Engine while fetching a snapshot. Task reset calls the Engine only for completion cleanup; it never simulates a QR scan. Speak Text has Wait Until Finished On, so trigger speech completes before Engine playback begins.

```jsx
IF: Shortcut Input does not have any value
    RUN INLINE SCRIPT:
        Code: contents of Inline Scriptable/Calendar Alarms Installer.js
        Parameter: none — explicitly clear this field
        → Install

    DICTIONARY:
        op: settings_read (Text)
        → SettingsRequest
    RUN SCRIPT: Calendar Alarms Runtime
        Parameter: SettingsRequest
        → Settings
    GET DICTIONARY VALUE:
        Dictionary: Settings
        Key: welcome
        → SettingsWelcome (Text)
    IF: SettingsWelcome is not [blank]
        SHOW RESULT: SettingsWelcome
    END IF
    REPEAT: 5 times
        CHOOSE FROM MENU:
            Prompt: Want Calendar Alarms to ignore any calendars?
            Input Calendars to Ignore:
                GET DICTIONARY VALUE:
                    Dictionary: Settings
                    Key: defaultInput
                    → SettingsDefaultInput (Text)
                ASK FOR INPUT:
                    Type: Text
                    Prompt: Enter calendar names separated by commas, or leave blank to ignore none.
                    Default: SettingsDefaultInput
                    → CalendarNames
                DICTIONARY:
                    op: settings_save (Text)
                    names: CalendarNames (Text)
                    skip: No (Boolean)
                    → SaveSettingsRequest
                RUN SCRIPT: Calendar Alarms Runtime
                    Parameter: SaveSettingsRequest
                    → SavedSettings
                GET DICTIONARY VALUE:
                    Dictionary: SavedSettings
                    Key: message
                    → SavedSettingsMessage (Text)
                SHOW NOTIFICATION:
                    Body: SavedSettingsMessage
                STOP THIS SHORTCUT
            Skip:
                DICTIONARY:
                    op: settings_save (Text)
                    skip: Yes (Boolean)
                    → SkipRequest
                RUN SCRIPT: Calendar Alarms Runtime
                    Parameter: SkipRequest
                    → SkippedSettings
                GET DICTIONARY VALUE:
                    Dictionary: SkippedSettings
                    Key: message
                    → SkippedSettingsMessage (Text)
                SHOW NOTIFICATION:
                    Body: SkippedSettingsMessage
                STOP THIS SHORTCUT
            Why would I want this?:
                SHOW RESULT:
                    Usually you can leave this alone.
                    This is useful if someone shares a calendar containing their own
                    Calendar Alarms and you do not want those alarms on your phone.
        END MENU
    END REPEAT
    STOP THIS SHORTCUT
END IF

GET CURRENT FOCUS:
    → Focus
DICTIONARY:
    op: action (Text)
    input: Shortcut Input
    focus: Focus (Name; Text)
    refreshed: No (Boolean)
    → ActionRequest
RUN SCRIPT: Calendar Alarms Runtime
    Parameter: ActionRequest
    → PreparedAction
SET VARIABLE: Plan to PreparedAction
GET DICTIONARY VALUE:
    Dictionary: Plan
    Key: refresh
    → PlanRefresh (Boolean)
IF: PlanRefresh is Yes
    RUN SHORTCUT: Update Lockout Cache
        Input: fetch_new_cache
        → RefreshResult (Dictionary)
    GET DICTIONARY VALUE:
        Dictionary: RefreshResult
        Key: cacheOK
        → RefreshCacheOK (Number)
    DICTIONARY:
        op: action (Text)
        input: Shortcut Input
        focus: Focus (Name; Text)
        refreshed: Yes (Boolean)
        cacheOK: RefreshCacheOK (Number)
        → RefreshedRequest
    RUN SCRIPT: Calendar Alarms Runtime
        Parameter: RefreshedRequest
        → RefreshedAction
    SET VARIABLE: Plan to RefreshedAction
END IF

GET DICTIONARY VALUE:
    Dictionary: Plan
    Key: speak
    → PlanSpeak (Boolean)
IF: PlanSpeak is Yes
    GET DICTIONARY VALUE:
        Dictionary: Plan
        Key: message
        → PlanMessage (Text)
    SET VOLUME:
        Volume: Plan (Dictionary → Get Value for Key: speechLevel)
        // Runtime returns a 0–1 media-volume fraction; missing speechVolume defaults to 50%.
    SPEAK TEXT:
        Text: PlanMessage
        Wait Until Finished: On
END IF
GET DICTIONARY VALUE:
    Dictionary: Plan
    Key: show
    → PlanShow (Boolean)
IF: PlanShow is Yes
    GET DICTIONARY VALUE:
        Dictionary: Plan
        Key: title
        → PlanTitle (Text)
    GET DICTIONARY VALUE:
        Dictionary: Plan
        Key: message
        → PlanMessage2 (Text)
    SHOW NOTIFICATION:
        Title: PlanTitle
        Body: PlanMessage2
END IF

GET DICTIONARY VALUE:
    Dictionary: Plan
    Key: kind
    → PlanKind (Text)
IF: PlanKind is timer_start
    GET DICTIONARY VALUE:
        Dictionary: Plan
        Key: minutes
        → PlanMinutes (Number)
    START TIMER:
        Duration: PlanMinutes minutes
END IF
IF: PlanKind is timer_cancel
    CANCEL CURRENT TIMER
END IF
IF: PlanKind is focus_on
    GET DICTIONARY VALUE:
        Dictionary: Plan
        Key: name
        → PlanName (Text)
    SET FOCUS:
        Focus: PlanName
        On until turned off
END IF
IF: PlanKind is focus_off
    GET DICTIONARY VALUE:
        Dictionary: Plan
        Key: name
        → PlanName2 (Text)
    SET FOCUS:
        Focus: PlanName2
        Off
END IF
IF: PlanKind is filters_on
    SET COLOR FILTERS: On
END IF
IF: PlanKind is filters_off
    SET COLOR FILTERS: Off
END IF
IF: PlanKind is brightness
    GET DICTIONARY VALUE:
        Dictionary: Plan
        Key: level
        → PlanLevel (Number)
    SET BRIGHTNESS: PlanLevel
END IF
IF: PlanKind is appearance_dark
    SET APPEARANCE: Dark
END IF
IF: PlanKind is appearance_light
    SET APPEARANCE: Light
END IF
IF: PlanKind is open_app
    GET DICTIONARY VALUE:
        Dictionary: Plan
        Key: appName
        → PlanAppName (Text)
    OPEN APP: PlanAppName
END IF
IF: PlanKind is open_url
    GET DICTIONARY VALUE:
        Dictionary: Plan
        Key: url
        → PlanUrl (Text)
    OPEN URLS: PlanUrl
END IF
IF: PlanKind is open_home_screen
    GET DEVICE DETAILS:
        Detail: Is Locked
        → Locked
    IF: Locked is No
        GO TO HOME SCREEN
    END IF
END IF
IF: PlanKind is open_lock_screen
    LOCK SCREEN
END IF
IF: PlanKind is volume
    GET DICTIONARY VALUE:
        Dictionary: Plan
        Key: level
        → PlanLevel2 (Number)
    SET VOLUME:
        Media volume: PlanLevel2
END IF
IF: PlanKind is silent_on
    SET SILENT MODE: On
END IF
IF: PlanKind is silent_off
    SET SILENT MODE: Off
END IF
IF: PlanKind is haptic
    VIBRATE DEVICE
END IF
IF: PlanKind is sound
    GET DICTIONARY VALUE:
        Dictionary: Plan
        Key: file
        → PlanFile (Text)
    DICTIONARY:
        op: sound_file (Text)
        file: PlanFile
        → SoundRequest
    RUN SCRIPT: Calendar Alarms Runtime
        Parameter: SoundRequest
        Output Type: File
        → SoundFile
    PLAY SOUND: SoundFile
END IF

IF: PlanKind is task_alarm_reset
    GET DICTIONARY VALUE:
        Dictionary: Plan
        Key: ok
        → PlanOk (Boolean)
    IF: PlanOk is Yes
        GET DICTIONARY VALUE:
            Dictionary: Plan
            Key: allComplete
            → PlanAllComplete (Boolean)
        IF: PlanAllComplete is Yes
            GET DICTIONARY VALUE:
                Dictionary: Plan
                Key: engineInput
                → PlanEngineInput (Text)
            RUN SHORTCUT: Calendar Alarm Engine
                Input: PlanEngineInput
                → CleanupResult (Dictionary)
            GET DICTIONARY VALUE:
                Dictionary: CleanupResult
                Key: errorRegistry
                → CleanupErrors (Text)
            IF: CleanupErrors is [blank]
                SHOW NOTIFICATION:
                    Body: Alarm Reset due to Task Completion.
            END IF
        END IF
    OTHERWISE
        GET DICTIONARY VALUE:
            Dictionary: Plan
            Key: error
            → PlanError (Text)
        SHOW NOTIFICATION:
            Body: PlanError
    END IF
END IF
STOP AND OUTPUT:
    Output: Plan (Dictionary)
```
