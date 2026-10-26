import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useBaBoard, useBacklog, useDevBoard } from '../api/queries';
import { useCurrentProject, useIssueParam } from '../components/AppShell';
import { BoardView } from '../components/BoardView';
import { CreateIssueModal } from '../components/CreateIssueModal';
import { CompleteSprintModal } from '../components/SprintModals';
import { canPlan, daysLeft, fmtDate } from '../lib/workflow';

/** Developer & QA board for the active sprint. */
export function DevBoardPage() {
  const project = useCurrentProject();
  const { data, isLoading } = useDevBoard(project.key);
  const { data: backlog } = useBacklog(project.key);
  const [, openIssue] = useIssueParam();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [completing, setCompleting] = useState(false);

  if (isLoading || !data) return <div>Loading board…</div>;

  if (!data.sprint) {
    return (
      <>
        <div className="page-head">
          <h1>Sprint board</h1>
        </div>
        <div className="panel" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
          <h2 style={{ margin: 0 }}>No active sprint</h2>
          <p style={{ margin: 0 }}>Plan groomed issues into a sprint on the backlog, then start it to see them here.</p>
          <Link className="btn yellow" to={`/p/${project.key}/backlog`}>
            Go to the backlog
          </Link>
        </div>
      </>
    );
  }

  const { sprint, stats } = data;
  const pct = stats.totalPoints ? Math.round((stats.donePoints / stats.totalPoints) * 100) : 0;
  const left = daysLeft(sprint.endDate);
  const allIssues = data.columns.flatMap((c) => c.issues);

  return (
    <>
      <section className="panel sprint-head" aria-label={sprint.name}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: '1 1 300px', minWidth: 0 }}>
          <span className="label">
            Active sprint · {fmtDate(sprint.startDate)} – {fmtDate(sprint.endDate)}
          </span>
          <h1 style={{ margin: 0, fontSize: 28, letterSpacing: '-0.02em' }}>{sprint.name}</h1>
          {sprint.goal && <div style={{ fontWeight: 500 }}>Goal: {sprint.goal}</div>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: '1 1 300px', minWidth: 0 }}>
          <div className="row">
            <span className="label">Sprint progress</span>
            <span className="spacer mono" style={{ fontWeight: 700 }}>
              {stats.donePoints} / {stats.totalPoints} pts
            </span>
          </div>
          <div className="progress">
            <div style={{ width: `${pct}%` }} />
          </div>
          <div style={{ fontSize: 13 }}>
            {stats.totalPoints - stats.donePoints} points remaining across {stats.openCount} open issues
          </div>
        </div>
        <div className="row wrap">
          {left !== null && <span className="mini" style={{ background: '#FFD23F', height: 28 }}>{left} days left</span>}
          {canPlan(project) && (
            <button className="btn" type="button" onClick={() => setCompleting(true)}>
              Complete sprint
            </button>
          )}
        </div>
      </section>

      <BoardView
        project={project}
        columns={data.columns}
        members={data.members}
        wip={{ DEV_IN_PROGRESS: 3, QA_IN_PROGRESS: 2 }}
        onCreate={() => setCreating(true)}
      />

      {creating && <CreateIssueModal project={project} sprintId={sprint.id} defaultType="TASK" onClose={() => setCreating(false)} onCreated={openIssue} />}
      {completing && (
        <CompleteSprintModal
          project={project}
          sprint={sprint}
          issues={allIssues}
          plannedSprints={backlog?.sprints.filter((s) => s.state === 'PLANNED') ?? []}
          onClose={() => setCompleting(false)}
          onDone={() => navigate(`/p/${project.key}/retro/${sprint.id}`)}
        />
      )}
    </>
  );
}

/** BA & Lead board: stories being written, on hold, in Lead review and ready to groom. */
export function BaBoardPage() {
  const project = useCurrentProject();
  const { data, isLoading } = useBaBoard(project.key);
  const [, openIssue] = useIssueParam();
  const [creating, setCreating] = useState(false);

  if (isLoading || !data) return <div>Loading board…</div>;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="muted" style={{ fontWeight: 600 }}>{project.name}</div>
          <h1>BA &amp; Lead board</h1>
        </div>
      </div>
      <div className="muted" style={{ marginTop: -8 }}>
        Stories need a description before Lead review. Leads approve to To Groom or return them to the BA with a comment.
      </div>
      <BoardView project={project} columns={data.columns} members={data.members} onCreate={() => setCreating(true)} />
      {creating && <CreateIssueModal project={project} defaultType="STORY" onClose={() => setCreating(false)} onCreated={openIssue} />}
    </>
  );
}
