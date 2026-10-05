const fs=require('fs'), vm=require('vm'), assert=require('assert/strict');
const source=fs.readFileSync(require.resolve('../Calendar Alarms Runtime.js'),'utf8');
let now=Date.parse('2026-10-02T12:00:00-04:00'), seq=0, disk=new Map(), clouds=new Set();
const root='/Shortcuts/OpenHabits/Calendar Alarms/';
const metrics='/Shortcuts/OpenHabits/OpenHabits Metrics/lockoutCache.json';
const fm={bookmarkedPath:()=>'/Shortcuts',joinPath:(a,b)=>a+'/'+b,cacheDirectory:()=>'/local',
 fileExists:p=>disk.has(p),readString:p=>disk.get(p),writeString:(p,v)=>disk.set(p,v),
 createDirectory:()=>{},isFileStoredIniCloud:p=>clouds.has(p),isFileDownloaded:()=>true,
 read:p=>({toBase64String:()=>Buffer.from(disk.get(p)).toString('base64')})};
const RealDate=Date;
class FakeDate extends Date {constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
let events=[];
async function run(r){
 let output;
 const ctx={FileManager:{iCloud:()=>fm,local:()=>fm},UUID:{string:()=>String(++seq)},
 Date:FakeDate,CalendarEvent:{between:async()=>events},args:{shortcutParameter:r},
 Script:{setShortcutOutput:r=>output=r,complete:()=>{}},console};
 await vm.runInNewContext('(async()=>{'+source+'})()',ctx);
 return JSON.parse(JSON.stringify(output));
}
const set=(name,value)=>disk.set(root+name,JSON.stringify(value));
(async()=>{
 let tests=0;
 const check=(condition)=>{assert.ok(condition);tests++;};
 let p=await run({op:'settings_read'});check(!p.exists && !!p.welcome);
 await run({op:'settings_save',skip:true});check(disk.get(root+'settings.json')==='{"disabledCalendars":[]}');
 set('settings.json',{disabledCalendars:['A'],other:3});
 await run({op:'settings_save',names:' A,B, C , ,A'});
 check(JSON.parse(disk.get(root+'settings.json')).disabledCalendars.join(',')==='A,B,C');
 check(JSON.parse(disk.get(root+'settings.json')).other===3);
 await run({op:'settings_save',skip:true});check(JSON.parse(disk.get(root+'settings.json')).disabledCalendars.length===3);
 set('registry.txt',[]);
 const old=(await run({op:'engine_begin',input:'Calendar'}));check(old.cleanInput==='');
 const oldSession=old.session;
 let clock=await run({op:'engine_begin',input:'Clock'});check(clock.activeCount===0 && clock.clock);
 const alarm={qrActive:true,alarmName:'Wake',qrCodeID:'bath',firstQRFireTime:1,qrSoundPath:'marimba.mp3',qrVol:50};
 set('registry.txt',[alarm]);disk.set(root+'Alarm Tones/marimba.mp3','audio');
 p=await run({op:'qr_poll',session:oldSession});check(p.play && p.volume===0.5);
 const key=p.alarmKey;
 await run({op:'scanner_touch'});p=await run({op:'qr_poll',session:oldSession});check(!p.play && !p.stop);
 now+=13000;p=await run({op:'qr_poll',session:oldSession});check(p.play);
 check((await run({op:'qr_permit',session:oldSession,duration:2,alarmKey:key})).play);
 const playbackPath='/local/calendar-alarms-playback-v1.json';
 const reservation=disk.get(playbackPath);
 check(JSON.parse(reservation).expectedEndAt===now+3000);
 check(!(await run({op:'qr_poll',session:oldSession})).play);
 const successor=(await run({op:'engine_begin',input:''})).session;
 check(disk.get(playbackPath)===reservation);
 let waiting=await run({op:'qr_poll',session:successor});check(!waiting.stop&&!waiting.play);
 check(!(await run({op:'qr_permit',session:successor,duration:2,alarmKey:key})).play);
 check((await run({op:'qr_poll',session:oldSession})).stop);
 check(disk.get(playbackPath)===reservation); // old instance cannot clear the marker
 now+=2999;check(!(await run({op:'qr_poll',session:successor})).play);
 now+=1;check((await run({op:'qr_poll',session:successor})).play);
 const concurrent=await Promise.all([1,2].map(()=>run({op:'qr_permit',session:successor,duration:2,alarmKey:key})));
 check(concurrent.filter(p=>p.play).length===1);
 // No completion callback is required: a crash after permission expires naturally.
 now+=3000;check((await run({op:'qr_poll',session:successor})).play);
 await run({op:'scanner_touch'});
 check(!(await run({op:'qr_permit',session:successor,duration:2,alarmKey:key})).play);
 now+=60000;check((await run({op:'qr_poll',session:successor})).play); // missed successor still rings
 let newer=await run({op:'engine_begin',input:''});check((await run({op:'qr_poll',session:oldSession})).stop);
 check((await run({op:'qr_permit',session:oldSession,duration:2,alarmKey:key})).stop);
 now=newer.session.deadline-3000;check((await run({op:'qr_permit',session:newer.session,duration:2,alarmKey:key})).stop);
 now=newer.session.deadline;check((await run({op:'qr_poll',session:newer.session})).stop);
 newer=await run({op:'engine_begin',input:''});set('registry.txt',[]);
 check((await run({op:'qr_poll',session:newer.session})).stop);
 check((await run({op:'scan_input',input:'shortcuts://run-shortcut?name=Calendar%20Alarms%20QR%20Scanner&input=bath%2Broom',fromScan:true})).code==='bath+room');
 check((await run({op:'scan_input',input:'https://bad.test/?input=x',fromScan:true})).code==='');
 check((await run({op:'scan_input',input:'x%20y'})).code==='x%20y');
 for (const mode of ['show','speak','both']){
 p=await run({op:'action',input:[JSON.stringify({action:'notification',message:'Hi',mode,title:'Title'})],focus:'Do Not Disturb'});
 check(p.show && !p.speak && p.title==='Title');
 }
 p=await run({op:'action',input:{action:'notification',message:'Hi'}});check(p.show && !p.speak);
 p=await run({op:'action',input:{action:'display',operation:'brightness',percent:0}});check(p.kind==='brightness'&&p.level===0);
 await assert.rejects(()=>run({op:'action',input:{action:'audio',operation:'volume',percent:101}}));tests++;
 await assert.rejects(()=>run({op:'action',input:[{},{}]}));tests++;
 const c={ok:true,generatedAtISO:new RealDate(now).toISOString(),reminderState:{todayPoints:10,byID:{
  done:{complete:true},normal:{displayName:'Floss',points:1,streak:2,complete:false,scheduledToday:true},
  urgent:{displayName:'Walk',points:2,dueProperties:{hasDeadline:true,status:'due',minutesRemaining:12}},
  critical:{displayName:'Brush',streak:3,dueProperties:{hasDeadline:true,status:'due',minutesRemaining:2}},
  expired:{dueProperties:{hasDeadline:true,status:'expired',minutesRemaining:-1}},
  unscheduled:{scheduledToday:false}
 }}};
 disk.set(metrics,JSON.stringify(c));
 p=await run({op:'action',input:{action:'openhabits_reminder',metricIDs:['normal','done','urgent','critical','expired','missing','unscheduled'],mode:'both'}});
 check(!p.refresh&&p.message.startsWith('Final reminder. Log Brush within 2 minutes'));
 check(p.message.includes('Log Floss for 1 point.')&&p.message.includes('You currently have 10 points.'));
 check(p.speak&&p.show&&!p.message.includes('missing'));
 now+=91000;p=await run({op:'action',input:{action:'openhabits_reminder',metricIDs:['normal']}});check(p.refresh);
 p=await run({op:'action',input:{action:'openhabits_reminder',metricIDs:['normal']},refreshed:true});check(!p.refresh&&p.show);
 p=await run({op:'action',input:{action:'task_alarm_reset',taskLoopMetricIDs:['done'],qrCodeID:'bath'}});check(p.refresh);
 p=await run({op:'action',input:{action:'task_alarm_reset',taskLoopMetricIDs:['done'],qrCodeID:'bath'},refreshed:true});
 check(p.allComplete&&p.qrCodeID==='bath'&&JSON.parse(p.engineInput).metricsByID[0].complete);
 p=await run({op:'action',input:{action:'task_alarm_reset',taskLoopMetricIDs:['done','missing']},refreshed:true});check(!p.allComplete);
 disk.set(metrics,'{}');p=await run({op:'action',input:{action:'task_alarm_reset',taskLoopMetricIDs:['done']},refreshed:true});check(p.ok===false);
 p=await run({op:'wake_plan',sleep:{start:'2026-10-02T02:30:00-04:00',end:'2026-10-02T10:30:00-04:00'},time:'07:30'});
 check(p.hh===7&&p.mm===30&&(Date.parse(p.end)-Date.parse(p.start))===8*3600000);
 const dst=await run({op:'wake_plan',sleep:{start:'2026-10-31T23:30:00-04:00',end:'2026-11-01T06:30:00-05:00'},time:'08:30'});
 check(dst.hh===8&&dst.mm===30&&(Date.parse(dst.end)-Date.parse(dst.start))===8*3600000);
 const diagnosticSession=(await run({op:'engine_begin',input:''})).session;
 check((await run({op:'engine_begin',input:'Clock'})).clock===1);
 check((await run({op:'engine_begin',input:'Clock'})).activeCount===0);
 set('registry.txt',[alarm]);
 disk.delete('/local/calendar-alarms-playback-v1.json');
 disk.set(root+'scannerLastOpened.txt',new RealDate(0).toISOString());
 let diagnostic=await run({op:'qr_poll',session:diagnosticSession});
 check(diagnostic.stop===0&&diagnostic.play===1);
 check(diagnostic.fileName==='marimba.mp3'&&!('audio' in diagnostic));
 check((await run({op:'sound_file',file:'Alarm Tones/'+diagnostic.fileName}))===root+'Alarm Tones/marimba.mp3');
 diagnostic=await run({op:'qr_poll'});
 check(diagnostic.stop===1&&diagnostic.play===0&&diagnostic.reason==='invalid_session');
 diagnostic=await run({op:'qr_poll',session:JSON.stringify(diagnosticSession)});
 check(diagnostic.stop===0&&diagnostic.play===1);
 check((await run({op:'qr_poll',session:{}})).reason==='invalid_session');
 check((await run({op:'qr_poll',session:{id:diagnosticSession.id,deadline:'bad'}})).reason==='invalid_session');
 const diagnosticOwnerPath='/local/calendar-alarms-loop-owner-v1.json';
 const savedOwner=disk.get(diagnosticOwnerPath);
 disk.delete(diagnosticOwnerPath);
 check((await run({op:'qr_poll',session:diagnosticSession})).reason==='owner_missing');
 disk.set(diagnosticOwnerPath,savedOwner);
 check((await run({op:'qr_poll',session:{...diagnosticSession,id:'other'}})).reason==='superseded');
 const diagnosticNow=now; now=diagnosticSession.deadline;
 check((await run({op:'qr_poll',session:diagnosticSession})).reason==='deadline_expired');
 now=diagnosticNow;
 set('registry.txt',[]);
 check((await run({op:'qr_poll',session:diagnosticSession})).reason==='no_active_qr_alarm');
 set('registry.txt',[alarm]);
 check((await run({op:'qr_permit',session:diagnosticSession,duration:999,alarmKey:key})).reason==='clip_exceeds_remaining_time');
 await run({op:'scanner_touch'});
 diagnostic=await run({op:'qr_poll',session:diagnosticSession});
 check(diagnostic.stop===0&&diagnostic.play===0&&!diagnostic.reason);
 now+=13000;
 diagnostic=await run({op:'qr_permit',session:JSON.stringify(diagnosticSession),duration:2,alarmKey:key});
 check(diagnostic.stop===0&&diagnostic.play===1);
 diagnostic=await run({op:'qr_poll',session:diagnosticSession});
 check(diagnostic.stop===0&&diagnostic.play===0&&!diagnostic.reason);
 // QR poll returns a canonical subfolder path without touching audio bytes.
 disk.delete(playbackPath);
 const expiredScanner = new RealDate(0).toISOString();
 disk.set(root+'scannerLastOpened.txt',expiredScanner);
 const fresh=(await run({op:'engine_begin',input:''})).session;
 for(const candidate of ['Nature/ocean.mp3','Alarm Tones/Nature/ocean.mp3',
   'OpenHabits/Calendar Alarms/Alarm Tones/Nature/ocean.mp3',
   '/Shortcuts/OpenHabits/Calendar Alarms/Alarm Tones/Nature/ocean.mp3',
   'Alarm Tones\\Nature\\ocean.mp3']) {
   set('registry.txt',[{...alarm,qrSoundPath:candidate}]);
   p=await run({op:'qr_poll',session:fresh});
   check(p.fileName==='Nature/ocean.mp3' && !('audio' in p) && !('file' in p));
 }
 set('registry.txt',[{...alarm,qrSoundPath:'Other/ocean.mp3'}]);
 check((await run({op:'qr_poll',session:fresh})).fileName==='Other/ocean.mp3');
 for(const candidate of ['../ocean.mp3','Nature/../ocean.mp3','Alarm Tones/','Nature//ocean.mp3']) {
   set('registry.txt',[{...alarm,qrSoundPath:candidate}]);
   await assert.rejects(()=>run({op:'qr_poll',session:fresh}));tests++;
 }
 set('registry.txt',[alarm]);
 p=await run({op:'qr_poll',session:fresh});
 now=fresh.deadline-3001;
 check((await run({op:'qr_permit',session:fresh,duration:2,alarmKey:p.alarmKey})).play===1);
 check(JSON.parse(disk.get(playbackPath)).expectedEndAt===fresh.deadline-1);
 disk.delete(playbackPath);now=fresh.deadline-3000;
 check((await run({op:'qr_permit',session:fresh,duration:2,alarmKey:p.alarmKey})).reason==='clip_exceeds_remaining_time');
 console.log('PASS:',tests,'behavior checks; no network API provided to runtime.');
})().catch(e=>{console.error(e);process.exitCode=1});
