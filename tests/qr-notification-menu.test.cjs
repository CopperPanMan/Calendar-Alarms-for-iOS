const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');
const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'Calendar Alarms Runtime.js'), 'utf8');
const ROOT = '/Shortcuts/OpenHabits/Calendar Alarms/';
const ID = 'calendar-alarms-qr-menu-v1';
const UX = '/local/calendar-alarms-qr-menu-v1.json';
const PLAY = '/local/calendar-alarms-playback-v1.json';
const alarm = {alarmName:'Wake',qrActive:true,qrCodeID:'bath',firstQRFireTime:1,qrSoundPath:'ring.mp3',qrVol:50};

function harness() {
  let now = Date.parse('2026-10-18T14:00:00Z'), seq = 0, output;
  const disk = new Map(), pending = new Map(), delivered = new Map(), schedules = [];
  let scheduleFailure = false, onSchedule;
  class FakeDate extends Date {
    constructor(...args){super(...(args.length ? args : [now]));}
    static now(){return now;}
  }
  const fm = {bookmarkedPath:()=>'/Shortcuts',joinPath:(a,b)=>a+'/'+b,cacheDirectory:()=>'/local',
    fileExists:p=>disk.has(p),readString:p=>disk.get(p),writeString:(p,v)=>disk.set(p,v),
    createDirectory:()=>{},isFileStoredIniCloud:()=>false,isFileDownloaded:()=>true};
  class Notification {
    static async removePending(ids){for(const id of ids)pending.delete(id);}
    static async removeDelivered(ids){for(const id of ids)delivered.delete(id);}
    setTriggerDate(d){this.date=d.getTime();}
    async schedule(){
      if(scheduleFailure)throw Error('Notification denied');
      const n=JSON.parse(JSON.stringify({...this,date:this.date || now}));
      schedules.push(n);pending.set(n.identifier,n);
      if(onSchedule)await onSchedule();
    }
  }
  const setRows=rows=>disk.set(ROOT+'registry.txt',JSON.stringify(rows));
  setRows([alarm]);disk.set(ROOT+'scannerLastOpened.txt',new Date(0).toISOString());
  async function run(request){
    const context={FileManager:{iCloud:()=>fm,local:()=>fm},Notification,Date:FakeDate,
      UUID:{string:()=>String(++seq)},args:{shortcutParameter:request},
      Script:{setShortcutOutput:x=>output=x,complete:()=>{}}};
    await vm.runInNewContext('(async()=>{'+source+'})()',context);
    return JSON.parse(JSON.stringify(output));
  }
  return {run,disk,pending,delivered,schedules,setRows,
    get now(){return now;},advance(ms){now+=ms;for(const [id,n]of pending)if(n.date<=now){pending.delete(id);delivered.set(id,n);}},
    failSchedule(){scheduleFailure=true;},onSchedule(fn){onSchedule=fn;}};
}

test('notification routes to the main Scanner and replaces only its own notification',async()=>{
  const h=harness();h.pending.set('unrelated',{date:h.now+100000});h.delivered.set('unrelated',{});
  const session=(await h.run({op:'engine_begin',input:''})).session;
  assert.equal(session.deadline-h.now,180000);
  const n=await h.run({op:'qr_notification',session:JSON.stringify(session)});
  assert.equal(n.ok,1);assert.equal(h.schedules.length,1);
  const posted=h.schedules[0],url=new URL(posted.openURL);
  assert.equal(url.protocol,'shortcuts:');assert.equal(url.searchParams.get('name'),'Calendar Alarms QR Scanner');
  assert.equal(url.searchParams.has('input'),false);assert.equal(posted.sound,null);
  assert.equal(posted.title,'Wake');assert.ok(posted.body.includes('15 seconds'));
  assert.ok(h.pending.has('unrelated'));assert.ok(h.delivered.has('unrelated'));
  h.advance(120000);const next=(await h.run({op:'engine_begin',input:''})).session;
  await h.run({op:'qr_notification',session:next});assert.equal(h.schedules.length,2);
  assert.equal(h.schedules[1].identifier,ID);
});

