# 76-action Scanner release

The 76-action **Calendar Alarms QR Scanner** passes camera results directly to **Calendar Alarm QR Scanner.js**. This script release adds the decoder already used by that installed shortcut, while preserving the repository's newer `taskLoopEnabled !== false` cleanup guard. Without this support, the old repository script converts the request dictionary into a raw code string and fails to match the scanned alarm.

## Input and output contract

- Direct QR links still pass a raw QR code ID to the Scanner core.
- The in-shortcut camera passes `{op: "scanner_scan", input: scannedText, fromScan: true}`. `fromScan` is a Boolean and `input` is the full scanned Shortcuts URL. The core also accepts the JSON-serialized dictionary or a one-item list containing it.
- Camera URLs must target `Calendar Alarms QR Scanner` and contain a nonempty `input` code. Malformed, empty or unrelated camera requests return invalid-code feedback before filesystem access; they never fall through to the legacy no-input menu mode.
- The same invocation decodes the URL and performs the existing locked scan completion. JSON Text output, `errorRegistry`, Clock deletions, vibration, configured scan actions and explicit `Script.complete()` are retained. Native callers still convert this JSON Text to a Dictionary.
- Older raw-code and no-input core callers remain supported. No Runtime change is required, and its older `scan_input` operation remains available to older shortcuts.

## Existing native reduction

These are the already-installed October 27 changes, not native edits made by this PR. The preceding 89-action shortcut included the introductory Comment added after the historical 88-action readout.

| Measurement | Previous shortcut | Selected shortcut | Change |
|---|---:|---:|---:|
| Total native actions, including Comment | 89 | 76 | -13 |
| Scriptable cards | 6 | 4 | -2 |
| Calls for a successful first-menu camera scan | 4 | 3 | -1 |
| Calls for a direct QR-link scan | 1 | 1 | 0 |

Call counts exclude any configured post-scan shortcuts. The camera path is Runtime menu → Runtime camera preparation → camera → Scanner core. The separate Runtime decoder and recursive Scanner self-call are removed; both routes use the existing shared cleanup block. Tapping the shortcut still opens the active-alarm menu and its Scan option still opens Camera.

The existing 15-second camera mute, Silence behavior with a returning notification after 10 seconds, Clock cleanup, scan feedback, configured actions and future-occurrence/task-check protection remain. The accepted simplification tradeoff is that an unrecognized camera code exits after feedback without immediately refreshing the actionable QR banner; the temporary mute expires normally. This script PR adds no further tradeoff, native action or Scriptable call.

## Release and verification

Merge/deploy this script before publishing or reinstalling scripts for the 76-action shortcut. The installer already uses the canonical filename. Until deployment, reinstalling from old main can overwrite the locally installed decoder. This PR does not change a shared shortcut link or any installed shortcut, script, setting or automation.

Regression coverage compares camera dictionaries, serialized dictionaries and one-item lists with direct-code results, including encoded characters, cleanup and configured actions. It also checks invalid camera input without filesystem effects, wrong-code preservation, legacy JSON-like code IDs, disabled task-loop cleanup, and JSON output with explicit completion on error. The existing broader suite covers locking, execution budgets, completion scope and scheduling. Automated tests do not establish iOS execution reliability or resolve the remaining intermittent timeout/cycle failures.
