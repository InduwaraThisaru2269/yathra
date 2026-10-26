import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useEpics, useIssue, useMe, useMembers, usePlanning } from '../api/queries';
import type { IssueDetail, IssueEvent, LinkType, Priority, Project } from '../api/types';
import {
  canUse,
  fmtDate,
  nextMoves,
  PRIORITIES,
  PRIORITY_LABEL,
  STATUS_LABEL,
  STORY_POINTS,
  TYPE_META,
} from '../lib/workflow';
import { CommentText, MentionTextarea } from './Mentions';
import { useToast } from './Toast';
import { Avatar, Icon, StatusBadge, TypeIcon } from './ui';
import { useMoveWithPrompt } from './useMoveWithPrompt';

const LINK_LABEL: Record<LinkType, [string, string]> = {
  BLOCKS: ['blocks', 'is blocked by'],
  RELATES: ['relates to', 'relates to'],
  DUPLICATES: ['duplicates', 'is duplicated by'],
};

export function IssueDrawer({
  project,
  issueKey,
  onClose,
  onOpen,
}: {
  project: Project;
  issueKey: string;
  onClose: () => void;
  onOpen: (key: string) => void;
}) {
  const { data: issue, error } = useIssue(issueKey);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <aside className="drawer" aria-label={`Issue ${issueKey}`}>
      {!issue ? (
        <div className="dsec">
          <div className="row">
            <span className="key">{issueKey}</span>
            <button className="btn sm spacer" type="button" aria-label="Close" onClick={onClose}>
              {Icon.close}
            </button>
          </div>
          {error ? <p>{(error as Error).message}</p> : <p>Loading…</p>}
        </div>
      ) : (
        <IssueBody key={issue.id} project={project} issue={issue} onClose={onClose} onOpen={onOpen} />
      )}
    </aside>
  );
}

