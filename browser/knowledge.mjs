// The reader's checks for the curated sources catalog (the PEA knowledge format, major 1, known
// minor 3), as pure functions. The catalog is a set of static files published by a curator. Before
// anything in a file is shown, kept or put in a prompt, the file must pass every check here: its
// size, the size and SHA-256 the index promised, strict JSON, the version, the schema, the text
// rules, the addresses and the cross-checks. A file that fails is not used, and the typed reason
// says why. The rules follow the public reader's contract of gptkiosk/pea-knowledge-processor
// (docs/APP-CONTRACT.md and its reference validator); the tests run that project's own corpus.
import { knowledgeSchemas } from './knowledge-schema.mjs';

export const knowledgeLimits = {
  store: 512000,
  items: 512000,
  brief: 8000,
  digest: 24000,
  // All the text of a digest's short form together.
  digestBrief: 900,
  // How much of a digest goes with a Chat message, after the brief.
  digestShared: 1400,
  visible: 1800,
  talk: 1050,
  titleShown: 120,
  claimsShown: 2,
  claimsMin: 4,
  url: 2000,
};
const MAJOR = 1,
  MINOR = 3;

// What the owner is told for each reason a file was refused.
const said = {
  missing: 'Could not get this item. It will be tried again.',
  too_large: 'This item was refused: too large.',
  not_json: 'The source list could not be read.',
  unsupported_version: 'Update PEA to read the curated sources.',
  size_mismatch: 'This item did not arrive intact. It will be tried again.',
  hash_mismatch: 'This item did not arrive intact. It will be tried again.',
};
export const refusal = (code) => said[code] ?? 'This item was refused: not in the expected form.';

const problem = (code, where, detail) => ({ code, where, detail });
const length = (text) => [...text].length;

// --- Strict JSON ---------------------------------------------------------------------------------

// The first key written twice in one object of `text`, or null. `text` already parsed as JSON.
function repeatedKey(text) {
  const stack = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      let end = i + 1;
      while (text[end] !== '"') end += text[end] === '\\' ? 2 : 1;
      const top = stack.at(-1);
      if (top?.key) {
        const name = JSON.parse(text.slice(i, end + 1));
        if (top.seen.has(name)) return name;
        top.seen.add(name);
        top.key = false;
      }
      i = end;
    } else if (c === '{') stack.push({ seen: new Set(), key: true });
    else if (c === '[') stack.push(null);
    else if (c === '}' || c === ']') stack.pop();
    else if (c === ',' && stack.at(-1)) stack.at(-1).key = true;
  }
  return null;
}
function finite(value) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(finite);
  if (value && typeof value === 'object') return Object.values(value).every(finite);
  return true;
}
// Strict JSON from bytes: UTF-8 with no byte order mark, no number too large to read, no key
// written twice in one object. Gives { value } or { error }.
export function strictJSON(bytes) {
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return { error: 'not UTF-8 text' };
  }
  if (text.startsWith('\ufeff')) return { error: 'starts with a byte order mark' };
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return { error: 'does not parse' };
  }
  if (!finite(value)) return { error: 'a number too large to read' };
  const twice = repeatedKey(text);
  if (twice !== null) return { error: `the key ${JSON.stringify(twice).slice(0, 60)} is written twice` };
  return { value };
}

// --- The schema checker (the part of JSON Schema these schemas use) ------------------------------

const isType = (value, name) =>
  name === 'null'
    ? value === null
    : name === 'boolean'
      ? typeof value === 'boolean'
      : name === 'string'
        ? typeof value === 'string'
        : name === 'array'
          ? Array.isArray(value)
          : name === 'object'
            ? value !== null && typeof value === 'object' && !Array.isArray(value)
            : name === 'integer'
              ? Number.isInteger(value)
              : name === 'number'
                ? typeof value === 'number' && Number.isFinite(value)
                : false;
const sorted = (value) =>
  Array.isArray(value)
    ? value.map(sorted)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((k) => [k, sorted(value[k])]),
        )
      : value;
