# Calendar Alarms QR Scanner

Action readout, 2026-10-26, for the approved installed **88-action Scanner**, derived from the restored 91-action October 26 baseline. Its only native change is removal of original actions 58–60: the post-core `scanner_scan_finished` request, Runtime call and Dictionary conversion. This readout describes that flow, not the older published iCloud Shortcut; updating this file does not update a published Shortcut. The October 26 phone result covered Engine looping; Scanner device validation has not yet been reported. Run this shortcut from the notification, Camera QR link, or manually; only Engine runs automatically on alarm firings.

Arrows name magic variables. All Scriptable calls use Run in App Off. Runtime calls return a Dictionary: explicitly follow Run Script with Get Dictionary from Input and use that result. The named Scanner core returns JSON **Text**, also requiring Get Dictionary. Text guards use `is [blank]` / `is not [blank]` with the comparison field truly empty and the value coerced to Text. Do not type the word blank or use Dictionary Value “has any value”. Counts are Numbers; `fromScan` and `vibrate` are Booleans.

The menu opens once per user invocation and exits on Scan, Silence, or Dismiss. Silence mutes for 15 seconds and schedules a returning **notification** after 10 seconds; no native Wait or automatic menu reopening is involved. Dismissing/cancelling a user-opened menu no longer holds the alarm automation open. Expanded notification action buttons are not used. Camera cancellation may abort that manual invocation; use Camera or reopen Scanner to recover.

Successful direct scans use one Scriptable call; successful manual camera scans use four, including the nested direct scan. Invalid-scan cleanup remains. Removing successful-scan notification cleanup lets the core result proceed directly to error handling, Clock deletion, feedback and configured scan actions. A notification may remain stale until later Engine/Runtime upkeep; the final camera-silence deadline can remain for the rest of its 15-second period. This update does not add a replacement call or change that menu behavior.

```jsx
IF: Shortcut Input does not have any value
    DICTIONARY:
        op: scanner_menu (Text)
        → MenuRequest
    RUN SCRIPT: Calendar Alarms Runtime
        Parameter: MenuRequest
        → MenuStateRaw
    GET DICTIONARY FROM INPUT: MenuStateRaw
        → MenuState (Dictionary)
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
                → CameraPreparationRaw
            GET DICTIONARY FROM INPUT: CameraPreparationRaw
                → CameraPreparation (Dictionary)
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
                → DecodedRaw
            GET DICTIONARY FROM INPUT: DecodedRaw
                → Decoded (Dictionary)
            GET DICTIONARY VALUE: code from Decoded
                → DecodedCode (Text)
            IF: DecodedCode is not [blank]
                TEXT: Calendar Alarms QR Scanner
                    → Calendar Alarms QR ScannerName
                RUN SHORTCUT: Calendar Alarms QR ScannerName
                    Input: DecodedCode
            OTHERWISE
                SHOW NOTIFICATION: That is not a Calendar Alarms QR code. Please scan the configured code.
                DICTIONARY: op = scanner_scan_finished (Text)
                RUN SCRIPT: Calendar Alarms Runtime
                    Parameter: preceding Dictionary
                    → UnmatchedScanNotificationRaw
                GET DICTIONARY FROM INPUT: UnmatchedScanNotificationRaw
                    → UnmatchedScanNotification (Dictionary)
            END IF
            STOP THIS SHORTCUT
        Silence for 15 seconds:
            DICTIONARY: op = scanner_silence (Text)
            RUN SCRIPT: Calendar Alarms Runtime
                Parameter: preceding Dictionary
                → SilenceResultRaw
            GET DICTIONARY FROM INPUT: SilenceResultRaw
                → SilenceResult (Dictionary)
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

The matching Scanner core uses a three-second lock-acquisition budget and requires locally available registry/lock state instead of waiting for iCloud downloads. A failed read or lock attempt returns a retry error without alarm changes or scan-action dispatch. The budget cannot preempt a stalled system file operation. The core outputs its result and explicitly calls `Script.complete()`. Legacy no-input core/menu operations remain for older shortcuts; this native flow uses Runtime `scanner_menu` instead.
