const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const engine=fs.readFileSync(require.resolve('../Calendar Alarm Engine.js'),'utf8');
function extract(name,next){return engine.slice(engine.indexOf('function '+name+'('),engine.indexOf('function '+next+'('));}
const ctx={};
vm.runInNewContext('const DELIM=":;:";const pad2=n=>String(Math.trunc(n)).padStart(2,"0");'+
 extract('parseEngineInput','getCompletedTaskMetricIDs')+extract('getCompletedTaskMetricIDs','applyTaskLogCompletions')+
 'this.parse=parseEngineInput;this.completed=getCompletedTaskMetricIDs;',ctx);
const report={ok:true,allComplete:true,metricsByID:[{metricID:'floss',found:true,complete:true}]};
const payload=['Alarm A\nAlarm B','7\n8','30\n0','Do Not Disturb',JSON.stringify(report)].join(':;:');
const result=ctx.parse(payload);
assert.equal(result.iosAlarms.length,2);assert.equal(result.iosAlarms[0].hh,'07');
assert.equal(result.currentFocus,'Do Not Disturb');assert.equal(ctx.completed(result.taskLogResponseRaw).ids[0],'floss');
const config=require('../docs/alarm-config.js');
console.log('PASS: completion JSON and delimiter transport accepted by unchanged Engine parser.');