test('menu opens repeatedly without old menu flags and never extends silence',async()=>{
  const h=harness();h.disk.set(ROOT+'menuOpenStatus.txt','true');h.disk.set(ROOT+'menuLastOpened.txt',new Date(h.now).toISOString());
  const first=await h.run({op:'scanner_menu'}),second=await h.run({op:'scanner_menu'});
  assert.equal(first.activeCount,1);assert.equal(second.activeCount,1);assert.equal(first.activeName,'Wake');
  assert.equal(first.error,'');
  assert.equal(h.disk.get(ROOT+'menuOpenStatus.txt'),'true');
  assert.equal(h.disk.get(ROOT+'scannerLastOpened.txt'),new Date(0).toISOString());
  assert.equal(h.schedules.length,0);assert.equal(JSON.parse(h.disk.get(UX)).silenceUntil,undefined);
});

test('Silence returns a notification at ten seconds and blocks poll AND permit until fifteen',async()=>{
  const h=harness(),session=(await h.run({op:'engine_begin',input:''})).session;
  const poll=await h.run({op:'qr_poll',session}),start=h.now;
  const silence=await h.run({op:'scanner_silence'});
  assert.equal(silence.error,'');
  assert.equal(silence.silenceUntil,start+15000);assert.equal(silence.reminderAt,start+10000);
  assert.equal(h.pending.get(ID).date,start+10000);
  for(const advance of [0,10000,3000,1999]){
    h.advance(advance);
    assert.equal((await h.run({op:'qr_poll',session})).play,0);
    assert.equal((await h.run({op:'qr_permit',session,duration:6,alarmKey:poll.alarmKey})).play,0);
  }
  assert.ok(h.delivered.has(ID));
  h.advance(1);assert.equal((await h.run({op:'qr_poll',session})).play,1);
  assert.equal((await h.run({op:'qr_permit',session,duration:6,alarmKey:poll.alarmKey})).play,1);
});

test('an engine successor preserves both deadlines and opening the returning menu does not renew mute',async()=>{
  const h=harness();const old=(await h.run({op:'engine_begin',input:''})).session;
  const start=h.now;await h.run({op:'scanner_silence'});h.advance(4000);
  const next=(await h.run({op:'engine_begin',input:''})).session;
  assert.equal((await h.run({op:'qr_notification',session:next})).kept,1);
  assert.equal(h.schedules.length,1);assert.equal(h.pending.get(ID).date,start+10000);
  assert.equal((await h.run({op:'qr_poll',session:old})).stop,0); // pending successor preserves current player
  h.advance(6000);await h.run({op:'scanner_menu'});
  assert.equal(h.pending.has(ID),false);assert.equal(h.delivered.has(ID),false);
  assert.equal(JSON.parse(h.disk.get(UX)).silenceUntil,start+15000);
  h.advance(4999);assert.equal((await h.run({op:'qr_poll',session:next})).play,0);
  h.advance(1);assert.equal((await h.run({op:'qr_poll',session:next})).play,1);
});

test('a second Silence replaces the old reminder and starts a fresh fifteen seconds',async()=>{
  const h=harness(),start=h.now;await h.run({op:'scanner_silence'});h.advance(9000);
  await h.run({op:'scanner_silence'});
  assert.equal(h.pending.get(ID).date,start+19000);
  assert.equal(JSON.parse(h.disk.get(UX)).silenceUntil,start+24000);
  assert.equal(h.pending.size,1);
});

test('camera preparation cancels reminders; successful scan clears only QR UX state',async()=>{
  const h=harness();await h.run({op:'scanner_silence'});h.advance(2000);
  const prep=await h.run({op:'scanner_scan_begin'});assert.equal(prep.activeCount,1);
  assert.equal(h.pending.has(ID),false);assert.equal(h.delivered.has(ID),false);
  h.pending.set('unrelated',{date:h.now+30000});h.setRows([{...alarm,qrActive:false}]);
  assert.equal((await h.run({op:'scanner_scan_finished'})).activeCount,0);
  assert.equal(h.pending.has(ID),false);assert.equal(h.pending.has('unrelated'),true);
  assert.deepEqual(JSON.parse(h.disk.get(UX)),{});
  assert.equal(h.disk.get(ROOT+'scannerLastOpened.txt'),new Date(0).toISOString());
});

test('wrong scan or another active QR retains an actionable notification',async()=>{
  const h=harness();await h.run({op:'scanner_scan_begin'});await h.run({op:'scanner_scan_finished'});
  assert.equal(h.pending.get(ID).title,'Wake');
  h.setRows([{...alarm,qrActive:false},{...alarm,alarmName:'Other',qrCodeID:'other'}]);
  await h.run({op:'scanner_scan_finished'});assert.equal(h.pending.get(ID).title,'Other');
});

