import {ServiceError} from './connections.mjs';
import {validIntroduction,introductionLimits} from './memory.mjs';

// The authenticated format label selects the PBKDF2-SHA256 work factor. New files are v2; v1 files remain readable.
export const profileFormats={'pea-profile-export-v1':310000,'pea-profile-export-v2':600000};
const label='pea-profile-export-v2', aadFor=format=>new TextEncoder().encode(format);
const fields=(v,n)=>v && typeof v==='object' && !Array.isArray(v) && Object.keys(v).length===n.length && n.every(k=>Object.hasOwn(v,k));
const profiles=['personal','work'];
export function planProfileImport(current,incoming,mode){
  if(!validIntroduction(current)||!validIntroduction(incoming)||!['missing','replace'].includes(mode))throw new ServiceError('Invalid profile or import choice. Nothing was changed.');
  const next={},changes=[];
  for(const key of Object.keys(introductionLimits)){
    const before=current[key]??'',offered=incoming[key]??'';
    const after=mode==='replace'?offered:(!before.trim()&&offered.trim()?offered:before);
    next[key]=after;if(before!==after)changes.push({field:key,before,after});
  }
  return {next,changes};
}
const encode=bytes=>btoa(String.fromCharCode(...bytes));
function decode(s,max){if(typeof s!=='string'||s.length>max||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s))throw Error('encoding');return Uint8Array.from(atob(s),c=>c.charCodeAt(0));}
async function derive(passphrase,salt,format=label){
  if(typeof passphrase!=='string'||passphrase.length<12||passphrase.length>256)throw new ServiceError('Use a passphrase of 12–256 characters.');
  const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(passphrase),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:profileFormats[format],hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export async function encryptProfile(profile,introduction,passphrase){
  if(!profiles.includes(profile)||!validIntroduction(introduction))throw new ServiceError('Choose a valid Personal or Work interview.');
  const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
  const key=await derive(passphrase,salt),plain=new TextEncoder().encode(JSON.stringify({profile,introduction}));
  if(plain.byteLength>28984)throw new ServiceError('This profile is too large to export. Shorten the answers and try again.');
  const data=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aadFor(label)},key,plain));
  return JSON.stringify({format:label,salt:encode(salt),iv:encode(iv),data:encode(data)});
}
export async function decryptProfile(serialized,passphrase){
  if(typeof serialized!=='string'||serialized.length>40000)throw new ServiceError('Choose a profile file under 40 KB.');
  try{
    const envelope=JSON.parse(serialized);
    if(!fields(envelope,['format','salt','iv','data'])||typeof envelope.format!=='string'||!Object.hasOwn(profileFormats,envelope.format))throw Error('format');
    const salt=decode(envelope.salt,24),iv=decode(envelope.iv,16),data=decode(envelope.data,39900);
    if(salt.length!==16||iv.length!==12||data.length<16||data.length>29000)throw Error('size');
    const key=await derive(passphrase,salt,envelope.format),plain=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:aadFor(envelope.format)},key,data);
    const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(plain));
    if(!fields(value,['profile','introduction'])||!profiles.includes(value.profile)||!validIntroduction(value.introduction))throw Error('schema');
    return value;
  }catch{throw new ServiceError('Could not verify this profile file. Check the file and passphrase; nothing was changed.');}
}