const patterns = new Map();
function matches(pattern, text) {
  if (!patterns.has(pattern)) patterns.set(pattern, new RegExp(pattern, 'u'));
  return patterns.get(pattern).test(text);
}
// Checks `value` against `schema`. Gives a list of [path, message], empty when it conforms.
// `lenient` skips members a schema does not name, for a file of a newer minor version.
export function schemaErrors(value, schema, root = schema, path = '$', lenient = false) {
  const errors = [];
  if ('$ref' in schema) {
    let node = root;
    for (const part of schema.$ref.slice(2).split('/')) node = node[part];
    errors.push(...schemaErrors(value, node, root, path, lenient));
  }
  if ('anyOf' in schema && !schema.anyOf.some((s) => !schemaErrors(value, s, root, path, lenient).length))
    errors.push([path, 'matches none of the allowed shapes']);
  if ('const' in schema && value !== schema.const) errors.push([path, 'is not the required value']);
  if ('enum' in schema && !schema.enum.some((e) => e === value))
    errors.push([path, 'is not one of the allowed values']);
  if ('type' in schema) {
    const names = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!names.some((n) => isType(value, n))) {
      errors.push([path, 'must be ' + names.join(' or ')]);
      return errors;
    }
  }
  if (typeof value === 'string') {
    if ('minLength' in schema && length(value) < schema.minLength)
      errors.push([path, 'is shorter than allowed']);
    if ('maxLength' in schema && length(value) > schema.maxLength)
      errors.push([path, 'is longer than allowed']);
    else if ('pattern' in schema && !matches(schema.pattern, value))
      errors.push([path, 'does not have the required form']);
  } else if (typeof value === 'number') {
    if ('minimum' in schema && value < schema.minimum) errors.push([path, 'is below the least allowed']);
    if ('maximum' in schema && value > schema.maximum) errors.push([path, 'is above the most allowed']);
  } else if (Array.isArray(value)) {
    if ('minItems' in schema && value.length < schema.minItems) errors.push([path, 'has too few entries']);
    if ('maxItems' in schema && value.length > schema.maxItems) {
      errors.push([path, 'has too many entries']);
      return errors;
    }
    if (schema.uniqueItems) {
      const seen = new Set();
      for (const item of value) {
        const key = JSON.stringify(sorted(item));
        if (seen.has(key)) {
          errors.push([path, 'has the same entry twice']);
          break;
        }
        seen.add(key);
      }
    }
    if (schema.items && typeof schema.items === 'object')
      value.forEach((item, i) =>
        errors.push(...schemaErrors(item, schema.items, root, `${path}[${i}]`, lenient)),
      );
  } else if (value !== null && typeof value === 'object') {
    const properties = schema.properties ?? {};
    for (const name of schema.required ?? [])
      if (!Object.hasOwn(value, name)) errors.push([path, `lacks ${name}`]);
    for (const [name, item] of Object.entries(value)) {
      if (Object.hasOwn(properties, name))
        errors.push(...schemaErrors(item, properties[name], root, `${path}.${name}`, lenient));
      else if (schema.additionalProperties === false) {
        if (!lenient) errors.push([path, 'has an unknown member']);
      } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object')
        errors.push(...schemaErrors(item, schema.additionalProperties, root, `${path}.${name}`, lenient));
    }
  }
  return errors;
}

// --- Text and addresses --------------------------------------------------------------------------

const FORBIDDEN =
  /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff\ufff9-\ufffb]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
const TAG = /<[A-Za-z/!?][^<>]{0,400}>/;
const URL_LIKE =
  /[a-z][a-z0-9+.\-]{1,20}:\/\/|(?<![a-z0-9])www\.[a-z0-9]|(?<![a-z0-9])(?:mailto|javascript|data|tel|sms):\S/i;
// Null when `text` may stand in a text field, otherwise the reason.
export function textReason(text) {
  if (FORBIDDEN.test(text)) return 'control_character';
  if (TAG.test(text)) return 'html';
  if (URL_LIKE.test(text)) return 'url';
  if (text !== text.trim() || text.includes('  ') || text.replace(/\s+/g, ' ') !== text) return 'spacing';
  return null;
}

