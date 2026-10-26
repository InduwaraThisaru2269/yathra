import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useNotificationActions, useNotificationList, useNotificationSettings, useUnreadCount } from '../api/notifications';
import type { AppNotification, NotificationType } from '../api/types';
import { useToast } from './Toast';
import { Avatar, Modal } from './ui';

export const NOTIFICATION_LABEL: Record<NotificationType, { label: string; hint: string; color: string }> = {
  ASSIGNED: { label: 'Assigned to you', hint: 'Someone assigns you an issue', color: '#8EC5FF' },
  MENTIONED: { label: 'Mentions', hint: 'Someone @mentions you in a comment', color: '#B69CFF' },
  COMMENTED: { label: 'Comments', hint: 'New comments on issues you reported or own', color: '#FFFFFF' },
  LEAD_REVIEW_REQUESTED: { label: 'Lead review requests', hint: 'A story is ready for review (Leads)', color: '#B69CFF' },
  RETURNED_TO_BA: { label: 'Returned to BA', hint: 'A Lead sends your story back', color: '#FF6B6B' },
  READY_FOR_QA: { label: 'Ready for QA', hint: 'Work reaches QA To Do (QAs)', color: '#FFD23F' },
  QA_FAILED: { label: 'Failed QA', hint: 'QA sends your work back to Dev', color: '#FF6B6B' },
  ISSUE_DONE: { label: 'Done', hint: 'Your issue passes QA', color: '#2EE59D' },
  ADDED_TO_PROJECT: { label: 'Added to a project', hint: 'A PM adds you to a project', color: '#FFD23F' },
  SPRINT_STARTED: { label: 'Sprint started', hint: 'A sprint starts in your project', color: '#8EC5FF' },
  SPRINT_COMPLETED: { label: 'Sprint completed', hint: 'A sprint ends and its retro opens', color: '#FF9F1C' },
};

const ago = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
};

/** Bell with unread badge; opens the notification panel. */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  const [params, setParams] = useSearchParams();
  const { data } = useUnreadCount();
  const count = data?.unreadCount ?? 0;
  const ref = useRef<HTMLDivElement>(null);

  // The settings link in notification emails lands here.
  useEffect(() => {
    if (params.get('notifications') === 'settings') {
      setSettings(true);
      const next = new URLSearchParams(params);
      next.delete('notifications');
      setParams(next, { replace: true });
    }
  }, [params, setParams]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div className="notif-wrap" ref={ref}>
      <button
        type="button"
        className="nav"
        style={{ width: '100%', background: open ? '#F3F3F7' : undefined, cursor: 'pointer' }}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(!open)}
      >
        <span className="ni" style={{ background: count ? '#FFD23F' : '#FFFFFF' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" />
          </svg>
        </span>
        Notifications
        {count > 0 && (
          <span className="notif-badge" aria-label={`${count} unread`}>
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>
      {open && <NotificationPanel onClose={() => setOpen(false)} onSettings={() => { setOpen(false); setSettings(true); }} />}
      {settings && <NotificationSettingsModal onClose={() => setSettings(false)} />}
    </div>
  );
}

function NotificationPanel({ onClose, onSettings }: { onClose: () => void; onSettings: () => void }) {
  const { data, isLoading } = useNotificationList(true);
  const { read, readAll } = useNotificationActions();
  const navigate = useNavigate();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const items = (data?.items ?? []).filter((n) => !unreadOnly || !n.readAt);

  const open = (n: AppNotification) => {
    if (!n.readAt) read.mutate(n.id);
    onClose();
    navigate(n.link);
  };

  return (
    <div className="notif-panel" role="dialog" aria-label="Notifications">
      <div className="notif-head">
        <b style={{ fontSize: 16 }}>Notifications</b>
        <span className="spacer row" style={{ gap: 6 }}>
          <button type="button" className={unreadOnly ? 'chip on' : 'chip'} style={{ minHeight: 28, fontSize: 12 }} onClick={() => setUnreadOnly(!unreadOnly)}>
            Unread
          </button>
          <button type="button" className="btn ghost sm" disabled={!data?.unreadCount} onClick={() => readAll.mutate()}>Mark all read</button>
        </span>
      </div>
      <div className="notif-list">
        {isLoading && <div className="empty">Loading…</div>}
        {!isLoading && !items.length && <div className="empty">{unreadOnly ? "You're all caught up." : 'No notifications yet.'}</div>}
        {items.map((n) => (
          <button key={n.id} type="button" className={`notif-item${n.readAt ? '' : ' unread'}`} onClick={() => open(n)}>
            {n.actor ? <Avatar user={n.actor} size={30} /> : <span className="av" style={{ width: 30, height: 30, background: '#FFD23F' }}>Y</span>}
            <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flex: 1, textAlign: 'left' }}>
              <span className="row" style={{ gap: 6 }}>
                <span className="mini" style={{ background: NOTIFICATION_LABEL[n.type].color, height: 20, fontSize: 11 }}>{NOTIFICATION_LABEL[n.type].label}</span>
                {n.project && <span className="key" style={{ fontSize: 11 }}>{n.project.key}</span>}
                <span className="spacer muted" style={{ fontSize: 12 }}>{ago(n.createdAt)}</span>
              </span>
              <span style={{ fontWeight: n.readAt ? 500 : 700, lineHeight: 1.35 }}>{n.title}</span>
              {n.body && <span className="muted notif-body">{n.body}</span>}
            </span>
          </button>
        ))}
      </div>
      <div className="notif-foot">
        <button type="button" className="btn ghost sm" onClick={onSettings}>Email settings</button>
      </div>
    </div>
  );
}

export function NotificationSettingsModal({ onClose }: { onClose: () => void }) {
  const { data } = useNotificationSettings(true);
  const { saveSettings } = useNotificationActions();
  const toast = useToast();
  const [emailFor, setEmailFor] = useState<NotificationType[] | null>(null);
  const selected = emailFor ?? data?.emailFor ?? [];

  return (
    <Modal
      title="Email notifications"
      onClose={onClose}
      footer={
        <>
          <button className="btn" type="button" onClick={onClose}>Cancel</button>
          <button
            className="btn yellow"
            type="button"
            disabled={!data || saveSettings.isPending}
            onClick={() => saveSettings.mutate(selected, { onSuccess: () => { toast.ok('Saved', 'Email settings'); onClose(); }, onError: (e) => toast.error(e) })}
          >
            Save
          </button>
        </>
      }
    >
      <p className="muted" style={{ margin: 0 }}>You always see every notification in Yathra. Choose which ones also come by email.</p>
      {!data ? (
        <div>Loading…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {data.allTypes.map((t) => {
            const on = selected.includes(t);
            return (
              <label key={t} className={on ? 'radio on' : 'radio'} style={{ minHeight: 0, padding: '8px 12px', alignItems: 'flex-start' }}>
                <input
                  type="checkbox"
                  checked={on}
                  style={{ marginTop: 3, accentColor: '#121212' }}
                  onChange={() => setEmailFor(on ? selected.filter((x) => x !== t) : [...selected, t])}
                />
                <span style={{ display: 'flex', flexDirection: 'column' }}>
                  {NOTIFICATION_LABEL[t].label}
                  <span className="muted" style={{ fontSize: 12, fontWeight: 500 }}>{NOTIFICATION_LABEL[t].hint}</span>
                </span>
              </label>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
