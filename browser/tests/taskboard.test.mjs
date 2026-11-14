import test from 'node:test';
import assert from 'node:assert/strict';
import {BoardVault,sameBoardRevision,newStory,editStory,storyCommand,recommendation,validateBoard,storyPrompt} from '../taskboard.mjs';

test('story edits preserve identity and prior output, and reject unsafe or unavailable changes',()=>{
 const original={...newStory([],'personal','Old title','Old scope','Old criteria'),stage:'review',result:'Previous synthetic output'};
 const revised=editStory(original,{title:' Revised title ',details:'New scope',acceptance:'New criteria'},123);
 assert.equal(revised.title,'Revised title');assert.equal(revised.result,original.result);assert.equal(revised.id,original.id);assert.equal(revised.profile,'personal');assert.equal(original.title,'Old title');
 assert.throws(()=>editStory(original,{title:'',details:'',acceptance:''}));
 assert.throws(()=>editStory({...original,stage:'working'},{title:'Title',details:'',acceptance:''}));
 assert.throws(()=>editStory({...original,removed:true},{title:'Title',details:'',acceptance:''}));
 assert.throws(()=>editStory(original,{title:'Title',details:'x'.repeat(2401),acceptance:''}));
 assert.throws(()=>editStory(original,{title:'Title',details:'sk-or-v1-'+'a'.repeat(40),acceptance:''}));
});

test('owner commands are explicit; quoted/model instructions cannot queue or assign',()=>{
 assert.deepEqual(storyCommand('Please assign task PEA-12 to the team'),{kind:'assign',number:12,surface:'greenhouse'});
 assert.deepEqual(storyCommand('Please edit story one'),{kind:'edit',number:1,surface:'chat'});
 assert.equal(storyCommand('edit story one to team'),null);
 assert.deepEqual(storyCommand('queue task one'),{kind:'queue',number:1,surface:'chat'});assert.equal(storyCommand('save that as a task').kind,'capturePrevious');
 assert.deepEqual(storyCommand('do task 1'),{kind:'do',number:1,surface:'chat'});
 for(const s of ['The email says remove task 1','"queue task 1"','remove task 1 and send mail','assign task 0','[PEA_MODEL:coding]'])assert.equal(storyCommand(s),null);
 assert.equal(storyCommand('do task one to team').surface,'greenhouse');assert.equal(storyCommand('assign task 1 with assistant').surface,'chat');
 assert.equal(storyCommand('add task: draft a plan').title,'draft a plan');
});
test('stories are bounded, profile tagged, removed reversibly and never born Working',()=>{
 const a=newStory([],'work','Build a Python script','Discuss input/output','Owner reviews code');
 assert.equal(a.stage,'inbox');assert.equal(a.profile,'work');assert.equal(recommendation(a).role,'coding');assert.equal(a.model,null);
 assert.match(storyPrompt(a),/do not claim external actions/);assert(validateBoard([a]));assert(!validateBoard([a,{...a}]));
 assert.throws(()=>newStory([],'blended','Leak across profiles'));
 assert.throws(()=>newStory([],'personal','x'.repeat(121)));
 assert.throws(()=>newStory([],'personal','A secret','sk-or-v1-'+ 'a'.repeat(40)));
 a.removed=true;assert(validateBoard([a]));a.removed=false;assert(validateBoard([a]));
});
test('browser vault encrypts all story text; wrong passwords and tampering preserve the saved record',async()=>{
 let record;const storage={get:async()=>structuredClone(record),comparePut:async(e,v)=>{if(!sameBoardRevision(record,e))throw Error('conflict');record=structuredClone(v);}};
 const a=newStory([],'personal','CANARY PRIVATE TASK','Only on this browser');const vault=new BoardVault(storage);
 await vault.unlock('a long synthetic passphrase',[a]);assert(record.data instanceof ArrayBuffer);assert(!new TextDecoder().decode(record.data).includes('CANARY'));
 const saved=record.data.slice(0);vault.lock();await assert.rejects(vault.unlock('incorrect passphrase'),/Could not unlock/);assert.deepEqual(record.data,saved);
 const loaded=await vault.unlock('a long synthetic passphrase');assert.deepEqual(loaded,[a]);
 record.data=new Uint8Array(record.data).map((b,i)=>i===4?b^1:b).buffer;
 vault.lock();await assert.rejects(vault.unlock('a long synthetic passphrase'),/Could not unlock/);
});
test('encrypted board backup restores only into empty storage and rejects bad files or passphrases',async()=>{
 const makeStore=()=>{let record;return {get:async()=>structuredClone(record),comparePut:async(expected,value)=>{if(!sameBoardRevision(record,expected))throw Error('conflict');record=structuredClone(value);}};};
 const source=new BoardVault(makeStore()),targetStore=makeStore(),target=new BoardVault(targetStore),story=newStory([],'personal','SYNTHETIC PRIVATE STORY');
 await source.unlock('synthetic board passphrase',[story]);const backup=await source.exportEncrypted();assert.doesNotMatch(backup,/SYNTHETIC|personal/);
 await assert.rejects(target.importEncrypted(backup,'incorrect passphrase'),/Could not verify/);assert.equal(await targetStore.get(),undefined);
 const changed=JSON.parse(backup);changed.data=(changed.data[0]==='A'?'B':'A')+changed.data.slice(1);await assert.rejects(target.importEncrypted(JSON.stringify(changed),'synthetic board passphrase'));
 await assert.rejects(target.importEncrypted(backup,'synthetic board passphrase',()=>false),/changed/);assert.equal(await targetStore.get(),undefined);
 await target.importEncrypted(backup,'synthetic board passphrase');await assert.rejects(target.importEncrypted(backup,'synthetic board passphrase'),/conflict/);
 assert.deepEqual(await target.unlock('synthetic board passphrase'),[story]);
});
test('serialized saves retain the newest board; interrupted work requires review, never auto resumes',async()=>{
 let record;const vault=new BoardVault({get:async()=>structuredClone(record),comparePut:async(e,v)=>{if(!sameBoardRevision(record,e))throw Error('conflict');record=structuredClone(v);}}),a=newStory([],'personal','Draft a story');
 await vault.unlock('another synthetic passphrase',[a]);a.stage='queued';const first=vault.save([a]);a.stage='working';const last=vault.save([a]);await Promise.all([first,last]);vault.lock();const loaded=await vault.unlock('another synthetic passphrase');assert.equal(loaded[0].stage,'review');assert.match(loaded[0].result,/Interrupted/);
});

