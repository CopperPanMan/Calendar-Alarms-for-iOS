const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('every built-in QR sound has a source ringtone', () => {
  const docsDirectory = path.join(__dirname, '..', 'docs');
  const ringtoneDirectory = path.join(__dirname, '..', 'qr alarm ringtones');
  const html = fs.readFileSync(path.join(docsDirectory, 'index.html'), 'utf8');
  const soundList = html.match(/<datalist id="qrBuiltInSounds">([\s\S]*?)<\/datalist>/);

  assert.ok(soundList, 'built-in QR sound list should exist');
  const filenames = Array.from(soundList[1].matchAll(/<option value="([^"]+)"/g), (match) => match[1]);
  assert.ok(filenames.length > 0, 'built-in QR sound list should not be empty');

  filenames.forEach((filename) => {
    assert.ok(fs.existsSync(path.join(ringtoneDirectory, filename)), `${filename} should have a source ringtone`);
  });
});
