/* QR URL helpers shared by the editor and its automated tests. */
(function exposeQrTools(globalScope) {
  const QR_ID_PATTERN = /^[A-Za-z0-9._~-]+$/;
  const SCANNER_SHORTCUT_NAME = 'Calendar Alarms QR Scanner';

  function validateQrCodeID(value) {
    const id = String(value ?? '');
    if (!id) return 'Enter a QR Code ID to generate its code.';
    if (id !== id.trim()) return 'Remove leading or trailing spaces from the QR Code ID.';
    if (!QR_ID_PATTERN.test(id)) return 'Use only letters, numbers, -, ., _, or ~.';
    return '';
  }

  function buildQrShortcutUrl(value) {
    const id = String(value ?? '');
    const error = validateQrCodeID(id);
    if (error) throw new Error(error);
    return `shortcuts://run-shortcut?name=${encodeURIComponent(SCANNER_SHORTCUT_NAME)}&input=${encodeURIComponent(id)}`;
  }

  const api = { QR_ID_PATTERN, SCANNER_SHORTCUT_NAME, validateQrCodeID, buildQrShortcutUrl };
  globalScope.QrTools = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
