const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync(require.resolve('../Inline Scriptable/Calendar Alarms Installer.js'),'utf8');
const disk=new Map(), calls=[];
const fm={documentsDirectory:()=>'/scripts',bookmarkedPath:()=>'/Shortcuts',bookmarkExists:()=>true,
 joinPath:(a,b)=>a+'/'+b,fileExists:p=>disk.has(p),createDirectory:p=>disk.set(p,'DIR'),isDirectory:p=>disk.get(p)==='DIR',
 writeString:(p,v)=>disk.set(p,v),write:(p,v)=>disk.set(p,v)};
let fail=false;
class Request {constructor(url){this.url=url;this.response={statusCode:200};}
 async loadString(){calls.push(this.url);if(fail&&this.url.includes('Runtime')){this.response.statusCode=404;return 'missing';}return '//'.padEnd(110,' ')+'\nScript.setShortcutOutput({});';}
 async load(){calls.push(this.url);return {length:10};}}
async function run(){let output;await vm.runInNewContext('(async()=>{'+source+'})()',{
 FileManager:{iCloud:()=>fm,local:()=>fm},Request,Script:{setShortcutOutput:r=>output=JSON.parse(r)}});return output;}
(async()=>{
 let r=await run();assert.equal(r.ok,true);assert.equal(r.installed.length,3);assert.equal(r.soundsInstalled.length,6);assert.equal(calls.length,9);
 assert(r.installed.includes('Calendar Alarms Runtime.js'));assert(calls.every(u=>u.startsWith('https://raw.githubusercontent.com/')));
 disk.set('/scripts/Calendar Alarm Engine.js','USER EXISTING');calls.length=0;
 r=await run();assert.equal(calls.length,0);assert.equal(r.alreadyPresent.length,3);assert.equal(r.soundsAlreadyPresent.length,6);assert.equal(disk.get('/scripts/Calendar Alarm Engine.js'),'USER EXISTING');
 disk.delete('/scripts/Calendar Alarms Runtime.js');fail=true;r=await run();assert.equal(r.ok,false);assert(r.errors.some(e=>e.includes('Runtime')));assert(!disk.has('/scripts/Calendar Alarms Runtime.js'));
 console.log('PASS: GitHub-only requests, three scripts/six sounds, skip existing without overwrites, and failed-download reporting.');
})().catch(e=>{console.error(e);process.exitCode=1;});
