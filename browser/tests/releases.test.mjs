import test from 'node:test';
import assert from 'node:assert/strict';
import {newerVersion,versionParts,validRepository,publicBuild,suggestionDraft,issueURL} from '../releases.mjs';

test('SemVer ordering respects numeric releases and prerelease precedence',()=>{
 for(const [a,b] of [['1.10.0','1.9.9'],['2.0.0','1.99.99'],['1.0.0','1.0.0-rc.9'],['1.0.0-rc.10','1.0.0-rc.2'],['1.0.0-beta','1.0.0-9']]) assert.equal(newerVersion(a,b),true);
 for(const [a,b] of [['1.0.0','1.0.0'],['1.0.0+build.2','1.0.0+build.1'],['1.0.0-rc','1.0.0'],['0.9.9','1.0.0'],['not-a-release','1.0.0']]) assert.equal(newerVersion(a,b),false);
 for(const v of ['01.0.0','1.0','1.0.0-01','1.0.0-','1.0.0/../../x',null])assert.equal(versionParts(v),null);
});
test('Public identity refuses unknown channels, invalid commits and external upstreams',()=>{
 const clean={version:'0.1.0-dev.1',channel:'development',environment:'source',commit:null,modified:null,repository:null};
 assert.equal(publicBuild(clean),clean);
 for(const patch of [{commit:'short'},{repository:'https://evil.invalid'},{repository:'owner/../repo'},{environment:'customer-host-path'},{modified:'false'},{channel:'anything'}])assert.throws(()=>publicBuild({...clean,...patch}));
 assert.equal(validRepository('gptkiosk/pea-web'),true); assert.equal(validRepository('gptkiosk/pea-web?token=x'),false);
});
test('Feedback includes only deliberately entered text and public build identity',()=>{
 const args={kind:'suggestion',title:'Improve keyboard hiding',description:'Keep the microphone visible.',version:'0.1.0',commit:'a'.repeat(40)};
 const body=suggestionDraft(args);assert.match(body,/Improve keyboard hiding/);assert.match(body,/aaaaaaa/);assert.match(body,/No chats.*attached automatically/);
 assert.equal(body.includes('undefined'),false);
 const url=new URL(issueURL('gptkiosk/pea-web',args.title,body));assert.equal(url.origin,'https://github.com');assert.equal(url.pathname,'/gptkiosk/pea-web/issues/new');assert.equal(url.searchParams.get('body'),body);assert.equal(url.searchParams.has('token'),false);
 for(const text of ['sk-or-v1-synthetic','-----BEGIN '+'OPENSSH PRIVATE KEY-----','github_pat_synthetic'])assert.throws(()=>suggestionDraft({...args,description:text}));
 assert.throws(()=>suggestionDraft({...args,description:'x'.repeat(4001)}));assert.throws(()=>issueURL('attacker/../route','t','b'));assert.throws(()=>issueURL('gptkiosk/pea-web','t','x'.repeat(7100)));
});
