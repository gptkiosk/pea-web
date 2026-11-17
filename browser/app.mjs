import {
  ownerNavigation,
  navigationProposals,
  visibleReply,
  storyProposals,
  emailProposals,
  emailDraftLink,
  documentProposals,
  calendarProposals,
  calendarEdits,
  claimsCalendarEdit,
  calendarFile,
  warnsOfUnconfirmedCalendar,
  warnsOfUnconfirmedStory,
  warnsOfUnconfirmedEmail,
  warnsOfUnconfirmedDocument,
} from './actions.mjs';
import { presenceAt } from './presence.mjs';
import { installMemory } from './memory-ui.mjs';
import { installReleaseUI } from './release-ui.mjs';
import { gate, projectCalendar, recentFiles } from './policy.mjs';
import { installConnections } from './live-ui.mjs';
import {
  Dictation,
  voicePreferences,
  loadVoicePreferences,
  saveVoicePreferences,
  speechReadPlan,
} from './voice.mjs';
import { installBoard } from './board-ui.mjs';
import { installWorkspace } from './workspace-ui.mjs';
import { installCommands } from './commands-ui.mjs';
import { installDragDrop, makeMessageDraggable } from './dragdrop-ui.mjs';
import { localFileKind } from './dragdrop.mjs';
import { installTodos } from './todos-ui.mjs';
import { installWeather } from './weather-ui.mjs';
import { installResearch } from './research-ui.mjs';
import { installHeadlines } from './feeds-ui.mjs';
import { installHome } from './home-ui.mjs';
import { installCanon } from './canon-ui.mjs';
import { installDays } from './days-ui.mjs';
import { installSpeech } from './speech-ui.mjs';
import { installDecks } from './decks-ui.mjs';
import { claimsRead, ownerRead, readProposals, sourcedNotice } from './research.mjs';
import { labelledPEA, madeByPEA, newEventId } from './connections.mjs';
import { claimsTodoChange, todoProposals } from './todos.mjs';
import { claimsDocument, docProposals } from './documents.mjs';
import {
  claimsOpen,
  describeOpen,
  openLabel,
  openLink,
  openProposals,
  replySegments,
  spokenReply,
} from './handoff.mjs';
import { honestyCorrection, needsHonestyCorrection } from './honesty.mjs';
// A page served without the gateway's frame-ancestors header must still refuse to run inside another site's frame.
if (globalThis.top !== globalThis.self) {
  document.body.replaceChildren(
    document.createTextNode('PEA does not run inside another page. Open it directly in a browser tab.'),
  );
  throw new Error('PEA refuses to run in a frame.');
}
const $ = (id) => document.getElementById(id);
let profile = 'personal',
  activeTab = 'chat',
  lastConversationSurface = 'chat',
  selected = null,
  imageURL = null;
let live, board, voice, memory, todos, research, weather, headlines, home, canon, days, speech, decks;
// Ends reading aloud, whichever voice is doing it.
function stopVoices() {
  globalThis.speechSynthesis?.cancel();
  speech?.stop();
}
// Replies written while a web page was shared, and proposals to read a page that were carried out.
const sourcedReplies = new Set(),
  readDone = new Set();
let voiceTarget = null;
const chats = {},
  schedules = {},
  proposals = new Map(),
  consumed = new Set(),
  emailReady = new Set(),
  calendarReady = new Map(),
  // Events added to the owner's Google calendar from a reply, and the id each proposal uses so a
  // second try cannot add it twice.
  calendarAdded = new Map(),
  eventIds = new Map(),
  // Replies whose reviewed change or removal of an event was carried out: 'changed' or 'deleted'.
  calendarEdited = new Map(),
  // What happened to each approved to-do proposal, shown in place of its button.
  todoDone = new Map(),
  // The outcome of each approved document proposal: a sentence, and a download link when it became a file.
  docDone = new Map(),
  // Phone-link proposals the owner has approved; the link appears only for these.
  openReady = new Set();
const applePlatform = /mac|iphone|ipad/i.test(navigator.userAgentData?.platform || navigator.platform || '');
// Draws a message: prose as text, and each fenced block as a box with a Copy button.
function messageBody(m) {
  const body = document.createElement('span');
  if (m.role === 'user') {
    body.textContent = m.text;
    return body;
  }
  const segments = replySegments(m.text);
  if (!segments.some((segment) => segment.kind === 'box')) {
    body.textContent = m.text;
    return body;
  }
  for (const segment of segments) {
    if (segment.kind === 'prose') {
      const prose = document.createElement('span');
      prose.className = 'reply-prose';
      prose.textContent = segment.text;
      body.append(prose);
      continue;
    }
    const box = document.createElement('div');
    box.className = 'copy-box';
    const bar = document.createElement('div');
    bar.className = 'copy-box-bar';
    const label = document.createElement('small');
    label.textContent = segment.label || 'Text to copy';
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'text-button';
    copy.textContent = 'Copy';
    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(segment.text);
        copy.textContent = 'Copied';
        // The conversation may be redrawn at any moment, replacing this button, so the notice is the lasting confirmation.
        notice('Copied to the clipboard.');
        setTimeout(() => (copy.textContent = 'Copy'), 1800);
      } catch {
        notice('Copying is blocked in this browser. Select the text and copy it by hand.');
      }
    };
    bar.append(label, copy);
    const pre = document.createElement('pre');
    pre.textContent = segment.text;
    box.append(bar, pre);
    body.append(box);
  }
  return body;
}
let reviewingStory = false;
const history = (surface, who = profile) => chats[`${who}:${surface}`] ?? (chats[`${who}:${surface}`] = []);
const message = (role, text, extra = {}) => ({
  id: crypto.randomUUID(),
  at: Date.now(),
  role,
  text,
  ...extra,
});
const now = Date.now(),
  daysAgo = (n) => new Date(now - n * 86400000).toISOString();
const files = [
  {
    id: 'sample_notes_0001',
    profile: 'personal',
    name: 'A few good rabbit holes.md',
    mimeType: 'text/markdown',
    createdTime: daysAgo(1),
    properties: { peaCreated: '1' },
    content:
      '# A few good rabbit holes\n\nWhat changes when an assistant remembers the right things?\n\n• A memory should have a source.\n• A good question can be more useful than a quick answer.\n• Personality has room to wander. Permissions do not.\n\nThis is synthetic preview content.',
    kind: 'document',
  },
  {
    id: 'sample_diagram_01',
    profile: 'personal',
    name: 'From spark to something.mmd',
    mimeType: 'text/plain',
    createdTime: daysAgo(3),
    properties: { peaCreated: '1' },
    content: 'A thought -> A conversation -> A reviewed draft -> Your PEA folder',
    kind: 'diagram',
  },
  {
    id: 'sample_code_0001',
    profile: 'personal',
    name: 'a-little-structure.py',
    mimeType: 'text/plain',
    createdTime: daysAgo(9),
    properties: { peaCreated: '1' },
    content:
      'def next_good_question(idea):\n    return f"What would make {idea} worth trying?"\n\n# Preview only. This code is never executed.',
    kind: 'code',
  },
  {
    id: 'sample_import_01',
    profile: 'personal',
    name: 'Something I brought along.txt',
    mimeType: 'text/plain',
    createdTime: daysAgo(2),
    properties: {},
    content:
      'A manually added file belongs in Greenhouse.\n\nWith a real PEA folder connection, files you move into that folder can be read after a membership check. They are not automatically shared with your AI model.',
    kind: 'document',
  },
  {
    id: 'sample_work_0001',
    profile: 'work',
    name: 'Project launch checklist.md',
    mimeType: 'text/markdown',
    createdTime: daysAgo(1),
    properties: { peaCreated: '1' },
    content:
      'WORK SAMPLE\n\n1. Review the proposal.\n2. Check the data boundary.\n3. Approve the next concrete step.\n\nThis Work sample does not appear in Personal or unshared Blended views.',
    kind: 'document',
  },
];
const visible = () =>
  files.filter(
    (f) => gate({ profile: f.profile, dataClass: 'attachment' }, profile, [], now / 1000) === 'allow',
  );
