import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBacklog, useMe, usePlanning } from '../api/queries';
import type { IssueCard, Sprint } from '../api/types';
import { useCurrentProject, useIssueParam } from '../components/AppShell';
import { CreateIssueModal } from '../components/CreateIssueModal';
import { CompleteSprintModal, EditSprintModal, StartSprintModal } from '../components/SprintModals';
import { useToast } from '../components/Toast';
import { Avatar, Icon, StatusBadge, TypeIcon } from '../components/ui';
import { canPlan, fmtDate } from '../lib/workflow';

type SectionId = string | 'backlog';

export function BacklogPage() {
  const project = useCurrentProject();
  const { data, isLoading } = useBacklog(project.key);
  const { data: me } = useMe();
  const p = usePlanning(project.key);
  const toast = useToast();
  const [, openIssue] = useIssueParam();
  const navigate = useNavigate();

  const [q, setQ] = useState('');
  const [mine, setMine] = useState(false);
  const [epic, setEpic] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [dragging, setDragging] = useState<IssueCard | null>(null);
  const [dropSection, setDropSection] = useState<SectionId | null>(null);
  const [dropBefore, setDropBefore] = useState<string | null>(null);
  const [creatingIn, setCreatingIn] = useState<SectionId | null>(null);
  const [starting, setStarting] = useState<Sprint | null>(null);
  const [completing, setCompleting] = useState<Sprint | null>(null);
  const [editing, setEditing] = useState<Sprint | null>(null);
  const [quickTitle, setQuickTitle] = useState('');

  if (isLoading || !data) return <div>Loading backlog…</div>;

  const planner = canPlan(project);
  const match = (i: IssueCard) =>
    (!q || `${i.key} ${i.title}`.toLowerCase().includes(q.toLowerCase())) &&
    (!mine || i.assignee?.id === me?.id) &&
    (!epic || i.parentId === epic);
  const activeSprint = data.sprints.find((s) => s.state === 'ACTIVE');
  const planned = data.sprints.filter((s) => s.state === 'PLANNED');

  const drop = (section: SectionId, beforeId?: string) => {
    if (!dragging) return;
    const sprintId = section === 'backlog' ? null : section;
    const issue = dragging;
    setDragging(null);
    setDropSection(null);
    setDropBefore(null);
    if (beforeId === issue.id) return;
    p.move.mutate(
      { key: issue.key, sprintId, beforeId },
      {
        onSuccess: () => sprintId !== issue.sprintId && toast.ok('Moved', `${issue.key} → ${sprintId ? data.sprints.find((s) => s.id === sprintId)?.name : 'Backlog'}`),
        onError: (e) => toast.error(e),
      },
    );
  };

  const quickCreate = (section: SectionId) => {
    if (!quickTitle.trim()) return setCreatingIn(null);
    p.createIssue.mutate(
      { type: 'TASK', title: quickTitle.trim(), sprintId: section === 'backlog' ? undefined : section },
      { onSuccess: (i) => { toast.ok('Created', i.key); setQuickTitle(''); setCreatingIn(null); }, onError: (e) => toast.error(e) },
    );
  };

  const rows = (section: SectionId, issues: IssueCard[]) => (
    <>
      {issues.filter(match).map((i) => (
        <div
          key={i.id}
          className={`irow${dropBefore === i.id ? ' drop-before' : ''}`}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move';
            setDragging(i);
          }}
          onDragEnd={() => {
            setDragging(null);
            setDropBefore(null);
            setDropSection(null);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDropSection(section);
            if (dropBefore !== i.id) setDropBefore(i.id);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            drop(section, i.id);
          }}
          style={dragging?.id === i.id ? { opacity: 0.45 } : undefined}
        >
          <TypeIcon type={i.type} />
          <span className="key" style={{ minWidth: 64 }}>{i.key}</span>
          <button type="button" className="title" onClick={() => openIssue(i.key)}>
            {i.title}
          </button>
          {i.parent && <span className="mini" style={{ background: '#EFE9FF' }}>{i.parent.key}</span>}
          {i.carryOverCount > 0 && <span className="mini">↻ {i.carryOverCount}</span>}
          <StatusBadge status={i.status} />
          <span className="pts" style={i.storyPoints === null ? { borderStyle: 'dashed' } : undefined}>{i.storyPoints ?? '?'} pts</span>
          <Avatar user={i.assignee} />
        </div>
      ))}
      {creatingIn === section ? (
        <div style={{ padding: '10px 16px' }}>
          <input
            className="input"
            autoFocus
            placeholder="Task summary, then Enter (use Create for stories and bugs)"
            aria-label="New task summary"
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') quickCreate(section);
              if (e.key === 'Escape') setCreatingIn(null);
            }}
            onBlur={() => !quickTitle && setCreatingIn(null)}
          />
        </div>
      ) : (
        <button type="button" className="btn ghost" style={{ margin: '6px 10px', alignSelf: 'flex-start' }} onClick={() => setCreatingIn(section)}>
          {Icon.plus}Create issue
        </button>
      )}
    </>
  );

  const counts = (issues: IssueCard[]) => ({
    todo: issues.filter((i) => ['TO_GROOM', 'DEV_TODO'].includes(i.status)).length,
    prog: issues.filter((i) => !['TO_GROOM', 'DEV_TODO', 'DONE'].includes(i.status)).length,
    done: issues.filter((i) => i.status === 'DONE').length,
  });

  const sectionProps = (id: SectionId) => ({
    className: `section${dropSection === id ? ' drop' : ''}`,
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setDropSection(id);
      setDropBefore(null);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      drop(id);
    },
  });

  return (
    <>
      <div className="page-head">
        <div>
          <div className="muted" style={{ fontWeight: 600 }}>{project.name}</div>
          <h1>Backlog</h1>
        </div>
        <span className="spacer" />
        {planner && (
          <button className="btn yellow" type="button" onClick={() => p.createSprint.mutate({}, { onSuccess: (s) => toast.ok('Created', s.name), onError: (e) => toast.error(e) })}>
            Create sprint
          </button>
        )}
        <button className="btn primary" type="button" onClick={() => setCreatingIn('modal')}>
          {Icon.plus}Create
        </button>
      </div>

      <div className="row wrap">
        <input className="input" style={{ maxWidth: 280 }} placeholder="Search backlog" aria-label="Search backlog" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" className={mine ? 'chip on' : 'chip'} aria-pressed={mine} onClick={() => setMine(!mine)}>
          Only my issues
        </button>
        {epic && (
          <button type="button" className="chip on" onClick={() => setEpic(null)}>
            Epic filter on · clear
          </button>
        )}
      </div>

      <div className="row wrap" style={{ alignItems: 'flex-start', gap: 20 }}>
        <aside className="panel epics" aria-label="Epics">
          <div className="label" style={{ padding: '4px 6px' }}>Epics</div>
          <button type="button" className={epic ? 'ep' : 'ep on'} onClick={() => setEpic(null)}>
            <span style={{ fontWeight: 700 }}>All issues</span>
          </button>
          {data.epics.map((e) => {
            const pct = e.issueCount ? Math.round((e.doneCount / e.issueCount) * 100) : 0;
            return (
              <button key={e.id} type="button" className={epic === e.id ? 'ep on' : 'ep'} aria-pressed={epic === e.id} onClick={() => setEpic(epic === e.id ? null : e.id)}>
                <span className="row">
                  <span className="key">{e.key}</span>
                  <span className="spacer mono" style={{ fontSize: 12 }}>{pct}%</span>
                </span>
                <span style={{ fontWeight: 600 }}>{e.title}</span>
                <span className="epbar"><div style={{ width: `${pct}%` }} /></span>
                <span className="muted" style={{ fontSize: 12 }}>{e.issueCount} issues · {e.points} pts</span>
              </button>
            );
          })}
          {!data.epics.length && <div className="muted" style={{ fontSize: 13, padding: 6 }}>No epics yet. Create one to group stories.</div>}
        </aside>

        <div style={{ flex: '999 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {data.sprints.map((s) => {
            const c = counts(s.issues);
            const pts = s.issues.reduce((sum, i) => sum + (i.storyPoints ?? 0), 0);
            const open = !collapsed[s.id];
            return (
              <section key={s.id} {...sectionProps(s.id)} aria-label={s.name}>
                <div className="section-head" style={{ background: s.state === 'ACTIVE' ? '#E3EFFF' : '#FFF6D1' }}>
                  <button type="button" className="btn sm" aria-expanded={open} aria-label={`Show or hide ${s.name}`} onClick={() => setCollapsed({ ...collapsed, [s.id]: open })}>
                    <span style={{ display: 'inline-flex', transform: open ? 'rotate(90deg)' : undefined }}>{Icon.chevron}</span>
                  </button>
                  <div>
                    <div className="row">
                      <h2>{s.name}</h2>
                      {s.state === 'ACTIVE' && <span className="mini" style={{ background: '#8EC5FF' }}>ACTIVE</span>}
                    </div>
                    <div className="muted" style={{ fontSize: 13 }}>
                      {s.startDate ? `${fmtDate(s.startDate)} – ${fmtDate(s.endDate)}` : 'Dates not set'} · {s.issues.length} issues · {pts} pts
                    </div>
                  </div>
                  <span className="row" title="To do · In progress · Done">
                    <span className="pill">{c.todo}</span>
                    <span className="pill" style={{ background: '#8EC5FF' }}>{c.prog}</span>
                    <span className="pill" style={{ background: '#2EE59D' }}>{c.done}</span>
                  </span>
                  <span className="spacer row">
                    {planner && s.state === 'PLANNED' && (
                      <button className="btn sm mint" type="button" onClick={() => setStarting(s)}>Start sprint</button>
                    )}
                    {planner && s.state === 'ACTIVE' && (
                      <button className="btn sm yellow" type="button" onClick={() => setCompleting(s)}>Complete sprint</button>
                    )}
                    {planner && <button className="btn sm" type="button" onClick={() => setEditing(s)}>Edit</button>}
                  </span>
                  {s.goal && <div style={{ flexBasis: '100%', fontSize: 13, fontWeight: 500 }}>Goal: {s.goal}</div>}
                </div>
                {open && (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {rows(s.id, s.issues)}
                    {!s.issues.length && <div className="dropzone">Plan this sprint by dragging groomed issues here.</div>}
                  </div>
                )}
              </section>
            );
          })}

          <section {...sectionProps('backlog')} aria-label="Backlog">
            <div className="section-head">
              <h2>Backlog</h2>
              <span className="muted" style={{ fontSize: 13 }}>
                {data.backlog.length} issues · {data.backlog.filter((i) => i.storyPoints === null).length} not estimated
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>{rows('backlog', data.backlog)}</div>
          </section>
        </div>
      </div>

      {creatingIn === 'modal' && <CreateIssueModal project={project} onClose={() => setCreatingIn(null)} onCreated={openIssue} />}
      {starting && (
        <StartSprintModal project={project} sprint={starting} issues={data.sprints.find((s) => s.id === starting.id)?.issues ?? []} hasActive={!!activeSprint} onClose={() => setStarting(null)} />
      )}
      {completing && (
        <CompleteSprintModal
          project={project}
          sprint={completing}
          issues={data.sprints.find((s) => s.id === completing.id)?.issues ?? []}
          plannedSprints={planned}
          onClose={() => setCompleting(null)}
          onDone={() => {
            const id = completing.id;
            setCompleting(null);
            navigate(`/p/${project.key}/retro/${id}`);
          }}
        />
      )}
      {editing && <EditSprintModal project={project} sprint={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
