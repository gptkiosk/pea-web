import {containsCredential, ServiceError} from './connections.mjs';

const profiles = ['personal', 'work'];
const surfaces = ['chat', 'greenhouse'];
const id = value => typeof value === 'string' && /^[a-z0-9-]{10,50}$/i.test(value);
const time = value => Number.isSafeInteger(value) && value >= 0 && value <= 8640000000000000;
const fields = (value, names) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));
const text = (value, max) => typeof value === 'string' && value.length <= max && !containsCredential(value);
const legacyIntroductionLimits = {ownerName:80, assistantName:80, hometown:120, interests:1200, relationships:600, goals:600, persona:900};
export const introductionLimits = {...legacyIntroductionLimits, assistantHome:600, family:600, pets:600, work:600, workInterests:600, hobbies:600, duties:600, communication:600, boundaries:600};
export const emptyIntroduction = () => Object.fromEntries(Object.keys(legacyIntroductionLimits).map(k => [k, '']));
export const emptyLibrary = () => ({version:1, threads:[], memories:[], introductions:{personal:emptyIntroduction(), work:emptyIntroduction()}});
export function validIntroduction(value) {
  const limits=fields(value,Object.keys(legacyIntroductionLimits))?legacyIntroductionLimits:introductionLimits;
  return fields(value,Object.keys(limits)) && Object.entries(limits).every(([key,max])=>text(value[key],max));
}
export function validLibrary(value) {
  if (!fields(value, ['version','threads','memories','introductions']) || ![1,2].includes(value.version) ||
      !Array.isArray(value.threads) || value.threads.length > 40 || !Array.isArray(value.memories) || value.memories.length > 150 ||
      !fields(value.introductions, profiles) || !profiles.every(p => validIntroduction(value.introductions[p]) && (value.version!==1 || fields(value.introductions[p],Object.keys(legacyIntroductionLimits))))) return false;
  const ids = new Set(), messageIDs = new Set();
  for (const t of value.threads) {
    if (!fields(t, ['id','profile','surface','title','updated','messages']) || !id(t.id) || ids.has(t.id) ||
        !profiles.includes(t.profile) || !surfaces.includes(t.surface) || !text(t.title,100) || !time(t.updated) ||
        !Array.isArray(t.messages) || !t.messages.length || t.messages.length > 200) return false;
    ids.add(t.id);
    for (const m of t.messages) {
      if (!fields(m, ['id','role','text','at','incomplete','preview']) || !id(m.id) || messageIDs.has(m.id) ||
          !['user','assistant'].includes(m.role) || !text(m.text,12000) || !time(m.at) ||
          typeof m.incomplete !== 'boolean' || typeof m.preview !== 'boolean') return false;
      messageIDs.add(m.id);
    }
  }
  const memoryIDs = new Set();
  for (const m of value.memories) {
    if (!fields(m, ['id','profile','text','source','created','expires']) || !id(m.id) || memoryIDs.has(m.id) ||
        !profiles.includes(m.profile) || !text(m.text,600) || !m.text.trim() || !time(m.created) ||
        !(m.expires === null || time(m.expires) && m.expires > m.created) ||
        !fields(m.source, ['threadID','messageID','quote']) || !text(m.source.quote,600) || !m.source.quote.trim()) return false;
    const thread = value.threads.find(t => t.id === m.source.threadID && t.profile === m.profile);
    const message = thread?.messages.find(s => s.id === m.source.messageID && s.role === 'user' && !s.preview && !s.incomplete);
    if (!message || !message.text.includes(m.source.quote)) return false;
    memoryIDs.add(m.id);
  }
  return true;
}
function check(value) {
  if (Array.isArray(value?.threads) && value.threads.length > 40)
    throw new ServiceError('The library holds 40 conversations. Forget one in Conversations & memory to save this one; it stays in this tab meanwhile. Nothing was overwritten.');
  if (!validLibrary(value) || new TextEncoder().encode(JSON.stringify(value)).byteLength > 1900000)
    throw new ServiceError('Library limits reached or contents are not eligible. Keep up to 40 conversations, 200 messages each, and 150 sourced memories without credentials. Nothing was overwritten.');
  return value;
}
// The saved copy never holds key-like text and stays within the per-message cap; the visible chat is unchanged.
export const omittedText = '[Not saved: this message resembled a credential.]';
const savedText = value => typeof value !== 'string' ? '' : containsCredential(value) ? omittedText : value.slice(0,12000);
export function captureThread(library, profile, surface, messages, threadID = crypto.randomUUID(), now = Date.now()) {
  if (!profiles.includes(profile) || !surfaces.includes(surface)) throw new ServiceError('Choose Personal or Work for saved conversations.');
  if (!messages.length) return {library, threadID};
  const old = library.threads.find(t => t.id === threadID);
  if (old && (old.profile !== profile || old.surface !== surface)) throw new ServiceError('Conversation boundary changed.');
  const saved = messages.map(m => ({id:m.id, role:m.role, text:savedText(m.text), at:m.at, incomplete:!!m.incomplete, preview:!!m.preview}));
  const thread = {id:threadID, profile, surface, title:(saved.find(m => m.role === 'user')?.text || 'Conversation').slice(0,100), updated:now, messages:saved};
  const next = structuredClone(library);
  next.threads = next.threads.filter(t => t.id !== threadID).concat(thread);
  return {library:check(next), threadID};
}
export function remember(library, {profile, threadID, messageID, quote, fact, durable = false}, now = Date.now()) {
  const next = structuredClone(library);
  next.memories.push({id:crypto.randomUUID(),profile,text:fact.trim(),source:{threadID,messageID,quote},created:now,
    expires:durable ? null : now + 90 * 86400000});
  return check(next);
}
export function reviseMemory(library,profile,memoryID,fact){
  if(!profiles.includes(profile)||typeof fact!=='string')throw new ServiceError('Choose a valid memory and fact.');
  const next=structuredClone(library),memory=next.memories.find(m=>m.id===memoryID&&m.profile===profile);
  if(!memory)throw new ServiceError('Memory not found in this profile.');
  memory.text=fact.trim();
  return check(next);
}
export function forgetThread(library, profile, threadID) {
  const next = structuredClone(library);
  next.threads = next.threads.filter(t => !(t.id === threadID && t.profile === profile));
  next.memories = next.memories.filter(m => !(m.profile === profile && m.source.threadID === threadID));
  return check(next);
}
export function searchThreads(library, profile, query = '', surface = '') {
  if (!profiles.includes(profile) || typeof query !== 'string') return [];
  const q = query.trim().toLocaleLowerCase().slice(0,200);
  return library.threads.filter(t => t.profile === profile && (!surface || t.surface === surface) &&
    (!q || (t.title + '\n' + t.messages.map(m => m.text).join('\n')).toLocaleLowerCase().includes(q)))
    .sort((a,b) => b.updated - a.updated);
}
export function recall(library, profile, query, now = Date.now()) {
  if (!profiles.includes(profile) || typeof query !== 'string') return [];
  const words = new Set(query.toLocaleLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);
  return library.memories.filter(m => m.profile === profile && m.created <= now && (m.expires === null || m.expires > now))
    .map(m => {
      const age = (now - m.created) / 86400000;
      const overlap = [...words].filter(w => m.text.toLocaleLowerCase().includes(w)).length;
      return {memory:m, score:overlap * 4 + Math.exp(-age / 30), overlap, age};
    }).filter(r => r.overlap || r.age <= 30).sort((a,b) => b.score - a.score || b.memory.created - a.memory.created)
    .slice(0,4).map(r => r.memory);
}
export function memoryContext(library, profile, query, enabled, now = Date.now()) {
  if (!enabled) return '';
  return recall(library, profile, query, now).map(m => ({fact:m.text, source:m.source.threadID + '/' + m.source.messageID,
    recorded:new Date(m.created).toISOString().slice(0,10)}));
}
export function introductionContext(value) {
  if (!validIntroduction(value)) throw new ServiceError('Check interview length and remove credentials.');
  const priority=['boundaries','communication','ownerName','assistantName'];
  const entries=Object.entries(value).filter(([k,v]) => k !== 'persona' && v.trim());
  entries.sort(([a],[b])=>(priority.indexOf(a)<0?priority.length:priority.indexOf(a))-(priority.indexOf(b)<0?priority.length:priority.indexOf(b)));
  return entries.map(([k,v]) => `${k}: ${v}`).join('\n').slice(0,3200);
}

