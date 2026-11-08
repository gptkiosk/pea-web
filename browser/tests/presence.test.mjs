import test from 'node:test';
import assert from 'node:assert/strict';
import {presenceAt} from '../presence.mjs';
const at=h=>new Date(2026,10,8,h,30);
test('presence is explicit opt-in; invalid dates and truthy input stay neutral',()=>{
  for(const enabled of [false,undefined,null,'yes',1])assert.deepEqual(presenceAt(enabled,at(3)),{period:'off',style:'',rate:1.05,pitch:1});
  assert.equal(presenceAt(true,new Date('invalid')).period,'off');assert.equal(presenceAt(true,'3 am').period,'off');
});
test('coarse local periods change at bounded hour transitions',()=>{
  assert.equal(presenceAt(true,at(0)).period,'quiet hours');assert.equal(presenceAt(true,at(7)).period,'quiet hours');
  assert.equal(presenceAt(true,at(8)).period,'morning');assert.equal(presenceAt(true,at(11)).period,'morning');
  assert.equal(presenceAt(true,at(12)).period,'daytime');assert.equal(presenceAt(true,at(17)).period,'daytime');
  assert.equal(presenceAt(true,at(18)).period,'evening');assert.equal(presenceAt(true,at(23)).period,'evening');
});
test('quiet device speech is seven percent slower, other periods keep ordinary delivery',()=>{
  const quiet=presenceAt(true,at(4)),normal=presenceAt(true,at(14));assert.equal(quiet.rate/normal.rate,.93);assert(quiet.pitch<normal.pitch);
  assert.equal(normal.rate,1.05);assert.equal(normal.pitch,1);
});
test('delivery is deterministic, bounded and never claims real moods, location or tool authority',()=>{
  const s=presenceAt(true,at(19));assert.deepEqual(s,presenceAt(true,at(19)));assert(s.style.length<600);
  assert.match(s.style,/fictional conversational style/);assert.match(s.style,/Keep facts and permissions exact/);
  assert(!s.style.includes('2026'));assert(!s.style.includes('19:30'));assert.doesNotMatch(s.style,/latitude|longitude|timeZone/);
});

test('the optional delivery hint enters the same reviewed request without tools or a second model call',async()=>{
  const {Services}=await import('../connections.mjs');let calls=0;
  const service=new Services(()=>{calls++;throw Error('Network is forbidden');});
  const args={model:{id:'synthetic/text',prompt:0,completion:0,request:0},profile:'personal',text:'Keep me company',persona:'Dry wit'};
  const quiet=service.body({...args,delivery:presenceAt(true,at(5)).style});assert.match(quiet.messages[0].content,/softer, unhurried/);
  assert.equal(quiet.tools,undefined);assert.equal(quiet.max_tokens,384);assert.equal(calls,0);
  assert.doesNotMatch(service.body(args).messages[0].content,/Optional character delivery/);
  assert.throws(()=>service.body({...args,delivery:'sk-or-v1-'+ 'a'.repeat(40)}));
});