const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const BLOCKED = [
  '.local',
  '.localdomain',
  '.internal',
  '.lan',
  '.home',
  '.corp',
  '.intranet',
  '.private',
  '.test',
  '.invalid',
  '.example',
  '.onion',
  '.localhost',
];
// True for an address exactly as the catalog writes one: https, a public host name in lower case
// (never a number or a local name), no port, no credentials, no fragment, a path, ASCII only.
export function catalogAddress(text) {
  if (typeof text !== 'string' || text.length > knowledgeLimits.url) return false;
  if (!/^[\x21-\x7e]+$/.test(text) || text.includes('\\') || text.includes('#')) return false;
  const m = text.match(/^https:\/\/([^/?]*)(\/[^?]*)(\?.+)?$/);
  if (!m) return false;
  const host = m[1];
  if (host.length > 253 || host.includes(':') || host.includes('@') || host.endsWith('.')) return false;
  if (host === 'localhost' || BLOCKED.some((s) => host.endsWith(s)) || /^[0-9.]+$/.test(host)) return false;
  return HOST.test(host);
}

// Every string in a parsed file: `site` and `link` as addresses, everything else as text.
function texts(value, where, problems) {
  if (Array.isArray(value)) value.forEach((item, i) => texts(item, `${where}[${i}]`, problems));
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if ((key === 'site' || key === 'link') && typeof item === 'string') {
        if (!catalogAddress(item))
          problems.push(problem('address', `${where}.${key}`, 'not a normalized public https address'));
      } else texts(item, `${where}.${key}`, problems);
    }
  } else if (typeof value === 'string') {
    const why = textReason(value);
    if (why) problems.push(problem('text_rule', where, why));
  }
}

// Bytes to a checked value: size, strict JSON, version, schema, text rules.
// Gives { value, problems }: `value` is null when there is any problem.
export function readFile(bytes, kind, where, limit) {
  if (bytes.byteLength > limit)
    return { value: null, problems: [problem('too_large', where, `over ${limit} bytes`)] };
  const parsed = strictJSON(bytes);
  if (parsed.error) return { value: null, problems: [problem('not_json', where, parsed.error)] };
  const value = parsed.value;
  if (!isType(value, 'object'))
    return { value: null, problems: [problem('schema', where, 'not a JSON object')] };
  const version =
    typeof value.format_version === 'string' ? value.format_version.match(/^(\d{1,4})\.(\d{1,4})$/) : null;
  if (!version) return { value: null, problems: [problem('schema', where, 'no readable format_version')] };
  if (Number(version[1]) !== MAJOR)
    return {
      value: null,
      problems: [problem('unsupported_version', where, `format ${value.format_version}`)],
    };
  const problems = schemaErrors(
    value,
    knowledgeSchemas[kind],
    knowledgeSchemas[kind],
    '$',
    Number(version[2]) > MINOR,
  )
    .slice(0, 20)
    .map(([path, message]) => problem('schema', where + path.slice(1), message));
  if (problems.length) return { value: null, problems };
  texts(value, where, problems);
  return { value: problems.length ? null : value, problems };
}

export async function sha256(bytes) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
// The size and SHA-256 an index entry states for a file, against the bytes that arrived.
async function fileProblems(bytes, ref, where) {
  if (bytes.byteLength !== ref.bytes)
    return [problem('size_mismatch', where, 'not the size the index states')];
  if ((await sha256(bytes)) !== ref.sha256)
    return [problem('hash_mismatch', where, 'not the SHA-256 the index states')];
  return [];
}

// --- store.json ----------------------------------------------------------------------------------