function IssueBody({ project, issue, onClose, onOpen }: { project: Project; issue: IssueDetail; onClose: () => void; onOpen: (key: string) => void }) {
  const p = usePlanning(project.key);
  const toast = useToast();
  const { data: me } = useMe();
  const { data: members = [] } = useMembers(project.key);
  const { data: epics = [] } = useEpics(project.key);
  const { move, prompt } = useMoveWithPrompt(project);

  const [title, setTitle] = useState(issue.title);
  const [desc, setDesc] = useState(issue.description ?? '');
  const [labels, setLabels] = useState(issue.labels.join(', '));
  const [comment, setComment] = useState('');
  const [subtask, setSubtask] = useState('');
  const [linkKey, setLinkKey] = useState('');
  const [linkType, setLinkType] = useState<LinkType>('RELATES');
  const [showHistory, setShowHistory] = useState(false);

  const save = (body: Record<string, unknown>, msg = 'Saved') =>
    p.updateIssue.mutate(
      { key: issue.key, version: issue.version, ...body },
      { onSuccess: () => toast.ok(msg, issue.key), onError: (e) => toast.error(e) },
    );

  const moves = nextMoves(project, issue.type, issue.status, issue.holdFromStatus);
  const canEpic = issue.type !== 'EPIC' && issue.type !== 'SUBTASK';

  return (
    <>
      <div className="drawer-head">
        <TypeIcon type={issue.type} />
        <span className="key">{issue.key}</span>
        <span className="pts">{issue.storyPoints ?? '–'} pts</span>
        <span className="spacer" />
        <button
          className="btn sm"
          type="button"
          onClick={() => {
            if (!confirm(`Delete ${issue.key}? This cannot be undone.`)) return;
            p.deleteIssue.mutate(issue.key, { onSuccess: () => { toast.ok('Deleted', issue.key); onClose(); }, onError: (e) => toast.error(e) });
          }}
        >
          Delete
        </button>
        <button className="btn sm" type="button" aria-label="Close issue" onClick={onClose}>
          {Icon.close}
        </button>
      </div>

      <div className="dsec" style={{ gap: 14 }}>
        {issue.parent && (
          <button type="button" className="mini" style={{ alignSelf: 'flex-start', cursor: 'pointer', background: '#EFE9FF' }} onClick={() => onOpen(issue.parent!.key)}>
            {issue.parent.key} · {issue.parent.title}
          </button>
        )}
        <input
          className="input"
          aria-label="Title"
          style={{ fontSize: 20, fontWeight: 700, minHeight: 48 }}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title.trim() !== issue.title && save({ title: title.trim() })}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        <div className="row wrap">
          <StatusBadge status={issue.status} />
          {moves.map((r) => (
            <button
              key={r.to + r.label}
              type="button"
              className="btn sm"
              disabled={!canUse(project, r)}
              title={canUse(project, r) ? `Move to ${STATUS_LABEL[r.to]}` : `Only ${r.roles.join(', ')}`}
              onClick={() => move(issue, r.to)}
            >
              {r.label} →
            </button>
          ))}
        </div>
        {issue.holdReason && <div className="hold-note">On hold: {issue.holdReason}</div>}

        <div className="grid2">
          <label className="field">
            Assignee
            <select className="select" value={issue.assignee?.id ?? ''} onChange={(e) => save({ assigneeId: e.target.value || null }, 'Assigned')}>
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.user.id} value={m.user.id}>
                  {m.user.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Story points
            <select className="select" value={issue.storyPoints ?? ''} onChange={(e) => save({ storyPoints: e.target.value === '' ? null : Number(e.target.value) })}>
              <option value="">Not estimated</option>
              {STORY_POINTS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Priority
            <select className="select" value={issue.priority} onChange={(e) => save({ priority: e.target.value as Priority })}>
              {PRIORITIES.map((pr) => (
                <option key={pr} value={pr}>
                  {PRIORITY_LABEL[pr]}
                </option>
              ))}
            </select>
          </label>
          {canEpic ? (
            <label className="field">
              Epic
              <select className="select" value={issue.parentId ?? ''} onChange={(e) => save({ parentId: e.target.value || null })}>
                <option value="">No epic</option>
                {epics.map((ep) => (
                  <option key={ep.id} value={ep.id}>
                    {ep.key} · {ep.title}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="field">
              Type
              <span style={{ fontWeight: 500 }}>{TYPE_META[issue.type].label}</span>
            </div>
          )}
          <label className="field" style={{ gridColumn: '1 / -1' }}>
            Labels (comma separated)
            <input
              className="input"
              value={labels}
              onChange={(e) => setLabels(e.target.value)}
              onBlur={() => {
                const next = labels.split(',').map((l) => l.trim()).filter(Boolean);
                if (next.join(',') !== issue.labels.join(',')) save({ labels: next });
              }}
            />
          </label>
        </div>
        <div className="row wrap muted" style={{ fontSize: 13 }}>
          <span>Sprint: {issue.sprint?.name ?? 'Backlog'}</span>·<span>Reporter: {issue.reporter.name}</span>·<span>Created {fmtDate(issue.createdAt)}</span>
          {issue.carryOverCount > 0 && <span>· Carried over {issue.carryOverCount}×</span>}
        </div>
      </div>

      <div className="dsec">
        <span className="label">Description and acceptance criteria</span>
        <textarea className="textarea" style={{ minHeight: 140 }} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Describe the story and list acceptance criteria. Lead review needs this." />
        {desc !== (issue.description ?? '') && (
          <div className="row">
            <button className="btn yellow sm" type="button" onClick={() => save({ description: desc || null })}>
              Save description
            </button>
            <button className="btn sm" type="button" onClick={() => setDesc(issue.description ?? '')}>
              Cancel
            </button>
          </div>
        )}
      </div>

      {(issue.type === 'EPIC' || canEpic) && (
        <div className="dsec">
          <span className="label">{issue.type === 'EPIC' ? `Issues in this epic · ${issue.children.length}` : `Sub-tasks · ${issue.children.length}`}</span>
          {issue.children.map((c) => (
            <button key={c.id} type="button" className="row" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left' }} onClick={() => onOpen(c.key)}>
              <TypeIcon type={c.type} />
              <span className="key">{c.key}</span>
              <span style={{ flex: 1, fontWeight: 600 }}>{c.title}</span>
              <StatusBadge status={c.status} />
            </button>
          ))}
          {canEpic && (
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                if (!subtask.trim()) return;
                p.createIssue.mutate(
                  { type: 'SUBTASK', title: subtask.trim(), parentId: issue.id },
                  { onSuccess: (c) => { setSubtask(''); toast.ok('Created', c.key); }, onError: (er) => toast.error(er) },
                );
              }}
            >
              <input className="input" placeholder="Add a sub-task" aria-label="New sub-task title" value={subtask} onChange={(e) => setSubtask(e.target.value)} />
              <button className="btn sm" type="submit">
                Add
              </button>
            </form>
          )}
        </div>
      )}

      {issue.wikiPages.length > 0 && (
        <div className="dsec">
          <span className="label">Wiki pages · {issue.wikiPages.length}</span>
          {issue.wikiPages.map((w) => (
            <Link key={w.id} to={`/p/${project.key}/wiki/${w.id}`} className="row" style={{ fontWeight: 600, textDecoration: 'none', color: 'inherit' }}>
              <span className="stk" style={{ background: '#FFD23F' }}>{Icon.book}</span>
              {w.title}
            </Link>
          ))}
        </div>
      )}

      <div className="dsec">
        <span className="label">Links</span>
        {issue.linksOut.map((l) => (
          <LinkRow key={l.id} text={LINK_LABEL[l.type][0]} other={l.toIssue} onOpen={onOpen} onRemove={() => p.removeLink.mutate({ key: issue.key, id: l.id })} />
        ))}
        {issue.linksIn.map((l) => (
          <LinkRow key={l.id} text={LINK_LABEL[l.type][1]} other={l.fromIssue} onOpen={onOpen} onRemove={() => p.removeLink.mutate({ key: issue.key, id: l.id })} />
        ))}
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!linkKey.trim()) return;
            p.addLink.mutate(
              { key: issue.key, toKey: linkKey.trim(), type: linkType },
              { onSuccess: () => setLinkKey(''), onError: (er) => toast.error(er) },
            );
          }}
        >
          <select className="select" style={{ width: 150 }} aria-label="Link type" value={linkType} onChange={(e) => setLinkType(e.target.value as LinkType)}>
            <option value="BLOCKS">blocks</option>
            <option value="RELATES">relates to</option>
            <option value="DUPLICATES">duplicates</option>
          </select>
          <input className="input" placeholder={`${project.key}-123`} aria-label="Issue key to link" value={linkKey} onChange={(e) => setLinkKey(e.target.value)} />
          <button className="btn sm" type="submit">
            Link
          </button>
        </form>
      </div>

      <div className="dsec">
        <span className="label">Comments · {issue.comments.length}</span>
        {issue.comments.map((c) => (
          <div key={c.id} className="row" style={{ alignItems: 'flex-start' }}>
            <Avatar user={c.author} />
            <div className="bubble">
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 2 }}>
                {c.author.name} <span className="muted" style={{ fontWeight: 500 }}>· {new Date(c.createdAt).toLocaleString()}</span>
                {c.author.id === me?.id && (
                  <button type="button" className="btn ghost sm" style={{ minHeight: 0, padding: '0 6px', float: 'right' }} onClick={() => p.deleteComment.mutate({ key: issue.key, id: c.id })}>
                    Delete
                  </button>
                )}
              </div>
              <CommentText text={c.body} />
            </div>
          </div>
        ))}
        <MentionTextarea
          ariaLabel="Add a comment"
          placeholder="Add a comment. Type @ to mention someone."
          value={comment}
          onChange={setComment}
          members={members}
        />
        <div className="row">
          <button
            className="btn yellow spacer"
            type="button"
            disabled={!comment.trim()}
            onClick={() => p.addComment.mutate({ key: issue.key, body: comment.trim() }, { onSuccess: () => setComment(''), onError: (er) => toast.error(er) })}
          >
            Post comment
          </button>
        </div>
      </div>

      <div className="dsec" style={{ borderBottom: 0 }}>
        <button type="button" className="btn ghost sm" style={{ alignSelf: 'flex-start', padding: 0 }} onClick={() => setShowHistory(!showHistory)}>
          {showHistory ? 'Hide history' : `Show history (${issue.events.length})`}
        </button>
        {showHistory && issue.events.map((e) => <div key={e.id} className="event">{describeEvent(e)}</div>)}
      </div>
      {prompt}
    </>
  );
}

