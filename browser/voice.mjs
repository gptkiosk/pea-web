export function voicePreferences(value){
 const voice=typeof value?.voice==='string'&&value.voice.length<=300?value.voice:'';
 const rate=Number(value?.rate);
 return {voice,rate:Number.isFinite(rate)&&rate>=0.8&&rate<=1.25?rate:1};
}
export function loadVoicePreferences(){try{return voicePreferences(JSON.parse(globalThis.localStorage.getItem('pea-device-voice-v1')||'{}'));}catch{return voicePreferences({});}}
export function saveVoicePreferences(value){try{globalThis.localStorage.setItem('pea-device-voice-v1',JSON.stringify(voicePreferences(value)));return true;}catch{return false;}}
export function speechReadPlan(text){
 const value=typeof text==='string'?text.trim():'';if(value.length<=1200)return {long:false,excerpt:''};
 const sentences=value.split(/(?<=[.!?])\s+|\n+/u).map(s=>s.trim()).filter(Boolean);
 const indexes=[...new Set([0,Math.floor((sentences.length-1)/2),sentences.length-1])];
 const excerpt=indexes.map(i=>{const s=sentences[i];return s.length>180?s.slice(0,177).trimEnd()+'…':s;}).join(' … ');
 return {long:true,excerpt:excerpt.slice(0,600)};
}

// One reviewed dictation at a time. No auto-send, restart, hidden capture or model request.
export class Dictation {
 constructor({Recognition,onText,onState=()=>{},onError=()=>{}}){this.Recognition=Recognition;this.onText=onText;this.onState=onState;this.onError=onError;this.generation=0;this.active=null;}
 start(target){this.stop();if(!this.Recognition){this.onError('Speech recognition is unavailable in this browser. Use keyboard dictation or native PEA.');return false;}const epoch=this.generation,recognizer=new this.Recognition();this.active=recognizer;recognizer.lang='en-US';recognizer.interimResults=false;recognizer.continuous=false;recognizer.onresult=e=>{if(epoch===this.generation&&this.active===recognizer){const text=Array.from(e.results).filter(r=>r.isFinal!==false).map(r=>r[0]?.transcript??'').join(' ').slice(0,4000);if(text)this.onText(target,text);}};recognizer.onerror=e=>{if(epoch===this.generation)this.onError(e.error==='not-allowed'||e.error==='service-not-allowed'?'Microphone or speech service permission was denied. Allow it in browser and device settings, then try again.':'Recognition stopped. Review your draft or try again.');};recognizer.onend=()=>{if(epoch===this.generation){this.active=null;this.onState(false);}};try{recognizer.start();this.onState(true);return true;}catch{this.stop();this.onError('Microphone could not start. Check browser permission and use HTTPS on your phone.');return false;}}
 stop(){this.generation++;const old=this.active;this.active=null;old?.abort();this.onState(false);}
}