test('completion before reminder delivery cancels it and idle menu exits quietly',async()=>{
  const h=harness();await h.run({op:'scanner_silence'});h.advance(5000);h.setRows([]);
  assert.equal((await h.run({op:'qr_notification',cleanupOnly:true})).activeCount,0);
  assert.equal(h.pending.has(ID),false);h.advance(5000);assert.equal(h.delivered.has(ID),false);
  const idle=await h.run({op:'scanner_menu'});assert.equal(idle.ok,1);assert.equal(idle.activeCount,0);
  assert.equal(h.schedules.length,1);
});

test('an engine poll clears an untouched initial notification when the last QR stops',async()=>{
  const h=harness(),session=(await h.run({op:'engine_begin',input:''})).session;
  await h.run({op:'qr_notification',session});h.advance(1);assert.ok(h.delivered.has(ID));
  h.setRows([]);assert.equal((await h.run({op:'qr_poll',session})).reason,'no_active_qr_alarm');
  assert.equal(h.delivered.has(ID),false);assert.equal(h.pending.has(ID),false);
});

test('a completion during system notification scheduling cannot leave the new reminder behind',async()=>{
  const h=harness();h.onSchedule(()=>h.setRows([]));
  await h.run({op:'scanner_silence'});assert.equal(h.pending.has(ID),false);
});

test('notification failure does not throw or block playable alarm state',async()=>{
  const h=harness(),session=(await h.run({op:'engine_begin',input:''})).session;
  h.failSchedule();const result=await h.run({op:'qr_notification',session});
  assert.equal(result.ok,1);assert.equal(result.activeCount,1);assert.ok(result.notificationWarning.includes('Notification denied'));
  assert.equal((await h.run({op:'qr_poll',session})).play,1);
  const silenced=await h.run({op:'scanner_silence'});assert.equal(silenced.ok,1);assert.equal(silenced.activeCount,1);
  assert.equal((await h.run({op:'qr_poll',session})).play,0);
});

test('finished native playback releases only its exact lease before the fallback expiry',async()=>{
  const h=harness(),session=(await h.run({op:'engine_begin',input:''})).session;
  let p=await h.run({op:'qr_poll',session});
  const permit=await h.run({op:'qr_permit',session,duration:6,alarmKey:p.alarmKey});
  assert.equal(permit.play,1);assert.ok(permit.playbackToken);h.advance(6000);
  assert.equal((await h.run({op:'qr_poll',session})).play,0);
  p=await h.run({op:'qr_poll',session,completedPlaybackToken:permit.playbackToken});assert.equal(p.play,1);
  const next=await h.run({op:'qr_permit',session,duration:6,alarmKey:p.alarmKey});
  assert.notEqual(next.playbackToken,permit.playbackToken);
  assert.equal((await h.run({op:'qr_poll',session,completedPlaybackToken:permit.playbackToken})).play,0);
  assert.equal(JSON.parse(h.disk.get(PLAY)).playbackToken,next.playbackToken);
});

test('a superseded player may acknowledge its finished clip but cannot release a successor clip',async()=>{
  const h=harness(),old=(await h.run({op:'engine_begin',input:''})).session;
  const p=await h.run({op:'qr_poll',session:old});
  const permit=await h.run({op:'qr_permit',session:old,duration:6,alarmKey:p.alarmKey});h.advance(2000);
  const next=(await h.run({op:'engine_begin',input:''})).session;
  assert.equal((await h.run({op:'qr_poll',session:next})).play,0);h.advance(4000);
  assert.equal((await h.run({op:'qr_poll',session:old,completedPlaybackToken:permit.playbackToken})).stop,0); // successor has not committed yet
  const nextPoll=await h.run({op:'qr_poll',session:next});assert.equal(nextPoll.play,1);
  const nextPermit=await h.run({op:'qr_permit',session:next,duration:6,alarmKey:nextPoll.alarmKey});
  await h.run({op:'qr_poll',session:old,completedPlaybackToken:permit.playbackToken});
  assert.equal(JSON.parse(h.disk.get(PLAY)).playbackToken,nextPermit.playbackToken);
  assert.equal((await h.run({op:'qr_poll',session:next})).play,0);
});