function notice(message) {
  $('notice').textContent = message;
  clearTimeout(notice.timer);
  notice.timer = setTimeout(() => ($('notice').textContent = ''), 6500);
}
function stopSpeaking() {
  if ($('speech-length')?.open) $('speech-length').close();
  voice?.stop();
  stopVoices();
}
// Going to a workspace. On a wide screen it may already be on screen beside another one.
function tab(next) {
  if (!['chat', 'today', 'greenhouse'].includes(next)) return;
  // Overdue and due-today counts move with the clock, so the summary is redrawn on the way in.
  if (next === 'today') home?.render();
  stopSpeaking();
  workspace.go(next);
}
// Called whenever the layout is drawn. The focused workspace is the one voice and sending act on.
function focusChanged(next, changed) {
  if (changed) stopSpeaking();
  activeTab = next;
  if (next === 'chat' || next === 'greenhouse') lastConversationSurface = next;
  live?.render();
}
function fileRow(f) {
  const b = document.createElement('button');
  b.className = 'file-row';
  const icon = document.createElement('span');
  icon.className = 'file-icon';
  icon.textContent = f.kind === 'diagram' ? '◇' : f.kind === 'code' ? '⌘' : '▧';
  const label = document.createElement('span');
  const name = document.createElement('strong');
  name.textContent = f.name;
  const detail = document.createElement('small');
  detail.textContent = f.local
    ? 'Opened locally'
    : f.live
      ? madeByPEA(f)
        ? 'Created by PEA'
        : labelledPEA(f)
          ? 'Labelled as created by PEA · not confirmed'
          : 'Added by you'
      : f.properties.peaCreated
        ? 'Sample · created by PEA'
        : 'Sample · added by you';
  label.append(name, detail);
  b.append(icon, label);
  b.onclick = () => {
    void selectFile(f);
    tab('greenhouse');
  };
  if (f.live && f.mimeType !== 'application/vnd.google-apps.folder') {
    const wrap = document.createElement('div');
    wrap.className = 'file-row-wrap';
    wrap.append(b, live.selectCheckbox(f));
    return wrap;
  }
  return b;
}
function renderLists() {
  const list = visible();
  $('file-list').replaceChildren(
    ...list.filter((f) => f.name.toLowerCase().includes($('file-query').value.toLowerCase())).map(fileRow),
  );
  const recent = recentFiles(list, { days: Number($('days').value), query: $('recent-query').value, now });
  $('recent-files').replaceChildren(...recent.map(fileRow));
  if (!recent.length) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'No PEA-created sample files match this view.';
    $('recent-files').append(p);
  }
  const ev = {
    profile: 'personal',
    title: 'A little time to think',
    start: '10:30',
    end: '11:00',
    attendees: ['Sample only'],
  };
  const result = gate({ profile: ev.profile, dataClass: 'calendar' }, profile, [], now / 1000);
  const event = projectCalendar(ev, result);
  renderSchedule(event);
  $('context-title').textContent = `${profile[0].toUpperCase() + profile.slice(1)} space`;
}
function renderSchedule(sample) {
  home?.render();
  const live = schedules[profile];
  const events = live?.events ?? (sample ? [sample] : []),
    mail = live?.mail ?? [];
  const row = (title, detail) => {
    const d = document.createElement('div');
    d.className = 'peek-item';
    const strong = document.createElement('strong'),
      small = document.createElement('small');
    strong.textContent = title;
    small.textContent = detail;
    d.append(strong, small);
    return d;
  };
  $('calendar').replaceChildren(...events.slice(0, 3).map((e) => row(e.title, e.start)));
  $('mail-preview').replaceChildren(
    ...mail.slice(0, 3).map((m) => row(m.from + (m.unread ? ' · unread' : ''), m.subject)),
  );
  $('calendar-peek').textContent = events[0]
    ? events[0].title + ' · ' + events[0].start
    : live?.calendarOn
      ? 'Nothing coming up'
      : 'Connect Calendar for this profile';
  $('mail-peek').textContent = mail[0]
    ? mail[0].from + ' · ' + mail[0].subject
    : live?.mailOn
      ? 'No recent mail'
      : 'Connect Gmail for this profile';
  $('calendar-status').textContent = live
    ? live.calendarOn
      ? events.length + ' events'
      : 'Not connected'
    : 'Sample';
  $('mail-status').textContent = live?.mailOn ? mail.length + ' messages' : 'Not connected';
}
function proposalButton(m, surface) {
  const nav = proposals.get(m.id);
  if (nav?.kind === 'navigation' && !m.incomplete && nav.profile === profile) {
    const b = document.createElement('button');
    b.className = 'text-button';
    b.textContent = 'Open ' + { chat: 'Chat', today: 'Today', greenhouse: 'Greenhouse' }[nav.tab];
    b.onclick = () => {
      if (live.isBusy()) {
        notice('Finish the current request first.');
        return;
      }
      if (
        nav.profile !== profile ||
        !history(surface, profile).some((x) => x.id === m.id) ||
        proposals.get(m.id) !== nav
      )
        return;
      tab(nav.tab);
    };
    return b;
  }
  if (calendarEdited.has(m.id)) {
    const receipt = document.createElement('small');
    receipt.className = 'event-receipt';
    receipt.textContent =
      calendarEdited.get(m.id) === 'deleted'
        ? 'Event removed from your Google calendar'
        : 'Event changed in your Google calendar';
    return receipt;
  }
  const editing = proposals.get(m.id);
  if (editing?.kind === 'calendar-edit' && !m.incomplete && editing.profile === profile) {
    const b = document.createElement('button'),
      removing = editing.edit.op === 'delete';
    b.className = 'text-button';
    b.textContent = (removing ? 'Review event removal: ' : 'Review event change: ') + editing.target.title;
    b.onclick = async () => {
      if (reviewingStory || live.isBusy()) {
        notice('Finish the current request first.');
        return;
      }
      reviewingStory = true;
      const who = profile,
        account = live.eventAccount(),
        when = (e) =>
          `Start: ${new Date(e.start).toString()}\nEnd: ${new Date(e.end).toString()}\nUTC start: ${e.start}\nUTC end: ${e.end}`;
      try {
        if (!account)
          throw new Error(
            'Calendar changes are not connected for this profile. Connect them in Connections → Google, or use your calendar app.',
          );
        // What the owner reviews is the event as it is now, not what the model was told earlier.
        const now = await live.currentOwnEvent(editing.target.id);
        if (!now) return;
        const approved = await live.review(
          removing ? 'Remove this event from your calendar?' : 'Change this event in your calendar?',
          `Profile: ${who}\nGoogle calendar of ${account}\n\n${removing ? 'Event to remove' : 'Now'}:\n${now.title}\n${when(now)}${removing ? '' : `\n\nAfter approval:\n${editing.edit.title}\n${when(editing.edit)}`}\n\n${removing ? 'Approval deletes this event from your main calendar. PEA cannot bring it back.' : 'Approval changes the title and times of this event. Its notes stay as they are.'} This is an event PEA added, with no guests; Google is asked to send no notices. Nothing happens if the event has changed since this review opened.`,
        );
        if (!approved) return;
        if (
          who !== profile ||
          !history(surface, who).some((x) => x.id === m.id) ||
          proposals.get(m.id) !== editing
        )
          throw new Error('The conversation or profile changed. Review the event again.');
        if (live.eventAccount() !== account)
          throw new Error('Your Google connection changed. Review the event again.');
        const done = await live.editEvent(now, editing.edit);
        if (!done) return;
        calendarEdited.set(m.id, removing ? 'deleted' : 'changed');
        notice(
          removing
            ? done.already
              ? 'That event was already gone from your calendar.'
              : 'Event removed from your Google calendar.'
            : 'Event changed in your Google calendar. Nobody was notified.',
        );
        renderChat();
        renderCollaboration();
      } catch (error) {
        notice(error.message || 'Could not change the event.');
      } finally {
        reviewingStory = false;
      }
    };
    return b;
  }
  const event = proposals.get(m.id);
  if (event?.kind === 'calendar-proposal' && !m.incomplete && event.profile === profile) {
    if (calendarAdded.has(m.id)) {
      const receipt = document.createElement('small'),
        link = calendarAdded.get(m.id).link;
      receipt.className = 'event-receipt';
      receipt.append('Added to your Google calendar');
      if (link) {
        const open = document.createElement('a');
        open.href = link;
        open.target = '_blank';
        open.rel = 'noopener noreferrer';
        open.textContent = 'Open in Google Calendar';
        receipt.append(' · ', open);
      }
      return receipt;
    }
    if (calendarReady.has(m.id)) {
      const link = document.createElement('a');
      link.className = 'text-button';
      link.textContent = 'Download reviewed calendar event';
      link.download = 'pea-event.ics';
      link.href = calendarReady.get(m.id);
      return link;
    }
    const b = document.createElement('button');
    b.className = 'text-button';
    b.textContent = 'Review calendar event: ' + event.draft.title;
    b.onclick = async () => {
      if (reviewingStory || live.isBusy()) {
        notice('Finish the current request first.');
        return;
      }
      reviewingStory = true;
      const who = profile,
        d = event.draft,
        // With calendar changes connected the event goes straight in; otherwise it is a file.
        account = live.eventAccount();
      try {
        const approved = await live.review(
          account ? 'Add this event to your calendar?' : 'Review calendar event',
          `Profile: ${who}\n\n${d.title}\nStart: ${new Date(d.start).toString()}\nEnd: ${new Date(d.end).toString()}\n\nUTC start: ${d.start}\nUTC end: ${d.end}\n\n${d.details || 'No notes'}\n\n${account ? `Approval adds this event to the main Google calendar of ${account}. Nobody is invited and Google is asked to send no notices. Your calendar’s own default reminder may apply. To move or remove it afterwards, use your calendar app.` : 'Approval reveals a download link. You choose whether to import it into your calendar. PEA does not create an event or invite anyone.'}`,
        );
        if (!approved) return;
        if (
          who !== profile ||
          !history(surface, who).some((x) => x.id === m.id) ||
          proposals.get(m.id) !== event
        )
          throw new Error('The conversation or profile changed. Review the event again.');
        if (account) {
          if (live.eventAccount() !== account)
            throw new Error('Your Google connection changed. Review the event again.');
          if (!eventIds.has(m.id)) eventIds.set(m.id, newEventId());
          const added = await live.addEvent(d, eventIds.get(m.id));
          // A failure has already been explained; trying again is safe because the id is the same.
          if (!added) return;
          calendarAdded.set(m.id, added);
          notice(
            added.already
              ? 'This event was already in your calendar from an earlier try. Nothing was added twice.'
              : 'Event added to your Google calendar. Nobody was invited.',
          );
          renderChat();
          renderCollaboration();
          return;
        }
        const stamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
        calendarReady.set(
          m.id,
          'data:text/calendar;charset=utf-8,' +
            encodeURIComponent(calendarFile(d, crypto.randomUUID(), stamp)),
        );
        renderChat();
        renderCollaboration();
      } catch (error) {
        notice(error.message || 'Could not prepare the event.');
      } finally {
        reviewingStory = false;
      }
    };
    return b;
  }
  if (readDone.has(m.id)) {
    const receipt = document.createElement('small');
    receipt.textContent = 'Page read';
    return receipt;
  }
  const reading = proposals.get(m.id);
  if (reading?.kind === 'read' && !m.incomplete && reading.profile === profile) {
    const b = document.createElement('button');
    b.className = 'text-button';
    b.textContent = 'Review page: ' + reading.address.host;
    b.onclick = async () => {
      if (reviewingStory) return;
      reviewingStory = true;
      const who = profile;
      try {
        if (
          (await research.read(reading.address, 'model')) &&
          who === profile &&
          proposals.get(m.id) === reading
        ) {
          proposals.delete(m.id);
          readDone.add(m.id);
          restoreQuestion(surface, m.id);
          renderChat();
        }
      } finally {
        reviewingStory = false;
      }
    };
    return b;
  }
  const opening = proposals.get(m.id);
  if (opening?.kind === 'open' && !m.incomplete && opening.profile === profile) {
    if (openReady.has(m.id)) {
      const link = document.createElement('a');
      link.className = 'text-button';
      link.textContent = openLabel(opening.action);
      link.href = openLink(opening.action, { apple: applePlatform });
      if (opening.action.kind === 'directions') {
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      }
      return link;
    }
    const b = document.createElement('button');
    b.className = 'text-button';
    b.textContent =
      opening.action.kind === 'call'
        ? 'Review call'
        : opening.action.kind === 'text'
          ? 'Review text message'
          : 'Review directions';
    b.onclick = async () => {
      if (reviewingStory || live.isBusy()) {
        notice('Finish the current request first.');
        return;
      }
      reviewingStory = true;
      const who = profile;
      try {
        const approved = await live.review(
          opening.action.kind === 'directions' ? 'Open directions?' : 'Open your phone?',
          `Profile: ${who}\n\n${describeOpen(opening.action, { apple: applePlatform })}`,
        );
        if (!approved) return;
        if (
          who !== profile ||
          !history(surface, who).some((x) => x.id === m.id) ||
          proposals.get(m.id) !== opening
        )
          throw new Error('The conversation or profile changed. Review it again.');
        openReady.add(m.id);
        renderChat();
        renderCollaboration();
      } catch (error) {
        notice(error.message || 'Could not review that.');
      } finally {
        reviewingStory = false;
      }
    };
    return b;
  }
  if (docDone.has(m.id)) {
    const done = docDone.get(m.id);
    const receipt = document.createElement('small');
    receipt.textContent = done.say;
    if (done.href) {
      const link = document.createElement('a');
      link.className = 'text-button';
      link.textContent = 'Download the document';
      link.download = done.name;
      link.href = done.href;
      receipt.append(' ', link);
    }
    return receipt;
  }
  const written = proposals.get(m.id);
  if (written?.kind === 'doc' && !m.incomplete && written.profile === profile) {
    const b = document.createElement('button');
    b.className = 'text-button';
    b.textContent =
      (written.request.update ? 'Review new version: ' : 'Review document: ') + written.request.draft.title;
    b.onclick = async () => {
      if (reviewingStory || live.isBusy()) {
        notice('Finish the current request first.');
        return;
      }
      reviewingStory = true;
      const who = profile;
      try {
        if (!history(surface, who).some((x) => x.id === m.id) || proposals.get(m.id) !== written) return;
        const result = await live.writeDocument(written.request);
        if (!result) return;
        const title = result.title;
        docDone.set(
          m.id,
          result.status === 'file'
            ? {
                say: `“${title}” is ready as a file. Nothing was created in Google.`,
                href: 'data:text/html;charset=utf-8,' + encodeURIComponent(result.html),
                name:
                  title
                    .replace(/[^A-Za-z0-9 _.-]+/g, ' ')
                    .trim()
                    .slice(0, 80) + '.html',
              }
            : {
                say:
                  result.status === 'replaced'
                    ? `Replaced the text of “${title}” in your PEA folder.`
                    : `Created “${title}” in your PEA folder.`,
              },
        );
        proposals.delete(m.id);
        renderChat();
        renderCollaboration();
      } catch (error) {
        notice(error.message || 'Could not write the document.');
      } finally {
        reviewingStory = false;
      }
    };
    return b;
  }
  const doc = proposals.get(m.id);
  if (doc?.kind === 'document-proposal' && !m.incomplete && doc.profile === profile) {
    const b = document.createElement('button');
    b.className = 'text-button';
    b.textContent =
      'Edit ' + (doc.draft.kind === 'form' ? 'form' : 'document') + ' draft: ' + doc.draft.title;
    b.onclick = () => {
      if (reviewingStory || live.isBusy()) {
        notice('Finish the current request first.');
        return;
      }
      if (!history(surface, profile).some((x) => x.id === m.id) || proposals.get(m.id) !== doc) return;
      try {
        live.prepareDocument(doc.draft);
      } catch (error) {
        notice(error.message || 'Could not open the draft.');
      }
    };
    return b;
  }
  const email = proposals.get(m.id);
  if (email?.kind === 'email' && !m.incomplete && email.profile === profile) {
    if (emailReady.has(m.id)) {
      const link = document.createElement('a');
      link.className = 'text-button';
      link.textContent = 'Open reviewed draft in your mail app';
      link.href = emailDraftLink(email);
      return link;
    }
    const b = document.createElement('button');
    b.className = 'text-button';
    b.textContent = 'Review email draft';
    b.onclick = async () => {
      if (reviewingStory || live.isBusy()) {
        notice('Finish the current request first.');
        return;
      }
      reviewingStory = true;
      const who = profile;
      try {
        const approved = await live.review(
          'Review email draft',
          `Profile: ${who}\nTo: ${email.to}\nSubject: ${email.subject}\n\n${email.body}\n\nAfter approval, choose the link to open your mail app. PEA does not send this message; you decide whether to send it there.`,
        );
        if (!approved) return;
        if (
          who !== profile ||
          !history(surface, who).some((x) => x.id === m.id) ||
          proposals.get(m.id) !== email
        )
          throw new Error('The conversation or profile changed. Review the draft again.');
        emailReady.add(m.id);
        renderChat();
        renderCollaboration();
      } catch (error) {
        notice(error.message || 'Could not review the draft.');
      } finally {
        reviewingStory = false;
      }
    };
    return b;
  }
  const change = proposals.get(m.id);
  if (todoDone.has(m.id)) {
    const receipt = document.createElement('small');
    receipt.textContent = todoDone.get(m.id);
    return receipt;
  }
  if (change?.kind === 'todo' && !m.incomplete && change.profile === profile) {
    const b = document.createElement('button');
    b.className = 'text-button';
    b.textContent = 'Review to-do changes';
    b.onclick = async () => {
      if (reviewingStory || live.isBusy()) {
        notice('Finish the current request first.');
        return;
      }
      reviewingStory = true;
      const who = profile;
      try {
        const approved = await live.review(
          'Change your to-do list?',
          `Profile: ${who}\n\n${todos.describe(change.requests)}\n\nNothing changes unless you approve. Reminders appear only while PEA is open in this browser, unless you handed them to PEA for Mac. To-dos are kept with your story board, and its storage setting applies.`,
        );
        if (!approved) return;
        if (
          who !== profile ||
          !history(surface, who).some((x) => x.id === m.id) ||
          proposals.get(m.id) !== change ||
          todoDone.has(m.id)
        )
          throw new Error('The conversation or profile changed. Review the changes again.');
        const said = todos.apply(change.requests);
        todoDone.set(m.id, said);
        proposals.delete(m.id);
        renderChat();
        renderCollaboration();
      } catch (error) {
        notice(error.message || 'Could not change the to-do list.');
      } finally {
        reviewingStory = false;
      }
    };
    return b;
  }
  if (consumed.has(m.id)) {
    const receipt = document.createElement('small');
    receipt.textContent = 'Added to Today';
    return receipt;
  }
  const entry = proposals.get(m.id);
  if (!entry || m.incomplete || entry.profile !== profile) return null;
  const b = document.createElement('button');
  b.className = 'text-button';
  b.textContent = 'Review story: ' + entry.title;
  b.onclick = async () => {
    if (reviewingStory || live.isBusy()) {
      notice('Finish the current request first.');
      return;
    }
    reviewingStory = true;
    const who = profile;
    try {
      const approved = await live.review(
        'Add a story to Today?',
        `Profile: ${who}\n\n${entry.title}\n\nScope:\n${entry.details || 'None provided'}\n\nDone when:\n${entry.acceptance || 'Owner review'}\n\nAdd this story to Inbox? It will not run, send anything, or set a reminder. The task board’s local-storage setting applies.`,
      );
      if (!approved) return;
      if (
        who !== profile ||
        !history(surface, who).some((x) => x.id === m.id) ||
        proposals.get(m.id) !== entry ||
        consumed.has(m.id)
      )
        throw new Error('The conversation or profile changed. Review the story again.');
      board.capture(entry.title, entry.details, entry.acceptance);
      consumed.add(m.id);
      proposals.delete(m.id);
      tab('today');
      $('tasks-section').open = true;
      renderChat();
      renderCollaboration();
    } catch (error) {
      notice(error.message || 'Could not add the story.');
    } finally {
      reviewingStory = false;
    }
  };
  return b;
}
// After a page is read, the question that led to it goes back in the box for the owner to send.
function restoreQuestion(surface, replyID) {
  const thread = history(surface),
    asked = thread[thread.findIndex((x) => x.id === replyID) - 1];
  if (surface === 'chat' && asked?.role === 'user' && !$('thought').value) $('thought').value = asked.text;
}
function renderChat() {
  document.querySelector('.welcome').hidden = history('chat').length > 0;
  const nodes = history('chat').map((m) => {
    const d = document.createElement('div');
    d.className = `utterance ${m.role}`;
    const l = document.createElement('small');
    l.textContent = m.role === 'user' ? 'YOU' : m.preview ? 'PEA PREVIEW' : 'PEA';
    const t = messageBody(m);
    d.append(l, t);
    const action = proposalButton(m, 'chat');
    if (action) d.append(action);
    if (!m.preview && !m.incomplete) makeMessageDraggable(d, m.id);
    return d;
  });
  $('messages').replaceChildren(...nodes);
}
async function selectFile(f) {
  if (!visible().includes(f)) return;
  if (f.mimeType === 'application/vnd.google-apps.folder') {
    notice('Folder contents are included in this workspace list.');
    return;
  }
  if (f.live) {
    const opened = await live.run(() => live.open(f));
    if (!opened) return;
    f = opened;
  }
  selected = f;
  live.maybeAutoAttach(f);
  $('file-kind').textContent = f.local ? 'LOCAL FILE' : f.kind.toUpperCase();
  $('file-name').textContent = f.name;
  $('file-origin').textContent = f.local
    ? 'Local preview · stays in this tab'
    : f.live
      ? 'Your PEA Drive file · excerpt may be truncated'
      : 'Synthetic sample · not a live Google file';
  $('view-mode').value = f.kind === 'code' || f.kind === 'diagram' ? f.kind : 'document';
  $('discuss').disabled = false;
  renderPreview();
}
function renderPreview() {
  const pane = $('file-preview');
  pane.replaceChildren();
  if (!selected) return;
  if (selected.mimeType.startsWith('image/')) {
    const img = document.createElement('img');
    img.src = selected.url;
    img.alt = selected.name;
    pane.append(img);
    return;
  }
  const mode = $('view-mode').value;
  if (mode === 'diagram') {
    const labels = selected.content
      .split(/(?:-->|->)/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (labels.length > 1 && labels.length <= 12 && labels.every((s) => s.length <= 100)) {
      const diagram = document.createElement('div');
      diagram.className = 'diagram';
      labels.forEach((label, i) => {
        if (i) {
          const a = document.createElement('span');
          a.className = 'diagram-arrow';
          a.textContent = '→';
          diagram.append(a);
        }
        const node = document.createElement('span');
        node.className = 'diagram-node';
        node.textContent = label;
        diagram.append(node);
      });
      pane.append(diagram);
      return;
    }
  }
  const text = document.createElement(mode === 'code' ? 'pre' : 'div');
  text.textContent = selected.content;
  pane.append(text);
}
function preferences() {
  $('preferences').showModal();
}
for (const b of document.querySelectorAll('[data-tab]')) {
  b.onclick = () => tab(b.dataset.tab);
  b.onkeydown = (e) => {
    const tabs = [...document.querySelectorAll('[data-tab]')],
      i = tabs.indexOf(b);
    let next;
    if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (i + tabs.length - 1) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    else return;
    e.preventDefault();
    tabs[next].focus();
    tab(tabs[next].dataset.tab);
  };
}
for (const b of document.querySelectorAll('[data-go]')) b.onclick = () => tab(b.dataset.go);
for (const b of document.querySelectorAll('[data-prompt]'))
  b.onclick = () => {
    $('thought').value = b.dataset.prompt;
    $('thought').focus();
  };
$('profile').onchange = () => {
  if ($('speech-length').open) $('speech-length').close();
  voice?.stop();
  stopVoices();
  profile = $('profile').value;
  notice('');
  for (const id of [
    'thought',
    'collab-thought',
    'rename-file',
    'draft-title',
    'draft-text',
    'file-query',
    'recent-query',
  ])
    $(id).value = '';
  selected = null;
  $('file-preview').replaceChildren();
  $('file-name').textContent = 'Choose something to explore.';
  $('file-kind').textContent = 'DOCUMENT';
  $('file-origin').textContent = 'No file selected';
  $('local-open').disabled = profile === 'blended';
  $('discuss').disabled = true;
  renderLists();
  renderChat();
  renderCollaboration();
  live.profileChanged();
  board.profileChanged();
  canon?.render();
  days?.render();
  decks?.render();
  todos.profileChanged();
  research.profileChanged();
  memory.profileChanged();
};
$('theme').onclick = () =>
  (document.documentElement.dataset.theme =
    document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
for (const id of ['settings-open', 'context-open', 'folder-setup']) $(id).onclick = preferences;
$('preferences-done').onclick = () => $('preferences').close();
$('home-attach').onclick = () => tab('greenhouse');
$('home-connections').onclick = () => $('connections-open').click();
function addReply(surface, text) {
  const reply = message('assistant', '', { incomplete: true });
  history(surface).push(message('user', text), reply);
  return reply;
}
function renderCollaboration() {
  const nodes = history('greenhouse').map((m) => {
    const d = document.createElement('div');
    d.className = `utterance ${m.role}`;
    const label = document.createElement('small');
    label.textContent = m.role === 'user' ? 'YOU' : 'PEA · GREENHOUSE';
    const t = messageBody(m);
    d.append(label, t);
    const action = proposalButton(m, 'greenhouse');
    if (action) d.append(action);
    if (!m.incomplete) makeMessageDraggable(d, m.id);
    return d;
  });
  $('collab-messages').replaceChildren(...nodes);
}
async function submit(surface) {
  voice?.stop();
  const field = surface === 'chat' ? $('thought') : $('collab-thought'),
    text = field.value.trim();
  if (!text) return;
  const destination = ownerNavigation(text);
  if (destination) {
    if (live.isBusy()) {
      notice('Finish the current request before changing tabs.');
      return;
    }
    field.value = '';
    tab(destination);
    notice('Opened ' + { chat: 'Chat', today: 'Today', greenhouse: 'Greenhouse' }[destination] + '.');
    return;
  }
  // "read https://…" in the owner's own words. Chat only; the review comes before anything is asked.
  const address = surface === 'chat' ? ownerRead(text) : null;
  if (address) {
    field.value = '';
    await research.read(address, 'owner');
    return;
  }
  try {
    if (board.command(text)) {
      field.value = '';
      return;
    }
  } catch (error) {
    notice(error.message);
    return;
  }
  if (history(surface).length >= 199) {
    notice('Start a fresh conversation from Conversations & memory. This thread has reached 200 messages.');
    return;
  }
  const used = await live.run(() => live.chat(surface, text));
  if (used === false) {
    history(surface).push(
      message('user', text),
      message(
        'assistant',
        'This is the local preview. Connect your own OpenRouter key to collaborate with a live model. No message was sent to a provider.',
        { preview: true },
      ),
    );
    memory.record(surface);
  }
  field.value = '';
  renderChat();
  renderCollaboration();
}
$('chat-stop').onclick = () => {
  if ($('speech-length').open) $('speech-length').close();
  voice?.stop();
  stopVoices();
  $('request-stop').click();
};
$('composer').onsubmit = (e) => {
  e.preventDefault();
  void submit('chat');
};
$('collab-send').onclick = () => void submit('greenhouse');
$('attach-open').onclick = () => tab('greenhouse');
$('discuss').onclick = () => {
  if (!selected) return;
  try {
    live.attach(selected);
    $('collab-thought').value = `Discuss “${selected.name}”`;
    tab('greenhouse');
  } catch (error) {
    notice(error.message);
  }
};
for (const id of ['days', 'recent-query', 'file-query']) $(id).oninput = renderLists;
$('view-mode').onchange = renderPreview;
$('local-open').onclick = () => $('local-file').click();
// Opens one local file for preview. The file picker and a drop both come through here.
async function openLocalFile(f) {
  if (!f) return null;
  const accepted = localFileKind(f.name, f.type, f.size);
  if (accepted.error) {
    notice(accepted.error);
    return null;
  }
  const who = profile;
  const content = accepted.image ? '' : await f.text();
  if (who !== profile) return null;
  if (imageURL) URL.revokeObjectURL(imageURL);
  const item = {
    id: crypto.randomUUID(),
    profile,
    name: f.name,
    mimeType: accepted.mimeType,
    kind: accepted.kind,
    properties: {},
    createdTime: new Date().toISOString(),
    local: true,
    content,
  };
  if (accepted.image) {
    imageURL = URL.createObjectURL(f);
    item.url = imageURL;
  }
  files.push(item);
  renderLists();
  await selectFile(item);
  return item;
}
$('local-file').onchange = async () => {
  const f = $('local-file').files?.[0];
  $('local-file').value = '';
  await openLocalFile(f);
};
window.addEventListener('pagehide', () => {
  if (imageURL) URL.revokeObjectURL(imageURL);
});
live = installConnections({
  todoGuidance: (shared) => todos?.guidance(shared) ?? '',
  localChanged: () => todos?.connectionChanged(),
  profile: () => profile,
  surface: () => (activeTab === 'greenhouse' ? 'greenhouse' : 'chat'),
  history,
  notice,
  files: () => visible(),
  selected: () => selected,
  context: (text) => memory.context(text),
  canon: (text) => canon?.pick(text) ?? null,
  canonSent: (count) => canon?.sent(count),
  days: () => days?.pick() ?? null,
  // The board's own buttons follow the request too; without this they stay as they were last drawn.
  busyChanged: () => {
    memory?.render();
    board?.render();
  },
  setSchedule(events, mail, calendarOn, mailOn) {
    schedules[profile] = { events, mail, calendarOn, mailOn };
    renderLists();
  },
  setFiles(items) {
    for (let i = files.length - 1; i >= 0; i--)
      if (files[i].profile === profile && !files[i].local) files.splice(i, 1);
    files.push(...items);
    selected = null;
    $('file-preview').replaceChildren();
    $('file-name').textContent = 'Choose something to explore.';
    renderLists();
  },

  page: () => research?.current() ?? null,
  beginReply(surface, text, { sourced = false } = {}) {
    const reply = addReply(surface, text);
    if (sourced) sourcedReplies.add(reply.id);
    renderChat();
    renderCollaboration();
    memory.record(surface);
    return reply;
  },
  appendReply(surface, reply, delta) {
    reply.raw = (reply.raw ?? '') + delta;
    reply.text = visibleReply(reply.raw);
    if (!reply.frame)
      reply.frame = requestAnimationFrame(() => {
        reply.frame = null;
        if (surface === 'chat') renderChat();
        else renderCollaboration();
      });
  },
  finishReply(surface, reply, complete) {
    const raw = reply.raw ?? '',
      // A reply written with a web page in view offers nothing to approve: words from a stranger's
      // page must not be able to steer the owner toward an action, however it is worded.
      sourced = sourcedReplies.delete(reply.id),
      offer = complete && !sourced,
      items = offer ? storyProposals(raw) : [],
      emails = offer ? emailProposals(raw) : [],
      docs = offer ? documentProposals(raw) : [],
      events = offer ? calendarProposals(raw) : [],
      // A change or removal counts only if its ref names an event the model was actually given.
      edits = (offer ? calendarEdits(raw) : [])
        .map((edit) => ({ edit, target: live.ownEvent(edit.ref) }))
        .filter((x) => x.target),
      navs = offer ? navigationProposals(raw) : [],
      changes = offer ? todoProposals(raw) : [],
      written = offer ? docProposals(raw, live.currentDocument()) : [],
      opens = offer ? openProposals(raw) : [],
      reads = offer ? readProposals(raw) : [];
    // A note about her own day, kept only while the owner has notes on. Never from a sourced reply.
    if (offer && surface === 'chat') days?.noteFrom(raw);
    reply.text = visibleReply(raw);
    if (complete && sourced && /```pea-/i.test(raw)) reply.text += '\n\n' + sourcedNotice;
    if (offer && !reads.length && claimsRead(reply.text))
      reply.text +=
        '\n\nPEA did not read a web page for this reply. It reads one only after you approve its exact address.';
    if (complete && warnsOfUnconfirmedStory(reply.text))
      reply.text += '\n\nNo story was added by this reply. Review and approve a proposal before it is added.';
    if (complete && warnsOfUnconfirmedEmail(reply.text))
      reply.text += '\n\nPEA did not send an email. Review and send it yourself in your mail app.';
    if (complete && !written.length && (warnsOfUnconfirmedDocument(reply.text) || claimsDocument(reply.text)))
      reply.text +=
        '\n\nPEA did not create a document from this reply. Review and approve a proposal before anything is written.';
    if (complete && warnsOfUnconfirmedCalendar(reply.text))
      reply.text +=
        '\n\nPEA did not schedule an event from this reply. Nothing is added until you review and approve a proposal.';
    if (complete && claimsCalendarEdit(reply.text))
      reply.text +=
        '\n\nPEA did not change or remove an event from this reply. Nothing changes until you review and approve a proposal.';
    if (complete && !changes.length && claimsTodoChange(reply.text))
      reply.text +=
        '\n\nPEA did not change your to-do list. Review and approve a proposal before anything changes.';
    if (complete && !opens.length && claimsOpen(reply.text))
      reply.text +=
        '\n\nPEA did not call, text or open directions. Review and approve a proposal, then press the link yourself.';
    // PEA never passes as human. If the reply claimed to be, or dodged a sincere question about
    // what it is, the app adds the plain sentence itself.
    if (complete) {
      const asked = history(surface)
        .filter((m) => m.role === 'user')
        .at(-1)?.text;
      if (needsHonestyCorrection(reply.text, asked) && !reply.text.includes(honestyCorrection))
        reply.text += '\n\n' + honestyCorrection;
    }
    delete reply.raw;
    reply.incomplete = !complete;
    if (items.length === 1 && !emails.length) proposals.set(reply.id, { profile, ...items[0] });
    else if (emails.length === 1 && !items.length)
      proposals.set(reply.id, { profile, kind: 'email', ...emails[0] });
    else if (docs.length === 1 && !items.length && !emails.length)
      proposals.set(reply.id, { profile, kind: 'document-proposal', draft: docs[0] });
    else if (events.length === 1 && !items.length && !emails.length && !docs.length)
      proposals.set(reply.id, { profile, kind: 'calendar-proposal', draft: events[0] });
    else if (edits.length === 1 && !items.length && !emails.length && !docs.length && !events.length)
      proposals.set(reply.id, {
        profile,
        kind: 'calendar-edit',
        edit: edits[0].edit,
        target: { id: edits[0].target.id, title: edits[0].target.title },
      });
    else if (navs.length === 1 && !items.length && !emails.length && !docs.length && !events.length)
      proposals.set(reply.id, { profile, kind: 'navigation', tab: navs[0].tab });
    else if (
      changes.length &&
      !items.length &&
      !emails.length &&
      !docs.length &&
      !events.length &&
      !navs.length
    )
      proposals.set(reply.id, { profile, kind: 'todo', requests: changes });
    else if (
      written.length === 1 &&
      !items.length &&
      !emails.length &&
      !docs.length &&
      !events.length &&
      !navs.length
    )
      proposals.set(reply.id, { profile, kind: 'doc', request: written[0] });
    else if (
      opens.length === 1 &&
      !items.length &&
      !emails.length &&
      !docs.length &&
      !events.length &&
      !navs.length
    )
      proposals.set(reply.id, { profile, kind: 'open', action: opens[0] });
    else if (
      reads.length === 1 &&
      !items.length &&
      !emails.length &&
      !docs.length &&
      !events.length &&
      !navs.length &&
      !changes.length &&
      !written.length
    )
      proposals.set(reply.id, { profile, kind: 'read', address: reads[0] });
    memory.record(surface);
    if (surface === 'chat') renderChat();
    else renderCollaboration();
  },
});
// Clipboard is read only after a deliberate paste click; it is never logged or sent by this control.
for (const button of document.querySelectorAll('[data-paste-target]'))
  button.onclick = async () => {
    const input = $(button.dataset.pasteTarget),
      feedback = button.parentElement.querySelector('.paste-feedback'),
      who = profile,
      dialog = button.closest('dialog');
    feedback.textContent = '';
    try {
      if (!navigator.clipboard?.readText)
        throw new Error('Clipboard access is unavailable. Paste directly into the field.');
      const text = await navigator.clipboard.readText();
      if (who !== profile || !dialog?.open) throw new Error('Setup changed. Open it again before pasting.');
      if (!text.trim()) throw new Error('The clipboard is empty.');
      if (input.maxLength > 0 && text.length > input.maxLength)
        throw new Error('Clipboard text is too long for this field.');
      input.value = text.trim();
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
      feedback.textContent = 'Pasted. Review before connecting.';
    } catch (error) {
      feedback.textContent =
        error.name === 'NotAllowedError'
          ? 'Clipboard access was not granted. Paste directly into the field.'
          : error.message || 'Clipboard access failed. Paste directly into the field.';
    }
  };
$('copy-google-origin').onclick = async () => {
  try {
    if (!navigator.clipboard?.writeText) throw new Error();
    await navigator.clipboard.writeText(location.origin);
    $('origin-feedback').textContent = 'Origin copied.';
  } catch {
    $('origin-feedback').textContent = 'Could not copy. Select the origin and copy it manually.';
  }
};
// Guided entry points open existing connection controls; choosing a route never sends data.
$('connections-open').onclick = () => {
  if (!live.isBusy()) $('setup-wizard').showModal();
  else notice('Finish the current request first.');
};
function clearGuidedConnection() {
  $('connections').removeAttribute('data-guided');
  $('guided-connection').hidden = true;
}
$('connections').addEventListener('close', clearGuidedConnection);
$('guided-all').onclick = clearGuidedConnection;
$('guided-back').onclick = () => {
  $('connections').close();
  $('setup-wizard').showModal();
};
for (const [button, route, group, input] of [
  ['wizard-router', 'router', 'router-group', 'router-key'],
  ['wizard-local', 'local', 'local-group', 'local-token'],
  ['wizard-google', 'google', 'google-group', 'google-client'],
  ['wizard-github', 'github', 'github-group', 'github-repo'],
  ['wizard-voice', 'voice', 'voice-providers', null],
])
  $(button).onclick = () => {
    $('setup-wizard').close();
    $('collab-config').click();
    $('connections').dataset.guided = route;
    $('guided-connection').hidden = false;
    $('guided-title').textContent =
      route === 'router'
        ? 'Connect OpenRouter'
        : route === 'local'
          ? 'Connect your local model'
          : route === 'google'
            ? 'Connect Google workspace'
            : route === 'github'
              ? 'Connect GitHub'
              : 'Choose a provider voice';
    $('guided-description').textContent =
      route === 'router'
        ? 'Enter your OpenRouter API key, load the available models, then choose your Chat model below. Review costs and data terms before you send a message.'
        : route === 'local'
          ? 'Enter your server connection token and load its models. Then choose a Local Chat model in the model section below. Your server must already be running.'
          : route === 'google'
            ? 'Choose optional previews, enter your Web OAuth client ID, and review Google’s requested access before connecting. PEA enforces the selected folder boundary in the app.'
            : route === 'github'
              ? 'Choose a repository and create a fine-grained token limited to it. PEA can prepare a reviewed draft pull request; it does not merge it.'
              : 'Reading aloud can use your own ElevenLabs or Fish Audio key through your PEA gateway. Connect the gateway under Local model first. Each read-aloud is billed by the provider, and you review that before the first one.';
    $(group).open = true;
    requestAnimationFrame(() => {
      (input ? $(input) : $(group).querySelector('summary')).focus({ preventScroll: true });
    });
  };
board = installBoard({
  boardChanged: () => todos?.render(),
  review: live.review,
  dictate: (target) => requestDictation(target ?? 'board-command'),
  stopDictation: () => {
    if (voiceTarget === 'story-edit-dictation') voice?.stop();
  },
  lastRequest: () =>
    history(lastConversationSurface)
      .filter((m) => m.role === 'user')
      .at(-1)?.text,
  profile: () => profile,
  busy: () => live.isBusy(),
  notice,
  today: () => tab('today'),
  model: (surface, role) => live.model(surface, role),
  confirmStart: (surface, role) =>
    live.review(
      'Start a fresh task thread',
      `This replaces the visible ${surface} thread in this browser tab with the assigned story. Earlier eligible browser messages remain in your local library; encrypted saving is optional. Chat's configured model stays unchanged. Greenhouse uses the selected ${role} profile. Continue?`,
    ),
  async execute(surface, role, text, onDispatch) {
    const who = profile;
    if (surface === 'greenhouse') live.setRole(role);
    await memory.clearSurface(surface);
    tab(surface);
    let dispatched = false;
    const result = await live.run(() =>
      live.chat(surface, text, () => {
        dispatched = true;
        onDispatch();
      }),
    );
    if (who !== profile) return { started: dispatched, complete: false, text: 'Profile changed.' };
    const last = history(surface).at(-1);
    return result && typeof result === 'object'
      ? result
      : { started: dispatched, complete: false, text: last?.role === 'assistant' ? last.text : '' };
  },
});
todos = installTodos({
  store: board.todoStore,
  profile: () => profile,
  notice,
  review: live.review,
  mac: { key: () => live.localKey(), send: (key, list) => live.macReminders(key, list) },
  changed: () => home?.render(),
});
memory = installMemory({
  profile: () => profile,
  history,
  busy: () => live.isBusy(),
  notice,
  review: live.review,
  tab,
  contextChanged: () => live.contextChanged(),
  replace(surface, messages) {
    const current = history(surface);
    current.splice(0, current.length, ...messages);
    // A page that was read belongs to the conversation it was read in.
    if (surface === 'chat') research?.clear();
    renderChat();
    renderCollaboration();
  },
  clearAll() {
    proposals.clear();
    consumed.clear();
    emailReady.clear();
    calendarReady.clear();
    calendarAdded.clear();
    calendarEdited.clear();
    eventIds.clear();
    todoDone.clear();
    docDone.clear();
    openReady.clear();
    live.forgetDocument();
    voice?.stop();
    stopVoices();
    for (const key of Object.keys(chats)) delete chats[key];
    for (const id of ['thought', 'collab-thought']) $(id).value = '';
    renderChat();
    renderCollaboration();
  },
});
// Her history: cards the owner's model writes on request. Kept in this browser, Personal only.
canon = installCanon({
  profile: () => profile,
  interview: () => memory.context(''),
  review: live.review,
  run: live.run,
  compose: live.compose,
  isBusy: live.isBusy,
  key: live.localKey,
  read: live.readPage,
});
// Deck projects in Greenhouse: an outline, then slides, each from one reviewed request.
decks = installDecks({
  profile: () => profile,
  review: live.review,
  run: live.run,
  compose: live.compose,
  isBusy: live.isBusy,
});
// Provider voices for reading aloud, through the owner's gateway with the owner's key.
speech = installSpeech({
  voices: live.voices,
  speak: live.speak,
  localKey: live.localKey,
  profile: () => profile,
  review: live.review,
  notice,
});
// Her days: dated lines about the character's own life. Kept in this browser, Personal only.
days = installDays({
  profile: () => profile,
  interview: () => memory.context(''),
  cards: () => canon.cards(),
  review: live.review,
  run: live.run,
  compose: live.compose,
  isBusy: live.isBusy,
  notice,
});
for (const [id, target] of [
  ['menu-new-chat', 'library-new-chat'],
  ['menu-history', 'library-open'],
  ['menu-interview', 'interview-open'],
  ['menu-settings', 'collab-config'],
  ['menu-privacy', 'settings-open'],
])
  $(id).onclick = () => {
    $('workspace-menu').open = false;
    $(target).click();
  };
$('workspace-menu').onkeydown = (e) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    $('workspace-menu').open = false;
    $('workspace-menu').querySelector('summary').focus();
  }
};
function requestDictation(target) {
  if (live.isBusy()) {
    notice('Finish or stop the model request first.');
    return;
  }
  if (voice.active) {
    voice.stop();
    return;
  }
  voiceTarget = target;
  $('voice-consent').showModal();
}
let deviceVoice = loadVoicePreferences();
function voiceChoices() {
  return globalThis.speechSynthesis?.getVoices?.() ?? [];
}
function updateVoiceControls() {
  const select = $('device-voice'),
    voices = voiceChoices();
  select.replaceChildren(new Option('Device default', ''));
  for (const v of voices)
    if (v.voiceURI && v.voiceURI.length <= 300) select.add(new Option(`${v.name} · ${v.lang}`, v.voiceURI));
  select.value = voices.some((v) => v.voiceURI === deviceVoice.voice) ? deviceVoice.voice : '';
  $('device-rate').value = String(deviceVoice.rate);
  $('device-rate-value').textContent = deviceVoice.rate.toFixed(2) + '×';
  $('device-voice-note').textContent =
    deviceVoice.voice && !voices.some((v) => v.voiceURI === deviceVoice.voice)
      ? 'Saved voice is unavailable here; using the device default.'
      : '';
}
function saveDeviceVoice() {
  deviceVoice = voicePreferences({ voice: $('device-voice').value, rate: $('device-rate').value });
  const saved = saveVoicePreferences(deviceVoice);
  updateVoiceControls();
  $('device-voice-note').textContent = saved
    ? 'Saved on this browser.'
    : 'Storage unavailable; this choice lasts only until reload.';
}
function configureSpeech(utterance, delivery = { rate: 1, pitch: 1 }) {
  const selected = voiceChoices().find((v) => v.voiceURI === deviceVoice.voice);
  if (selected) utterance.voice = selected;
  utterance.rate = Math.max(0.5, Math.min(2, deviceVoice.rate * delivery.rate));
  utterance.pitch = delivery.pitch;
  return utterance;
}
$('device-voice').onchange = saveDeviceVoice;
$('device-rate').onchange = saveDeviceVoice;
$('device-rate').oninput = () => {
  $('device-rate-value').textContent = Number($('device-rate').value).toFixed(2) + '×';
};
$('device-voice-preview').onclick = () => {
  if (!globalThis.speechSynthesis || !globalThis.SpeechSynthesisUtterance) {
    $('device-voice-note').textContent = 'Device speech is unavailable in this browser.';
    return;
  }
  voice.stop();
  stopVoices();
  speechSynthesis.speak(configureSpeech(new SpeechSynthesisUtterance('Hello! Ready when you are.')));
};
globalThis.speechSynthesis?.addEventListener?.('voiceschanged', updateVoiceControls);
updateVoiceControls();
voice = new Dictation({
  Recognition: globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition,
  onText(target, text) {
    const field = $(target);
    if (
      target.startsWith('bio-') &&
      (!$('interview').open || !field || field.disabled || field.value.trim())
    ) {
      notice('The answer changed or the interview closed. Your existing answer was not replaced.');
      return;
    }
    if (target === 'story-edit-dictation' && (!$('story-edit').open || field.value.trim())) {
      if ($('story-edit').open)
        $('story-edit-dictation-note').textContent =
          'Draft changed while listening. Existing text was not replaced.';
      return;
    }
    if (target === 'story-edit-dictation' && text.length > 2400) {
      $('story-edit-dictation-note').textContent = 'The dictated draft is too long. Try a shorter passage.';
      return;
    }
    field.value = text;
    if (target === 'story-edit-dictation')
      $('story-edit-dictation-note').textContent = 'Draft ready to review.';
    if (target === 'voice-transcript') $('voice-room-status').textContent = 'Transcript ready to review.';
    notice('Transcript ready. Review, then Send or Apply when you choose.');
  },
  onState(on) {
    for (const id of ['collab-mic', 'board-mic'])
      $(id).textContent = on ? 'Stop listening' : id === 'board-mic' ? 'Dictate command' : 'Dictate';
    for (const b of document.querySelectorAll('.interview-dictate'))
      b.textContent = on && b.dataset.target === voiceTarget ? 'Stop listening' : 'Dictate answer';
    $('voice-room-mic').classList.toggle('listening', on);
    $('voice-room-mic').setAttribute('aria-pressed', String(on));
    if (on) $('voice-room-status').textContent = 'Listening…';
    else if ($('voice-room-status').textContent === 'Listening…')
      $('voice-room-status').textContent = 'Not listening.';
  },
  onError(message) {
    $('voice-room-status').textContent = message;
    notice(message);
  },
});
$('collab-mic').onclick = () => requestDictation('collab-thought');
$('voice-start').onclick = () => {
  $('voice-consent').close();
  if (voiceTarget?.startsWith('bio-') && !$('interview').open) {
    notice('Open the interview before dictating.');
    return;
  }
  if (voiceTarget === 'story-edit-dictation' && !$('story-edit').open) {
    notice('Open the story editor before dictating.');
    return;
  }
  voice.start(voiceTarget);
};
for (const field of document.querySelectorAll(
  '#interview input[id^="bio-"]:not([type="checkbox"]), #interview textarea[id^="bio-"]',
)) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'interview-dictate';
  b.dataset.target = field.id;
  b.textContent = 'Dictate answer';
  b.setAttribute(
    'aria-label',
    'Dictate answer for ' +
      (field.closest('label')?.childNodes[0]?.textContent?.trim() || 'interview question'),
  );
  b.onclick = () => {
    if (voice.active) {
      voice.stop();
      return;
    }
    if (field.disabled) {
      notice('Choose a Personal or Work profile first.');
      return;
    }
    if (field.value.trim()) {
      notice('This answer already has text. Clear it before dictating, or edit it directly.');
      return;
    }
    requestDictation(field.id);
  };
  field.closest('label').insertAdjacentElement('afterend', b);
  const speak = document.createElement('button');
  speak.type = 'button';
  speak.className = 'interview-dictate';
  speak.textContent = 'Read question';
  const question = field.closest('label')?.childNodes[0]?.textContent?.trim() || '';
  speak.setAttribute('aria-label', 'Read question: ' + question);
  speak.onclick = () => {
    if (!globalThis.speechSynthesis || !globalThis.SpeechSynthesisUtterance) {
      notice('Device speech is unavailable in this browser.');
      return;
    }
    voice.stop();
    globalThis.speechSynthesis.cancel();
    globalThis.speechSynthesis.speak(configureSpeech(new SpeechSynthesisUtterance(question)));
  };
  b.insertAdjacentElement('afterend', speak);
}
$('interview').addEventListener('close', () => {
  if (voiceTarget?.startsWith('bio-')) voice.stop();
  stopVoices();
});
for (const id of ['interview-back', 'interview-next', 'interview-save'])
  $(id).addEventListener('click', () => {
    if (voiceTarget?.startsWith('bio-')) voice.stop();
  });
