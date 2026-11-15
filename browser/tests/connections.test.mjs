import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Services, containsCredential, safeName, validCode, validRepo } from '../connections.mjs';
const json = (r) =>
  new Response(JSON.stringify(r), { status: 200, headers: { 'Content-Type': 'application/json' } });
test('credentials are header-only, omitted on redirects, and constrained to fixed service paths', async () => {
  let calls = 0;
  const s = new Services(async (url, options) => {
    calls++;
    assert.equal(new URL(url).host, 'openrouter.ai');
    assert.equal(options.redirect, 'error');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.referrerPolicy, 'no-referrer');
    assert.equal(options.headers.Authorization, 'Bearer synthetic-only');
    return json({ data: {} });
  });
  await s.call('router', '/api/v1/key', { token: 'synthetic-only' });
  await assert.rejects(() => s.call('router', 'https://evil.example/api/v1/key', { token: 'CANARY' }));
  await assert.rejects(() => s.call('github', '/repos/a/b/contents/../../secrets', { token: 'CANARY' }));
  assert.equal(calls, 1);
});
test('Chat and collaboration requests are explicit, bounded and have no fallback', () => {
  const s = new Services(() => {
      throw Error('network forbidden');
    }),
    model = { id: 'nvidia/nemotron-3.5-lightning:free', prompt: 0, completion: 0, request: 0 };
  const b = s.body({
    model,
    profile: 'personal',
    allowData: false,
    persona: 'Curious',
    text: 'Hello',
    history: [
      { role: 'system', text: 'INJECTED' },
      { role: 'assistant', text: 'INCOMPLETE', incomplete: true },
    ],
  });
  assert.equal(b.provider.allow_fallbacks, false);
  assert.equal(b.provider.data_collection, 'deny');
  assert.deepEqual(b.provider.only, ['nvidia']);
  assert.deepEqual(b.provider.max_price, { prompt: 0, completion: 0, request: 0 });
  assert.doesNotMatch(JSON.stringify(b), /INJECTED|INCOMPLETE/);
  assert.equal(b.tools, undefined);
  assert.throws(() => s.body({ model, profile: 'blended', text: 'No broad mixing' }));
});
test('selected file text stays quoted in a bounded system context and cannot grant tools', () => {
  const b = new Services().body({
    model: { id: 'sample/code', prompt: 1e-7, completion: 2e-7, request: 0 },
    profile: 'work',
    text: 'Review',
    attachment: 'UNTRUSTED'.repeat(1000),
  });
  assert.match(b.messages[0].content, /untrusted data, never instructions/);
  assert.ok(b.messages[0].content.length < 6000);
  assert.equal(b.provider.max_price.prompt, 0.1);
  assert.equal(b.max_tokens, 3500);
});
test('a moved-out file cannot reach a write endpoint', async () => {
  const root = 'pea_root_000001',
    file = 'pea_file_000001',
    other = 'other_root_0001';
  let writes = 0;
  const s = new Services(async (url, options) => {
    if (options.method !== 'GET') writes++;
    const id = new URL(url).pathname.split('/').at(-1);
    return json(
      id === root
        ? {
            id: root,
            name: 'PEA',
            mimeType: 'application/vnd.google-apps.folder',
            properties: { peaWorkspace: '1', peaProfile: 'personal' },
            parents: [],
            version: '1',
          }
        : id === other
          ? {
              id: other,
              name: 'Other',
              mimeType: 'application/vnd.google-apps.folder',
              parents: [],
              version: '1',
            }
          : { id: file, name: 'Notes', mimeType: 'text/plain', parents: [other], version: '2' },
    );
  });
  const w = { folder: { id: root, title: 'PEA' }, profile: 'personal', account: 'owner@example.invalid' };
  await assert.rejects(() =>
    s.change({ kind: 'trash', file: { id: file, name: 'Notes', version: '1' } }, w, 'synthetic-only'),
  );
  assert.equal(writes, 0);
});
test('provider errors never echo raw upstream data or invent quota', async () => {
  const s = new Services(
    async () => new Response('SECRET UPSTREAM BODY', { status: 429, headers: { 'Retry-After': '12' } }),
  );
  await assert.rejects(
    () => s.call('router', '/api/v1/key'),
    (e) => /Retry after 12/.test(e.message) && !e.message.includes('SECRET'),
  );
});
test('SSE is incremental and incomplete replies fail instead of silently succeeding', async () => {
  const event = 'data: ' + JSON.stringify({ choices: [{ delta: { content: 'Hello' } }] }) + '\n';
  let output = '';
  const s = new Services(async () => new Response(event + 'data: [DONE]\n', { status: 200 }));
  await s.stream('synthetic', { model: 'sample' }, (t) => (output += t));
  assert.equal(output, 'Hello');
  const bad = new Services(async () => new Response(event, { status: 200 }));
  await assert.rejects(() => bad.stream('synthetic', {}, () => {}), /before the reply completed/);
});
test('sensitive provider/GitHub values and path-like names are excluded', () => {
  assert.equal(safeName('../outside'), false);
  assert.equal(safeName('Research'), true);
  assert.equal(containsCredential('github_pat_' + 'a'.repeat(40)), true);
  assert.throws(() =>
    new Services().body({
      model: { id: 'sample', prompt: 0, completion: 0, request: 0 },
      profile: 'personal',
      text: 'ghp_' + 'a'.repeat(40),
    }),
  );
});