function LinkRow({ text, other, onOpen, onRemove }: { text: string; other: { key: string; title: string; status: IssueDetail['status']; type: IssueDetail['type'] }; onOpen: (k: string) => void; onRemove: () => void }) {
  return (
    <div className="row">
      <span className="muted" style={{ width: 110, fontSize: 13 }}>{text}</span>
      <button type="button" className="row" style={{ flex: 1, background: 'none', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left' }} onClick={() => onOpen(other.key)}>
        <TypeIcon type={other.type} />
        <span className="key">{other.key}</span>
        <span style={{ fontWeight: 600 }}>{other.title}</span>
      </button>
      <StatusBadge status={other.status} />
      <button type="button" className="btn ghost sm" aria-label={`Remove link to ${other.key}`} onClick={onRemove}>
        {Icon.close}
      </button>
    </div>
  );
}

function describeEvent(e: IssueEvent) {
  const who = e.actor?.name ?? 'System';
  const when = new Date(e.createdAt).toLocaleString();
  const label = (v: string | null) => (v && v in STATUS_LABEL ? STATUS_LABEL[v as keyof typeof STATUS_LABEL] : v ?? 'none');
  switch (e.field) {
    case 'created':
      return `${when} · ${who} created the issue in ${label(e.toValue)}`;
    case 'status':
      return `${when} · ${who} moved it ${label(e.fromValue)} → ${label(e.toValue)}`;
    case 'sprint':
      return `${when} · ${who} ${e.toValue ? 'moved it into a sprint' : 'moved it to the backlog'}`;
    case 'description':
      return `${when} · ${who} edited the description`;
    case 'holdReason':
      return `${when} · ${who} put it on hold: ${e.toValue}`;
    case 'assigneeId':
      return `${when} · ${who} ${e.toValue ? 'changed the assignee' : 'unassigned it'}`;
    case 'parentId':
      return `${when} · ${who} ${e.toValue ? 'changed the epic' : 'removed it from its epic'}`;
    default:
      return `${when} · ${who} changed ${e.field} from ${e.fromValue ?? 'none'} to ${e.toValue ?? 'none'}`;
  }
}
