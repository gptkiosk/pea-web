// UI projections only. A connected backend must repeat authorization at dispatch.
const profiles = new Set(['personal', 'work']);
const modes = new Set([...profiles, 'blended']);
const classes = new Set(['conversation', 'memory', 'calendar', 'mail', 'attachment']);
export function gate(item, mode, rules, now) {
  if (!profiles.has(item?.profile) || !modes.has(mode) || !classes.has(item?.dataClass) || !Array.isArray(rules) || !Number.isFinite(now)) return 'deny';
  if (item.profile === mode) return 'allow';
  const live = rules.filter(r => profiles.has(r.fromProfile) && profiles.has(r.toProfile) && r.fromProfile !== r.toProfile && r.fromProfile === item.profile && r.dataClass === item.dataClass && (mode === 'blended' || r.toProfile === mode) && [0, 1, 2].includes(r.projection) && (r.expires === null || r.expires === undefined || Number.isFinite(r.expires) && r.expires > now));
  if (!live.length) return 'deny';
  const p = Math.max(...live.map(r => r.projection)); return p === 2 ? 'allow' : `project:${p}`;
}
export function projectCalendar(event, decision) {
  if (decision === 'allow') return {...event};
  if (decision === 'project:0') return {title: 'Busy', start: event.start, end: event.end};
  if (decision === 'project:1') return {title: event.title, start: event.start, end: event.end};
  return null;
}
const safeID = s => typeof s === 'string' && /^[A-Za-z0-9_-]{10,100}$/.test(s);
const folder = f => f?.mimeType === 'application/vnd.google-apps.folder';
export function inWorkspace(item, workspace, ancestry) {
  if (!item || !workspace || !Array.isArray(ancestry) || !safeID(item.id) || !safeID(workspace.folder?.id) || typeof workspace.account !== 'string' || workspace.account.length>254 || !workspace.account.includes('@') || item.trashed || item.mimeType === 'application/vnd.google-apps.shortcut') return false;
  const root = ancestry.find(f => f.id === workspace.folder?.id);
  if (!root || !folder(root) || root.trashed || root.properties?.peaWorkspace !== '1' || root.properties?.peaProfile !== workspace.profile || !profiles.has(workspace.profile)) return false;
  const seen = new Set(); let f = item;
  for (let n = 0; n < 16; n++) {
    if (f.id === root.id) return true;
    if (!safeID(f.id) || f.trashed || f.mimeType === 'application/vnd.google-apps.shortcut' || seen.has(f.id) || f.parents?.length !== 1) return false;
    seen.add(f.id); f = ancestry.find(p => p.id === f.parents[0]); if (!f || !folder(f)) return false;
  }
  return false;
}
export function recentFiles(files, {days = 7, query = '', now = Date.now()} = {}) {
  const cutoff = now - Math.min(3650, Math.max(1, days)) * 86400000;
  return files.filter(f => !f.trashed && !folder(f) && f.properties?.peaCreated === '1' && Date.parse(f.createdTime) >= cutoff && Date.parse(f.createdTime) <= now && f.name.toLowerCase().includes(query.toLowerCase())).sort((a,b) => Date.parse(b.createdTime) - Date.parse(a.createdTime));
}
