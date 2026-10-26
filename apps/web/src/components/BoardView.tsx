import { useMemo, useState } from 'react';
import type { Column, IssueCard, Member, Project, Status } from '../api/types';
import { EMPTY_TEXT, LANE_COLOR } from '../lib/workflow';
import { useIssueParam } from './AppShell';
import { IssueCardView } from './IssueCardView';
import { Avatar, Icon } from './ui';
import { useMoveWithPrompt } from './useMoveWithPrompt';

type GroupBy = 'none' | 'assignee' | 'epic';

/** Kanban lanes with drag-and-drop, filters and swimlanes. Shared by the BA & Lead and Dev & QA boards. */
export function BoardView({
  project,
  columns,
  members,
  wip = {},
  onCreate,
}: {
  project: Project;
  columns: Column[];
  members: Member[];
  wip?: Partial<Record<Status, number>>;
  onCreate?: () => void;
}) {
  const { move, prompt } = useMoveWithPrompt(project);
  const [openKey, setOpenKey] = useIssueParam();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [onlyBugs, setOnlyBugs] = useState(false);
  const [group, setGroup] = useState<GroupBy>('none');
  const [dragging, setDragging] = useState<IssueCard | null>(null);
  const [over, setOver] = useState<Status | null>(null);

  const match = (i: IssueCard) =>
    (!q || `${i.key} ${i.title}`.toLowerCase().includes(q.toLowerCase())) &&
    (!picked.length || (i.assignee && picked.includes(i.assignee.id))) &&
    (!onlyBugs || i.type === 'BUG');

  const all = useMemo(() => columns.flatMap((c) => c.issues), [columns]);
  const groups = useMemo(() => {
    if (group === 'assignee') {
      const ids = [...new Set(all.map((i) => i.assignee?.id ?? 'none'))];
      return ids.map((id) => ({
        id,
        name: all.find((i) => i.assignee?.id === id)?.assignee?.name ?? 'Unassigned',
        user: all.find((i) => i.assignee?.id === id)?.assignee ?? null,
        test: (i: IssueCard) => (i.assignee?.id ?? 'none') === id,
      }));
    }
    if (group === 'epic') {
      const ids = [...new Set(all.map((i) => i.parent?.id ?? 'none'))];
      return ids.map((id) => {
        const p = all.find((i) => i.parent?.id === id)?.parent;
        return { id, name: p ? `${p.key} · ${p.title}` : 'No epic', user: null, test: (i: IssueCard) => (i.parent?.id ?? 'none') === id };
      });
    }
    return [{ id: 'all', name: '', user: null, test: () => true }];
  }, [all, group]);

  return (
    <>
      <div className="row wrap">
        <input className="input" style={{ maxWidth: 260 }} placeholder="Search this board" aria-label="Search this board" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="row" role="group" aria-label="Filter by person">
          {members.map((m) => {
            const on = picked.includes(m.user.id);
            return (
              <button
                key={m.user.id}
                type="button"
                aria-pressed={on}
                title={m.user.name}
                onClick={() => setPicked(on ? picked.filter((x) => x !== m.user.id) : [...picked, m.user.id])}
                style={{ padding: 0, border: 0, background: 'none', cursor: 'pointer', borderRadius: 99, boxShadow: on ? '0 0 0 3px #3D5AFE' : undefined, marginLeft: -4 }}
              >
                <Avatar user={m.user} />
              </button>
            );
          })}
        </div>
        <button type="button" className={onlyBugs ? 'chip on' : 'chip'} aria-pressed={onlyBugs} onClick={() => setOnlyBugs(!onlyBugs)}>
          Bugs
        </button>
        <label className="row spacer" style={{ fontWeight: 600 }}>
          Group by
          <select className="select" style={{ width: 140 }} value={group} onChange={(e) => setGroup(e.target.value as GroupBy)}>
            <option value="none">None</option>
            <option value="assignee">Assignee</option>
            <option value="epic">Epic</option>
          </select>
        </label>
        {onCreate && (
          <button className="btn primary" type="button" onClick={onCreate}>
            {Icon.plus}Create
          </button>
        )}
      </div>

      <div className="board-scroll">
        <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 12, minWidth: 'max-content' }}>
          <div className="board">
            {columns.map((c) => {
              const limit = wip[c.status];
              const over = limit !== undefined && c.issues.length > limit;
              return (
                <div key={c.status} className="lane-head" style={{ width: 264, background: LANE_COLOR[c.status].head }}>
                  {c.name}
                  <span className="n">{c.issues.filter(match).length}</span>
                  {limit !== undefined && (
                    <span className="spacer" style={{ fontSize: 12, ...(over ? { background: '#121212', color: '#FF6B6B', borderRadius: 6, padding: '1px 6px' } : {}) }}>
                      WIP {c.issues.length}/{limit}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {groups.map((g) => (
            <div key={g.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {g.name && (
                <div className="row" style={{ fontWeight: 700 }}>
                  {group === 'assignee' && <Avatar user={g.user} />}
                  {g.name}
                </div>
              )}
              <div className="board">
                {columns.map((c) => {
                  const cards = c.issues.filter((i) => g.test(i) && match(i));
                  return (
                    <div
                      key={c.status}
                      className={`lane-body${over === c.status ? ' drop' : ''}`}
                      style={{ width: 264, background: LANE_COLOR[c.status].body }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (over !== c.status) setOver(c.status);
                      }}
                      onDragLeave={() => setOver(null)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setOver(null);
                        if (dragging) move(dragging, c.status);
                        setDragging(null);
                      }}
                    >
                      {cards.map((i) => (
                        <IssueCardView
                          key={i.id}
                          issue={i}
                          selected={openKey === i.key}
                          dragging={dragging?.id === i.id}
                          onOpen={() => setOpenKey(i.key)}
                          onDragStart={() => setDragging(i)}
                          onDragEnd={() => {
                            setDragging(null);
                            setOver(null);
                          }}
                        />
                      ))}
                      {!cards.length && <div className="empty">{EMPTY_TEXT[c.status]}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      {prompt}
    </>
  );
}
