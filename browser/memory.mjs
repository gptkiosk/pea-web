import {containsCredential, ServiceError} from './connections.mjs';

const profiles = ['personal', 'work'];
const surfaces = ['chat', 'greenhouse'];
const id = value => typeof value === 'string' && /^[a-z0-9-]{10,50}$/i.test(value);
const time = value => Number.isSafeInteger(value) && value >= 0 && value <= 8640000000000000;
const fields = (value, names) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));
const text = (value, max) => typeof value === 'string' && value.length <= max && !containsCredential(value);
export const introductionLimits = {ownerName:80, assistantName:80, hometown:120, interests:1200, relationships:600, goals:600, persona:900};
export const emptyIntroduction = () => Object.fromEntries(Object.keys(introductionLimits).map(k => [k, '']));
export const emptyLibrary = () => ({version:1, threads:[], memories:[], introductions:{personal:emptyIntroduction(), work:emptyIntroduction()}});
export function validIntroduction(value) {
  return fields(value, Object.keys(introductionLimits)) && Object.entries(introductionLimits).every(([key, max]) => text(value[key], max));
}
export function validLibrary(value) {
  if (!fields(value, ['version','threads','memories','introductions']) || value.version !== 1 ||
      !Array.isArray(value.threads) || value.threads.length > 40 || !Array.isArray(value.memories) || value.memories.length > 150 ||
      !fields(value.introductions, profiles) || !profiles.every(p => validIntroduction(value.introductions[p]))) return false;
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
  if (!validLibrary(value) || new TextEncoder().encode(JSON.stringify(value)).byteLength > 1900000)
    throw new ServiceError('Library limits reached or contents are not eligible. Keep up to 40 conversations, 200 messages each, and 150 sourced memories without credentials. Nothing was overwritten.');
  return value;
}
export function captureThread(library, profile, surface, messages, threadID = crypto.randomUUID(), now = Date.now()) {
  if (!profiles.includes(profile) || !surfaces.includes(surface)) throw new ServiceError('Choose Personal or Work for saved conversations.');
  if (!messages.length) return {library, threadID};
  const old = library.threads.find(t => t.id === threadID);
  if (old && (old.profile !== profile || old.surface !== surface)) throw new ServiceError('Conversation boundary changed.');
  const thread = {id:threadID, profile, surface, title:(messages.find(m => m.role === 'user')?.text || 'Conversation').slice(0,100), updated:now,
    messages:messages.map(m => ({id:m.id, role:m.role, text:m.text, at:m.at, incomplete:!!m.incomplete, preview:!!m.preview}))};
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
  return Object.entries(value).filter(([k,v]) => k !== 'persona' && v.trim()).map(([k,v]) => `${k}: ${v}`).join('\n').slice(0,3200);
}

// Separate from the story board. Authenticated, bounded encrypted records only; keys/grants never enter this schema.
const aad = new TextEncoder().encode('PEA conversation library v1');
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
        r.onsuccess=()=>{if((r.result?.revision??null)!==expected){conflict=true;tx.abort();}else store.put(value,'library');};
        tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(new ServiceError(conflict?'Another tab changed this library. Lock and unlock to reload it before saving.':'Saving the local library failed. The previous encrypted record remains.'));
      })
    });
  }
  async derive(passphrase,salt) {
    if (typeof passphrase !== 'string' || passphrase.length < 12 || passphrase.length > 256)
      throw new ServiceError('Use a library passphrase of 12–256 characters.');
    const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(passphrase),'PBKDF2',false,['deriveKey']);
    return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:310000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  }
  async unlock(passphrase,current=emptyLibrary()) {
    const epoch=++this.epoch;
    await this.chain.catch(()=>{});
    this.chain=Promise.resolve();this.key=null;this.salt=null;this.revision=null;
    const saved=await this.storage.get();
    let key,salt,library;
    if (saved) {
      if (!fields(saved,['version','revision','salt','iv','data']) || saved.version!==1 || !id(saved.revision) ||
          !(saved.salt instanceof Uint8Array) || saved.salt.length!==16 || !(saved.iv instanceof Uint8Array) || saved.iv.length!==12 ||
          !(saved.data instanceof ArrayBuffer) || saved.data.byteLength>2000000)
        throw new ServiceError('Stored library format is not recognized. Nothing was overwritten.');
      try {
        salt=saved.salt;key=await this.derive(passphrase,salt);
        library=check(JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:saved.iv,additionalData:aad},key,saved.data))));
      } catch { throw new ServiceError('Could not unlock the library. Check the passphrase. Nothing was overwritten.'); }
    } else {
      library=check(structuredClone(current));salt=crypto.getRandomValues(new Uint8Array(16));key=await this.derive(passphrase,salt);
    }
    if (epoch!==this.epoch) throw new ServiceError('Library unlock was cancelled.');
    this.key=key;this.salt=salt;this.revision=saved?.revision??null;
    if (!saved) await this.save(library);
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
      await this.storage.comparePut(this.revision,{version:1,revision,salt,iv,data});
      this.revision=revision;
    });
    // A failed write stops this session. No queued stale write can hide it; explicitly unlock again.
    this.chain=task;return task;
  }
  lock() {this.epoch++;this.key=null;this.salt=null;this.revision=null;}
}
