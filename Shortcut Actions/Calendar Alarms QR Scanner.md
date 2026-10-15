# Calendar Alarms QR Scanner

Full replacement action readout, 2026-10-15, for the Scanner core and Runtime in this branch. Includes both menu and scan paths. Updating this file does not update the published iCloud Shortcut.

`→ Name` names an action's magic variable; it is not an additional Set Variable action. Use actual magic variables in request fields, with the types shown. Named caches must use Set Variable, as written. Unless specified otherwise, Run Script means Scriptable, Run in App Off, Output Type Dictionary. Clear parameters explicitly where specified.

The core returns JSON **Text**; convert it explicitly to a Dictionary in both paths. `shouldShowMenu` and `vibrate` are **Booleans**. Display `errorRegistry` without aborting the returned deletion plan. Find Alarms below has exactly the three predicates shown, with no additional empty Label filter. A successful scan removes owned QR restarts, including the next minute's restart, while preserving future task checks.

Menu cancellation can still leave the core's open flag set until its 120-second lease expires. This readout retains that bounded behavior. Runtime `scanner_touch` supplies the existing silence timestamp; it does not redesign the menu lease.

Task QR menus remain deferred through reset/trigger actions until Runtime grants the first matching playback permission. The existing `shouldShowMenu` Boolean carries that decision; no new native action is needed. The 180-second deadline and 90 repeats below replace the earlier 50-second/10-repeat limits so a slow reset has time to finish. Completion before playback exits without a menu, and direct scans remain available. Permission is immediately followed by Play Sound; it cannot confirm that iOS actually emitted sound.

Deferral applies while the Runtime session is live. Legacy playback without a Runtime session keeps its existing menu behavior; a session that expires before playback releases the menu for recovery.

```jsx
IF: Shortcut Input does not have any value
    CURRENT DATE:
        → Started
    ADJUST DATE:
        Add 180 seconds to Started
        → Deadline
    WAIT: 2 seconds
    REPEAT: 90 times
        CURRENT DATE:
            → Now
        IF: Now is after Deadline
            STOP THIS SHORTCUT
        END IF
        RUN SCRIPT: Calendar Alarm QR Scanner
            Parameter: none — explicitly clear this field
            Output Type: Text
            → MenuJSON
        GET DICTIONARY FROM INPUT: MenuJSON
            → MenuState
        GET DICTIONARY VALUE:
            Dictionary: MenuState
            Key: errorRegistry
            → MenuErrors (Text)
        IF: MenuErrors has any value
            SHOW NOTIFICATION:
                Body: MenuErrors
        END IF
        GET DICTIONARY VALUE:
            Dictionary: MenuState
            Key: activeName
            → MenuStateActiveName (Text)
        IF: MenuStateActiveName does not have any value
            STOP THIS SHORTCUT
        END IF
        GET DICTIONARY VALUE:
            Dictionary: MenuState
            Key: shouldShowMenu
            → MenuStateShouldShowMenu (Boolean)
        IF: MenuStateShouldShowMenu is Yes
            CHOOSE FROM MENU:
                Prompt: Alarm active: [MenuStateActiveName]
                Silence for 12s:
                    DICTIONARY:
                        op: scanner_touch (Text)
                        → SilenceRequest
                    RUN SCRIPT: Calendar Alarms Runtime
                        Parameter: SilenceRequest
                    WAIT: 8 seconds
                Scan Code:
                    DICTIONARY:
                        op: scanner_touch (Text)
                        → ScanTouchRequest
                    RUN SCRIPT: Calendar Alarms Runtime
                        Parameter: ScanTouchRequest
                    SCAN QR OR BARCODE:
                        → ScannedCode
                    DICTIONARY:
                        op: scan_input (Text)
                        input: ScannedCode (Text)
                        fromScan: Yes (Boolean)
                        → DecodeRequest
                    RUN SCRIPT: Calendar Alarms Runtime
                        Parameter: DecodeRequest
                        → Decoded
                    GET DICTIONARY VALUE:
                        Dictionary: Decoded
                        Key: code
                        → DecodedCode (Text)
                    IF: DecodedCode has any value
                        RUN SHORTCUT: Calendar Alarms QR Scanner
                            Input: DecodedCode
                    END IF
            END MENU
        OTHERWISE
            WAIT: 2 seconds
        END IF
    END REPEAT
OTHERWISE
    RUN SCRIPT: Calendar Alarm QR Scanner
        Parameter: Shortcut Input (Text; the QR code ID)
        Output Type: Text
        → ScanJSON
    GET DICTIONARY FROM INPUT: ScanJSON
        → ScanResult
    GET DICTIONARY VALUE:
        Dictionary: ScanResult
        Key: errorRegistry
        → ScanErrors (Text)
    IF: ScanErrors has any value
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
        IF: ScanResultNotification has any value
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
