// Drop targets. A dropped file takes the same path as "Open locally"; a dropped message fills in
// the story form. Nothing here sends to a model, saves a story or approves a review.
import { fileDropPlan, messageDragType, storyDraftFromMessage } from './dragdrop.mjs';

const $ = (id) => document.getElementById(id);

export function installDragDrop({ openLocalFile, selectForChat, messageText, context, notice, tab }) {
  const hasFiles = (event) => [...(event.dataTransfer?.types || [])].includes('Files');
  const hasMessage = (event) => [...(event.dataTransfer?.types || [])].includes(messageDragType);
  const mark = (element, on) => element.classList.toggle('drop-ready', on);

  for (const target of ['chat', 'greenhouse']) {
    const panel = $(target);
    panel.addEventListener('dragover', (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      mark(panel, true);
    });
    panel.addEventListener('dragleave', (event) => {
      if (!panel.contains(event.relatedTarget)) mark(panel, false);
    });
    panel.addEventListener('drop', async (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      mark(panel, false);
      const files = [...event.dataTransfer.files];
      const plan = fileDropPlan({ target, count: files.length, ...context() });
      if (plan.refuse) return notice(plan.refuse);
      const opened = await openLocalFile(files[0]);
      if (!opened) return;
      if (plan.action === 'open-and-select') selectForChat(opened);
      if (plan.note) notice(plan.note);
    });
  }

  // A message can be dropped on the Today workspace or on its tab.
  const fillStory = (event) => {
    const draft = storyDraftFromMessage(messageText(event.dataTransfer.getData(messageDragType)));
    if (!draft) return notice('That message is no longer available in this profile.');
    if (context().dialogOpen) return notice('Finish what is open first.');
    tab('today');
    for (
      let section = $('story-title').closest('details');
      section;
      section = section.parentElement?.closest('details')
    )
      section.open = true;
    $('story-title').value = draft.title;
    $('story-details').value = draft.details;
    $('story-title').focus();
    notice(
      'Story drafted from that message. Edit it, then choose Add to Inbox. Nothing is added until you do.',
    );
  };
  for (const element of [$('today'), $('tab-today')]) {
    element.addEventListener('dragover', (event) => {
      if (!hasMessage(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      mark(element, true);
    });
    element.addEventListener('dragleave', (event) => {
      if (!element.contains(event.relatedTarget)) mark(element, false);
    });
    element.addEventListener('drop', (event) => {
      if (!hasMessage(event)) return;
      event.preventDefault();
      mark(element, false);
      fillStory(event);
    });
  }

  // A file dropped anywhere else must not make the browser leave the app to display it.
  for (const type of ['dragover', 'drop'])
    window.addEventListener(type, (event) => {
      if (hasFiles(event) && !event.defaultPrevented) {
        event.preventDefault();
        if (type === 'drop') notice('Drop files on Chat or Greenhouse.');
      }
    });
}

// Makes a rendered message draggable. Only its id travels with the drag; the text is looked up on drop.
export function makeMessageDraggable(element, id) {
  element.draggable = true;
  element.addEventListener('dragstart', (event) => {
    // Dragging selected text out of a message stays an ordinary text drag.
    if (String(globalThis.getSelection?.() || '').trim()) return;
    event.dataTransfer.setData(messageDragType, id);
    event.dataTransfer.effectAllowed = 'copy';
  });
}