test('reliable poll never schedules notifications; explicit post-playback maintenance does',async()=>{
 const h=harness(),session=(await h.run({op:'engine_begin',input:'',reliableQRHandoff:true})).session;
 const first=await h.run({op:'qr_poll',session:JSON.stringify(session),notificationPollIndex:'1'});
 assert.equal(first.play,1);assert.equal(h.schedules.length,0);
 await h.run({op:'qr_notification',session});assert.equal(h.schedules.length,1);assert.ok(h.schedules[0].openURL.includes('Calendar%20Alarms%20QR%20Scanner'));
 await h.run({op:'qr_poll',session,notificationPollIndex:2});await h.run({op:'qr_poll',session,notificationPollIndex:'3'});assert.equal(h.schedules.length,1);
 h.advance(120000);const next=(await h.run({op:'engine_begin',input:'',reliableQRHandoff:true})).session;
 await h.run({op:'qr_poll',session:next,notificationPollIndex:'1'});assert.equal(h.schedules.length,1);
 await h.run({op:'qr_notification',session:next});assert.equal(h.schedules.length,2);
});
test('legacy polls without the optional counter retain no-notification behavior',async()=>{
 const h=harness(),s=(await h.run({op:'engine_begin',input:''})).session;
 assert.equal((await h.run({op:'qr_poll',session:s})).play,1);assert.equal(h.schedules.length,0);
});
test('superseded and expired first polls never post',async()=>{
 const h=harness(),old=(await h.run({op:'engine_begin',input:''})).session;
 const current=(await h.run({op:'engine_begin',input:''})).session;
 const plan=await h.run({op:'qr_poll',session:current});
 await h.run({op:'qr_permit',session:current,alarmKey:plan.alarmKey,duration:2});
 assert.equal((await h.run({op:'qr_poll',session:old,notificationPollIndex:1})).reason,'superseded');assert.equal(h.schedules.length,0);
 h.advance(180000);assert.equal((await h.run({op:'qr_poll',session:current,notificationPollIndex:1})).reason,'deadline_expired');assert.equal(h.schedules.length,0);
});
test('notification denial does not stop first-poll playback or retry on later polls',async()=>{
 const h=harness(),s=(await h.run({op:'engine_begin',input:''})).session;h.failSchedule();
 assert.equal((await h.run({op:'qr_poll',session:s,notificationPollIndex:1})).play,1);
 assert.equal((await h.run({op:'qr_poll',session:s,notificationPollIndex:2})).play,1);
});
test('first poll preserves pending ten-second reminder and fifteen-second silence',async()=>{
 const h=harness(),s=(await h.run({op:'engine_begin',input:''})).session,start=h.now;
 await h.run({op:'scanner_silence'});h.advance(2000);
 assert.equal((await h.run({op:'qr_poll',session:s,notificationPollIndex:1})).play,0);
 assert.equal(h.schedules.length,1);assert.equal(h.pending.get(ID).date,start+10000);assert.equal(JSON.parse(h.disk.get(UX)).silenceUntil,start+15000);
 h.advance(13000);assert.equal((await h.run({op:'qr_poll',session:s,notificationPollIndex:2})).play,1);assert.equal(h.schedules.length,1);
});
test('scan or ownership change during notification is checked before playback',async()=>{
 const h=harness(),s=(await h.run({op:'engine_begin',input:''})).session;h.onSchedule(()=>h.setRows([]));
 await h.run({op:'qr_notification',session:s});
 assert.equal((await h.run({op:'qr_poll',session:s,notificationPollIndex:1})).reason,'no_active_qr_alarm');assert.equal(h.pending.size,0);
 const b=harness(),old=(await b.run({op:'engine_begin',input:''})).session;b.onSchedule(async()=>{const next=(await b.run({op:'engine_begin',input:''})).session;const plan=await b.run({op:'qr_poll',session:next});await b.run({op:'qr_permit',session:next,alarmKey:plan.alarmKey,duration:2});});
 await b.run({op:'qr_notification',session:old});
 assert.equal((await b.run({op:'qr_poll',session:old,notificationPollIndex:1})).reason,'superseded');
});
test('notification time counts against the existing buffered deadline',async()=>{
 const h=harness(),s=(await h.run({op:'engine_begin',input:''})).session;const bounded={...s,deadline:h.now+1000};h.onSchedule(()=>h.advance(1100));
 await h.run({op:'qr_notification',session:bounded});
 assert.equal((await h.run({op:'qr_poll',session:bounded,notificationPollIndex:1})).reason,'deadline_expired');
});