let voiceRoomSurface = 'chat',
  voiceRoomProfile = profile;
const voiceDrafts = new Map();
function openVoiceRoom(surface) {
  if (live.isBusy()) {
    notice('Finish the current request first.');
    return;
  }
  voiceRoomSurface = surface;
  voiceRoomProfile = profile;
  $('voice-transcript').value = voiceDrafts.get(profile + ':' + surface) ?? '';
  $('voice-room-context').textContent =
    surface === 'greenhouse' ? 'Greenhouse · ' + $('greenhouse-role').selectedOptions[0].textContent : 'Chat';
  updateVoiceControls();
  $('voice-room-status').textContent = 'Ready when you are.';
  $('voice-room').showModal();
}
$('voice-open').onclick = () => openVoiceRoom('chat');
$('chat-voice').onclick = () => openVoiceRoom('chat');
$('collab-voice').onclick = () => openVoiceRoom('greenhouse');
$('voice-origin').textContent = location.origin;
$('voice-room-mic').onclick = () => requestDictation('voice-transcript');
$('voice-room').addEventListener('close', () => {
  voice.stop();
  voiceDrafts.set(voiceRoomProfile + ':' + voiceRoomSurface, $('voice-transcript').value);
});
$('profile').addEventListener('change', () => {
  if ($('voice-room').open) $('voice-room').close();
  voiceDrafts.clear();
  $('voice-transcript').value = '';
});
window.addEventListener('pagehide', () => {
  voiceDrafts.clear();
  $('voice-transcript').value = '';
});
$('voice-room-send').onclick = async () => {
  const text = $('voice-transcript').value.trim(),
    surface = voiceRoomSurface,
    field = $(surface === 'chat' ? 'thought' : 'collab-thought');
  if (!text) {
    $('voice-room-status').textContent = 'Speak or type a message first.';
    return;
  }
  if (field.value.trim()) {
    $('voice-room-status').textContent =
      'Your typed ' +
      (surface === 'chat' ? 'chat' : 'Greenhouse') +
      ' draft is still open. Send or clear it first.';
    return;
  }
  if (live.isBusy()) {
    $('voice-room-status').textContent = 'Finish the current request first.';
    return;
  }
  if (profile !== voiceRoomProfile || activeTab !== surface) {
    $('voice-room-status').textContent = 'The profile or workspace changed. Open voice chat again.';
    return;
  }
  const who = profile,
    previous = history(surface, who).at(-1)?.id,
    read = $('voice-auto-read').checked;
  voice.stop();
  field.value = text;
  $('voice-room').close();
  await submit(surface);
  const reply = history(surface, who).at(-1);
  if (who === profile && reply?.id !== previous && reply?.role === 'assistant') {
    voiceDrafts.delete(who + ':' + surface);
    if (voiceRoomProfile === who && voiceRoomSurface === surface) $('voice-transcript').value = '';
  }
  if (
    read &&
    who === profile &&
    activeTab === surface &&
    !document.hidden &&
    reply?.id !== previous &&
    reply?.role === 'assistant' &&
    !reply.incomplete &&
    !reply.preview
  )
    $(surface === 'chat' ? 'chat-read' : 'collab-read').click();
};
let pendingSpeech = null;
function playReply(selection, short = false) {
  if (
    !selection ||
    selection.profile !== profile ||
    activeTab !== selection.surface ||
    !history(selection.surface, selection.profile).some(
      (m) => m.id === selection.id && m.text === selection.text && !m.incomplete,
    )
  ) {
    notice('The conversation changed. Choose the reply again.');
    return;
  }
  const text = short ? selection.excerpt : (selection.spoken ?? selection.text);
  if (speech?.chosen()) {
    void speech.read(text);
    return;
  }
  const utterance = configureSpeech(new SpeechSynthesisUtterance(text), presenceAt(memory.presence()));
  globalThis.speechSynthesis.speak(utterance);
  notice('Reading with your browser/device voice. Stop ends playback.');
}
$('speech-length').addEventListener('close', () => {
  // Closing is reported a moment later. If the choice has been opened again by then, that late
  // report belongs to the previous time and must not empty this one.
  if ($('speech-length').open) return;
  pendingSpeech = null;
  $('speech-excerpt').textContent = '';
});
for (const [id, short] of [
  ['speech-full', false],
  ['speech-short', true],
])
  $(id).onclick = () => {
    const selection = pendingSpeech;
    $('speech-length').close();
    if (selection) playReply(selection, short);
  };
