const test = require('node:test');
const assert = require('node:assert/strict');
const {Harness,root,registryPath}=require('./helpers/calendar-engine-harness.cjs');
const qr=(extra={})=>({alarmName:'Native Test',qrCodeID:'native-test',qrSoundPath:'Alarm Tones/ocean.mp3',qrVol:30,...extra});
async function playing(defs=[qr()]) {const h=new Harness(defs,{nativePlaybackV2:true});await h.install();const p=await h.engine();return {h,p};}
test('native preparation emits a committed activation, sound, volume and 5+1 second deadline',async()=>{
 const {h,p}=await playing();const v=p.nativePlaybackPlan;assert.equal(v.enabled,1);
 assert.equal(v.activationID,h.registry()[0].nativePlaybackID);assert.ok(v.ownerID);
 assert.equal(v.soundPath,'Alarm Tones/ocean.mp3');assert.equal(v.volume,.3);
 assert.equal(Date.parse(v.clipDeadlineISO),h.registry()[0].qrRestartFireTime*1000-6000);
 assert.equal(h.disk.has(root+'nativePlaybackTestOwner.txt'),false);assert.equal(h.disk.has(root+'nativeLoopOwner.txt'),false);
});
test('two-minute restart retains activation but returns a new invocation owner',async()=>{
 const {h,p}=await playing();h.at(2);const next=(await h.engine()).nativePlaybackPlan;
 assert.equal(next.enabled,1);assert.equal(next.activationID,p.nativePlaybackPlan.activationID);
 assert.notEqual(next.ownerID,p.nativePlaybackPlan.ownerID);assert.equal(h.registry()[0].nativePlaybackID,next.activationID);
});
test('an already-active occurrence gets one persistent migration ID',async()=>{
 const h=new Harness([qr()]);await h.install();await h.engine();assert.equal(h.registry()[0].nativePlaybackID,undefined);
 h.options.nativePlaybackV2=true;h.at(2);const first=(await h.engine()).nativePlaybackPlan;
 assert.equal(first.enabled,1);assert.equal(first.activationID,h.registry()[0].nativePlaybackID);
 h.at(4);assert.equal((await h.engine()).nativePlaybackPlan.activationID,first.activationID);
});
test('scan invalidates native activation eligibility and next occurrence gets a different ID',async()=>{
 const {h,p}=await playing([qr(),qr({offsetMin:10})]);await h.scan('native-test');
 assert.equal(h.registry().some(x=>x.qrActive&&x.nativePlaybackID===p.nativePlaybackPlan.activationID),false);
 h.at(10);const later=(await h.engine()).nativePlaybackPlan;
 assert.equal(later.enabled,1);assert.notEqual(later.activationID,p.nativePlaybackPlan.activationID);
});
test('failed registry commit cannot produce an enabled plan',async()=>{
 const h=new Harness([qr()],{nativePlaybackV2:true});await h.install();h.options.failRegistryWrite=true;
 const p=await h.engine('',false);assert.equal(p.nativePlaybackPlan.enabled,0);assert.deepEqual(p.alarmsToDelete,[]);
});
test('concurrent scan survives commit and prevents stale native playback',async()=>{
 const {h}=await playing();h.at(2);let reads=0;
 h.options.onRead=(p)=>{if(p===registryPath&&++reads===2){const rows=h.registry();rows[0].qrActive=false;h.putRegistry(rows);}};
 const p=await h.engine('',false);assert.equal(p.nativePlaybackPlan.enabled,0);assert.equal(h.registry()[0].qrActive,false);
});
test('concurrent replacement activation cannot be overwritten by an older patch',async()=>{
 const {h}=await playing();h.at(2);let reads=0;
 h.options.onRead=(p)=>{if(p===registryPath&&++reads===2){const rows=h.registry();rows[0].nativePlaybackID='newer-activation';rows[0].qrRestartFireTime+=120;h.putRegistry(rows);}};
 const p=await h.engine('',false);assert.equal(h.registry()[0].nativePlaybackID,'newer-activation');
 assert.equal(p.nativePlaybackPlan.activationID,'newer-activation');assert.ok(p.debug.rejectedScheduleKeys.length);
});
test('scoped completion preserves tomorrow and never starts native playback',async()=>{
 const task={taskIDs:['floss'],taskLoopMin:10,maxReschedules:3};const {h}=await playing([qr(task),qr({...task,offsetMin:1430})]);
 const start=new Date(h.now);start.setHours(0,0,0,0);const end=new Date(start);end.setDate(end.getDate()+1);
 const p=await h.engine(JSON.stringify({ok:true,metricsByID:[{metricID:'floss',complete:true}],completionScope:{evaluatedAtISO:new Date(h.now).toISOString(),windowStartISO:start.toISOString(),windowEndISO:end.toISOString()}}));
 assert.deepEqual(h.registry().map(x=>x.taskSatisfied),[true,false]);assert.equal(h.clock.length,1);assert.equal(p.nativePlaybackPlan.enabled,0);
});
test('invalid input still returns explicit disabled numeric native output',async()=>{
 const h=new Harness();assert.equal((await h.run('Calendar Alarm Engine.js',{})).nativePlaybackPlan.enabled,0);
});
test('invalid sound path disables native plan without an owner claim',async()=>{
 const {h}=await playing();const rows=h.registry();rows[0].qrSoundPath='../bad.mp3';h.putRegistry(rows);h.at(2);
 const p=await h.engine();assert.equal(p.nativePlaybackPlan.enabled,0);assert.match(p.errorRegistry,/sound path/);
});
test('native begin classifies empty and Calendar inputs without tickets or owner writes',async()=>{
 const h=new Harness();for(const input of [undefined,'',[],[''],' \n ','Calendar']){
  const p=await h.runtime({op:'engine_begin',nativePlaybackV2:true,input});assert.equal(p.clock,0);assert.equal(p.completionOnly,0);assert.equal(p.cleanInput,'');assert.equal(p.session,undefined);
 }assert.equal(h.disk.has('/local/calendar-alarms-loop-ticket-v1.txt'),false);assert.equal(h.disk.has('/local/calendar-alarms-loop-owner-v1.json'),false);
});
test('native begin retains completion passthrough and Clock guard',async()=>{
 const {h}=await playing();const input='{"ok":false}';const p=await h.runtime({op:'engine_begin',nativePlaybackV2:true,input});
 assert.equal(p.completionOnly,1);assert.equal(p.cleanInput,input);assert.equal(p.session,undefined);
 const g=await h.runtime({op:'engine_begin',nativePlaybackV2:true,input:'Clock'});assert.equal(g.clock,1);assert.equal(g.activeCount,1);
});
