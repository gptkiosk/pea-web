import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyIntroduction,introductionLimits} from '../memory.mjs';
import {encryptProfile,decryptProfile,planProfileImport,profileFormats} from '../profile-transfer.mjs';

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
test('new profile files use 600,000 rounds; earlier 310,000-round files still open and the label cannot be swapped',async()=>{
  const answers={...emptyIntroduction(),ownerName:'Synthetic owner'},pass='synthetic passphrase';
  const current=JSON.parse(await encryptProfile('work',answers,pass));
  assert.equal(current.format,'pea-profile-export-v2');assert.equal(profileFormats[current.format],600000);
  // An earlier-format file, built the way the first development build wrote it.
  const format='pea-profile-export-v1',salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
  const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(pass),'PBKDF2',false,['deriveKey']);
  const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:310000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt']);
  const data=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(format)},key,new TextEncoder().encode(JSON.stringify({profile:'work',introduction:answers}))));
  const b64=bytes=>btoa(String.fromCharCode(...bytes)),old={format,salt:b64(salt),iv:b64(iv),data:b64(data)};
  assert.deepEqual(await decryptProfile(JSON.stringify(old),pass),{profile:'work',introduction:answers});
  await assert.rejects(decryptProfile(JSON.stringify({...old,format:'pea-profile-export-v2'}),pass));
  await assert.rejects(decryptProfile(JSON.stringify({...current,format}),pass));
  await assert.rejects(decryptProfile(JSON.stringify({...current,format:'constructor'}),pass));
});
