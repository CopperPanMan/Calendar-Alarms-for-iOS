const test = require('node:test');
const assert = require('node:assert/strict');

const { buildQrShortcutUrl, validateQrCodeID } = require('../docs/qr-tools.js');

test('builds the Calendar Alarms scanner URL', () => {
  assert.equal(
    buildQrShortcutUrl('wakeup'),
    'shortcuts://run-shortcut?name=Calendar%20Alarms%20QR%20Scanner&input=wakeup',
  );
});

test('accepts every supported QR ID character', () => {
  assert.equal(validateQrCodeID('Morning-Alarm_1.0~backup'), '');
});

test('rejects empty, spaced, and unsupported QR IDs', () => {
  assert.match(validateQrCodeID(''), /Enter/);
  assert.match(validateQrCodeID(' wakeup'), /leading or trailing/);
  assert.match(validateQrCodeID('wake up'), /only letters/);
  assert.throws(() => buildQrShortcutUrl('wake up'), /only letters/);
});
