import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyIntroduction,introductionLimits} from '../memory.mjs';
import {encryptProfile,decryptProfile,planProfileImport} from '../profile-transfer.mjs';

test('profile-only encrypted export is randomized and round trips without leaking answers',async()=>{
  const answers={...Object.fromEntries(Object.keys(introductionLimits).map(k=>[k,''])),...emptyIntroduction(),family:'SYNTHETIC PRIVATE ANSWER',persona:'A synthetic character'};
  const first=await encryptProfile('personal',answers,'synthetic passphrase'),second=await encryptProfile('personal',answers,'synthetic passphrase');
  assert.notEqual(first,second);assert.doesNotMatch(first,/SYNTHETIC|persona|personal/);
  assert.deepEqual(await decryptProfile(first,'synthetic passphrase'),{profile:'personal',introduction:answers});
  await assert.rejects(decryptProfile(first,'wrong passphrase'));
  const altered=JSON.parse(first);altered.data=(altered.data[0]==='A'?'B':'A')+altered.data.slice(1);await assert.rejects(decryptProfile(JSON.stringify(altered),'synthetic passphrase'));
  altered.format='other';await assert.rejects(decryptProfile(JSON.stringify(altered),'synthetic passphrase'));
  await assert.rejects(encryptProfile('blended',answers,'synthetic passphrase'));
  await assert.rejects(encryptProfile('work',{...answers,token:'not allowed'},'synthetic passphrase'));
});
test('profile import plans fill only missing fields by default or show exact replacements',()=>{
  const current={...emptyIntroduction(),ownerName:'Current',persona:'Existing persona'};
  const incoming={...Object.fromEntries(Object.keys(introductionLimits).map(k=>[k,''])),...emptyIntroduction(),ownerName:'Incoming',family:'Synthetic family'};
  const missing=planProfileImport(current,incoming,'missing');
  assert.equal(missing.next.ownerName,'Current');assert.equal(missing.next.persona,'Existing persona');assert.equal(missing.next.family,'Synthetic family');
  assert.deepEqual(missing.changes,[{field:'family',before:'',after:'Synthetic family'}]);
  const replacement=planProfileImport(current,incoming,'replace');
  assert.equal(replacement.next.ownerName,'Incoming');assert.equal(replacement.next.persona,'');
  assert(replacement.changes.some(change=>change.field==='persona'&&change.before==='Existing persona'&&change.after===''));
  assert.throws(()=>planProfileImport(current,incoming,'automatic'));
  assert.throws(()=>planProfileImport(current,{...incoming,permissions:true},'missing'));
});
