import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCreateProject, useProjects } from '../api/queries';
import { Sidebar } from '../components/AppShell';
import { useToast } from '../components/Toast';
import { Modal } from '../components/ui';
import { daysLeft, ROLE_LABEL } from '../lib/workflow';

export function ProjectsPage() {
  const { data: projects, isLoading, error } = useProjects();
  const [creating, setCreating] = useState(false);

  return (
    <div className="shell">
      <Sidebar />
      <main className="main">
        <div className="page-head">
          <h1>Projects</h1>
          <button className="btn primary spacer" type="button" onClick={() => setCreating(true)}>
            New project
          </button>
        </div>
        {isLoading && <div>Loading…</div>}
        {error && <div className="hold-note">{(error as Error).message}</div>}
        {projects && !projects.length && (
          <div className="panel" style={{ padding: 20 }}>
            You are not in any project yet. Create one, or ask a PM to add you.
          </div>
        )}
        <div className="cards">
          {projects?.map((p) => {
            const left = p.activeSprint ? daysLeft(p.activeSprint.endDate) : null;
            return (
              <Link key={p.id} to={`/p/${p.key}/backlog`} className="panel pcard">
                <span className="row">
                  <span className="mini" style={{ background: '#FFD23F' }}>{p.key}</span>
                  {p.myRole && <span className="spacer muted" style={{ fontSize: 12, fontWeight: 600 }}>{ROLE_LABEL[p.myRole]}</span>}
                </span>
                <span style={{ fontWeight: 700, fontSize: 17 }}>{p.name}</span>
                {p.description && <span className="muted" style={{ fontSize: 13 }}>{p.description}</span>}
                <span className="muted" style={{ fontSize: 13 }}>
                  {p.activeSprint ? `${p.activeSprint.name}${left !== null ? ` · ${left} days left` : ''}` : 'No active sprint'} · {p._count.issues} issues · {p._count.members} members
                </span>
              </Link>
            );
          })}
        </div>
      </main>
      {creating && <CreateProjectModal onClose={() => setCreating(false)} />}
    </div>
  );
}

function CreateProjectModal({ onClose }: { onClose: () => void }) {
  const create = useCreateProject();
  const navigate = useNavigate();
  const toast = useToast();
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  return (
    <Modal
      title="New project"
      onClose={onClose}
      footer={
        <>
          <button className="btn" type="button" onClick={onClose}>Cancel</button>
          <button
            className="btn primary"
            type="button"
            disabled={!key || !name.trim() || create.isPending}
            onClick={() =>
              create.mutate(
                { key, name: name.trim(), description: description.trim() || undefined },
                { onSuccess: (p) => { toast.ok('Created', p.name); navigate(`/p/${p.key}/settings`); }, onError: (e) => toast.error(e) },
              )
            }
          >
            Create project
          </button>
        </>
      }
    >
      <label className="field">
        Name
        <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="TMS Web" />
      </label>
      <label className="field">
        Key (used in issue numbers, e.g. TN-123)
        <input className="input mono" value={key} maxLength={10} onChange={(e) => setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="TN" />
      </label>
      <label className="field">
        Description
        <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <div className="muted" style={{ fontSize: 13 }}>You become the project's PM and can add members next.</div>
    </Modal>
  );
}
