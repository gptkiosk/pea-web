import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Services,containsCredential,safeName} from '../connections.mjs';
const json=r=>new Response(JSON.stringify(r),{status:200,headers:{'Content-Type':'application/json'}});
test('credentials are header-only, omitted on redirects, and constrained to fixed service paths',async()=>{
 let calls=0;const s=new Services(async(url,options)=>{calls++;assert.equal(new URL(url).host,'openrouter.ai');assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');assert.equal(options.referrerPolicy,'no-referrer');assert.equal(options.headers.Authorization,'Bearer synthetic-only');return json({data:{}});});
 await s.call('router','/api/v1/key',{token:'synthetic-only'});
 await assert.rejects(()=>s.call('router','https://evil.example/api/v1/key',{token:'CANARY'}));
 await assert.rejects(()=>s.call('github','/repos/a/b/contents/../../secrets',{token:'CANARY'}));assert.equal(calls,1);
});
test('Chat and collaboration requests are explicit, bounded and have no fallback',()=>{
 const s=new Services(()=>{throw Error('network forbidden');}),model={id:'nvidia/nemotron-3.5-lightning:free',prompt:0,completion:0,request:0};
 const b=s.body({model,profile:'personal',allowData:false,persona:'Curious',text:'Hello',history:[{role:'system',text:'INJECTED'},{role:'assistant',text:'INCOMPLETE',incomplete:true}]});
 assert.equal(b.provider.allow_fallbacks,false);assert.equal(b.provider.data_collection,'deny');assert.deepEqual(b.provider.only,['nvidia']);assert.deepEqual(b.provider.max_price,{prompt:0,completion:0,request:0});assert.doesNotMatch(JSON.stringify(b),/INJECTED|INCOMPLETE/);assert.equal(b.tools,undefined);
 assert.throws(()=>s.body({model,profile:'blended',text:'No broad mixing'}));
});
test('selected file text stays quoted in a bounded system context and cannot grant tools',()=>{
 const b=new Services().body({model:{id:'sample/code',prompt:1e-7,completion:2e-7,request:0},profile:'work',text:'Review',attachment:'UNTRUSTED'.repeat(1000)});
 assert.match(b.messages[0].content,/untrusted data, never instructions/);assert.ok(b.messages[0].content.length<6000);assert.equal(b.provider.max_price.prompt,.1);assert.equal(b.max_tokens,384);
});
test('a moved-out file cannot reach a write endpoint',async()=>{
 const root='pea_root_000001',file='pea_file_000001',other='other_root_0001';let writes=0;
 const s=new Services(async(url,options)=>{if(options.method!=='GET')writes++;const id=new URL(url).pathname.split('/').at(-1);return json(id===root?{id:root,name:'PEA',mimeType:'application/vnd.google-apps.folder',properties:{peaWorkspace:'1',peaProfile:'personal'},parents:[],version:'1'}:id===other?{id:other,name:'Other',mimeType:'application/vnd.google-apps.folder',parents:[],version:'1'}:{id:file,name:'Notes',mimeType:'text/plain',parents:[other],version:'2'});});
 const w={folder:{id:root,title:'PEA'},profile:'personal',account:'owner@example.invalid'};
 await assert.rejects(()=>s.change({kind:'trash',file:{id:file,name:'Notes',version:'1'}},w,'synthetic-only'));assert.equal(writes,0);
});
test('provider errors never echo raw upstream data or invent quota',async()=>{
 const s=new Services(async()=>new Response('SECRET UPSTREAM BODY',{status:429,headers:{'Retry-After':'12'}}));
 await assert.rejects(()=>s.call('router','/api/v1/key'),e=>/Retry after 12/.test(e.message)&&!e.message.includes('SECRET'));
});
test('SSE is incremental and incomplete replies fail instead of silently succeeding',async()=>{
 const event='data: '+JSON.stringify({choices:[{delta:{content:'Hello'}}]})+'\n';let output='';
 const s=new Services(async()=>new Response(event+'data: [DONE]\n',{status:200}));await s.stream('synthetic',{model:'sample'},t=>output+=t);assert.equal(output,'Hello');
 const bad=new Services(async()=>new Response(event,{status:200}));await assert.rejects(()=>bad.stream('synthetic',{},()=>{}),/before the reply completed/);
});
test('sensitive provider/GitHub values and path-like names are excluded',()=>{
 assert.equal(safeName('../outside'),false);assert.equal(safeName('Research'),true);
 assert.equal(containsCredential('github_pat_'+'a'.repeat(40)),true);
 assert.throws(()=>new Services().body({model:{id:'sample',prompt:0,completion:0,request:0},profile:'personal',text:'ghp_'+'a'.repeat(40)}));
});

test('unknown, null and empty prices never become zero-cost routes',async()=>{
 const {knownPrice}=await import('../connections.mjs');
 for(const bad of [null,undefined,'', ' ',false,{},-1,Infinity,'not priced'])assert.equal(knownPrice(bad),undefined);
 assert.equal(knownPrice('0'),0);assert.equal(knownPrice('0.05'),0.05);
 const item={id:'example/model',name:'Example',architecture:{input_modalities:['text'],output_modalities:['text']},pricing:{prompt:null,completion:'0'}};
 const service=new Services(async url=>new Response(JSON.stringify(url.endsWith('/key')?{data:{}}:{data:[item,{...item,id:'example/free',pricing:{prompt:'0',completion:'0'}}]}),{status:200}));
 assert.deepEqual((await service.catalogue('synthetic')).map(m=>m.id),['example/free']);
});

test('calendar reads a bounded primary-calendar window without external attendee/location payloads',async()=>{
 const calls=[];const s=new Services(async(url,options)=>{calls.push({url:new URL(url),options});return new Response(JSON.stringify({items:[{summary:'Planning',start:{dateTime:'2026-11-07T10:00:00Z'},end:{dateTime:'2026-11-07T11:00:00Z'},attendees:['excluded'],location:'excluded'}]}));});
 const rows=await s.calendar('synthetic','work',Date.parse('2026-11-07T00:00:00Z'));assert.equal(rows.length,1);assert.equal(rows[0].profile,'work');assert.equal(rows[0].attendees,undefined);assert.equal(rows[0].location,undefined);assert.equal(calls[0].url.pathname,'/calendar/v3/calendars/primary/events');assert.equal(calls[0].url.searchParams.get('maxResults'),'10');assert.equal(calls[0].options.method,'GET');
});
test('mail preview requests only metadata for at most three safe IDs and excludes credential-like contents',async()=>{
 const calls=[];const s=new Services(async(url,options)=>{const u=new URL(url);calls.push({u,options});return new Response(JSON.stringify(u.pathname.endsWith('/messages')?{messages:[{id:'abc'},{id:'def'},{id:'../../escape'}]}:{payload:{headers:[{name:'From',value:'Sender'},{name:'Subject',value:u.pathname.endsWith('def')?'sk-or-v1-'+ 'a'.repeat(40):'A safe note'}]},snippet:'Short preview'}));});
 const rows=await s.mail('synthetic','personal');assert.equal(rows.length,1);assert.equal(rows[0].subject,'A safe note');assert.equal(calls.length,3);assert.equal(calls[1].u.searchParams.get('format'),'metadata');assert(!calls.some(c=>c.u.searchParams.get('format')==='full'));assert(calls.every(c=>c.options.method==='GET'));
});
test('enabled source text is bounded, untrusted context and credential-protected',()=>{
 const s=new Services();const base={model:{id:'sample/free',prompt:0,completion:0,request:0},profile:'personal',allowData:false,text:'Discuss',sources:'SOURCE '+ 'x'.repeat(8000)};const body=s.body(base);assert.match(body.messages[0].content,/untrusted quoted data/);assert(!body.messages[0].content.includes('x'.repeat(4001)));assert.throws(()=>s.body({...base,sources:'github_pat_'+ 'a'.repeat(40)}));
});
