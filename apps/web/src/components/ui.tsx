import { useEffect, type ReactNode } from 'react';
import type { IssueType, Status, UserSummary } from '../api/types';
import { avatarColor, initials, LANE_COLOR, STATUS_LABEL, TYPE_META } from '../lib/workflow';

/** Yathra mark: a winding path through three stops — plan, build, test. */
export function YathraLogo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 112 112" aria-hidden="true" style={{ flex: 'none' }}>
      <rect x="6" y="6" width="104" height="104" rx="22" fill="#121212" />
      <rect x="2" y="2" width="104" height="104" rx="22" fill="#2EE59D" stroke="#121212" strokeWidth="4" />
      <path d="M20 82c18 0 14-30 34-30s16-26 34-26" fill="none" stroke="#121212" strokeWidth="8" strokeLinecap="round" />
      <circle cx="20" cy="82" r="9" fill="#FFFFFF" stroke="#121212" strokeWidth="4" />
      <circle cx="54" cy="52" r="9" fill="#FFD23F" stroke="#121212" strokeWidth="4" />
      <circle cx="88" cy="26" r="9" fill="#FF6B6B" stroke="#121212" strokeWidth="4" />
    </svg>
  );
}

export function Avatar({ user, size = 28 }: { user: UserSummary | null; size?: number }) {
  if (!user) {
    return (
      <span className="av empty" style={{ width: size, height: size }} title="Unassigned">
        ?
      </span>
    );
  }
  const c = avatarColor(user.id);
  return (
    <span className="av" style={{ width: size, height: size, background: c.bg, color: c.fg }} title={user.name}>
      {initials(user.name)}
    </span>
  );
}

const ICONS: Record<IssueType, ReactNode> = {
  STORY: <path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z" fill="currentColor" stroke="none" />,
  BUG: <><rect x="7" y="8" width="10" height="12" rx="5" /><path d="M12 8V5M4 12h3M17 12h3M4 17h3M17 17h3" /></>,
  TASK: <path d="M5 12.5l4.5 4.5L19 7" />,
  EPIC: <path d="M13 2L4 14h7l-1 8 9-12h-7z" fill="currentColor" stroke="none" />,
  SUBTASK: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M9 12h6" /></>,
};

export function TypeIcon({ type }: { type: IssueType }) {
  return (
    <span className={`stk ${TYPE_META[type].cls}`} title={TYPE_META[type].label}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {ICONS[type]}
      </svg>
    </span>
  );
}

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className="status" style={{ background: LANE_COLOR[status].head }}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  tone = '#FFD23F',
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  tone?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-head" style={{ background: tone }}>
          {title}
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export const Icon = {
  board: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="5" height="16" rx="1" /><rect x="10" y="4" width="5" height="10" rx="1" /><rect x="17" y="4" width="4" height="13" rx="1" />
    </svg>
  ),
  list: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M4 6h16M4 12h16M4 18h10" />
    </svg>
  ),
  pen: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20h4L19 9l-4-4L4 16z" />
    </svg>
  ),
  chart: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  ),
  retro: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><path d="M12 8v4l3 2" />
    </svg>
  ),
  book: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 19V5" />
    </svg>
  ),
  gear: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
    </svg>
  ),
  plus: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  close: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
  chevron: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  ),
};