export function checkStore(bytes) {
  const { value: store, problems } = readFile(bytes, 'store', 'store.json', knowledgeLimits.store);
  if (!store) return { value: null, problems };
  const seen = new Set(),
    vocabulary = store.topics ?? [],
    known = new Set(vocabulary.map((t) => t.id));
  if (known.size !== vocabulary.length)
    problems.push(problem('inconsistent', 'store.json.topics', 'a topic id is listed twice'));
  store.sources.forEach((s, n) => {
    const where = `store.json.sources[${n}]`,
      wrong = (code, detail) => problems.push(problem(code, where, detail)),
      ref = s.items_file;
    if ((s.topics ?? []).some((t) => !known.has(t)))
      wrong('inconsistent', 'a topic is not in the vocabulary of this file');
    if (seen.has(s.id)) wrong('inconsistent', 'an id is listed twice');
    seen.add(s.id);
    if (ref !== null && ref.path !== `sources/${s.id}/items.json`)
      wrong('path_invalid', 'the items file is not where it belongs');
    if (s.state === 'withdrawn' && (ref !== null || s.item_count !== 0 || s.latest_titles.length))
      wrong('inconsistent', 'a withdrawn source lists items');
    if (s.state !== 'active' && (s.message === null || s.state_since === null || s.state_reason === null))
      wrong('inconsistent', 'a source that is not active needs a message, a reason and a time');
    if (s.state === 'active' && s.state_since !== null)
      wrong('inconsistent', 'an active source has a state_since');
    if (s.purge && s.state !== 'withdrawn')
      wrong('inconsistent', 'purge is set on a source that is not withdrawn');
    if ((ref === null) !== (s.item_count === 0)) wrong('inconsistent', 'item_count and items_file disagree');
    if (s.state === 'paused' && s.freshness.status !== 'stale')
      wrong('inconsistent', 'a paused source must be marked stale');
    if (s.available.digest !== s.item_count || s.available.transcript > s.item_count)
      wrong('inconsistent', 'the availability counts do not fit item_count');
  });
  return { value: problems.length ? null : store, problems };
}

// --- A source's items.json -----------------------------------------------------------------------

function topicProblems(topics, method, known) {
  if ((topics === undefined) !== (method === undefined)) return ['topics and topics_by go together'];
  if (topics === undefined) return [];
  const out = [],
    ids = topics.map((t) => t.id),
    scores = topics.map((t) => t.score);
  if (new Set(ids).size !== ids.length) out.push('a topic is listed twice');
  if (known && ids.some((i) => !known.has(i))) out.push('a topic is not in the vocabulary');
  if (scores.some((s) => Math.round(s * 100) / 100 !== s)) out.push('a score has more than two decimals');
  if (scores.some((s, i) => i > 0 && s > scores[i - 1])) out.push('the topics are not sorted by score');
  return out;
}
// `listing` is the source's entry in a checked store.json, and `topics` that file's vocabulary.
export async function checkItems(bytes, listing, topics = null) {
  const sid = listing.id,
    where = `sources/${sid}/items.json`,
    known = topics === null ? null : new Set(topics.map((t) => t.id));
  let problems = await fileProblems(bytes, listing.items_file, where);
  if (problems.length) return { value: null, problems };
  const read = readFile(bytes, 'items', where, knowledgeLimits.items);
  if (!read.value) return read;
  const items = read.value;
  problems = read.problems;
  if (items.source_id !== sid)
    problems.push(problem('identity_mismatch', where, 'the file is for another source'));
  if (items.items.length !== listing.item_count)
    problems.push(problem('inconsistent', where, 'not the number of items the store states'));
  const seen = new Set();
  items.items.forEach((item, n) => {
    const at = `${where}.items[${n}]`,
      wrong = (code, detail) => problems.push(problem(code, at, detail)),
      t = item.transcript;
    if (seen.has(item.id)) wrong('inconsistent', 'an id is listed twice');
    seen.add(item.id);
    if (item.digest.path !== `sources/${sid}/${item.id}.digest.json`)
      wrong('path_invalid', 'the digest is not where it belongs');
    let size = item.digest.bytes;
    if (t.file !== null) {
      size += t.file.bytes;
      if (t.file.path !== `sources/${sid}/${item.id}.transcript.pea.txt`)
        wrong('path_invalid', 'the transcript is not where it belongs');
    }
    if (item.brief != null && item.brief.path !== `sources/${sid}/${item.id}.brief.json`)
      wrong('path_invalid', 'the brief is not where it belongs');
    if (item.bytes !== size) wrong('inconsistent', 'bytes is not the size of the item’s files');
    const fits = {
      yes: t.reason === null && t.file !== null,
      partial: t.reason === 'cut' && t.file !== null,
      no: t.reason !== null && t.reason !== 'cut' && t.file === null,
    }[t.available];
    if (!fits) wrong('inconsistent', 'transcript.available, reason and file disagree');
    if (t.file !== null && listing.publish !== 'full')
      wrong('inconsistent', 'a transcript file in a source that publishes digests only');
    if ('read' in t && t.read !== ({ yes: 'full', partial: 'partial' }[t.available] ?? t.read))
      wrong('inconsistent', 'transcript.read and transcript.available disagree');
    const origin = item.transcript_source;
    if (origin != null) {
      if ((t.read ?? 'none') === 'none')
        wrong('inconsistent', 'a transcript_source on an item whose transcript was not read');
      if ('extract' in origin !== (origin.format === 'html'))
        wrong('inconsistent', 'transcript_source.extract goes with format html, and only with it');
    }
    if (item.stale !== (item.stale_reason !== null)) wrong('inconsistent', 'stale and stale_reason disagree');
    for (const why of topicProblems(item.topics, item.topics_by, known)) wrong('inconsistent', why);
  });
  const order = items.items.map((i) => [i.date, i.id]);
  if (
    order.some(
      ([d, id], i) => i > 0 && (d > order[i - 1][0] || (d === order[i - 1][0] && id > order[i - 1][1])),
    )
  )
    problems.push(problem('inconsistent', where, 'the items are not newest first'));
  return { value: problems.length ? null : items, problems };
}