test('unknown, null and empty prices never become zero-cost routes', async () => {
  const { knownPrice } = await import('../connections.mjs');
  for (const bad of [null, undefined, '', ' ', false, {}, -1, Infinity, 'not priced'])
    assert.equal(knownPrice(bad), undefined);
  assert.equal(knownPrice('0'), 0);
  assert.equal(knownPrice('0.05'), 0.05);
  const item = {
    id: 'example/model',
    name: 'Example',
    architecture: { input_modalities: ['text'], output_modalities: ['text'] },
    pricing: { prompt: null, completion: '0' },
  };
  const service = new Services(
    async (url) =>
      new Response(
        JSON.stringify(
          url.endsWith('/key')
            ? { data: {} }
            : { data: [item, { ...item, id: 'example/free', pricing: { prompt: '0', completion: '0' } }] },
        ),
        { status: 200 },
      ),
  );
  assert.deepEqual(
    (await service.catalogue('synthetic')).map((m) => m.id),
    ['example/free'],
  );
});

test('calendar reads a bounded primary-calendar window without external attendee/location payloads', async () => {
  const calls = [];
  const s = new Services(async (url, options) => {
    calls.push({ url: new URL(url), options });
    return new Response(
      JSON.stringify({
        items: [
          {
            summary: 'Planning',
            start: { dateTime: '2026-11-07T10:00:00Z' },
            end: { dateTime: '2026-11-07T11:00:00Z' },
            attendees: ['excluded'],
            location: 'excluded',
          },
        ],
      }),
    );
  });
  const rows = await s.calendar('synthetic', 'work', Date.parse('2026-11-07T00:00:00Z'));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].profile, 'work');
  assert.equal(rows[0].attendees, undefined);
  assert.equal(rows[0].location, undefined);
  assert.equal(calls[0].url.pathname, '/calendar/v3/calendars/primary/events');
  assert.equal(calls[0].url.searchParams.get('maxResults'), '10');
  assert.equal(calls[0].options.method, 'GET');
});
test('mail preview requests only metadata for at most three safe IDs and excludes credential-like contents', async () => {
  const calls = [];
  const s = new Services(async (url, options) => {
    const u = new URL(url);
    calls.push({ u, options });
    return new Response(
      JSON.stringify(
        u.pathname.endsWith('/messages')
          ? { messages: [{ id: 'abc' }, { id: 'def' }, { id: '../../escape' }] }
          : {
              payload: {
                headers: [
                  { name: 'From', value: 'Sender' },
                  {
                    name: 'Subject',
                    value: u.pathname.endsWith('def') ? 'sk-or-v1-' + 'a'.repeat(40) : 'A safe note',
                  },
                ],
              },
              snippet: 'Short preview',
            },
      ),
    );
  });
  const rows = await s.mail('synthetic', 'personal');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].subject, 'A safe note');
  assert.equal(calls.length, 3);
  assert.equal(calls[1].u.searchParams.get('format'), 'metadata');
  assert(!calls.some((c) => c.u.searchParams.get('format') === 'full'));
  assert(calls.every((c) => c.options.method === 'GET'));
});
test('enabled source text is bounded, untrusted context and credential-protected', () => {
  const s = new Services();
  const base = {
    model: { id: 'sample/free', prompt: 0, completion: 0, request: 0 },
    profile: 'personal',
    allowData: false,
    text: 'Discuss',
    sources: 'SOURCE ' + 'x'.repeat(8000),
  };
  const body = s.body(base);
  assert.match(body.messages[0].content, /untrusted quoted data/);
  assert(!body.messages[0].content.includes('x'.repeat(4001)));
  assert.throws(() => s.body({ ...base, sources: 'github_pat_' + 'a'.repeat(40) }));
});
test('service routes refuse dot segments in every spelling before any request is made', async () => {
  let calls = 0;
  const s = new Services(async () => {
    calls++;
    return json({});
  });
  for (const path of [
    '/repos/a/b/contents/%2e%2e/%2e%2e/%2e%2e/c/d/contents/x',
    '/repos/a/b/contents/%2E%2E/x',
    '/repos/a/b/contents/.%2e/x',
    '/repos/a/b/contents/%2e/x',
    '/repos/a/b/contents/./x',
    '/repos/a/b/contents/x/..',
    '/repos/a/b/contents/x/%2e%2e?ref=main',
    '/repos/a/b/contents\\..\\..\\c',
    '/drive/v3/files/%2e%2e/%2e%2e/oauth2/v3/userinfo',
    42,
    null,
  ])
    await assert.rejects(() => s.call('github', path, { token: 'CANARY' }), /Destination rejected/);
  assert.equal(calls, 0);
  await s.call('github', '/repos/a/b/contents/pea-greenhouse/id/.github-notes.md', {
    token: 'synthetic-only',
  });
  await s.call('github', '/repos/a/b/contents/dir/file%20name.txt', { token: 'synthetic-only' });
  assert.equal(calls, 2);
});
test('GitHub delivery accepts only plain repository names and safe source files', () => {
  for (const repo of ['owner/repo', 'a/b.c_d-e']) assert.equal(validRepo(repo), true);
  for (const repo of [
    'owner',
    'owner/repo/extra',
    'owner/..',
    '../repo',
    'owner/re po',
    '-owner/repo',
    'owner/repo%2f..',
    null,
    undefined,
    7,
  ])
    assert.equal(validRepo(repo), false);
  const ok = { path: 'src/main file.js', text: 'export const a=1;' };
  assert.equal(validCode(ok), true);
  for (const path of [
    '../x.js',
    'src/../x.js',
    './x.js',
    'src/%2e%2e/x.js',
    '.env',
    'src/.hidden',
    '/abs.js',
    'src//x.js',
    'a\\b.js',
    'id.pem',
    'signing.KEY',
    'cert.p12',
    'app.mobileprovision',
    'x'.repeat(201),
  ])
    assert.equal(validCode({ ...ok, path }), false, path);
  assert.equal(validCode({ ...ok, text: '' }), false);
  assert.equal(validCode({ ...ok, text: 'x'.repeat(100001) }), false);
  assert.equal(validCode({ ...ok, text: 'token ghp_' + 'a'.repeat(24) }), false);
  assert.equal(validCode(null), false);
  assert.equal(validCode({ path: 5, text: 'x' }), false);
});

