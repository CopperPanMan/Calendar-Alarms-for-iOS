const test = require('node:test');
const assert = require('node:assert/strict');
const {Harness, root} = require('./helpers/calendar-engine-harness.cjs');
const url = code => 'shortcuts://run-shortcut?name=Calendar%20Alarms%20QR%20Scanner&input=' + encodeURIComponent(code);
const request = input => ({op: 'scanner_scan', fromScan: true, input});
async function active(code = 'bath') {
  const h = new Harness();
  h.putRegistry([{alarmName:'Task', qrCodeID:code, qrActive:true, calcFireTime:h.now/1000-60,
    firstQRFireTime:h.now/1000-60, qrRestartFireTime:h.now/1000+120, qrRestartHHMM:'12:02',
    taskIDs:['floss'], taskCheckFireTime:h.now/1000+600, taskCheckHHMM:'12:10',
    nextFireTime:h.now/1000+600, nextFireHHMM:'12:10',
    qrShortcutsOnScan:[{name:'Follow-up',input:['floss']}]}]);
  h.disk.set(root+'registryLock.txt','');
  return h;
}

test('camera dictionary and serialized dictionary match the direct-code result', async () => {
  for (const code of ['bath','spaces & percent% + unicodeé']) {
    const original = await active(code);
    const expected = await original.run('Calendar Alarm QR Scanner.js', code);
    for (const input of [request(url(code)), JSON.stringify(request(url(code))), [request(url(code))]]) {
      const h = await active(code);
      const got = await h.run('Calendar Alarm QR Scanner.js',input);
      assert.deepEqual(got, expected);
      assert.deepEqual(h.registry(), original.registry());
      assert.equal(got.identifiedAlarms,1);
      assert.equal(got.alarmsToDelete.some(x=>x.mm==='10'),false);
      assert.equal(got.shortcutsToRunDetailed.length,1);
    }
  }
});

test('invalid camera input produces feedback without filesystem access or mutation', async () => {
  for (const input of [request(''),request('bath'),request('https://example.com'),
    request('shortcuts://run-shortcut?name=Other&input=bath'),request(url('')),
    request('shortcuts://run-shortcut?name=%broken&input=bath'),
    request(null),{op:'scanner_scan',input:url('bath'),fromScan:'true'},
    {op:'scanner_scan',input:url('bath')},{}]) {
    const h = await active(); const before = [...h.disk];
    h.fm.bookmarkedPath = () => { throw Error('invalid camera scan touched filesystem'); };
    const result = await h.run('Calendar Alarm QR Scanner.js',input);
    assert.equal(result.mode,'scan');
    assert.equal(result.identifiedAlarms,0);
    assert.equal(result.errorRegistry,'');
    assert.match(result.notification,/not a Calendar Alarms QR code/);
    assert.deepEqual(result.alarmsToDelete,[]);
    assert.deepEqual(result.shortcutsToRunDetailed,[]);
    assert.deepEqual([...h.disk],before);
  }
});

test('valid camera link with a wrong code preserves active alarms and guidance', async () => {
  const h = await active(); const before = h.registry();
  const result = await h.run('Calendar Alarm QR Scanner.js',request(url('wrong')));
  assert.equal(result.identifiedAlarms,0);
  assert.match(result.notification,/wrong code/);
  assert.deepEqual(h.registry(),before);
});

test('legacy raw identifiers that look like JSON stay raw', async () => {
  const code='{"some":"id"}'; const h=await active(code);
  const result=await h.run('Calendar Alarm QR Scanner.js',code);
  assert.equal(result.identifiedAlarms,1);
});


test('camera requests preserve the repository fix for explicitly disabled task loops', async () => {
  const h = await active();
  const rows = h.registry();
  rows[0].taskLoopEnabled = false;
  h.putRegistry(rows);
  const result = await h.run('Calendar Alarm QR Scanner.js', request(url('bath')));
  assert.equal(result.identifiedAlarms, 1);
  assert.equal(result.alarmsToDelete.some(x => x.hh === '12' && x.mm === '10'), true);
  assert.equal(h.registry()[0].taskLoopEnabled, false);
});

test('camera failures still return JSON and explicitly complete the Scriptable invocation', async () => {
  for (const input of [request(url('bath')), request(''), request(url('wrong'))]) {
    const h = await active();
    h.fm.bookmarkedPath = () => { throw Error('Synthetic bookmark failure'); };
    const context = h.context.bind(h);
    let completed = 0;
    h.context = (...args) => {
      const value = context(...args);
      value.Script.complete = () => { completed++; };
      return value;
    };
    const result = await h.run('Calendar Alarm QR Scanner.js', input);
    assert.equal(typeof h.output, 'string');
    assert.equal(completed, 1);
    assert.equal(result.mode, 'scan');
    assert.equal(result.identifiedAlarms, 0);
    assert.deepEqual(result.alarmsToDelete, []);
    assert.deepEqual(result.shortcutsToRunDetailed, []);
    if (input.input) assert.match(result.errorRegistry, /Missing Scriptable File Bookmark/);
    else assert.equal(result.errorRegistry, '');
  }
});
