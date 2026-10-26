import DOMPurify from 'dompurify';
import { Marked, type TokenizerAndRendererExtension } from 'marked';
import type { LinkedIssue } from '../api/types';
import { LANE_COLOR, STATUS_LABEL } from './workflow';

// Open links that leave the app in a new tab, safely.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.getAttribute('href')?.match(/^https?:/)) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * Ticket keys of the current project become chips that show the issue's live status and open it
 * in the issue panel. Keys inside code spans and blocks stay as text, because marked never runs
 * inline extensions there.
 */
function ticketExtension(projectKey: string, issues: Map<string, LinkedIssue>): TokenizerAndRendererExtension {
  const start = new RegExp(`(?<![A-Za-z0-9-])${projectKey}-\\d+`);
  const exact = new RegExp(`^${projectKey}-\\d+\\b`);
  return {
    name: 'ticket',
    level: 'inline',
    start(src) {
      return src.match(start)?.index;
    },
    tokenizer(src) {
      const m = exact.exec(src);
      return m ? { type: 'ticket', raw: m[0], key: m[0] } : undefined;
    },
    renderer(token) {
      const key = token.key as string;
      const issue = issues.get(key);
      if (!issue) return `<span class="ticket-chip missing" title="No issue ${key} in this project">${key}</span>`;
      const color = LANE_COLOR[issue.status].head;
      return (
        `<a class="ticket-chip" href="?issue=${key}" data-issue="${key}" title="${escape(issue.title)}">` +
        `<span class="tk">${key}</span><span class="ts" style="background:${color}">${STATUS_LABEL[issue.status]}</span></a>`
      );
    },
  };
}

export function renderMarkdown(markdown: string, projectKey: string, issues: LinkedIssue[] = []) {
  const map = new Map(issues.map((i) => [i.key, i]));
  const md = new Marked({ gfm: true, breaks: false });
  md.use({ extensions: [ticketExtension(projectKey, map)] });
  const html = md.parse(markdown, { async: false }) as string;
  return DOMPurify.sanitize(html, { ADD_ATTR: ['target'] });
}

/** Same rule as the API: keys of this project, not inside code. Used to look up chips while editing. */
export function issueKeysIn(markdown: string, projectKey: string) {
  const text = markdown.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]*`/g, ' ');
  return [...new Set(text.match(new RegExp(`(?<![A-Za-z0-9-])${projectKey}-\\d+\\b`, 'g')) ?? [])];
}