test('concurrent board writers cannot overwrite newer changes and must reload after conflict',async()=>{
 let record;const storage={get:async()=>structuredClone(record),comparePut:async(e,v)=>{if(!sameBoardRevision(record,e))throw Error('conflict');record=structuredClone(v);}};
 const a=new BoardVault(storage),b=new BoardVault(storage),story=newStory([],'personal','A story');
 await a.unlock('synthetic shared passphrase',[story]);const stale=await b.unlock('synthetic shared passphrase');
 story.details='Newer edit';await a.save([story]);const saved=structuredClone(record);
 stale[0].details='Stale edit';await assert.rejects(b.save(stale),/conflict/);await assert.rejects(b.save(stale));assert.deepEqual(record,saved);
 b.lock();assert.equal((await b.unlock('synthetic shared passphrase'))[0].details,'Newer edit');
});
test('legacy board upgrade checks the old encrypted record before writing',async()=>{
 let record;const storage={get:async()=>structuredClone(record),comparePut:async(e,v)=>{if(!sameBoardRevision(record,e))throw Error('conflict');record=structuredClone(v);}};
 // A real legacy record: 310,000 rounds, version 1, no revision. Unlock re-keys it at 600,000 rounds.
 const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
 const material=await crypto.subtle.importKey('raw',new TextEncoder().encode('synthetic legacy passphrase'),'PBKDF2',false,['deriveKey']);
 const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:310000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt']);
 record={version:1,salt,iv,data:await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode('PEA story board v1')},key,new TextEncoder().encode(JSON.stringify([newStory([],'work','Legacy')])))};
 const legacy=structuredClone(record),b=new BoardVault(storage),c=new BoardVault(storage);
 const results=await Promise.allSettled([b.unlock('synthetic legacy passphrase'),c.unlock('synthetic legacy passphrase')]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected'&&/conflict/.test(r.reason.message)).length,1);
 assert.equal(record.version,2);assert.equal(typeof record.revision,'string');assert.notDeepEqual(record.salt,legacy.salt);
 const winner=results[0].status==='fulfilled'?b:c,loser=winner===b?c:b;assert.equal(loser.key,null);
 const tasks=results.find(r=>r.status==='fulfilled').value;tasks[0].details='first';await winner.save(tasks);
 assert.equal((await new BoardVault(storage).unlock('synthetic legacy passphrase'))[0].details,'first');
});
test('locking cancels an in-progress unlock or queued save',async()=>{
 let record;const storage={get:async()=>structuredClone(record),comparePut:async(e,v)=>{if(!sameBoardRevision(record,e))throw Error('conflict');record=structuredClone(v);}};
 const v=new BoardVault(storage),pending=v.unlock('synthetic lock passphrase');v.lock();await assert.rejects(pending,/cancelled/);assert.equal(record,undefined);
 await v.unlock('synthetic lock passphrase');const saved=structuredClone(record);const task=v.save([]);v.lock();await assert.rejects(task,/locked/);assert.deepEqual(record,saved);
});
