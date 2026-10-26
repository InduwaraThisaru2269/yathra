import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMembers } from '../api/queries';
import { useRetroActions, useRetroBoard, useRetroSprints } from '../api/retro';
import type { Project, RetroBoard, RetroColumn, RetroItem } from '../api/types';
import { useCurrentProject, useIssueParam } from '../components/AppShell';
import { useToast } from '../components/Toast';
import { Avatar, Icon, Modal, StatusBadge } from '../components/ui';
import { fmtDate } from '../lib/workflow';

const COLUMNS: { id: RetroColumn; title: string; prompt: string; head: string; body: string }[] = [
  { id: 'WENT_WELL', title: 'Went well', prompt: 'What helped us this sprint?', head: '#2EE59D', body: '#DDFBEF' },
  { id: 'TO_IMPROVE', title: 'To improve', prompt: 'What slowed us down?', head: '#FF6B6B', body: '#FFE3E3' },
  { id: 'ACTION', title: 'Actions', prompt: 'What will we change next sprint?', head: '#FFD23F', body: '#FFF6D1' },
];

export function RetroPage() {
  const project = useCurrentProject();
  const { sprintId } = useParams();
  const navigate = useNavigate();
  const { data: sprints, isLoading } = useRetroSprints(project.key);

  // Default to the most recent sprint that has finished or is running.
  useEffect(() => {
    if (!sprintId && sprints?.length) navigate(`/p/${project.key}/retro/${sprints[0]!.id}`, { replace: true });
  }, [sprintId, sprints, navigate, project.key]);

  if (isLoading) return <div>Loading…</div>;
  if (!sprints?.length) {
    return (
      <>
        <div className="page-head"><h1>Retro</h1></div>
        <div className="panel" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
          <h2 style={{ margin: 0 }}>Retros open once a sprint starts</h2>
          <p className="muted" style={{ margin: 0 }}>Start a sprint from the backlog. Its retro board appears here, and opens automatically when you complete the sprint.</p>
          <Link className="btn yellow" to={`/p/${project.key}/backlog`}>Go to the backlog</Link>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="muted" style={{ fontWeight: 600 }}>{project.name}</div>
          <h1>Retro</h1>
        </div>
        <label className="row spacer" style={{ fontWeight: 600 }}>
          Sprint
          <select className="select" style={{ width: 260 }} value={sprintId ?? ''} onChange={(e) => navigate(`/p/${project.key}/retro/${e.target.value}`)}>
            {sprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.retroStatus === 'OPEN' ? `${s.noteCount} notes` : s.retroStatus === 'CLOSED' ? 'closed' : 'not started'}
                {s.state === 'ACTIVE' ? ' (active)' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
      {sprintId && <RetroBoardView key={sprintId} project={project} sprintId={sprintId} />}
    </>
  );
}

function RetroBoardView({ project, sprintId }: { project: Project; sprintId: string }) {
  const { data, error } = useRetroBoard(sprintId);
  const actions = useRetroActions(project.key, sprintId);
  const toast = useToast();
  const [ticketFor, setTicketFor] = useState<RetroItem | null>(null);

  if (error) return <div className="panel" style={{ padding: 24 }}>{(error as Error).message}</div>;
  if (!data) return <div>Loading retro…</div>;

  const closed = !!data.retro.closedAt;
  const s = data.sprint;
  const notes = data.items.length;
  const actionItems = data.items.filter((i) => i.column === 'ACTION');
  const ticketed = actionItems.filter((i) => i.issue).length;

  return (
    <>
      <section className="panel sprint-head" aria-label={`${s.name} retro`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: '1 1 320px', minWidth: 0 }}>
          <span className="label">
            {s.state === 'ACTIVE' ? 'Active sprint' : 'Completed sprint'} · {fmtDate(s.startDate)} – {fmtDate(s.endDate)}
          </span>
          <h2 style={{ margin: 0, fontSize: 26, letterSpacing: '-0.02em' }}>{s.name} retro</h2>
          {s.goal && <div style={{ fontWeight: 500 }}>Goal: {s.goal}</div>}
          {s.completedPoints !== null && (
            <div className="muted" style={{ fontSize: 13 }}>
              Delivered {s.completedPoints} of {s.committedPoints ?? 0} committed points
            </div>
          )}
        </div>
        <div className="row wrap">
          <span className="mini" style={{ height: 28, background: closed ? '#E6E6E2' : '#2EE59D' }}>{closed ? 'Closed' : 'Open'}</span>
          <span className="mini" style={{ height: 28 }} title="Dot voting: spread your votes across the notes that matter most">
            {data.votesLeft} of {data.votesPerPerson} votes left
          </span>
          <span className="mini" style={{ height: 28 }}>{notes} notes · {ticketed}/{actionItems.length} actions ticketed</span>
          {data.canManage &&
            (closed ? (
              <button className="btn sm" type="button" onClick={() => actions.reopen.mutate(undefined, { onError: (e) => toast.error(e) })}>Reopen</button>
            ) : (
              <button
                className="btn sm yellow"
                type="button"
                onClick={() => {
                  const missing = actionItems.length - ticketed;
                  if (missing && !confirm(`${missing} action${missing > 1 ? 's have' : ' has'} no ticket yet. Close the retro anyway?`)) return;
                  actions.close.mutate(undefined, { onSuccess: () => toast.ok('Closed', `${s.name} retro`), onError: (e) => toast.error(e) });
                }}
              >
                Close retro
              </button>
            ))}
        </div>
      </section>

      {data.previousActions && <PreviousActions board={data} />}

      <div className="retro-cols">
        {COLUMNS.map((c) => (
          <RetroColumnView
            key={c.id}
            column={c}
            items={data.items.filter((i) => i.column === c.id)}
            closed={closed}
            sprintId={sprintId}
            project={project}
            onTicket={setTicketFor}
          />
        ))}
      </div>

      {ticketFor && (
        <TicketModal project={project} sprintId={sprintId} item={ticketFor} nextSprint={data.nextSprint} onClose={() => setTicketFor(null)} />
      )}
    </>
  );
}

function PreviousActions({ board }: { board: RetroBoard }) {
  const [, openIssue] = useIssueParam();
  const prev = board.previousActions!;
  const done = prev.items.filter((i) => i.issue?.status === 'DONE').length;
  return (
    <section className="panel" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }} aria-label="Actions from the last retro">
      <div className="row wrap">
        <span className="label">From the {prev.sprintName} retro</span>
        <span className="muted" style={{ fontSize: 13 }}>{done} of {prev.items.length} actions done. Start by checking these.</span>
      </div>
      {prev.items.map((i) => (
        <div key={i.id} className="row wrap">
          <span style={{ flex: '1 1 260px', fontWeight: 600 }}>{i.text}</span>
          {i.issue ? (
            <button type="button" className="row" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }} onClick={() => openIssue(i.issue!.key)}>
              <span className="key">{i.issue.key}</span>
              <StatusBadge status={i.issue.status} />
            </button>
          ) : (
            <span className="mini">No ticket</span>
          )}
        </div>
      ))}
    </section>
  );
}

