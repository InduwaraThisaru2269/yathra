import { createContext, useContext } from 'react';
import { NavLink, Outlet, useParams, useSearchParams } from 'react-router-dom';
import { useMe, useProject } from '../api/queries';
import type { Project } from '../api/types';
import { useQueryClient } from '@tanstack/react-query';
import { signOut } from '../auth/session';
import { ROLE_LABEL } from '../lib/workflow';
import { IssueDrawer } from './IssueDrawer';
import { NotificationBell } from './Notifications';
import { Avatar, Icon, YathraLogo } from './ui';

const ProjectContext = createContext<Project | null>(null);

export function useCurrentProject(): Project {
  const p = useContext(ProjectContext);
  if (!p) throw new Error('useCurrentProject must be used inside a project page');
  return p;
}

/** The open issue lives in the URL (?issue=TN-12) so it can be linked and survives reloads. */
export function useIssueParam(): [string | null, (key: string | null) => void] {
  const [params, setParams] = useSearchParams();
  const set = (key: string | null) => {
    const next = new URLSearchParams(params);
    if (key) next.set('issue', key);
    else next.delete('issue');
    setParams(next, { replace: true });
  };
  return [params.get('issue'), set];
}

export function Sidebar({ project }: { project?: Project }) {
  const { data: me } = useMe();
  const queryClient = useQueryClient();
  const nav = (to: string, icon: JSX.Element, label: string, tint: string, end = true) => (
    <NavLink to={to} className={({ isActive }) => (isActive ? 'nav active' : 'nav')} end={end}>
      <span className="ni" style={{ background: tint }}>
        {icon}
      </span>
      {label}
    </NavLink>
  );

  return (
    <nav className="side" aria-label="Main">
      <NavLink to="/" className="brand">
        <YathraLogo />Yathra
      </NavLink>
      <NotificationBell />
      {project && (
        <>
          <div className="panel" style={{ padding: 12, boxShadow: 'none' }}>
            <div className="label">{project.key}</div>
            <div style={{ fontWeight: 700 }}>{project.name}</div>
            <div className="muted" style={{ fontSize: 12 }}>
              {project.myRole ? ROLE_LABEL[project.myRole] : project.isAdmin ? 'Org admin' : ''}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div className="label muted" style={{ padding: '0 10px 4px' }}>
              Planning
            </div>
            {nav(`/p/${project.key}/backlog`, Icon.list, 'Backlog', '#2EE59D')}
            {nav(`/p/${project.key}/board`, Icon.board, 'Sprint board', '#8EC5FF')}
            {nav(`/p/${project.key}/ba-board`, Icon.pen, 'BA & Lead board', '#B69CFF')}
            {nav(`/p/${project.key}/reports`, Icon.chart, 'Reports', '#FF9F1C')}
            {nav(`/p/${project.key}/retro`, Icon.retro, 'Retro', '#FF6B6B', false)}
            {nav(`/p/${project.key}/wiki`, Icon.book, 'Wiki', '#FFD23F', false)}
            {nav(`/p/${project.key}/settings`, Icon.gear, 'Settings', '#FFFFFF')}
          </div>
          <div className="muted" style={{ fontSize: 12, padding: '0 10px' }}>
            Development and Testing arrive in the next phases.
          </div>
        </>
      )}
      <div className="me">
        <Avatar user={me ?? null} />
        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span style={{ fontWeight: 700 }}>{me?.name ?? '…'}</span>
          <button type="button" className="btn ghost sm" style={{ padding: 0, justifyContent: 'flex-start', minHeight: 24 }} onClick={() => signOut().finally(() => queryClient.clear())}>
            Sign out
          </button>
        </span>
      </div>
    </nav>
  );
}

export function ProjectShell() {
  const { key = '' } = useParams();
  const { data: project, error, isLoading } = useProject(key.toUpperCase());
  const [openKey, setOpenKey] = useIssueParam();

  if (isLoading) return <div className="main">Loading…</div>;
  if (error || !project) {
    return (
      <div className="shell">
        <Sidebar />
        <main className="main">
          <h1>Can't open {key}</h1>
          <p>{(error as Error)?.message ?? 'Project not found.'}</p>
        </main>
      </div>
    );
  }

  return (
    <ProjectContext.Provider value={project}>
      <div className="shell">
        <Sidebar project={project} />
        <main className="main">
          <Outlet />
        </main>
      </div>
      {openKey && <IssueDrawer project={project} issueKey={openKey} onClose={() => setOpenKey(null)} onOpen={setOpenKey} />}
    </ProjectContext.Provider>
  );
}
