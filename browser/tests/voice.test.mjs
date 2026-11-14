import test from 'node:test';
import assert from 'node:assert/strict';
import {Dictation,voicePreferences,loadVoicePreferences,saveVoicePreferences,speechReadPlan} from '../voice.mjs';

test('long spoken replies require a choice and provide bounded, explicitly extractive text',()=>{
  assert.deepEqual(speechReadPlan('Short reply.'),{long:false,excerpt:''});
  const reply='First sentence. '+('Middle details. '.repeat(100))+'Final sentence.';
  const plan=speechReadPlan(reply);assert.equal(plan.long,true);assert(plan.excerpt.length<=600);assert.match(plan.excerpt,/First sentence/);assert.match(plan.excerpt,/Final sentence/);
  const giant=speechReadPlan('x'.repeat(2000));assert.equal(giant.long,true);assert(giant.excerpt.length<=600);
});

test('device voice preferences discard malformed choices and bound speaking speed',()=>{
  assert.deepEqual(voicePreferences(null),{voice:'',rate:1});
  assert.deepEqual(voicePreferences({voice:'synthetic',rate:'1.2'}),{voice:'synthetic',rate:1.2});
  assert.deepEqual(voicePreferences({voice:'x'.repeat(301),rate:3}),{voice:'',rate:1});
});
test('device voice storage retains only voice and rate and handles unavailable storage',()=>{
  const old=globalThis.localStorage;let saved='';
  try{globalThis.localStorage={setItem(_key,value){saved=value;},getItem(){return saved;}};
    assert.equal(saveVoicePreferences({voice:'synthetic',rate:1.1,token:'excluded'}),true);
    assert.deepEqual(JSON.parse(saved),{voice:'synthetic',rate:1.1});assert.deepEqual(loadVoicePreferences(),{voice:'synthetic',rate:1.1});
    globalThis.localStorage={setItem(){throw Error('unavailable');},getItem(){throw Error('unavailable');}};
    assert.equal(saveVoicePreferences({voice:'',rate:1}),false);assert.deepEqual(loadVoicePreferences(),{voice:'',rate:1});
  }finally{if(old===undefined)delete globalThis.localStorage;else globalThis.localStorage=old;}
});

test('dictation reports permission denial and ignores results after stop',()=>{
  let recognition, text='', error='', listening=false;
  class FakeRecognition { constructor(){recognition=this;} start(){} abort(){} }
  const voice=new Dictation({Recognition:FakeRecognition,onText(_target,value){text=value;},onState(value){listening=value;},onError(value){error=value;}});
  assert.equal(voice.start('draft'),true);assert.equal(listening,true);
  recognition.onerror({error:'not-allowed'});assert.match(error,/permission was denied/);
  voice.stop();assert.equal(listening,false);
  recognition.onresult({results:[{0:{transcript:'stale'},isFinal:true}]});assert.equal(text,'');
});
