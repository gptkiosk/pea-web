import {ServiceError} from './connections.mjs';
import {ConversationVault, emptyLibrary, captureThread, remember, forgetThread, searchThreads, memoryContext,
  emptyIntroduction, introductionLimits, validIntroduction, introductionContext} from './memory.mjs';
const $ = id => document.getElementById(id);
const profiles = ['personal','work'], surfaces = ['chat','greenhouse'];

export function installMemory(hooks) {
  let library=emptyLibrary(),vault=null,pending=0,failed=false,initializing=true,hasSaved=false,porting=false,backupURL=null;
  // Threads the library could not take (full or over limits). Saving resumes as soon as one fits again.
  const active=new Map(),presence=new Map(),unsaved=new Set();let source=null;
  const profile=hooks.profile;
  const fields=Object.keys(introductionLimits);
  const eligible=()=>profiles.includes(profile());
  function idle() { if(initializing || pending || porting || hooks.busy()) throw new ServiceError('Finish the current request or local save first.'); }
  function ensure() { idle(); if(!eligible()) throw new ServiceError('Choose Work or Personal. Saved context is never shared into Blended.'); }
  function say(error) { hooks.notice(error instanceof ServiceError ? error.message : 'Local library operation failed. The saved record was preserved.'); }
  function invalidate() { hooks.contextChanged(); }
  function readInterview() { return Object.fromEntries(fields.map(k=>[k,$('bio-'+k).value.trim()])); }
  function fillInterview() {
    const value=eligible()?library.introductions[profile()]:emptyIntroduction();
    for(const key of fields) { $('bio-'+key).value=value[key];$('bio-'+key).disabled=!eligible(); }
    $('interview-save').disabled=!eligible();$('bio-presence').disabled=!eligible();$('bio-presence').checked=presence.get(profile())??false;
    $('note-count').textContent=String(Object.values(value).filter(Boolean).length);
  }
  function render() {
    const saved=!!vault?.key;
    $('memory-status').textContent=initializing?'Checking local storage…':failed?'Save failed · local changes unsaved':unsaved.size?'Library full or over limits · current chat is tab-only':pending?'Encrypting changes…':saved?'Encrypted saving · unlocked':hasSaved?'Saved library locked · current chats tab-only':'Tab-only · encrypted saving optional';
    $('library-storage').textContent=saved?'Lock & clear unlocked context':'Unlock / enable encrypted saving…';
    $('library-storage').disabled=initializing||!!pending||porting||hooks.busy();$('library-backup').disabled=initializing||!!pending||porting||failed||hooks.busy()||!hasSaved;$('library-import-open').disabled=initializing||!!pending||porting||hooks.busy();
    $('library-scope').textContent=eligible()?`${profile()} · this browser only`:'Choose Work or Personal';
    $('memory-share').disabled=!eligible();
    const list=$('library-threads');list.replaceChildren();
    for(const t of searchThreads(library,profile(),$('library-search').value)) {
      const card=document.createElement('article');card.className='memory-card';
      const heading=document.createElement('strong');heading.textContent=t.title;
      const detail=document.createElement('small');detail.textContent=`${t.surface} · ${new Date(t.updated).toLocaleDateString()} · ${t.messages.length} messages`;
      const peek=document.createElement('details'),summary=document.createElement('summary'),content=document.createElement('pre');
      summary.textContent='Read saved conversation';content.textContent=t.messages.map(m=>`${m.role==='user'?'YOU':'PEA'}${m.incomplete?' (interrupted)':m.preview?' (preview)':''}\n${m.text}`).join('\n\n');
      peek.append(summary,content);card.append(heading,detail,peek,
        button(`Continue in ${t.surface}`,()=>restore(t)),button('Forget conversation…',()=>removeThread(t)));list.append(card);
    }
    if(!list.childNodes.length) list.textContent=eligible()?'No saved conversations match. Finish a conversation to add it to this local library.':'Blended has no saved library.';
    const facts=$('memory-list');facts.replaceChildren();
    for(const m of library.memories.filter(m=>m.profile===profile())) {
      const card=document.createElement('article');card.className='memory-card';
      const fact=document.createElement('p');fact.textContent=m.text;
      const source=document.createElement('details'),summary=document.createElement('summary'),quote=document.createElement('p'),date=document.createElement('small');
      summary.textContent='Source · your message';quote.textContent=m.source.quote;source.append(summary,quote);
      date.textContent=new Date(m.created).toLocaleDateString()+' · '+(m.expires===null?'Keep until forgotten':m.expires<=Date.now()?'Expired · excluded from recall':'Expires '+new Date(m.expires).toLocaleDateString());
      card.append(fact,date,source,button('Forget memory…',()=>removeMemory(m)));facts.append(card);
    }
    if(!facts.childNodes.length) facts.textContent='No reviewed memories. Use “Remember from my message” after a conversation.';
  }
  function button(label,action) {
    const b=document.createElement('button');b.className='text-button';b.textContent=label;
    b.onclick=()=>Promise.resolve().then(action).catch(say);return b;
  }
  async function persist() {
    if(backupURL)URL.revokeObjectURL(backupURL);backupURL=null;$('library-backup-download').hidden=true;
    render();if(!vault?.key || failed)return;
    pending++;render();
    try { await vault.save(library);hasSaved=true; }
    catch(error) { failed=true;say(error); }
    finally { pending--;render(); }
  }
  function record(surface,who=profile()) {
    if(!profiles.includes(who) || !surfaces.includes(surface))return false;
    const key=who+':'+surface;
    try {
      const next=captureThread(library,who,surface,hooks.history(surface,who),active.get(key));
      library=next.library;active.set(key,next.threadID);unsaved.delete(key);void persist();return true;
    } catch(error) { unsaved.add(key);say(error);render();return false; }
  }
  async function clearSurface(surface) {
    ensure();if(!record(surface))throw new ServiceError('The current thread could not be archived. Keep it open and resolve the library warning first.');if(pending)await vault.chain.catch(()=>{});
    if(failed)throw new ServiceError('The current thread was not saved. Resolve the library warning before replacing it.');
    active.delete(profile()+':'+surface);hooks.replace(surface,[]);invalidate();render();
  }
  async function fresh(surface) {
    ensure();const who=profile();
    if(!await hooks.review('Start a fresh conversation',`The current ${surface} conversation stays in your local library if eligible. Encrypted saving is ${vault?.key?'enabled':'off; the library lasts only in this tab'}. A new thread sends no earlier messages. Continue?`))return;
    if(who!==profile())throw new ServiceError('Profile changed. Review again.');
    await clearSurface(surface);
  }
  async function restore(thread) {
    ensure();const who=profile();
    if(!await hooks.review('Continue a saved conversation',`Restore “${thread.title}” in ${thread.surface}? It stays in ${who}. Future model requests may include up to 12 completed recent messages, shown in a new provider review. This does not send anything now.`))return;
    ensure();if(who!==profile() || !library.threads.includes(thread))throw new ServiceError('Library changed. Review again.');
    if(!record(thread.surface))throw new ServiceError('The current thread could not be archived. Keep it open and resolve the library warning first.');if(pending)await vault.chain.catch(()=>{});
    if(failed)throw new ServiceError('The current thread was not saved. Resolve the library warning before replacing it.');
    active.set(who+':'+thread.surface,thread.id);hooks.replace(thread.surface,structuredClone(thread.messages));
    invalidate();hooks.tab(thread.surface);$('library').close();render();
  }
  async function removeThread(thread) {
    ensure();const who=profile();
    if(!await hooks.review('Forget this conversation',`Remove “${thread.title}” and memories sourced from it from this browser library? This cannot undo provider retention or copies elsewhere. No remote files are changed.`))return;
    ensure();if(who!==profile() || thread.profile!==who)throw new ServiceError('Profile changed.');
    library=forgetThread(library,who,thread.id);
    if(active.get(who+':'+thread.surface)===thread.id){active.delete(who+':'+thread.surface);hooks.replace(thread.surface,[]);}
    // Space was freed: give any thread the library refused earlier another chance.
    for(const key of [...unsaved]){const [owner,surface]=key.split(':');record(surface,owner);}
    invalidate();await persist();
  }
  async function removeMemory(memory) {
    ensure();const who=profile();
    if(!await hooks.review('Forget this memory',memory.text+'\n\nRemove this fact from future recall? Its source conversation remains until you forget it separately.'))return;
    ensure();if(who!==profile() || memory.profile!==who)throw new ServiceError('Profile changed.');
    library={...library,memories:library.memories.filter(m=>m.id!==memory.id)};invalidate();await persist();
  }
  function chooseSource() {
    ensure();const surface=$('memory-surface').value;
    if(!record(surface))throw new ServiceError('Resolve the library warning before adding a memory.');
    const t=library.threads.find(t=>t.id===active.get(profile()+':'+surface));
    const messages=t?.messages.filter(m=>m.role==='user'&&!m.incomplete&&!m.preview)??[];
    $('memory-message').replaceChildren(...messages.map(m=>new Option(m.text.slice(0,100),m.id)));
    source=t??null;fillSource();
  }
  function fillSource() {
    const m=source?.messages.find(m=>m.id===$('memory-message').value);
    $('memory-quote').value=m?.text.slice(0,600)??'';$('memory-fact').value='';
    $('memory-source-text').textContent=m?.text??'No eligible owner message in this active thread.';
  }
  $('library-open').onclick=()=>{render();$('library').showModal();};
  $('library-search').oninput=render;
  $('memory-share').onchange=()=>{invalidate();hooks.notice('Memory sharing changed for this profile. Exact recalled facts appear in the next model review.');};
  const share=new Map();
  $('memory-share').addEventListener('change',()=>share.set(profile(),$('memory-share').checked));
  let interviewStep=0;
  function showInterviewStep(step,focus=false){interviewStep=Math.max(0,Math.min(2,step));for(const part of document.querySelectorAll('[data-interview-step]'))part.hidden=Number(part.dataset.interviewStep)!==interviewStep;$('interview-progress').textContent=`Step ${interviewStep+1} of 3 · ${['About you','Your world','Your companion'][interviewStep]}`;$('interview-progress-bar').style.width=`${(interviewStep+1)*100/3}%`;$('interview-back').hidden=interviewStep===0;$('interview-next').hidden=interviewStep===2;$('interview-save').hidden=interviewStep!==2;if(focus)document.querySelector(`[data-interview-step="${interviewStep}"] h3`).focus();}
  $('interview-back').onclick=()=>showInterviewStep(interviewStep-1,true);
  $('interview-next').onclick=()=>showInterviewStep(interviewStep+1,true);
  $('interview-open').onclick=$('home-persona').onclick=$('library-interview').onclick=()=>{fillInterview();showInterviewStep(0);$('interview').showModal();};
  $('bio-presence').onchange=()=>{if(!eligible())return;presence.set(profile(),$('bio-presence').checked);invalidate();hooks.notice('Local-time delivery changed for this tab/profile. Review its style with the next model request.');};
  $('interview-save').onclick=()=>{
    try {ensure();const value=readInterview();if(!validIntroduction(value))throw new ServiceError('Keep interview answers within the field limits and remove credentials.');
      library={...library,introductions:{...library.introductions,[profile()]:value}};fillInterview();invalidate();void persist();
      $('interview-note').textContent=vault?.key?'Saved locally when encryption finishes. Sharing still needs your connection setting and provider review.':'Kept in this tab. Enable encrypted saving in Conversations & memory to retain it after reload.';
    } catch(error){say(error);}
  };
  $('memory-source-open').onclick=()=>{try{chooseSource();$('remember').showModal();}catch(error){say(error);}};
  $('memory-surface').onchange=()=>{try{chooseSource();}catch(error){say(error);}};
  $('memory-message').onchange=fillSource;
  $('memory-save').onclick=async()=>{
    try {ensure();const who=profile(),thread=source,messageID=$('memory-message').value,quote=$('memory-quote').value,fact=$('memory-fact').value,durable=$('memory-durable').checked;
      if(!thread || thread.profile!==who)throw new ServiceError('Choose a source message in this profile.');
      const before=library,next=remember(library,{profile:who,threadID:thread.id,messageID,quote,fact,durable});
      if(!await hooks.review('Keep a sourced memory',`Fact:\n${fact}\n\nYour original words:\n${quote}\n\n${durable?'Retain until you forget it.':'Exclude from recall after 90 days; recent facts rank higher.'}\nStored locally. Sharing with a model requires the separate memory switch and review.`))return;
      ensure();if(who!==profile() || source!==thread || library!==before)throw new ServiceError('Context changed. Review again.');
      library=next;invalidate();$('remember').close();source=null;await persist();
    }catch(error){say(error);}
  };
  $('library-new-chat').onclick=()=>fresh('chat').catch(say);
  $('library-new-greenhouse').onclick=()=>fresh('greenhouse').catch(say);
  $('library-storage').onclick=async()=>{
    try {idle();if(vault?.key){await vault.chain.catch(()=>{});vault.lock();library=emptyLibrary();active.clear();unsaved.clear();share.clear();presence.clear();$('memory-share').checked=false;
        hooks.clearAll();source=null;for(const id of ['memory-quote','memory-fact','library-search'])$(id).value='';$('memory-source-text').textContent='';fillInterview();invalidate();render();hooks.notice('Library locked. Unlocked transcripts, interview answers and memories were cleared from the page.');
      }else{$('library-unlock').showModal();}}
    catch(error){say(error);}
  };
  function emptyCurrent() {
    return !library.threads.length && !library.memories.length && profiles.every(p=>Object.values(library.introductions[p]).every(v=>!v)) &&
      profiles.every(p=>surfaces.every(s=>!hooks.history(s,p).length)) && fields.every(k=>!$('bio-'+k).value.trim()) &&
      !$('thought').value.trim() && !$('collab-thought').value.trim();
  }
  $('library-backup').onclick=async()=>{
    try {idle();if(failed||!hasSaved)throw new ServiceError('Finish saving an encrypted library before backing it up.');
      if(!await hooks.review('Prepare encrypted backup','This file contains your encrypted Personal and Work conversations, reviewed memories and interview answers. Keep the file and passphrase safe. Keys, grants, files and the task board are excluded. Continue?'))return;
      idle();porting=true;render();const serialized=await vault.exportEncrypted();
      if(backupURL)URL.revokeObjectURL(backupURL);backupURL=URL.createObjectURL(new Blob([serialized],{type:'application/json'}));
      const link=$('library-backup-download');link.href=backupURL;link.hidden=false;hooks.notice('Encrypted backup ready. Choose Download and keep it with your passphrase.');
    }catch(error){say(error);}finally{porting=false;render();}
  };
  $('library-import-open').onclick=()=>{try{idle();if(hasSaved||vault?.key||!emptyCurrent())throw new ServiceError('Restore requires an empty browser library and no tab-only conversations or interview answers. Nothing was changed.');$('library-import').showModal();}catch(error){say(error);}};
  $('library-import').addEventListener('close',()=>{$('library-import-passphrase').value='';$('library-import-file').value='';});
  $('library-import-submit').onclick=async()=>{
    const file=$('library-import-file').files?.[0],input=$('library-import-passphrase'),password=input.value;input.value='';
    try {idle();if(hasSaved||vault?.key||!emptyCurrent())throw new ServiceError('Restore requires an empty browser library. Nothing was changed.');
      if(!file||file.size>2700000)throw new ServiceError('Choose a PEA encrypted backup under 2.7 MB.');
      if(!await hooks.review('Restore encrypted library','Verify and restore both profiles into this empty browser? Existing saved libraries are never overwritten. Nothing is sent to a model or service. You will unlock separately.'))return;
      idle();if(!emptyCurrent()||!$('library-import').open)throw new ServiceError('The library changed. Nothing was imported.');porting=true;render();$('library-import-submit').disabled=true;
      const serialized=await file.text();await vault.importEncrypted(serialized,password,()=>!vault.key&&emptyCurrent()&&$('library-import').open);
      hasSaved=true;$('library-import').close();hooks.notice('Encrypted library restored to this browser. Unlock it to review; nothing was sent to a model.');
    }catch(error){say(error);}finally{porting=false;$('library-import-submit').disabled=false;render();}
  };
  let unlocking=false;
  $('library-unlock').addEventListener('close',()=>{if(unlocking)vault?.lock();$('library-passphrase').value='';});
  $('library-unlock-submit').onclick=async()=>{
    if(unlocking)return;const input=$('library-passphrase'),password=input.value;input.value='';
    try {idle();if(!vault)vault=await ConversationVault.open();
      if(hasSaved && !await hooks.review('Open the saved library','Unlocking replaces the current tab-only library and interview answers with the encrypted saved copy. Save or finish any unsaved work first. No provider keys or grants will be restored. Continue?'))return;
      idle();unlocking=true;$('library-unlock-submit').disabled=true;
      // Keep only schema-bound transcripts/interview; never inspect connection or DOM credential fields.
      const next=await vault.unlock(password,library);if(!$('library-unlock').open) {vault.lock();return;}
      library=next;hasSaved=true;failed=false;active.clear();unsaved.clear();share.clear();presence.clear();$('memory-share').checked=false;
      hooks.clearAll();fillInterview();invalidate();unlocking=false;$('library-unlock').close();render();
      hooks.notice('Library unlocked. Search and continue a conversation; nothing has been sent to a model.');
    } catch(error){say(error);}finally{unlocking=false;$('library-unlock-submit').disabled=false;render();}
  };
  function profileChanged() {
    source=null;for(const id of ['library','remember','interview','library-unlock','library-import'])$(id).close();
    $('library-search').value='';$('memory-fact').value='';$('memory-quote').value='';$('memory-source-text').textContent='';
    $('memory-share').checked=share.get(profile())??false;$('interview-note').textContent='';fillInterview();render();
  }
  // No automatic hide timeout: hiding is common on mobile. Explicit Lock or page disposal clears context.
  window.addEventListener('pagehide',()=>{if(backupURL)URL.revokeObjectURL(backupURL);backupURL=null;vault?.lock();library=emptyLibrary();active.clear();unsaved.clear();share.clear();presence.clear();source=null;hooks.clearAll();for(const id of ['memory-quote','memory-fact','library-search'])$(id).value='';$('memory-source-text').textContent='';$('memory-share').checked=false;fillInterview();invalidate();render();});
  void (async()=>{try{vault=await ConversationVault.open();hasSaved=!!await vault.storage.get();}catch{hooks.notice('Local library storage is unavailable. Conversations remain in this tab.');}finally{initializing=false;render();}})();
  fillInterview();render();
  return {record,profileChanged,render,presence:()=>presence.get(profile())??false,async clearSurface(surface){await clearSurface(surface);},
    context(query){const value=eligible()?library.introductions[profile()]:emptyIntroduction();return {introduction:introductionContext(value),persona:value.persona,presence:presence.get(profile())??false,
      memories:memoryContext(library,profile(),query,share.get(profile())??false)};},
  };
}