// --- A brief -------------------------------------------------------------------------------------

const MARKUP = /\*\*|__|`|\[[^\]]{0,200}\]\(|^(?:#{1,6}\s|>\s|[-*+]\s)/;
const LABEL = /\[B\d{1,2}\]|\b(?:BRIEFS?|BRIEF RULES|WEB BRIEFS|LAYERS|AGE|MORE|HAVE)\s*:/;
const INSTRUCTION = new RegExp(
  [
    '\\b(?:ignore|disregard|forget|override)\\b[^.!?]{0,40}\\b(?:previous|prior|above|earlier|all|your|the)\\b[^.!?]{0,30}\\b(?:instruction|prompt|rule|direction|message|context)s?\\b',
    '\\b(?:new|updated|real)\\s+(?:system\\s+)?instructions?\\s*:',
    '\\byou\\s+are\\s+now\\s+(?:a|an|in|the)\\b',
    '\\b(?:system|developer|assistant)\\s*(?:prompt|message)\\s*:',
    '\\b(?:reveal|print|repeat|show)\\b[^.!?]{0,30}\\b(?:system\\s+prompt|your\\s+instructions|api\\s+key|secret)s?\\b',
    '<\\s*/?\\s*(?:system|assistant|user|instructions?)\\s*>',
    '\\[\\s*/?\\s*(?:INST|SYSTEM)\\s*\\]',
  ].join('|'),
  'i',
);
// Null when `text` may stand in a text a brief's writer controls, else the reason.
export function authoredReason(text) {
  if (MARKUP.test(text)) return 'markup';
  if (LABEL.test(text)) return 'label';
  if (INSTRUCTION.test(text)) return 'instruction';
  return null;
}
const str = (v) => (typeof v === 'string' ? v : '');
// All visible text of a brief, counted in characters.
export function visibleChars(b) {
  const parts = [str(b.headline), str(b.new), ...b.claims.map((c) => str(c.text))];
  for (const q of b.quotes) parts.push(str(q.text), str(q.speaker));
  for (const key of ['topics', 'keywords', 'entities'])
    parts.push(...b[key].filter((x) => typeof x === 'string'));
  return parts.reduce((sum, p) => sum + length(p), 0);
}
// What a prompt block shows of a brief at the least: its talk size.
export function talkChars(b) {
  return (
    length(str(b.source_name)) +
    Math.min(length(str(b.title)), knowledgeLimits.titleShown) +
    length(str(b.covers_note)) +
    length(str(b.headline)) +
    b.claims.slice(0, knowledgeLimits.claimsShown).reduce((sum, c) => sum + length(str(c.text)), 0) +
    length(str(b.new)) +
    b.quotes.reduce((sum, q) => sum + length(str(q.text)) + length(str(q.speaker)), 0)
  );
}
function realDate(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  // Years below 100 would be read as 19xx; the calendar starts at year 1 as the reference's does.
  d.setUTCFullYear(+m[1]);
  return +m[1] >= 1 && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}
// The rules every brief keeps, whatever named it.
function briefRules(b, where) {
  const problems = [],
    wrong = (code, at, detail) => problems.push(problem(code, where + at, detail));
  if (!realDate(b.date)) wrong('schema', '.date', 'not a date that exists');
  if (visibleChars(b) > knowledgeLimits.visible) wrong('brief_too_long', '', 'too much visible text');
  if (talkChars(b) > knowledgeLimits.talk) wrong('brief_too_long', '', 'its talk size is over the limit');
  if (!b.claims.length) wrong('inconsistent', '.claims', 'a brief has at least one claim');
  if ((b.brief_kind === 'model') !== (b.model !== null))
    wrong('inconsistent', '.model', 'brief_kind and model disagree');
  if (
    b.brief_kind === 'model' &&
    (b.claims.length < knowledgeLimits.claimsMin || b.claims.some((c) => c.ref === null) || b.new === null)
  )
    wrong(
      'inconsistent',
      '.claims',
      'a model brief has four claims or more, each with a ref, and says what is new',
    );
  if ((b.covers === 'whole') !== (b.covers_note === null))
    wrong('inconsistent', '.covers_note', 'a partial brief says what it covers, a whole one has no note');
  const authored = [
    ['headline', b.headline],
    ['new', b.new],
    ['covers_note', b.covers_note],
    ...b.claims.map((c, n) => [`claims[${n}].text`, c.text]),
    ...b.quotes.flatMap((q, n) => [
      [`quotes[${n}].text`, q.text],
      [`quotes[${n}].speaker`, q.speaker],
    ]),
    ...['keywords', 'entities'].flatMap((key) => b[key].map((x, n) => [`${key}[${n}]`, x])),
  ];
  for (const [at, text] of authored) {
    const why = typeof text === 'string' ? authoredReason(text) : null;
    if (why) wrong('text_rule', '.' + at, why);
  }
  return problems;
}
// A brief file on its own, with no index entry: what the contract's corpus is checked with.
export function checkBriefAlone(bytes, where = 'brief') {
  const read = readFile(bytes, 'brief', where, knowledgeLimits.brief);
  if (!read.value) return read;
  const problems = briefRules(read.value, where);
  return { value: problems.length ? null : read.value, problems };
}
// An item's brief, against its entry in a checked items file and its source's listing.
export async function checkBrief(bytes, listing, item, topics = null) {
  const ref = item.brief,
    where = ref.path;
  let problems = await fileProblems(bytes, ref, where);
  if (problems.length) return { value: null, problems };
  const read = readFile(bytes, 'brief', where, knowledgeLimits.brief);
  if (!read.value) return read;
  const b = read.value;
  problems = read.problems;
  for (const [key, expected] of [
    ['source_id', listing.id],
    ['source_name', listing.name],
    ['item_id', item.id],
    ['title', item.title],
    ['date', item.date],
    ['link', item.link],
    ['brief_kind', ref.kind],
    ['covers', ref.covers],
  ])
    if (b[key] !== expected)
      problems.push(problem('identity_mismatch', `${where}.${key}`, 'differs from the index'));
  problems.push(...briefRules(b, where));
  if (topics !== null) {
    const known = new Set(topics.map((t) => t.id));
    if (b.topics.some((t) => !known.has(t)))
      problems.push(problem('inconsistent', where + '.topics', 'a topic is not in the vocabulary'));
  }
  return { value: problems.length ? null : b, problems };
}

// --- A digest: the longer checked account of one episode ------------------------------------------

// The rules every digest keeps, whatever named it. This reader holds no transcripts, so the rules
// that compare a digest with its transcript are not checked here.
function digestRules(d, where) {
  const problems = [],
    wrong = (code, at, detail) => problems.push(problem(code, where + at, detail));
  const chapters = d.chapters ?? [];
  if (
    chapters.some((c) => c.end_seconds !== null && c.end_seconds <= c.start_seconds) ||
    chapters
      .slice(1)
      .some(
        (b, i) =>
          b.start_seconds <= chapters[i].start_seconds ||
          (chapters[i].end_seconds !== null && chapters[i].end_seconds > b.start_seconds),
      )
  )
    wrong('inconsistent', '.chapters', 'the chapters are not in order of time');
  if (d.basis !== 'transcript' && (d.snippable_moments ?? []).length)
    wrong('inconsistent', '.snippable_moments', 'moments without a transcript');
  const short = d.brief,
    size =
      length(str(short.about)) +
      (short.points ?? []).reduce((sum, p) => sum + length(str(p)), 0) +
      length(str(short.quote?.text)) +
      length(str(short.quote?.speaker)) +
      length(str(short.hook));
  if (size > knowledgeLimits.digestBrief)
    wrong('brief_too_long', '.brief', 'its short form is over the limit');
  if ((d.provenance.method === 'model') !== (d.provenance.model !== null))
    wrong('inconsistent', '.provenance', 'method and model disagree');
  if (d.basis !== 'transcript' && (d.quotes.length || d.provenance.transcript_sha256 !== null))
    wrong('inconsistent', '', 'quotes or a transcript hash without a transcript');
  if (d.basis === 'headline' && d.quality.grade !== 'headline')
    wrong('inconsistent', '', 'a headline digest with another grade');
  return problems;
}
// A digest file on its own, with no index entry: what the catalog's hostile samples are checked with.
export function checkDigestAlone(bytes, where = 'digest') {
  const read = readFile(bytes, 'digest', where, knowledgeLimits.digest);
  if (!read.value) return read;
  const problems = digestRules(read.value, where);
  return { value: problems.length ? null : read.value, problems };
}
// An item's digest, against its entry in a checked items file and its source's listing.
export async function checkDigest(bytes, listing, item) {
  const ref = item.digest,
    where = ref.path;
  let problems = await fileProblems(bytes, ref, where);
  if (problems.length) return { value: null, problems };
  const read = readFile(bytes, 'digest', where, knowledgeLimits.digest);
  if (!read.value) return read;
  const d = read.value;
  problems = read.problems;
  for (const [key, expected] of [
    ['source_id', listing.id],
    ['source_name', listing.name],
    ['item_id', item.id],
    ['title', item.title],
    ['date', item.date],
    ['link', item.link],
    ['duration_seconds', item.duration_seconds],
    ['basis', ref.basis],
  ])
    if (d[key] !== expected)
      problems.push(problem('identity_mismatch', `${where}.${key}`, 'differs from the index'));
  if ('link_kind' in d && 'link_kind' in item && d.link_kind !== item.link_kind)
    problems.push(problem('identity_mismatch', where + '.link_kind', 'differs from the index'));
  if (d.quality.grade !== ref.grade || d.provenance.method !== ref.method)
    problems.push(problem('identity_mismatch', where, 'grade or method differs from the index'));
  problems.push(...digestRules(d, where));
  return { value: problems.length ? null : d, problems };
}
const clock = (seconds) =>
  Number.isFinite(seconds) && seconds >= 0
    ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
    : '';
// What a checked digest adds to an episode's brief in conversation, as quoted evidence: what it
// was made from, the main claim, the talking points with their times, figures, what is disputed,
// exact quotes and who took part. Whole lines only, within `limit` characters. A sentence already
// in `said` (the brief's own) is not repeated. Empty when the digest adds nothing.
export function digestLines(d, said = [], limit = knowledgeLimits.digestShared) {
  const have = new Set(said.map((x) => String(x).trim()).filter(Boolean)),
    lines = [],
    at = (p) => (clock(p?.time_seconds) ? ` (at ${clock(p.time_seconds)})` : '');
  if (d.strongest_claim && !have.has(d.strongest_claim.text))
    lines.push(`Strongest claim${at(d.strongest_claim.at)}: ${d.strongest_claim.text}`);
  for (const p of d.talking_points)
    if (!have.has(p.point))
      lines.push(`Point${at(p.at)}: ${p.point}${p.why ? ` Why it matters: ${p.why}` : ''}`);
  for (const n of d.numbers) lines.push(`Figure${at(n.at)}: ${n.value}, ${n.context}`);
  for (const c of d.contested) lines.push(`Disputed, so say it is disputed: ${c}`);
  for (const q of d.quotes)
    if (q.exact && !have.has(q.text))
      lines.push(`Exact quote${q.speaker ? ` (${q.speaker})` : ''}${at(q.at)}: “${q.text}”`);
  for (const g of d.guests ?? []) lines.push(`Taking part: ${g.name}${g.role ? `, ${g.role}` : ''}`);
  const from = { transcript: 'the transcript', notes: 'the show notes', headline: 'the headline only' }[
      d.basis
    ],
    out = [
      `From the episode’s digest, made from ${from ?? 'the episode'}${d.provenance.method === 'model' ? ' by a model and checked by the curator’s pipeline' : ' in its own sentences, with no model'}:`,
    ];
  let used = out[0].length;
  for (const line of lines) {
    if (used + line.length + 1 > limit) break;
    out.push(line);
    used += line.length + 1;
  }
  return out.length > 1 ? out : [];
}

// --- The catalog's address, and asking its curator for a podcast ---------------------------------

// Where the curated catalog is published. A fork that keeps its own catalog changes this and the
// page's allowed addresses (index.html and server/contract.json) together.
export const catalogBase = 'https://gptkiosk.github.io/pea-knowledge-processor/';

// The GitHub repository a catalog published on GitHub Pages comes from, as "owner/name", or null.
export function catalogRepository(base = catalogBase) {
  const m =
    typeof base === 'string'
      ? base.match(/^https:\/\/([a-z0-9-]{1,39})\.github\.io\/([A-Za-z0-9_.-]{1,100})\/$/)
      : null;
  return m ? `${m[1]}/${m[2]}` : null;
}
// Typed words as one line, or null when they hold a control or direction-changing character.
function oneLine(value, max) {
  if (typeof value !== 'string') return null;
  const flat = value.replace(/\s+/g, ' ').trim();
  return FORBIDDEN.test(flat) ? null : flat.slice(0, max + 1);
}
// A public https address the owner typed, as the browser normalizes it, or null.
function typedAddress(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value.trim());
    url.hash = '';
    return catalogAddress(url.href) ? url.href : null;
  } catch {
    return null;
  }
}
// The address of a filled-in request on the catalog's own issue form, or { error }. Nothing is
// sent by making it: the owner opens it and submits the request on GitHub themselves.
// `secret(text)` says whether a text looks like a key or password.
export function requestAddress(
  { name, feed = '', site = '', notes = '' },
  { base = catalogBase, secret = () => false } = {},
) {
  const repository = catalogRepository(base);
  if (!repository) return { error: 'This catalog does not say where requests go.' };
  const show = oneLine(name, 120),
    more = notes === '' ? '' : oneLine(notes, 600),
    feedURL = typedAddress(feed),
    siteURL = typedAddress(site);
  if (!show || show.length < 2 || show.length > 120)
    return { error: 'Give the podcast’s name, 2 to 120 characters.' };
  if (feedURL === null || siteURL === null)
    return { error: 'An address must be a full public https:// address, with no sign-in in it.' };
  if (!feedURL && !siteURL) return { error: 'Give the podcast’s feed address or its website.' };
  if (more === null || more.length > 600) return { error: 'Keep the notes to 600 characters of plain text.' };
  if ([show, more, feedURL, siteURL].some((text) => secret(text)))
    return { error: 'Something here looks like a password or key. Remove it first.' };
  const query = new URLSearchParams({
    template: 'request-podcast.yml',
    labels: 'source-request',
    title: 'Podcast request: ' + show,
    show_name: show,
  });
  if (feedURL) query.set('feed_url', feedURL);
  if (siteURL) query.set('website_url', siteURL);
  if (more) query.set('notes', more);
  return {
    url: `https://github.com/${repository}/issues/new?${query}`,
    show,
    feed: feedURL,
    site: siteURL,
    notes: more,
    repository,
  };
}
