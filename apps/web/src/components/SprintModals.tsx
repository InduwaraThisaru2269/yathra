import { useState } from 'react';
import { usePlanning, useVelocity } from '../api/queries';
import type { IssueCard, Project, Sprint } from '../api/types';
import { useToast } from './Toast';
import { Modal } from './ui';

const toDateInput = (d: Date) => d.toISOString().slice(0, 10);

export function StartSprintModal({
  project,
  sprint,
  issues,
  hasActive,
  onClose,
}: {
  project: Project;
  sprint: Sprint;
  issues: IssueCard[];
  hasActive: boolean;
  onClose: () => void;
}) {
  const { startSprint } = usePlanning(project.key);
  const { data: velocity } = useVelocity(project.key);
  const toast = useToast();
  const today = new Date();
  const [name, setName] = useState(sprint.name);
  const [goal, setGoal] = useState(sprint.goal ?? '');
  const [weeks, setWeeks] = useState(2);
  const [start, setStart] = useState(sprint.startDate?.slice(0, 10) ?? toDateInput(today));
  const end = toDateInput(new Date(new Date(start).getTime() + (weeks * 7 - 1) * 86_400_000));
  const points = issues.reduce((s, i) => s + (i.storyPoints ?? 0), 0);
  const unestimated = issues.filter((i) => i.storyPoints === null).length;
  const avg = velocity?.averageVelocity ?? null;

  return (
    <Modal
      title={`Start ${sprint.name}`}
      tone="#2EE59D"
      onClose={onClose}
      footer={
        <>
          <button className="btn" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn mint"
            type="button"
            disabled={hasActive || startSprint.isPending}
            onClick={() =>
              startSprint.mutate(
                { id: sprint.id, name, goal, startDate: new Date(start).toISOString(), endDate: new Date(`${end}T23:59:59`).toISOString() },
                { onSuccess: () => { toast.ok('Started', `${name} is live`); onClose(); }, onError: (e) => toast.error(e) },
              )
            }
          >
            Start sprint
          </button>
        </>
      }
    >
      {hasActive && <div className="hold-note">Another sprint is active. Complete it before starting this one.</div>}
      <label className="field">
        Sprint name
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="grid2">
        <label className="field">
          Duration
          <select className="select" value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
            {[1, 2, 3, 4].map((w) => (
              <option key={w} value={w}>
                {w} week{w > 1 ? 's' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Start date
          <input className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
      </div>
      <div style={{ fontWeight: 600 }}>
        Ends {new Date(end).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {issues.length} issues · {points} points
        {avg !== null && <span className="muted"> · average velocity {avg}</span>}
      </div>
      {avg !== null && points > avg && <div className="hold-note">This is {points - avg} points above the team's average velocity.</div>}
      {unestimated > 0 && <div className="muted">{unestimated} issue{unestimated > 1 ? 's are' : ' is'} not estimated.</div>}
      <label className="field">
        Sprint goal
        <textarea className="textarea" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="What does success look like for this sprint?" />
      </label>
    </Modal>
  );
}

export function CompleteSprintModal({
  project,
  sprint,
  issues,
  plannedSprints,
  onClose,
  onDone,
}: {
  project: Project;
  sprint: Sprint;
  issues: IssueCard[];
  plannedSprints: Sprint[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { completeSprint } = usePlanning(project.key);
  const toast = useToast();
  const done = issues.filter((i) => i.status === 'DONE');
  const open = issues.filter((i) => i.status !== 'DONE');
  const [target, setTarget] = useState<string>(plannedSprints[0]?.id ?? 'NEW');

  const options = [
    ...plannedSprints.map((s) => ({ id: s.id, label: s.name })),
    { id: 'NEW', label: 'A new sprint' },
    { id: 'BACKLOG', label: 'Backlog' },
  ];

  return (
    <Modal
      title={`Complete ${sprint.name}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" type="button" onClick={onClose}>
            Not yet
          </button>
          <button
            className="btn yellow"
            type="button"
            disabled={completeSprint.isPending}
            onClick={() =>
              completeSprint.mutate(
                target === 'NEW' || target === 'BACKLOG'
                  ? { id: sprint.id, moveOpenTo: target }
                  : { id: sprint.id, moveOpenTo: 'SPRINT', targetSprintId: target },
                {
                  onSuccess: (r) => {
                    toast.ok('Sprint complete', `${r.completedPoints} points done, ${r.carriedCount} issues ${r.movedTo ? `moved to ${r.movedTo.name}` : 'back in the backlog'}`);
                    onDone();
                  },
                  onError: (e) => toast.error(e),
                },
              )
            }
          >
            Complete sprint
          </button>
        </>
      }
    >
      <div className="grid2">
        <div className="panel" style={{ padding: 12, background: '#DDFBEF', boxShadow: 'none' }}>
          <div style={{ fontSize: 26, fontWeight: 700 }}>{done.length}</div>
          <div style={{ fontWeight: 600 }}>issues done · {done.reduce((s, i) => s + (i.storyPoints ?? 0), 0)} pts</div>
        </div>
        <div className="panel" style={{ padding: 12, background: '#FFE3E3', boxShadow: 'none' }}>
          <div style={{ fontSize: 26, fontWeight: 700 }}>{open.length}</div>
          <div style={{ fontWeight: 600 }}>issues open · {open.reduce((s, i) => s + (i.storyPoints ?? 0), 0)} pts</div>
        </div>
      </div>
      {open.length > 0 && (
        <>
          <div style={{ fontWeight: 700 }}>Move the {open.length} open issues to</div>
          {options.map((o) => (
            <label key={o.id} className={target === o.id ? 'radio on' : 'radio'}>
              <input type="radio" name="moveto" checked={target === o.id} onChange={() => setTarget(o.id)} />
              {o.label}
            </label>
          ))}
        </>
      )}
      <div className="muted" style={{ fontSize: 13 }}>
        Completing locks the sprint and records its velocity. Open issues keep their status and get a carry-over mark.
      </div>
    </Modal>
  );
}

export function EditSprintModal({ project, sprint, onClose }: { project: Project; sprint: Sprint; onClose: () => void }) {
  const { updateSprint, deleteSprint } = usePlanning(project.key);
  const toast = useToast();
  const [name, setName] = useState(sprint.name);
  const [goal, setGoal] = useState(sprint.goal ?? '');

  return (
    <Modal
      title={`Edit ${sprint.name}`}
      tone="#FFFFFF"
      onClose={onClose}
      footer={
        <>
          {sprint.state === 'PLANNED' && (
            <button
              className="btn danger"
              type="button"
              style={{ marginRight: 'auto' }}
              onClick={() =>
                confirm(`Delete ${sprint.name}? Its issues go back to the backlog.`) &&
                deleteSprint.mutate(sprint.id, { onSuccess: () => { toast.ok('Deleted', sprint.name); onClose(); }, onError: (e) => toast.error(e) })
              }
            >
              Delete sprint
            </button>
          )}
          <button className="btn" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn yellow"
            type="button"
            onClick={() =>
              updateSprint.mutate({ id: sprint.id, name, goal }, { onSuccess: () => { toast.ok('Saved', name); onClose(); }, onError: (e) => toast.error(e) })
            }
          >
            Save
          </button>
        </>
      }
    >
      <label className="field">
        Sprint name
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        Sprint goal
        <textarea className="textarea" value={goal} onChange={(e) => setGoal(e.target.value)} />
      </label>
    </Modal>
  );
}
