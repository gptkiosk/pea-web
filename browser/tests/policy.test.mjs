import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gate, inWorkspace, projectCalendar, recentFiles} from '../policy.mjs';
const fixtures = JSON.parse(await readFile(new URL('./fixtures/PolicyFixtures.json', import.meta.url)));
assert.equal(fixtures.version, 1);
for (const c of fixtures.gateCases) test(`shared gate: ${c.name}`, () => assert.equal(gate({profile:c.origin, dataClass:c.dataClass}, c.mode, c.rules, fixtures.now), c.expected));
for (const c of fixtures.workspaceCases) test(`shared folder: ${c.name}`, () => assert.equal(inWorkspace(c.item, c.workspace, c.ancestry), c.expected));
test('busy projection removes all extra fields, not just a title in the UI', () => assert.deepEqual(projectCalendar({title:'PRIVATE', attendees:['SECRET'], body:'CANARY', start:1, end:2}, 'project:0'), {title:'Busy',start:1,end:2}));
test('unknown policy values fail closed', () => { assert.equal(gate({profile:'work',dataClass:'shell'},'personal',[],1000),'deny'); assert.equal(gate({profile:'work',dataClass:'memory'},'invalid',[],1000),'deny'); });
test('recent means created by PEA, not merely recently moved or modified', () => {
 const now = Date.UTC(2026,10,7), base={mimeType:'text/plain',name:'Notes',createdTime:new Date(now-86400000).toISOString(),properties:{peaCreated:'1'}};
 assert.equal(recentFiles([base,{...base,properties:{}},{...base,createdTime:new Date(now-9*86400000).toISOString()},{...base,trashed:true}],{now}).length,1);
});
test('document rendering cannot execute source or recover owner tokens', async () => {
 const html = await readFile(new URL('../index.html',import.meta.url),'utf8');
 const app = await readFile(new URL('../app.mjs',import.meta.url),'utf8');
 assert.match(html,/connect-src 'self'/);assert.match(html,/object-src 'none'/);assert.match(html,/frame-src https:\/\/accounts\.google\.com/);
 assert.doesNotMatch(app,/innerHTML|eval\(|new Function|localStorage|document\.cookie|fetch\(/);
 assert.match(app,/textContent/);
});
