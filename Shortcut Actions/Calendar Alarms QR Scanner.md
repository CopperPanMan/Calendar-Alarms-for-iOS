# Calendar Alarms QR Scanner

Checkpoint readout, 2026-10-05. See [checkpoint status and known issues](../Development/Runtime%20Checkpoint.md) before rebuilding.

`→ Name` names an action's magic variable; it is not an additional Set Variable action. Use actual magic variables in request fields, with the types shown. Named caches must use Set Variable, as written. Unless specified otherwise, Run Script means Scriptable, Run in App Off, Output Type Dictionary. Clear parameters explicitly where specified.

**Known unresolved wiring:** this readout preserves the previously supplied Scanner flow, including its Number comparisons for `shouldShowMenu` and `vibrate`. The unchanged core returns those as Booleans inside JSON text. Restore explicit Get Dictionary from Output where the Scriptable action does not convert it, and use Boolean/is Yes comparisons; these corrections were discussed but have not yet been phone-tested. Dismissing the menu without choosing an option can leave its open flag set for 120 seconds. The proposed timestamp-only cooldown is not implemented here.

```jsx
IF: Shortcut Input does not have any value
    CURRENT DATE:
        → Started
    ADJUST DATE:
        Add 50 seconds to Started
        → Deadline
    WAIT: 2 seconds
    REPEAT: 10 times
        CURRENT DATE:
            → Now
        IF: Now is after Deadline
            STOP THIS SHORTCUT
        END IF
        RUN SCRIPT: Calendar Alarm QR Scanner
            Parameter: none — explicitly clear this field
            → MenuState
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
            → MenuStateShouldShowMenu (Number)
        IF: MenuStateShouldShowMenu is 1
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
        → ScanResult
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
            → MatchingAlarms
        IF: MatchingAlarms has any value
            DELETE ALARMS: MatchingAlarms
        END IF
    END REPEAT
    GET DICTIONARY VALUE:
        Dictionary: ScanResult
        Key: vibrate
        → ScanResultVibrate (Number)
    IF: ScanResultVibrate is 1
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