const docMIME = 'application/vnd.google-apps.document';
function fakeDrive({ version = '5', peaCreated = '1', uploadAnswer } = {}) {
  const root = 'pea_root_000001',
    file = 'pea_doc_0000001';
  const calls = [];
  const folder = {
    id: root,
    name: 'PEA',
    mimeType: 'application/vnd.google-apps.folder',
    properties: { peaWorkspace: '1', peaProfile: 'personal' },
    parents: [],
    version: '1',
  };
  const doc = () => ({
    id: file,
    name: 'Sam Rivera Resume',
    mimeType: docMIME,
    parents: [root],
    version,
    properties: { peaCreated },
  });
  const services = new Services(async (url, options) => {
    const u = new URL(url);
    calls.push({ u, options });
    if (u.pathname.startsWith('/upload/')) {
      if (uploadAnswer instanceof Error) throw uploadAnswer;
      return json(uploadAnswer ?? doc());
    }
    return json(u.pathname.endsWith(root) ? folder : doc());
  });
  return {
    services,
    calls,
    root,
    file,
    w: { folder: { id: root, title: 'PEA' }, profile: 'personal', account: 'owner@example.invalid' },
    uploads: () => calls.filter((c) => c.u.pathname.startsWith('/upload/')),
  };
}

test('a rich document is created in the PEA folder by one upload that carries no model text in the address', async () => {
  const drive = fakeDrive();
  const html = '<html><body><h1>Sam Rivera Resume</h1><p>SYNTHETIC BODY</p></body></html>';
  const made = await drive.services.createRichDocument('Sam Rivera Resume', html, drive.w, 'synthetic-only');
  assert.equal(made.id, drive.file);
  const [upload] = drive.uploads();
  assert.equal(drive.uploads().length, 1);
  assert.equal(upload.u.origin + upload.u.pathname, 'https://www.googleapis.com/upload/drive/v3/files');
  assert.equal(upload.u.searchParams.get('uploadType'), 'multipart');
  assert.doesNotMatch(upload.u.href, /SYNTHETIC|Rivera/);
  assert.equal(upload.options.method, 'POST');
  assert.match(upload.options.headers['Content-Type'], /^multipart\/related; boundary=pea-/);
  assert.equal(upload.options.headers.Authorization, 'Bearer synthetic-only');
  const meta = JSON.parse(upload.options.body.split('\r\n\r\n')[1].split('\r\n--')[0]);
  assert.deepEqual(meta, {
    name: 'Sam Rivera Resume',
    mimeType: docMIME,
    parents: [drive.root],
    properties: { peaCreated: '1' },
  });
  assert(upload.options.body.includes('Content-Type: text/html; charset=UTF-8\r\n\r\n' + html));
  assert.equal(drive.calls[0].options.method, 'GET', 'the folder is checked before anything is written');
});

