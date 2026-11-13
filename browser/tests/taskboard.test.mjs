import test from 'node:test';
import assert from 'node:assert/strict';
import {BoardVault,sameBoardRevision,newStory,storyCommand,recommendation,validateBoard,storyPrompt} from '../taskboard.mjs';

test('owner commands are explicit; quoted/model instructions cannot queue or assign',()=>{
 assert.deepEqual(storyCommand('Please assign task PEA-12 to the team'),{kind:'assign',number:12,surface:'greenhouse'});
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
 const a=new BoardVault(storage);await a.unlock('synthetic legacy passphrase',[newStory([],'work','Legacy')]);delete record.revision;
 const b=new BoardVault(storage),c=new BoardVault(storage);const x=await b.unlock('synthetic legacy passphrase'),y=await c.unlock('synthetic legacy passphrase');
 x[0].details='first';await b.save(x);assert.equal(typeof record.revision,'string');y[0].details='second';await assert.rejects(c.save(y),/conflict/);
});
test('locking cancels an in-progress unlock or queued save',async()=>{
 let record;const storage={get:async()=>structuredClone(record),comparePut:async(e,v)=>{if(!sameBoardRevision(record,e))throw Error('conflict');record=structuredClone(v);}};
 const v=new BoardVault(storage),pending=v.unlock('synthetic lock passphrase');v.lock();await assert.rejects(pending,/cancelled/);assert.equal(record,undefined);
 await v.unlock('synthetic lock passphrase');const saved=structuredClone(record);const task=v.save([]);v.lock();await assert.rejects(task,/locked/);assert.deepEqual(record,saved);
});