$('speech-text').onclick = () => $('speech-length').close();
for (const [id, surface] of [
  ['chat-read', 'chat'],
  ['collab-read', 'greenhouse'],
])
  $(id).onclick = () => {
    voice.stop();
    const reply = history(surface)
      .filter((m) => m.role === 'assistant' && !m.incomplete)
      .at(-1);
    if (!reply) {
      notice('There is no completed reply to read yet.');
      return;
    }
    // A chosen provider voice is used on its own terms; it is never swapped for the device voice.
    if (!speech?.chosen() && (!globalThis.speechSynthesis || !globalThis.SpeechSynthesisUtterance)) {
      notice('Device speech is unavailable in this browser.');
      return;
    }
    stopVoices();
    // Copy boxes are never read aloud; only the prose around them is.
    const spoken = spokenReply(reply.text);
    if (!spoken) {
      notice('This reply is only text to copy, so there is nothing to read aloud.');
      return;
    }
    const plan = speechReadPlan(spoken),
      selection = { profile, surface, id: reply.id, text: reply.text, spoken, excerpt: plan.excerpt };
    if (plan.long) {
      pendingSpeech = selection;
      $('speech-excerpt').textContent = plan.excerpt;
      $('speech-length').showModal();
      return;
    }
    playReply(selection);
  };
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if ($('speech-length').open) $('speech-length').close();
    voice.stop();
    stopVoices();
  }
});
window.addEventListener('pagehide', () => voice.stop());
renderLists();
const workspace = installWorkspace({ onFocus: focusChanged });
workspace.render();
installDragDrop({
  openLocalFile,
  // The same step as Discuss: the text is selected for the next request, which is reviewed before sending.
  selectForChat(file) {
    try {
      live.attach(file);
      tab('chat');
    } catch (error) {
      notice(error.message);
    }
  },
  // Only a message in the active profile's own conversations can be dropped.
  messageText: (id) =>
    [...history('chat'), ...history('greenhouse')].find((m) => m.id === id && !m.incomplete)?.text ?? null,
  context: () => ({
    profile,
    busy: live.isBusy(),
    dialogOpen: Boolean(document.querySelector('dialog[open]')),
  }),
  notice,
  tab,
});
installCommands({
  workspace,
  tab,
  context: () => ({ ...workspace.layout(), wide: workspace.wide(), profile, busy: live.isBusy() }),
});
if (location.hash.slice(1)) tab(location.hash.slice(1));

void installReleaseUI();
weather = installWeather({ notice, review: live.review, changed: () => home?.render() });
research = installResearch({
  profile: () => profile,
  notice,
  review: live.review,
  run: live.run,
  isBusy: live.isBusy,
  key: live.localKey,
  read: live.readPage,
});
headlines = installHeadlines({
  changed: () => home?.render(),
  review: live.review,
  key: live.localKey,
  read: live.readPage,
  // A headline's own page is read like any other: Chat opens and the usual review names the address.
  readInChat(address, feed) {
    tab('chat');
    void research.read(address, 'feed', feed);
  },
});
// The summary at the top of Today repeats what the cards below hold; it asks nothing of anyone.
home = installHome({
  weather: () => weather.summary(),
  // Only a connected calendar's next event; the sample event is not the owner's day.
  event: () => (schedules[profile]?.calendarOn ? (schedules[profile].events[0] ?? null) : null),
  todos: () => todos.open(),
  headlines: () => headlines.top(3),
});