// Separate from the story board. Authenticated, bounded encrypted records only; keys/grants never enter this schema.
const aad = new TextEncoder().encode('PEA conversation library v1');
// Record version selects the PBKDF2-SHA256 work factor. Version 1 records are re-keyed to version 2 on their next unlock.
export const kdfIterations = {1:310000, 2:600000};
export class ConversationVault {
  constructor(storage) { this.storage=storage; this.key=null; this.salt=null; this.revision=null; this.chain=Promise.resolve(); this.epoch=0; }
  static async open() {
    const db = await new Promise((resolve,reject) => {
      const r=indexedDB.open('pea-conversation-library-v1',1);
      r.onupgradeneeded=()=>r.result.createObjectStore('encrypted');
      r.onerror=()=>reject(new ServiceError('Local library storage is unavailable.'));
      r.onblocked=()=>reject(new ServiceError('Close other PEA tabs before opening this library.'));
      r.onsuccess=()=>{r.result.onversionchange=()=>r.result.close();resolve(r.result);};
    });
    return new ConversationVault({
      get:()=>new Promise((resolve,reject)=>{const r=db.transaction('encrypted').objectStore('encrypted').get('library');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);}),
      // Check and write in ONE transaction, so another tab cannot silently overwrite the latest revision.
      comparePut:(expected,value)=>new Promise((resolve,reject)=>{
        const tx=db.transaction('encrypted','readwrite'), store=tx.objectStore('encrypted'), r=store.get('library');
        let conflict=false;
        r.onsuccess=()=>{if(expected===null ? r.result!==undefined : r.result?.revision!==expected){conflict=true;tx.abort();}else store.put(value,'library');};
        tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(new ServiceError(conflict?'Another tab changed this library. Lock and unlock to reload it before saving.':'Saving the local library failed. The previous encrypted record remains.'));
      })
    });
  }
  async derive(passphrase,salt,version=2) {
    if (typeof passphrase !== 'string' || passphrase.length < 12 || passphrase.length > 256)
      throw new ServiceError('Use a library passphrase of 12–256 characters.');
    const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(passphrase),'PBKDF2',false,['deriveKey']);
    return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:kdfIterations[version],hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  }
  async unlock(passphrase,current=emptyLibrary()) {
    const epoch=++this.epoch;
    await this.chain.catch(()=>{});
    this.chain=Promise.resolve();this.key=null;this.salt=null;this.revision=null;
    const saved=await this.storage.get();
    let key,salt,library,upgrade=false;
    if (saved) {
      if (!fields(saved,['version','revision','salt','iv','data']) || !Object.hasOwn(kdfIterations,saved.version) || !id(saved.revision) ||
          !(saved.salt instanceof Uint8Array) || saved.salt.length!==16 || !(saved.iv instanceof Uint8Array) || saved.iv.length!==12 ||
          !(saved.data instanceof ArrayBuffer) || saved.data.byteLength>2000000)
        throw new ServiceError('Stored library format is not recognized. Nothing was overwritten.');
      try {
        salt=saved.salt;key=await this.derive(passphrase,salt,saved.version);
        library=check(JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:saved.iv,additionalData:aad},key,saved.data))));
        if (saved.version!==2) {salt=crypto.getRandomValues(new Uint8Array(16));key=await this.derive(passphrase,salt);upgrade=true;}
      } catch { throw new ServiceError('Could not unlock the library. Check the passphrase. Nothing was overwritten.'); }
    } else {
      library=check(structuredClone(current));salt=crypto.getRandomValues(new Uint8Array(16));key=await this.derive(passphrase,salt);
    }
    if (epoch!==this.epoch) throw new ServiceError('Library unlock was cancelled.');
    this.key=key;this.salt=salt;this.revision=saved?.revision??null;
    // A first save or a work-factor upgrade that cannot be written leaves the vault locked and the old record intact.
    if (!saved || upgrade) { try {await this.save(library);} catch(error) {this.lock();throw error;} }
    return library;
  }
  save(library) {
    if (!this.key) return Promise.reject(new ServiceError('Unlock the library before saving.'));
    let plain;
    try {plain=new TextEncoder().encode(JSON.stringify(check(library)));} catch(error) {return Promise.reject(error);}
    const key=this.key,salt=this.salt,epoch=this.epoch;
    const task=this.chain.then(async()=>{
      if(epoch!==this.epoch) throw new ServiceError('Library was locked before saving.');
      const iv=crypto.getRandomValues(new Uint8Array(12)),data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},key,plain);
      if(epoch!==this.epoch) throw new ServiceError('Library was locked before saving.');
      const revision=crypto.randomUUID();
      await this.storage.comparePut(this.revision,{version:2,revision,salt,iv,data});
      this.revision=revision;
    });
    // A failed write stops this session. No queued stale write can hide it; explicitly unlock again.
    this.chain=task;return task;
  }
  async exportEncrypted() {
    await this.chain;
    const record=await this.storage.get();
    if(!record || (this.key && record.revision!==this.revision))throw new ServiceError('No current saved library to export. Resolve any save conflict first.');
    const encoded=bytes=>{let out='';for(let i=0;i<bytes.length;i+=8192)out+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(out);};
    if(!fields(record,['version','revision','salt','iv','data']) || !Object.hasOwn(kdfIterations,record.version) || !id(record.revision) ||
       !(record.salt instanceof Uint8Array) || record.salt.length!==16 || !(record.iv instanceof Uint8Array) || record.iv.length!==12 ||
       !(record.data instanceof ArrayBuffer) || record.data.byteLength<16 || record.data.byteLength>2000000)throw new ServiceError('Stored library format is not recognized.');
    return JSON.stringify({format:'pea-encrypted-library',version:record.version,salt:encoded(record.salt),iv:encoded(record.iv),data:encoded(new Uint8Array(record.data))});
  }
  async importEncrypted(serialized,passphrase,canCommit=()=>true) {
    const epoch=this.epoch;
    if(this.key)throw new ServiceError('Lock the library before importing.');
    if(typeof serialized!=='string' || serialized.length>2700000)throw new ServiceError('Backup is too large or invalid.');
    let value,salt,iv,data;
    try {
      value=JSON.parse(serialized);
      if(!fields(value,['format','version','salt','iv','data']) || value.format!=='pea-encrypted-library' || !Object.hasOwn(kdfIterations,value.version))throw Error('format');
      const decode=(s,max)=>{if(typeof s!=='string'||s.length>max||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s))throw Error('encoding');const raw=atob(s);return Uint8Array.from(raw,c=>c.charCodeAt(0));};
      salt=decode(value.salt,24);iv=decode(value.iv,16);data=decode(value.data,2666668);
      if(salt.length!==16 || iv.length!==12 || data.length<16 || data.length>2000000)throw Error('size');
      const key=await this.derive(passphrase,salt,value.version);
      check(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:aad},key,data))));
    } catch {throw new ServiceError('Could not verify this backup. Check the file and passphrase; nothing was imported.');}
    if(epoch!==this.epoch || this.key || !canCommit())throw new ServiceError('The library changed while verifying. Nothing was imported.');
    // Compare-and-insert prevents another tab from being overwritten, even after verification.
    await this.storage.comparePut(null,{version:value.version,revision:crypto.randomUUID(),salt,iv,data:data.buffer});
  }
  lock() {this.epoch++;this.key=null;this.salt=null;this.revision=null;}
}
