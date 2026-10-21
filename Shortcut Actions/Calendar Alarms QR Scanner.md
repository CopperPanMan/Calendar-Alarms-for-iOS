# Calendar Alarms QR Scanner

Full replacement action readout, 2026-10-19, matching the installed notification/menu flow. Updating this file does not update a published iCloud Shortcut. Run this shortcut from the notification, Camera QR link, or manually; **remove its Any Alarm Goes Off automation**. Only Engine runs automatically on alarm firings.

Arrows name magic variables. All Scriptable calls use Run in App Off. Runtime calls return a Dictionary: explicitly follow Run Script with Get Dictionary from Input and use that result. The named Scanner core returns JSON **Text**, also requiring Get Dictionary. Text guards use `is [blank]` / `is not [blank]` with the comparison field truly empty and the value coerced to Text. Do not type the word blank or use Dictionary Value “has any value”. Counts are Numbers; `fromScan` and `vibrate` are Booleans.

The menu opens once per user invocation and exits on Scan, Silence, or Dismiss. Silence mutes for 15 seconds and schedules a returning **notification** after 10 seconds; no native Wait or automatic menu reopening is involved. Dismissing/cancelling a user-opened menu no longer holds the alarm automation open. Expanded notification action buttons are not used. Camera cancellation may abort that manual invocation; use Camera or reopen Scanner to recover.

```jsx
IF: Shortcut Input does not have any value
    DICTIONARY:
        op: scanner_menu (Text)
        → MenuRequest
    RUN SCRIPT: Calendar Alarms Runtime
        Parameter: MenuRequest
        → MenuState (Dictionary; explicitly normalize)
    GET DICTIONARY VALUE: error from MenuState
        → MenuErrors (Text)
    IF: MenuErrors is not [blank]
        SHOW NOTIFICATION: MenuErrors
    END IF
    GET DICTIONARY VALUE: activeCount from MenuState
        → MenuActiveCount (Number)
    IF: MenuActiveCount is 0
        STOP THIS SHORTCUT
    END IF
    GET DICTIONARY VALUE: activeName from MenuState
        → MenuActiveName (Text)
    CHOOSE FROM MENU:
        Prompt: Alarm active: [MenuActiveName]
        Scan QR Code:
            DICTIONARY:
                op: scanner_scan_begin (Text)
                → CameraRequest
            RUN SCRIPT: Calendar Alarms Runtime
                Parameter: CameraRequest
                → CameraPreparation (Dictionary; explicitly normalize)
            GET DICTIONARY VALUE: error from CameraPreparation
                → CameraError (Text)
            IF: CameraError is not [blank]
                SHOW NOTIFICATION: CameraError
            END IF
            GET DICTIONARY VALUE: activeCount from CameraPreparation
                → CameraActiveCount (Number)
            IF: CameraActiveCount is 0
                STOP THIS SHORTCUT
            END IF
            SCAN QR OR BARCODE:
                → ScannedCode
            DICTIONARY:
                op: scan_input (Text)
                input: ScannedCode (Text)
                fromScan: Yes (Boolean)
                → DecodeRequest
            RUN SCRIPT: Calendar Alarms Runtime
                Parameter: DecodeRequest
                → Decoded (Dictionary; explicitly normalize)
            GET DICTIONARY VALUE: code from Decoded
                → DecodedCode (Text)
            IF: DecodedCode is not [blank]
                RUN SHORTCUT: Calendar Alarms QR Scanner
                    Input: DecodedCode
            OTHERWISE
                SHOW NOTIFICATION: That is not a Calendar Alarms QR code. Please scan the configured code.
                DICTIONARY: op = scanner_scan_finished (Text)
                RUN SCRIPT: Calendar Alarms Runtime
                    Parameter: preceding Dictionary
                    → UnmatchedScanNotification (Dictionary; explicitly normalize)
            END IF
            STOP THIS SHORTCUT
        Silence for 15 seconds:
            DICTIONARY: op = scanner_silence (Text)
            RUN SCRIPT: Calendar Alarms Runtime
                Parameter: preceding Dictionary
                → SilenceResult (Dictionary; explicitly normalize)
            GET DICTIONARY VALUE: error from SilenceResult
                → SilenceError (Text)
            IF: SilenceError is not [blank]
                SHOW NOTIFICATION: SilenceError
            END IF
            STOP THIS SHORTCUT
        Dismiss:
            STOP THIS SHORTCUT
    END MENU
    STOP THIS SHORTCUT
OTHERWISE
    RUN SCRIPT: Calendar Alarm QR Scanner
        Parameter: Shortcut Input (Text; QR code ID)
        Output Type: Text
        → ScanJSON
    GET DICTIONARY FROM INPUT: ScanJSON
        → ScanResult
    DICTIONARY: op = scanner_scan_finished (Text)
    RUN SCRIPT: Calendar Alarms Runtime
        Parameter: preceding Dictionary
        → ScanNotificationCleanup (Dictionary; explicitly normalize)
    GET DICTIONARY VALUE:
        Dictionary: ScanResult
        Key: errorRegistry
        → ScanErrors (Text)
    IF: ScanErrors is not [blank]
        SHOW NOTIFICATION:
            Body: ScanErrors
    END IF
    GET DICTIONARY VALUE:
        Dictionary: ScanResult
        Key: alarmsToDelete
        → ScanResultAlarmsToDelete (List)
    REPEAT WITH EACH: ScanResultAlarmsToDelete
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
        Dictionary: ScanResult
        Key: vibrate
        → ScanResultVibrate (Boolean)
    IF: ScanResultVibrate is Yes
        VIBRATE DEVICE
    OTHERWISE
        GET DICTIONARY VALUE:
            Dictionary: ScanResult
            Key: notification
            → ScanResultNotification (Text)
        IF: ScanResultNotification is not [blank]
            SHOW NOTIFICATION:
                Body: ScanResultNotification
        END IF
    END IF
    GET DICTIONARY VALUE:
        Dictionary: ScanResult
        Key: shortcutsToRunDetailed
        → ScanResultShortcutsToRunDetailed (List)
    REPEAT WITH EACH: ScanResultShortcutsToRunDetailed
        GET DICTIONARY VALUE:
            Dictionary: Repeat Item
            Key: name
            → ItemName2 (Text)
        GET DICTIONARY VALUE:
            Dictionary: Repeat Item
            Key: input
            → ItemInput (List)
        RUN SHORTCUT:
            Shortcut: ItemName2
            Input: ItemInput
    END REPEAT
END IF
STOP THIS SHORTCUT
```

The Scanner core retries registry lock acquisition for at most 3 seconds between awaited file operations, then returns a clear retry message without changing alarms or dispatching scan actions. This does not cancel an iCloud file operation already in progress. It outputs the result and explicitly calls `Script.complete()`. Legacy no-input core/menu operations remain for older shortcuts; this native flow uses Runtime `scanner_menu` instead.
