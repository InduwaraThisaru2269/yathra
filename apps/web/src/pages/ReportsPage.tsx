import { useSearchParams } from 'react-router-dom';
import { useSprintReport, useSprints, useVelocity } from '../api/queries';
import type { ReportRow, SprintReport, Velocity } from '../api/types';
import { useCurrentProject } from '../components/AppShell';
import { StatusBadge, TypeIcon } from '../components/ui';
import { fmtDate } from '../lib/workflow';

export function ReportsPage() {
  const project = useCurrentProject();
  const { data: sprints = [] } = useSprints(project.key);
  const { data: velocity } = useVelocity(project.key);
  const [params, setParams] = useSearchParams();

  const reportable = sprints.filter((s) => s.state !== 'PLANNED');
  const sprintId = params.get('sprint') ?? reportable[0]?.id ?? null;
  const { data: report } = useSprintReport(sprintId);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="muted" style={{ fontWeight: 600 }}>{project.name}</div>
          <h1>Reports</h1>
        </div>
        <label className="row spacer" style={{ fontWeight: 600 }}>
          Sprint
          <select className="select" style={{ width: 240 }} value={sprintId ?? ''} onChange={(e) => setParams({ sprint: e.target.value })}>
            {reportable.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} {s.state === 'ACTIVE' ? '(active)' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!reportable.length && <div className="panel" style={{ padding: 20 }}>Reports appear once a sprint has started.</div>}

      {report && <SprintSummary report={report} />}

      <div className="row wrap" style={{ alignItems: 'stretch', gap: 20 }}>
        {report && (
          <section className="panel" style={{ flex: '3 1 520px', padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }} aria-label="Burndown">
            <div className="row">
              <span className="label">Burndown</span>
              <span className="spacer row muted" style={{ fontSize: 12, gap: 14 }}>
                <span className="row" style={{ gap: 6 }}><span style={{ width: 18, height: 4, background: '#FF6B6B', border: '1.5px solid #121212' }} />Remaining</span>
                <span className="row" style={{ gap: 6 }}><span style={{ width: 18, borderTop: '2.5px dashed #121212' }} />Ideal</span>
              </span>
            </div>
            <Burndown data={report.burndown} />
          </section>
        )}
        {velocity && (
          <section className="panel" style={{ flex: '2 1 320px', padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }} aria-label="Velocity">
            <span className="label">Velocity · last {velocity.sprints.length} sprints</span>
            <VelocityChart data={velocity} />
          </section>
        )}
      </div>

      {report && (
        <div className="row wrap" style={{ alignItems: 'flex-start', gap: 20 }}>
          <IssueList title={`Completed · ${report.completed.length}`} rows={report.completed} />
          <IssueList title={`Not completed · ${report.notCompleted.length}`} rows={report.notCompleted} />
          {report.addedAfterStart.length > 0 && <IssueList title={`Added after start · ${report.addedAfterStart.length}`} rows={report.addedAfterStart} />}
        </div>
      )}
    </>
  );
}

function SprintSummary({ report }: { report: SprintReport }) {
  const s = report.sprint;
  const done = report.completed.reduce((a, r) => a + r.points, 0);
  const notDone = report.notCompleted.reduce((a, r) => a + r.points, 0);
  const added = report.addedAfterStart.reduce((a, r) => a + r.points, 0);
  const stat = (v: number | string, label: string, bg: string) => (
    <div className="panel" style={{ padding: '14px 16px', background: bg, flex: '1 1 160px' }}>
      <div style={{ fontSize: 28, fontWeight: 700 }}>{v}</div>
      <div style={{ fontWeight: 600 }}>{label}</div>
    </div>
  );
  return (
    <>
      <div className="muted" style={{ fontWeight: 600 }}>
        {s.name} · {fmtDate(s.startDate)} – {fmtDate(s.endDate)}
        {s.completedAt ? ` · completed ${fmtDate(s.completedAt)}` : ' · in progress'}
        {s.goal ? ` · Goal: ${s.goal}` : ''}
      </div>
      <div className="row wrap" style={{ gap: 14 }}>
        {stat(s.committedPoints ?? 0, 'Points committed', '#E3EFFF')}
        {stat(done, 'Points completed', '#DDFBEF')}
        {stat(notDone, s.state === 'CLOSED' ? 'Points carried over' : 'Points open', '#FFE3E3')}
        {stat(`+${added}`, 'Scope change', '#FFF6D1')}
      </div>
    </>
  );
}

