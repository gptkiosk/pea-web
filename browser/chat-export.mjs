// A conversation as a plain text file the owner asks for and saves themselves. Made in the
// browser; nothing here sends anything. With `debug`, each reply also carries what PEA did for
// it: the steps shown over the reply and the fuller record kept for this tab.
import { trailDebug, trailRows, trailSummary, workRows, workSummary } from './activity.mjs';

const stamp = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString() : 'time not recorded');
const RULE = '----------------------------------------';

export function chatExportName(now, debug = false) {
  return `pea-chat-${new Date(now).toISOString().slice(0, 10)}${debug ? '-debug' : ''}.txt`;
}

// `messages` are the conversation's own; `trailFor(id)` gives a reply's record or null.
export function chatExport({
  messages,
  trailFor = () => null,
  workFor = () => null,
  debug = false,
  profile = '',
  version = '',
  now,
}) {
  const rows = (Array.isArray(messages) ? messages : []).filter(
    (m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string',
  );
  const out = [
    'PEA chat export',
    `Exported: ${stamp(now)}`,
    `Profile: ${profile || 'not recorded'}`,
    `PEA: ${String(version).replace(/\s+/g, ' ').trim() || 'version not recorded'}`,
    `Messages: ${rows.length}`,
    `Debug detail: ${debug ? 'included' : 'not included'}`,
    'This file is plain text and not encrypted.',
  ];
  for (const m of rows) {
    const who = m.role === 'user' ? 'YOU' : 'PEA';
    out.push('', RULE, `${who} · ${stamp(m.at)}${m.incomplete ? ' · not finished' : ''}`, '', m.text);
    if (!debug || m.role !== 'assistant') continue;
    const trail = trailFor(m.id),
      work = workFor(m.id);
    out.push('');
    if (!trail) out.push('  What PEA did: no record. PEA keeps one only until the page is reloaded.');
    else {
      out.push('  ' + trailSummary(trail));
      for (const row of trailRows(trail)) out.push(`  - ${row.text}`);
      out.push('  Debug detail:');
      for (const line of trailDebug(trail)) out.push(`  - ${line}`);
    }
    // A document this reply proposed and the owner approved.
    if (work) {
      out.push('  Document · ' + workSummary(work));
      for (const row of workRows(work)) out.push(`  - ${row.text}`);
    }
  }
  return out.join('\n') + '\n';
}
