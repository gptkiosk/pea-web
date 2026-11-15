// What a drag and drop may do, as pure decisions. Dropping never sends, saves or approves anything:
// a file goes through the same local-open path as the file picker, and a message only fills in the
// story form for the owner to review.
export const localFileLimit = 4 * 1024 * 1024;
const imageTypes = ['image/png', 'image/jpeg', 'image/webp'];

// Whether a local file can be opened, and as what. The same rule serves the file picker and a drop.
export function localFileKind(name, type, size) {
  if (typeof name !== 'string' || !name || !Number.isFinite(size) || size < 0)
    return { error: 'That file could not be read.' };
  if (size > localFileLimit) return { error: 'Choose a local file under 4 MB.' };
  const image = imageTypes.includes(type);
  if (!image && !/\.(txt|md|csv|json|js|py|swift|mmd)$/i.test(name))
    return { error: 'Use a text/code file or PNG, JPEG or WebP image.' };
  const kind = image
    ? 'image'
    : /\.mmd$/i.test(name)
      ? 'diagram'
      : /\.(js|py|swift|json)$/i.test(name)
        ? 'code'
        : 'document';
  return { image, kind, mimeType: image ? type : 'text/plain' };
}

// What to do with files dropped on a workspace. `target` is the workspace under the pointer.
export function fileDropPlan({ target, count, profile, busy, dialogOpen }) {
  if (!['chat', 'greenhouse'].includes(target)) return { refuse: 'Drop files on Chat or Greenhouse.' };
  if (dialogOpen) return { refuse: 'Finish what is open first.' };
  if (busy) return { refuse: 'Finish or stop the active request first.' };
  if (profile === 'blended')
    return { refuse: 'Choose the Personal or Work profile before opening a local file.' };
  if (!Number.isInteger(count) || count < 1) return { refuse: 'Nothing to open was dropped.' };
  return {
    // Chat selects the file's text for the next request, which is still reviewed before it is sent.
    action: target === 'chat' ? 'open-and-select' : 'open',
    note: count > 1 ? 'Opened the first file only.' : '',
  };
}

// A story draft from a dropped message, within the board's own limits. The owner edits and adds it.
export function storyDraftFromMessage(text) {
  if (typeof text !== 'string') return null;
  const clean = text.replace(/\r\n?/g, '\n').trim();
  if (!clean) return null;
  const firstLine = clean.split('\n').find((line) => line.trim()) || clean;
  const title = firstLine.replace(/\s+/g, ' ').trim().slice(0, 120);
  return { title, details: clean.slice(0, 2400) };
}

export const messageDragType = 'application/x-pea-message';