function IssueList({ title, rows }: { title: string; rows: ReportRow[] }) {
  return (
    <section className="panel" style={{ flex: '1 1 380px', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span className="label">{title}</span>
      {rows.map((r) => (
        <div key={r.key + (r.outcome ?? '')} className="row">
          <TypeIcon type={r.type} />
          <span className="key">{r.key}</span>
          <span style={{ flex: 1, fontWeight: 600, minWidth: 0 }}>{r.title}</span>
          <StatusBadge status={r.status} />
          <span className="pts">{r.points}</span>
        </div>
      ))}
      {!rows.length && <span className="muted">None</span>}
    </section>
  );
}

function Burndown({ data }: { data: SprintReport['burndown'] }) {
  if (!data.length) return <div className="muted">The burndown starts when the sprint starts.</div>;
  const W = 640, H = 260, L = 40, R = 620, T = 20, B = 220;
  const max = Math.max(1, ...data.map((d) => Math.max(d.ideal, d.remaining ?? 0)));
  const x = (i: number) => L + (data.length === 1 ? 0 : (i / (data.length - 1)) * (R - L));
  const y = (v: number) => B - (v / max) * (B - T);
  const actual = data.map((d, i) => (d.remaining === null ? null : `${x(i)},${y(d.remaining)}`)).filter(Boolean).join(' ');
  const ideal = data.map((d, i) => `${x(i)},${y(d.ideal)}`).join(' ');
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));
  const step = Math.max(1, Math.ceil(data.length / 7));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Burndown of remaining story points by day">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={R} y1={y(t)} y2={y(t)} stroke="#D9D9EA" />
          <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fontFamily="Space Mono, monospace">{t}</text>
        </g>
      ))}
      <line x1={L} x2={R} y1={B} y2={B} stroke="#121212" strokeWidth="2" />
      {data.map((d, i) =>
        i % step === 0 || i === data.length - 1 ? (
          <text key={d.date} x={x(i)} y={B + 20} textAnchor="middle" fontSize="11" fontFamily="Space Mono, monospace">
            {d.date.slice(5)}
          </text>
        ) : null,
      )}
      <polyline points={ideal} fill="none" stroke="#121212" strokeWidth="2" strokeDasharray="7 6" />
      {actual && <polyline points={actual} fill="none" stroke="#121212" strokeWidth="6" strokeLinejoin="round" strokeLinecap="round" />}
      {actual && <polyline points={actual} fill="none" stroke="#FF6B6B" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />}
    </svg>
  );
}

function VelocityChart({ data }: { data: Velocity }) {
  if (!data.sprints.length) return <div className="muted">Velocity appears after the first sprint is completed.</div>;
  const max = Math.max(1, ...data.sprints.map((s) => Math.max(s.committedPoints ?? 0, s.completedPoints ?? 0)));
  return (
    <>
      <div className="row" style={{ alignItems: 'flex-end', gap: 14, height: 200 }}>
        {data.sprints.map((s) => (
          <div key={s.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
            <span className="mono" style={{ fontSize: 12, fontWeight: 700 }}>{s.completedPoints ?? 0}</span>
            <div className="row" style={{ alignItems: 'flex-end', gap: 3, width: '100%', justifyContent: 'center' }}>
              <div title={`Committed ${s.committedPoints ?? 0}`} style={{ width: '40%', maxWidth: 22, height: ((s.committedPoints ?? 0) / max) * 150, background: '#FFFFFF', border: '2px solid #121212', borderRadius: '6px 6px 0 0' }} />
              <div title={`Completed ${s.completedPoints ?? 0}`} style={{ width: '40%', maxWidth: 22, height: ((s.completedPoints ?? 0) / max) * 150, background: '#2EE59D', border: '2px solid #121212', borderRadius: '6px 6px 0 0' }} />
            </div>
            <span className="mono" style={{ fontSize: 11 }}>{s.name.replace(/^.*Sprint\s*/i, 'S')}</span>
          </div>
        ))}
      </div>
      <div className="muted" style={{ fontSize: 13 }}>
        White = committed, green = completed{data.averageVelocity !== null ? ` · average of the last 3: ${data.averageVelocity}` : ''}
      </div>
    </>
  );
}
