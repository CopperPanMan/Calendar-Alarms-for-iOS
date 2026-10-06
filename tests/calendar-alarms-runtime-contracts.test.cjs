const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const engine=fs.readFileSync(require.resolve('../Calendar Alarm Engine.js'),'utf8');
function extract(name,next){const start=engine.indexOf('function '+name+'(');let end=engine.indexOf('function '+next+'(');if(engine.slice(end-6,end)==='async ')end-=6;return engine.slice(start,end);}
const ctx={};
vm.runInNewContext('const pad2=n=>String(Math.trunc(n)).padStart(2,"0");'+
 extract('parseEngineInput','getCompletedTaskMetricIDs')+extract('getCompletedTaskMetricIDs','applyTaskLogCompletions')+
 'this.parse=parseEngineInput;this.completed=getCompletedTaskMetricIDs;',ctx);
const report={ok:true,allComplete:true,metricsByID:[{metricID:'floss',found:true,complete:true}]};
const payload={labels:['Alarm A','Alarm B'],hours:[7,8],minutes:[30,0],isEnabled:[false,true],
 currentFocus:'Do Not Disturb',taskLogResponse:JSON.stringify(report)};
const result=ctx.parse(payload);
assert.equal(result.iosAlarms.length,2);assert.equal(result.iosAlarms[0].hh,'07');
assert.equal(result.iosAlarms[0].isEnabled,false);assert.equal(result.iosAlarms[1].isEnabled,true);
assert.equal(result.currentFocus,'Do Not Disturb');assert.equal(ctx.completed(result.taskLogResponseRaw).ids[0],'floss');
const config=require('../docs/alarm-config.js');
console.log('PASS: completion JSON and dictionary transport accepted by Engine parser.');