function RetroColumnView({
  column,
  items,
  closed,
  sprintId,
  project,
  onTicket,
}: {
  column: (typeof COLUMNS)[number];
  items: RetroItem[];
  closed: boolean;
  sprintId: string;
  project: Project;
  onTicket: (item: RetroItem) => void;
}) {
  const actions = useRetroActions(project.key, sprintId);
  const toast = useToast();
  const [text, setText] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [sort, setSort] = useState<'votes' | 'newest'>('votes');
  const sorted = useMemo(
    () =>
      [...items].sort((a, b) =>
        sort === 'votes' ? b.votes - a.votes || a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt),
      ),
    [items, sort],
  );

  const add = () => {
    if (!text.trim()) return;
    actions.add.mutate(
      { column: column.id, text: text.trim(), anonymous },
      { onSuccess: () => setText(''), onError: (e) => toast.error(e) },
    );
  };

  return (
    <section className="retro-col" style={{ background: column.body }} aria-label={column.title}>
      <div className="lane-head" style={{ background: column.head }}>
        {column.title}
        <span className="n">{items.length}</span>
        <button type="button" className="spacer btn ghost sm" style={{ minHeight: 24, padding: '0 4px', fontSize: 12 }} onClick={() => setSort(sort === 'votes' ? 'newest' : 'votes')}>
          {sort === 'votes' ? 'Top voted' : 'Newest'}
        </button>
      </div>

      {!closed && (
        <div className="retro-add">
          <textarea
            className="textarea"
            style={{ minHeight: 64 }}
            placeholder={column.prompt}
            aria-label={`Add to ${column.title}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                add();
              }
            }}
          />
          <div className="row">
            <label className="row" style={{ fontSize: 13, fontWeight: 600, gap: 6 }}>
              <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
              Anonymous
            </label>
            <button className="btn sm spacer" type="button" disabled={!text.trim() || actions.add.isPending} onClick={add}>Add</button>
          </div>
        </div>
      )}

      {sorted.map((item) => (
        <RetroNote key={item.id} item={item} closed={closed} project={project} sprintId={sprintId} isAction={column.id === 'ACTION'} onTicket={onTicket} />
      ))}
      {!items.length && <div className="empty">{closed ? 'No notes.' : 'Nothing yet. Be the first.'}</div>}
    </section>
  );
}

function RetroNote({ item, closed, project, sprintId, isAction, onTicket }: { item: RetroItem; closed: boolean; project: Project; sprintId: string; isAction: boolean; onTicket: (item: RetroItem) => void }) {
  const actions = useRetroActions(project.key, sprintId);
  const toast = useToast();
  const [, openIssue] = useIssueParam();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);

  return (
    <article className="retro-note">
      {editing ? (
        <>
          <textarea className="textarea" style={{ minHeight: 60 }} aria-label="Edit note" value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
          <div className="row">
            <button className="btn sm" type="button" onClick={() => { setEditing(false); setDraft(item.text); }}>Cancel</button>
            <button
              className="btn sm yellow spacer"
              type="button"
              disabled={!draft.trim()}
              onClick={() => actions.edit.mutate({ id: item.id, text: draft.trim() }, { onSuccess: () => setEditing(false), onError: (e) => toast.error(e) })}
            >
              Save
            </button>
          </div>
        </>
      ) : (
        <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{item.text}</p>
      )}

      {item.issue && (
        <button type="button" className="row" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }} onClick={() => openIssue(item.issue!.key)}>
          <span className="key">{item.issue.key}</span>
          <StatusBadge status={item.issue.status} />
        </button>
      )}

      <div className="row wrap" style={{ gap: 6 }}>
        <button
          type="button"
          className={item.voted ? 'react on' : 'react'}
          style={{ minHeight: 32, padding: '0 10px', border: '2px solid #121212', borderRadius: 999, background: item.voted ? '#FFD23F' : '#FFFFFF', fontWeight: 700, cursor: closed ? 'default' : 'pointer' }}
          aria-pressed={item.voted}
          aria-label={item.voted ? 'Remove your vote' : 'Vote for this note'}
          disabled={closed}
          onClick={() => actions.vote.mutate(item.id, { onError: (e) => toast.error(e) })}
        >
          ▲ {item.votes}
        </button>
        <span className="row muted" style={{ fontSize: 12, gap: 6 }}>
          {item.author ? <Avatar user={item.author} size={20} /> : null}
          {item.anonymous ? (item.mine ? 'Anonymous (you)' : 'Anonymous') : item.author?.name}
        </span>
        <span className="spacer row" style={{ gap: 4 }}>
          {isAction && !item.issue && (
            <button className="btn sm mint" type="button" style={{ minHeight: 30 }} onClick={() => onTicket(item)}>Create ticket</button>
          )}
          {item.mine && !closed && !editing && (
            <button className="btn ghost sm" type="button" style={{ minHeight: 30 }} onClick={() => setEditing(true)}>Edit</button>
          )}
          {item.mine && !closed && (
            <button
              className="btn ghost sm"
              type="button"
              style={{ minHeight: 30 }}
              aria-label="Delete note"
              onClick={() => confirm('Delete this note?') && actions.remove.mutate(item.id, { onError: (e) => toast.error(e) })}
            >
              {Icon.close}
            </button>
          )}
        </span>
      </div>
    </article>
  );
}

function TicketModal({ project, sprintId, item, nextSprint, onClose }: { project: Project; sprintId: string; item: RetroItem; nextSprint: RetroBoard['nextSprint']; onClose: () => void }) {
  const actions = useRetroActions(project.key, sprintId);
  const { data: members = [] } = useMembers(project.key);
  const toast = useToast();
  const [, openIssue] = useIssueParam();
  const [destination, setDestination] = useState<'NEXT_SPRINT' | 'BACKLOG'>(nextSprint ? 'NEXT_SPRINT' : 'BACKLOG');
  const [assigneeId, setAssigneeId] = useState('');

  return (
    <Modal
      title="Turn this action into a ticket"
      tone="#2EE59D"
      onClose={onClose}
      footer={
        <>
          <button className="btn" type="button" onClick={onClose}>Cancel</button>
          <button
            className="btn mint"
            type="button"
            disabled={actions.toTicket.isPending}
            onClick={() =>
              actions.toTicket.mutate(
                { id: item.id, destination, assigneeId: assigneeId || undefined },
                {
                  onSuccess: (issue) => {
                    toast.ok('Created', `${issue.key} · ${destination === 'NEXT_SPRINT' ? nextSprint?.name : 'Backlog'}`);
                    onClose();
                    openIssue(issue.key);
                  },
                  onError: (e) => toast.error(e),
                },
              )
            }
          >
            Create ticket
          </button>
        </>
      }
    >
      <blockquote className="hold-note" style={{ margin: 0, background: '#FFF6D1' }}>{item.text}</blockquote>
      <div className="muted" style={{ fontSize: 13 }}>It becomes a task labelled retro-action, so the team can track it like any other work.</div>
      <div style={{ fontWeight: 700 }}>Plan it into</div>
      <label className={destination === 'NEXT_SPRINT' ? 'radio on' : 'radio'} style={!nextSprint ? { opacity: 0.5 } : undefined}>
        <input type="radio" name="dest" disabled={!nextSprint} checked={destination === 'NEXT_SPRINT'} onChange={() => setDestination('NEXT_SPRINT')} />
        {nextSprint ? `${nextSprint.name} (next sprint)` : 'Next sprint (none planned yet)'}
      </label>
      <label className={destination === 'BACKLOG' ? 'radio on' : 'radio'}>
        <input type="radio" name="dest" checked={destination === 'BACKLOG'} onChange={() => setDestination('BACKLOG')} />
        Backlog
      </label>
      <label className="field">
        Owner
        <select className="select" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
          <option value="">Unassigned</option>
          {members.map((m) => (
            <option key={m.user.id} value={m.user.id}>{m.user.name}</option>
          ))}
        </select>
      </label>
    </Modal>
  );
}
