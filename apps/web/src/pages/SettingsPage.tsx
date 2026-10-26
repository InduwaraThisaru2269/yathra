import { useState } from 'react';
import { useMe, useMembers, useProjectAdmin } from '../api/queries';
import type { Role } from '../api/types';
import { useCurrentProject } from '../components/AppShell';
import { useToast } from '../components/Toast';
import { Avatar } from '../components/ui';
import { ROLE_LABEL, ROLES } from '../lib/workflow';

const ROLE_HELP: Record<Role, string> = {
  BA: 'Writes stories, moves BA lanes',
  LEAD: 'Approves stories, plans sprints, can move any lane',
  DEV: 'Moves Dev lanes',
  QA: 'Moves QA lanes, passes or fails work',
  PM: 'Plans sprints, manages members and settings',
};

export function SettingsPage() {
  const project = useCurrentProject();
  const { data: members = [] } = useMembers(project.key);
  const { data: me } = useMe();
  const admin = useProjectAdmin(project.key);
  const toast = useToast();
  const canManage = project.isAdmin || project.myRole === 'PM';

  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('DEV');

  return (
    <>
      <div className="page-head">
        <div>
          <div className="muted" style={{ fontWeight: 600 }}>{project.key}</div>
          <h1>Settings</h1>
        </div>
      </div>

      <section className="panel" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 720 }}>
        <span className="label">Project</span>
        <label className="field">
          Name
          <input className="input" value={name} disabled={!canManage} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          Description
          <textarea className="textarea" value={description} disabled={!canManage} onChange={(e) => setDescription(e.target.value)} />
        </label>
        {canManage && (
          <button
            className="btn yellow"
            type="button"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => admin.update.mutate({ name, description }, { onSuccess: () => toast.ok('Saved', project.key), onError: (e) => toast.error(e) })}
          >
            Save project
          </button>
        )}
      </section>

      <section className="panel" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 920 }}>
        <span className="label">Members · {members.length}</span>
        <div style={{ overflowX: 'auto' }}>
          <table className="t">
            <thead>
              <tr>
                <th>Person</th>
                <th>Role</th>
                <th>Can</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.user.id}>
                  <td>
                    <span className="row">
                      <Avatar user={m.user} />
                      <span>
                        <div style={{ fontWeight: 700 }}>{m.user.name}{m.user.id === me?.id ? ' (you)' : ''}</div>
                        <div className="muted" style={{ fontSize: 12 }}>{m.user.email}</div>
                      </span>
                    </span>
                  </td>
                  <td>
                    <select
                      className="select"
                      style={{ width: 140 }}
                      aria-label={`Role for ${m.user.name}`}
                      disabled={!canManage}
                      value={m.role}
                      onChange={(e) =>
                        admin.updateMember.mutate({ userId: m.user.id, role: e.target.value as Role }, { onError: (er) => toast.error(er) })
                      }
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="muted" style={{ fontSize: 13 }}>{ROLE_HELP[m.role]}</td>
                  <td>
                    {canManage && (
                      <button
                        className="btn sm"
                        type="button"
                        onClick={() =>
                          confirm(`Remove ${m.user.name} from ${project.key}?`) &&
                          admin.removeMember.mutate(m.user.id, { onError: (er) => toast.error(er) })
                        }
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {canManage && (
          <form
            className="row wrap"
            onSubmit={(e) => {
              e.preventDefault();
              admin.addMember.mutate(
                { email: email.trim(), role },
                { onSuccess: (m) => { toast.ok('Added', `${m.user.name} as ${ROLE_LABEL[m.role]}`); setEmail(''); }, onError: (er) => toast.error(er) },
              );
            }}
          >
            <input className="input" style={{ maxWidth: 320 }} type="email" required placeholder="name@inivosglobal.com" aria-label="Member email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <select className="select" style={{ width: 140 }} aria-label="Role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABEL[r]}</option>
              ))}
            </select>
            <button className="btn primary" type="submit">Add member</button>
            <span className="muted" style={{ fontSize: 13, flexBasis: '100%' }}>
              People appear here after they sign in once with their Microsoft account.
            </span>
          </form>
        )}
      </section>
    </>
  );
}
