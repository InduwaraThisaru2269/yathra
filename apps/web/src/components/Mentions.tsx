import { useMemo, useRef, useState, type ReactNode } from 'react';
import type { Member } from '../api/types';
import { Avatar } from './ui';

/** Stored form of a mention; the API notifies the user id inside it. */
const MENTION = /@\[([^\]\n]{1,80})\]\(user:([0-9a-f-]{36})\)/g;

/** Renders comment text with mentions as "@Name" chips and keeps line breaks. */
export function CommentText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(MENTION)) {
    if (m.index! > last) parts.push(text.slice(last, m.index));
    parts.push(
      <span key={m.index} className="mention">
        @{m[1]}
      </span>,
    );
    last = m.index! + m[0].length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}

/**
 * Textarea with @mention autocomplete over project members. Typing "@ni" suggests Nimal;
 * picking inserts a mention token that shows as "@Nimal P." once posted.
 */
export function MentionTextarea({
  value,
  onChange,
  members,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  members: Member[];
  placeholder?: string;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<{ start: number; text: string } | null>(null);
  const [active, setActive] = useState(0);

  const matches = useMemo(() => {
    if (!query) return [];
    const q = query.text.toLowerCase();
    return members.filter((m) => m.user.name.toLowerCase().includes(q) || m.user.email.toLowerCase().startsWith(q)).slice(0, 6);
  }, [query, members]);

  /** Looks back from the caret for "@word" that starts a mention. */
  const detect = (text: string, caret: number) => {
    const before = text.slice(0, caret);
    const m = /(^|\s)@([\p{L}.'-]{0,30})$/u.exec(before);
    setQuery(m ? { start: caret - m[2]!.length - 1, text: m[2]! } : null);
    setActive(0);
  };

  const pick = (member: Member) => {
    if (!query || !ref.current) return;
    const caret = ref.current.selectionStart;
    const token = `@[${member.user.name}](user:${member.user.id}) `;
    const next = value.slice(0, query.start) + token + value.slice(caret);
    onChange(next);
    setQuery(null);
    const pos = query.start + token.length;
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(pos, pos);
    });
  };

  return (
    <div style={{ position: 'relative' }}>
      <textarea
        ref={ref}
        className="textarea"
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          detect(e.target.value, e.target.selectionStart);
        }}
        onKeyDown={(e) => {
          if (!matches.length) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => (a + 1) % matches.length);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => (a - 1 + matches.length) % matches.length);
          } else if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            pick(matches[active]!);
          } else if (e.key === 'Escape') {
            setQuery(null);
          }
        }}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
      />
      {matches.length > 0 && (
        <div className="mention-menu" role="listbox" aria-label="Mention someone">
          {matches.map((m, i) => (
            <button
              key={m.user.id}
              type="button"
              role="option"
              aria-selected={i === active}
              className={i === active ? 'mention-opt on' : 'mention-opt'}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(m);
              }}
            >
              <Avatar user={m.user} size={22} />
              <span style={{ fontWeight: 600 }}>{m.user.name}</span>
              <span className="muted" style={{ fontSize: 12 }}>{m.role}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