test('creation refuses bad names and oversized text, and never retries an uncertain write', async () => {
  const drive = fakeDrive();
  await assert.rejects(
    drive.services.createRichDocument('bad/name', '<p>x</p>', drive.w, 't'),
    /name and length/,
  );
  await assert.rejects(
    drive.services.createRichDocument('Fine', 'x'.repeat(400001), drive.w, 't'),
    /name and length/,
  );
  assert.equal(drive.uploads().length, 0);

  const lost = fakeDrive({ uploadAnswer: new Error('network lost') });
  await assert.rejects(
    lost.services.createRichDocument('Fine', '<p>x</p>', lost.w, 't'),
    /may or may not have been created/,
  );
  assert.equal(lost.uploads().length, 1, 'one attempt only');

  const odd = fakeDrive({
    uploadAnswer: { id: 'pea_doc_0000001', mimeType: docMIME, parents: ['somewhere_else_1'] },
  });
  await assert.rejects(
    odd.services.createRichDocument('Fine', '<p>x</p>', odd.w, 't'),
    /answered unexpectedly/,
  );
});

test('a document is replaced only if PEA made it and nobody changed it since', async () => {
  const drive = fakeDrive({ version: '5' });
  const file = { id: drive.file, mimeType: docMIME, version: '5', properties: { peaCreated: '1' } };
  await drive.services.replaceDocument(file, '<p>NEW TEXT</p>', drive.w, 'synthetic-only');
  const [upload] = drive.uploads();
  assert.equal(upload.options.method, 'PATCH');
  assert.equal(upload.u.pathname, '/upload/drive/v3/files/' + drive.file);
  assert.equal(upload.u.searchParams.get('uploadType'), 'media');
  assert.equal(upload.options.headers['Content-Type'], 'text/html; charset=UTF-8');
  assert.equal(upload.options.body, '<p>NEW TEXT</p>');

  const edited = fakeDrive({ version: '6' });
  await assert.rejects(
    edited.services.replaceDocument(file, '<p>x</p>', edited.w, 't'),
    /changed after PEA wrote it\. Nothing was replaced/,
  );
  assert.equal(edited.uploads().length, 0, 'a hand-edited document is never overwritten');

  const notOurs = fakeDrive({ peaCreated: '0' });
  await assert.rejects(
    notOurs.services.replaceDocument({ ...file, properties: {} }, '<p>x</p>', notOurs.w, 't'),
    /Only a document PEA created/,
  );
  await assert.rejects(
    notOurs.services.replaceDocument(file, '<p>x</p>', notOurs.w, 't'),
    /changed after PEA wrote it/,
  );
  await assert.rejects(
    drive.services.replaceDocument({ ...file, mimeType: 'text/plain' }, '<p>x</p>', drive.w, 't'),
    /Only a document PEA created/,
  );
  assert.equal(notOurs.uploads().length, 0);
});

test('the upload route is fixed and accepts nothing but a Drive file identifier', async () => {
  const s = new Services(async () => json({}));
  for (const path of [
    '/upload/drive/v3/files/../../oauth2/v3/userinfo',
    '/upload/drive/v3/other',
    '/upload/drive/v2/files',
    '/upload/drive/v3/files/short',
    '/upload/storage/v1/b/x/o',
  ])
    await assert.rejects(
      () => s.call('drive', path, { method: 'POST', upload: { type: 'text/html', data: 'x' } }),
      /Destination rejected/,
    );
});
