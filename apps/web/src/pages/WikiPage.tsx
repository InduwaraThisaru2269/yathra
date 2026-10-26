import { useQuery } from '@tanstack/react-query';
import { diffLines } from 'diff';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { get } from '../api/client';
import type { IssueCard, LinkedIssue, Project, WikiPage, WikiTreeItem } from '../api/types';
import { useWikiActions, useWikiPage, useWikiSearch, useWikiTree, useWikiVersion, useWikiVersions } from '../api/wiki';
import { useCurrentProject, useIssueParam } from '../components/AppShell';
import { useToast } from '../components/Toast';
import { Avatar, Icon, Modal, StatusBadge, TypeIcon } from '../components/ui';
import { issueKeysIn, renderMarkdown } from '../lib/markdown';
import { WIKI_TEMPLATES } from '../lib/wikiTemplates';

const timeAgo = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const storage = {
  get(k: string) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string | null) {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* private mode: drafts just aren't kept */
    }
  },
};

export function WikiPageScreen() {
  const project = useCurrentProject();
  const { pageId } = useParams();
  const navigate = useNavigate();
  const { data: tree = [], isLoading } = useWikiTree(project.key);
  const [creating, setCreating] = useState<{ parentId?: string } | null>(null);

  // Opening the wiki lands on the first top-level page.
  useEffect(() => {
    if (!pageId && tree.length) {
      const first = tree.filter((p) => !p.parentId).sort((a, b) => a.position - b.position)[0];
      if (first) navigate(`/p/${project.key}/wiki/${first.id}`, { replace: true });
    }
  }, [pageId, tree, navigate, project.key]);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="muted" style={{ fontWeight: 600 }}>{project.name}</div>
          <h1>Wiki</h1>
        </div>
        <button className="btn primary spacer" type="button" onClick={() => setCreating({})}>
          {Icon.plus}New page
        </button>
      </div>

      <div className="wiki">
        <WikiSidebar project={project} tree={tree} activeId={pageId} onNewChild={(parentId) => setCreating({ parentId })} />
        <div className="wiki-main">
          {pageId ? (
            <PageArea key={pageId} project={project} pageId={pageId} onNewChild={(parentId) => setCreating({ parentId })} />
          ) : isLoading ? (
            <div className="panel" style={{ padding: 24 }}>Loading…</div>
          ) : (
            <div className="panel" style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
              <h2 style={{ margin: 0 }}>Start your project wiki</h2>
              <p className="muted" style={{ margin: 0, maxWidth: 520 }}>
                Keep specs, decisions, runbooks and meeting notes next to the tickets. Mention a ticket like {project.key}-12 and it links both ways.
              </p>
              <button className="btn yellow" type="button" onClick={() => setCreating({})}>Create the first page</button>
            </div>
          )}
        </div>
      </div>

      {creating && (
        <NewPageModal
          project={project}
          parentId={creating.parentId}
          parentTitle={tree.find((p) => p.id === creating.parentId)?.title}
          onClose={() => setCreating(null)}
          onCreated={(id) => {
            setCreating(null);
            navigate(`/p/${project.key}/wiki/${id}?edit=1`);
          }}
        />
      )}
    </>
  );
}

// ---------- Sidebar: search and the page tree ----------

function WikiSidebar({ project, tree, activeId, onNewChild }: { project: Project; tree: WikiTreeItem[]; activeId?: string; onNewChild: (parentId: string) => void }) {
  const [q, setQ] = useState('');
  const { data: hits = [] } = useWikiSearch(project.key, q);
  const { move } = useWikiActions(project.key);
  const toast = useToast();
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string | 'root'; where: 'before' | 'inside' } | null>(null);
  const collapsedKey = `yathra.wiki.collapsed.${project.key}`;
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(storage.get(collapsedKey) ?? '{}');
    } catch {
      return {};
    }
  });

  const byParent = useMemo(() => {
    const m = new Map<string | null, WikiTreeItem[]>();
    for (const p of tree) m.set(p.parentId, [...(m.get(p.parentId) ?? []), p]);
    m.forEach((list) => list.sort((a, b) => a.position - b.position));
    return m;
  }, [tree]);

  // Keep the open page's ancestors expanded.
  useEffect(() => {
    if (!activeId) return;
    const byId = new Map(tree.map((p) => [p.id, p]));
    let cur = byId.get(activeId)?.parentId ?? null;
    const open: Record<string, boolean> = {};
    while (cur) {
      if (collapsed[cur]) open[cur] = false;
      cur = byId.get(cur)?.parentId ?? null;
    }
    if (Object.keys(open).length) setCollapsed((c) => ({ ...c, ...open }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, tree]);

  const toggle = (id: string) =>
    setCollapsed((c) => {
      const next = { ...c, [id]: !c[id] };
      storage.set(collapsedKey, JSON.stringify(next));
      return next;
    });

  const doDrop = (target: WikiTreeItem | null, where: 'before' | 'inside') => {
    const id = dragId;
    setDragId(null);
    setDrop(null);
    if (!id || (target && target.id === id)) return;
    const body = !target ? { parentId: null } : where === 'inside' ? { parentId: target.id } : { parentId: target.parentId, beforeId: target.id };
    move.mutate({ id, ...body }, { onError: (e) => toast.error(e) });
  };

  const render = (parentId: string | null, depth: number): JSX.Element[] =>
    (byParent.get(parentId) ?? []).map((p) => {
      const kids = byParent.get(p.id) ?? [];
      const open = !collapsed[p.id];
      return (
        <div key={p.id}>
          <div
            className={`wiki-drop-line${drop?.id === p.id && drop.where === 'before' ? ' on' : ''}`}
            style={{ marginLeft: depth * 14 }}
            onDragOver={(e) => {
              e.preventDefault();
              setDrop({ id: p.id, where: 'before' });
            }}
            onDrop={(e) => {
              e.preventDefault();
              doDrop(p, 'before');
            }}
          />
          <div
            className={`wiki-node${p.id === activeId ? ' active' : ''}${drop?.id === p.id && drop.where === 'inside' ? ' drop' : ''}`}
            style={{ paddingLeft: 6 + depth * 14, opacity: dragId === p.id ? 0.4 : 1 }}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move';
              setDragId(p.id);
            }}
            onDragEnd={() => {
              setDragId(null);
              setDrop(null);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (drop?.id !== p.id || drop.where !== 'inside') setDrop({ id: p.id, where: 'inside' });
            }}
            onDrop={(e) => {
              e.preventDefault();
              doDrop(p, 'inside');
            }}
          >
            <button type="button" className="wiki-caret" aria-label={open ? 'Collapse' : 'Expand'} style={{ visibility: kids.length ? 'visible' : 'hidden' }} onClick={() => toggle(p.id)}>
              <span style={{ display: 'inline-flex', transform: open ? 'rotate(90deg)' : undefined }}>{Icon.chevron}</span>
            </button>
            <Link to={`/p/${project.key}/wiki/${p.id}`} className="wiki-link">{p.title}</Link>
            <button type="button" className="wiki-add" aria-label={`New page under ${p.title}`} title="New sub-page" onClick={() => onNewChild(p.id)}>
              {Icon.plus}
            </button>
          </div>
          {open && kids.length > 0 && render(p.id, depth + 1)}
        </div>
      );
    });

  return (
    <aside className="panel wiki-side" aria-label="Wiki pages">
      <input className="input" placeholder="Search the wiki" aria-label="Search the wiki" value={q} onChange={(e) => setQ(e.target.value)} />
      {q.trim().length >= 2 ? (
        <div className="wiki-hits">
          {hits.map((h) => (
            <Link key={h.id} className="wiki-hit" to={`/p/${project.key}/wiki/${h.id}`} onClick={() => setQ('')}>
              <b>{h.title}</b>
              <span className="muted">{h.snippet}</span>
            </Link>
          ))}
          {!hits.length && <div className="muted" style={{ padding: 8 }}>No pages match "{q}".</div>}
        </div>
      ) : (
        <nav className="wiki-tree">
          {render(null, 0)}
          {tree.length > 0 && (
            <div
              className={`wiki-root-drop${drop?.id === 'root' ? ' on' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDrop({ id: 'root', where: 'inside' });
              }}
              onDragLeave={() => setDrop(null)}
              onDrop={(e) => {
                e.preventDefault();
                doDrop(null, 'inside');
              }}
            >
              {dragId ? 'Drop here to move to the top level' : ''}
            </div>
          )}
          {!tree.length && <div className="muted" style={{ padding: 8, fontSize: 13 }}>No pages yet.</div>}
        </nav>
      )}
    </aside>
  );
}

// ---------- One page: view, edit or history ----------

function PageArea({ project, pageId, onNewChild }: { project: Project; pageId: string; onNewChild: (parentId: string) => void }) {
  const { data: page, error } = useWikiPage(pageId);
  const params = new URLSearchParams(window.location.search);
  const [mode, setMode] = useState<'view' | 'edit' | 'history'>(params.get('edit') ? 'edit' : 'view');

  if (error) return <div className="panel" style={{ padding: 24 }}>{(error as Error).message}</div>;
  if (!page) return <div className="panel" style={{ padding: 24 }}>Loading…</div>;

  if (mode === 'edit') return <PageEditor project={project} page={page} onDone={() => setMode('view')} />;
  if (mode === 'history') return <PageHistory project={project} page={page} onClose={() => setMode('view')} />;
  return <PageView project={project} page={page} onEdit={() => setMode('edit')} onHistory={() => setMode('history')} onNewChild={onNewChild} />;
}

function Breadcrumbs({ project, page }: { project: Project; page: WikiPage }) {
  return (
    <nav className="row wrap muted" aria-label="Breadcrumb" style={{ fontSize: 13, fontWeight: 600, gap: 6 }}>
      <Link to={`/p/${project.key}/wiki`}>Wiki</Link>
      {page.breadcrumbs.map((b) => (
        <span key={b.id} className="row" style={{ gap: 6 }}>
          / <Link to={`/p/${project.key}/wiki/${b.id}`}>{b.title}</Link>
        </span>
      ))}
    </nav>
  );
}

function MarkdownView({ project, markdown, issues }: { project: Project; markdown: string; issues: LinkedIssue[] }) {
  const [, openIssue] = useIssueParam();
  const html = useMemo(() => renderMarkdown(markdown, project.key, issues), [markdown, project.key, issues]);
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const chip = (e.target as HTMLElement).closest<HTMLElement>('[data-issue]');
    if (chip) {
      e.preventDefault();
      openIssue(chip.dataset.issue!);
    }
  };
  return markdown.trim() ? (
    <div className="md" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <p className="muted">This page is empty. Choose Edit to write it.</p>
  );
}

function PageView({ project, page, onEdit, onHistory, onNewChild }: { project: Project; page: WikiPage; onEdit: () => void; onHistory: () => void; onNewChild: (parentId: string) => void }) {
  const { remove } = useWikiActions(project.key);
  const navigate = useNavigate();
  const toast = useToast();
  const [, openIssue] = useIssueParam();

  return (
    <article className="panel wiki-page">
      <Breadcrumbs project={project} page={page} />
      <div className="row wrap" style={{ alignItems: 'flex-start', gap: 12 }}>
        <h1 className="wiki-title">{page.title}</h1>
        <span className="spacer row wrap">
          <button className="btn sm yellow" type="button" onClick={onEdit}>Edit</button>
          <button className="btn sm" type="button" onClick={() => onNewChild(page.id)}>Add sub-page</button>
          <button className="btn sm" type="button" onClick={onHistory}>History</button>
          <button
            className="btn sm"
            type="button"
            onClick={() => {
              if (!confirm(`Delete "${page.title}"${page.children.length ? ' and all its sub-pages' : ''}?`)) return;
              remove.mutate(page.id, {
                onSuccess: (r) => {
                  toast.ok('Deleted', `${r.archived} page${r.archived > 1 ? 's' : ''}`);
                  navigate(page.parentId ? `/p/${project.key}/wiki/${page.parentId}` : `/p/${project.key}/wiki`);
                },
                onError: (e) => toast.error(e),
              });
            }}
          >
            Delete
          </button>
        </span>
      </div>
      <div className="row wrap muted" style={{ fontSize: 13, gap: 8 }}>
        <Avatar user={page.updatedBy} size={22} />
        Edited by {page.updatedBy.name} · {timeAgo(page.updatedAt)} · <span className="mono">v{page.version}</span>
      </div>

      <MarkdownView project={project} markdown={page.content} issues={page.linkedIssues} />

      {page.children.length > 0 && (
        <section className="wiki-section">
          <span className="label">Sub-pages</span>
          <div className="row wrap">
            {page.children.map((c) => (
              <Link key={c.id} className="chip" to={`/p/${project.key}/wiki/${c.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>{c.title}</Link>
            ))}
          </div>
        </section>
      )}

      {page.linkedIssues.length > 0 && (
        <section className="wiki-section">
          <span className="label">Tickets on this page · {page.linkedIssues.length}</span>
          {page.linkedIssues.map((i) => (
            <button key={i.id} type="button" className="row wiki-issue" onClick={() => openIssue(i.key)}>
              <TypeIcon type={i.type} />
              <span className="key">{i.key}</span>
              <span style={{ flex: 1, fontWeight: 600, textAlign: 'left' }}>{i.title}</span>
              <StatusBadge status={i.status} />
            </button>
          ))}
        </section>
      )}
    </article>
  );
}

// ---------- Editor ----------

type Wrap = { before: string; after?: string; block?: boolean; placeholder?: string };
const TOOLS: { label: string; title: string; wrap: Wrap }[] = [
  { label: 'H2', title: 'Heading', wrap: { before: '## ', block: true, placeholder: 'Heading' } },
  { label: 'H3', title: 'Sub-heading', wrap: { before: '### ', block: true, placeholder: 'Sub-heading' } },
  { label: 'B', title: 'Bold (Ctrl+B)', wrap: { before: '**', after: '**', placeholder: 'bold text' } },
  { label: 'I', title: 'Italic (Ctrl+I)', wrap: { before: '_', after: '_', placeholder: 'italic text' } },
  { label: '• List', title: 'Bulleted list', wrap: { before: '- ', block: true, placeholder: 'item' } },
  { label: '1. List', title: 'Numbered list', wrap: { before: '1. ', block: true, placeholder: 'item' } },
  { label: '☐ Task', title: 'Checklist', wrap: { before: '- [ ] ', block: true, placeholder: 'task' } },
  { label: 'Quote', title: 'Quote', wrap: { before: '> ', block: true, placeholder: 'quote' } },
  { label: 'Code', title: 'Code block', wrap: { before: '```\n', after: '\n```', block: true, placeholder: 'code' } },
  { label: 'Link', title: 'Link', wrap: { before: '[', after: '](https://)', placeholder: 'link text' } },
  { label: 'Table', title: 'Table', wrap: { before: '| Column | Column |\n| --- | --- |\n| ', after: ' |  |', block: true, placeholder: 'value' } },
];

function PageEditor({ project, page, onDone }: { project: Project; page: WikiPage; onDone: () => void }) {
  const { save } = useWikiActions(project.key);
  const toast = useToast();
  const draftKey = `yathra.wiki.draft.${page.id}`;
  const savedDraft = useMemo(() => {
    try {
      const d = JSON.parse(storage.get(draftKey) ?? 'null');
      return d && d.baseVersion === page.version && (d.title !== page.title || d.content !== page.content) ? d : null;
    } catch {
      return null;
    }
  }, [draftKey, page]);

  const [title, setTitle] = useState(page.title);
  const [content, setContent] = useState(page.content);
  const [view, setView] = useState<'split' | 'write' | 'preview'>('split');
  const [picking, setPicking] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const dirty = title !== page.title || content !== page.content;

  // Keep an unsaved draft in this browser so a closed tab doesn't lose work.
  useEffect(() => {
    const t = setTimeout(() => storage.set(draftKey, dirty ? JSON.stringify({ title, content, baseVersion: page.version }) : null), 600);
    return () => clearTimeout(t);
  }, [title, content, dirty, draftKey, page.version]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // Live status for tickets typed in the preview.
  const keys = useMemo(() => issueKeysIn(content, project.key), [content, project.key]);
  const [debouncedKeys, setDebouncedKeys] = useState(keys);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedKeys(keys), 500);
    return () => clearTimeout(t);
  }, [keys]);
  const { data: keyIssues = [] } = useQuery({
    queryKey: ['project', project.key, 'issues-by-key', debouncedKeys.join(',')],
    queryFn: () => get<IssueCard[]>(`/projects/${project.key}/issues?keys=${encodeURIComponent(debouncedKeys.join(','))}&take=200`),
    enabled: debouncedKeys.length > 0,
  });
  const previewIssues: LinkedIssue[] = keyIssues.map((i) => ({ id: i.id, key: i.key, title: i.title, status: i.status, type: i.type }));

  const doSave = () => {
    if (!title.trim()) return toast.error(new Error('Give the page a title'));
    save.mutate(
      { id: page.id, title: title.trim(), content, baseVersion: page.version },
      {
        onSuccess: (p) => {
          storage.set(draftKey, null);
          toast.ok('Saved', `${title.trim()} · v${p.version}`);
          onDone();
        },
        onError: (e) => toast.error(e),
      },
    );
  };

  const apply = (w: Wrap, text?: string) => {
    const el = ta.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const selected = text ?? (content.slice(s, e) || w.placeholder || '');
    const needsNewline = w.block && s > 0 && content[s - 1] !== '\n' ? '\n' : '';
    const insert = needsNewline + w.before + selected + (w.after ?? '');
    const next = content.slice(0, s) + insert + content.slice(e);
    setContent(next);
    requestAnimationFrame(() => {
      el.focus();
      const from = s + needsNewline.length + w.before.length;
      el.setSelectionRange(from, from + selected.length);
    });
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 's') {
      e.preventDefault();
      doSave();
    } else if (mod && e.key.toLowerCase() === 'b' && e.currentTarget instanceof HTMLTextAreaElement) {
      e.preventDefault();
      apply(TOOLS[2]!.wrap);
    } else if (mod && e.key.toLowerCase() === 'i' && e.currentTarget instanceof HTMLTextAreaElement) {
      e.preventDefault();
      apply(TOOLS[3]!.wrap);
    }
  };

  return (
    <article className="panel wiki-page">
      <Breadcrumbs project={project} page={page} />
      {savedDraft && (
        <div className="hold-note row wrap" style={{ background: '#FFF6D1' }}>
          You have unsaved changes from earlier on this page.
          <button className="btn sm" type="button" onClick={() => { setTitle(savedDraft.title); setContent(savedDraft.content); }}>Restore draft</button>
          <button className="btn sm" type="button" onClick={() => storage.set(draftKey, null)}>Discard</button>
        </div>
      )}
      <input className="input wiki-title-input" aria-label="Page title" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={onKey} placeholder="Page title" />

      <div className="row wrap wiki-toolbar" role="toolbar" aria-label="Formatting">
        {TOOLS.map((t) => (
          <button key={t.label} type="button" className="btn sm" title={t.title} onClick={() => apply(t.wrap)}>{t.label}</button>
        ))}
        <button type="button" className="btn sm mint" title="Insert a ticket link" onClick={() => setPicking(true)}>+ Ticket</button>
        <span className="spacer row" role="radiogroup" aria-label="Editor layout">
          {(['write', 'split', 'preview'] as const).map((v) => (
            <button key={v} type="button" role="radio" aria-checked={view === v} className={view === v ? 'chip on' : 'chip'} onClick={() => setView(v)}>
              {v[0]!.toUpperCase() + v.slice(1)}
            </button>
          ))}
        </span>
      </div>

      <div className={`wiki-editor ${view}`}>
        {view !== 'preview' && (
          <textarea
            ref={ta}
            className="textarea wiki-source mono"
            aria-label="Page content in Markdown"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={onKey}
            placeholder={`Write in Markdown. Mention tickets like ${project.key}-12 to link them.`}
          />
        )}
        {view !== 'write' && (
          <div className="wiki-preview">
            <MarkdownView project={project} markdown={content} issues={previewIssues} />
          </div>
        )}
      </div>

      <div className="row wrap">
        <span className="muted" style={{ fontSize: 13 }}>Markdown · Ctrl+S to save · editing v{page.version}</span>
        <span className="spacer row">
          <button
            className="btn"
            type="button"
            onClick={() => {
              if (dirty && !confirm('Discard your changes?')) return;
              storage.set(draftKey, null);
              onDone();
            }}
          >
            Cancel
          </button>
          <button className="btn yellow" type="button" disabled={save.isPending || !dirty} onClick={doSave}>
            {save.isPending ? 'Saving…' : 'Save'}
          </button>
        </span>
      </div>

      {picking && (
        <TicketPicker
          project={project}
          onClose={() => setPicking(false)}
          onPick={(key) => {
            setPicking(false);
            apply({ before: '' }, key);
          }}
        />
      )}
    </article>
  );
}

function TicketPicker({ project, onClose, onPick }: { project: Project; onClose: () => void; onPick: (key: string) => void }) {
  const [q, setQ] = useState('');
  const { data = [] } = useQuery({
    queryKey: ['project', project.key, 'issue-search', q],
    queryFn: () => get<IssueCard[]>(`/projects/${project.key}/issues?q=${encodeURIComponent(q)}&take=12`),
  });
  return (
    <Modal title="Insert a ticket" tone="#2EE59D" onClose={onClose}>
      <input className="input" autoFocus placeholder="Search by key or title" aria-label="Search tickets" value={q} onChange={(e) => setQ(e.target.value)} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto' }}>
        {data.map((i) => (
          <button key={i.id} type="button" className="row wiki-issue" onClick={() => onPick(i.key)}>
            <TypeIcon type={i.type} />
            <span className="key">{i.key}</span>
            <span style={{ flex: 1, fontWeight: 600, textAlign: 'left' }}>{i.title}</span>
            <StatusBadge status={i.status} />
          </button>
        ))}
        {!data.length && <div className="muted">No tickets match.</div>}
      </div>
    </Modal>
  );
}

// ---------- History ----------

function PageHistory({ project, page, onClose }: { project: Project; page: WikiPage; onClose: () => void }) {
  const { data: versions = [] } = useWikiVersions(page.id, true);
  const { restore } = useWikiActions(project.key);
  const toast = useToast();
  const [selected, setSelected] = useState(page.version);
  const [compareTo, setCompareTo] = useState<'previous' | 'current'>('previous');
  const other = compareTo === 'previous' ? selected - 1 : page.version;

  const { data: a } = useWikiVersion(page.id, selected);
  const { data: b } = useWikiVersion(page.id, other > 0 && other !== selected ? other : null);

  // Old on the left of the diff, newer on the right.
  const [older, newer] = b && b.version < selected ? [b, a] : [a, b];
  const parts = useMemo(() => (older && newer ? diffLines(older.content, newer.content) : null), [older, newer]);
  const added = parts?.filter((p) => p.added).reduce((s, p) => s + (p.count ?? 0), 0) ?? 0;
  const removed = parts?.filter((p) => p.removed).reduce((s, p) => s + (p.count ?? 0), 0) ?? 0;

  return (
    <article className="panel wiki-page">
      <Breadcrumbs project={project} page={page} />
      <div className="row wrap">
        <h1 className="wiki-title" style={{ fontSize: 26 }}>History · {page.title}</h1>
        <button className="btn sm spacer" type="button" onClick={onClose}>Back to page</button>
      </div>

      <div className="wiki-history">
        <ol className="wiki-versions" aria-label="Versions">
          {versions.map((v) => (
            <li key={v.version}>
              <button type="button" className={v.version === selected ? 'wiki-ver on' : 'wiki-ver'} onClick={() => setSelected(v.version)}>
                <span className="row">
                  <span className="mono" style={{ fontWeight: 700 }}>v{v.version}</span>
                  {v.version === page.version && <span className="mini" style={{ background: '#2EE59D' }}>current</span>}
                  <span className="spacer muted" style={{ fontSize: 12 }}>{timeAgo(v.createdAt)}</span>
                </span>
                <span className="row" style={{ fontSize: 13 }}>
                  <Avatar user={v.editedBy} size={20} />
                  {v.editedBy.name}
                </span>
              </button>
            </li>
          ))}
        </ol>

        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="row wrap">
            <span className="row" role="radiogroup" aria-label="Compare with">
              <button type="button" role="radio" aria-checked={compareTo === 'previous'} className={compareTo === 'previous' ? 'chip on' : 'chip'} onClick={() => setCompareTo('previous')}>
                Changes in v{selected}
              </button>
              <button type="button" role="radio" aria-checked={compareTo === 'current'} className={compareTo === 'current' ? 'chip on' : 'chip'} onClick={() => setCompareTo('current')}>
                v{selected} vs current
              </button>
            </span>
            {parts && (
              <span className="mono" style={{ fontSize: 13 }}>
                <span style={{ color: '#15803D' }}>+{added}</span> <span style={{ color: '#B91C1C' }}>−{removed}</span> lines
              </span>
            )}
            {selected !== page.version && (
              <button
                className="btn sm yellow spacer"
                type="button"
                disabled={restore.isPending}
                onClick={() =>
                  restore.mutate(
                    { id: page.id, version: selected, baseVersion: page.version },
                    { onSuccess: () => { toast.ok('Restored', `v${selected} is now the current version`); onClose(); }, onError: (e) => toast.error(e) },
                  )
                }
              >
                Restore v{selected}
              </button>
            )}
          </div>

          {a && b && a.title !== b.title && (
            <div className="hold-note" style={{ background: '#FFF6D1' }}>
              Title: <s>{older!.title}</s> → <b>{newer!.title}</b>
            </div>
          )}

          {selected === 1 && compareTo === 'previous' ? (
            <div className="wiki-diff">
              <div className="muted" style={{ padding: 10 }}>First version of the page.</div>
              {a && <pre className="add">{a.content || '(empty)'}</pre>}
            </div>
          ) : !parts ? (
            <div className="muted">{compareTo === 'current' && selected === page.version ? 'This is the current version.' : 'Loading…'}</div>
          ) : (
            <div className="wiki-diff" aria-label="Changes">
              {parts.every((p) => !p.added && !p.removed) && <div className="muted" style={{ padding: 10 }}>No content changes (title or formatting only).</div>}
              {parts.map((p, i) =>
                p.added || p.removed ? (
                  <pre key={i} className={p.added ? 'add' : 'del'}>{p.value}</pre>
                ) : (
                  <ContextLines key={i} text={p.value} />
                ),
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

/** Long unchanged stretches fold to their first and last lines. */
function ContextLines({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const lines = text.replace(/\n$/, '').split('\n');
  if (open || lines.length <= 6) return <pre className="ctx">{text}</pre>;
  return (
    <>
      <pre className="ctx">{lines.slice(0, 2).join('\n') + '\n'}</pre>
      <button type="button" className="wiki-fold" onClick={() => setOpen(true)}>Show {lines.length - 4} unchanged lines</button>
      <pre className="ctx">{lines.slice(-2).join('\n') + '\n'}</pre>
    </>
  );
}

// ---------- New page ----------

function NewPageModal({ project, parentId, parentTitle, onClose, onCreated }: { project: Project; parentId?: string; parentTitle?: string; onClose: () => void; onCreated: (id: string) => void }) {
  const { create } = useWikiActions(project.key);
  const toast = useToast();
  const [templateId, setTemplateId] = useState('blank');
  const template = WIKI_TEMPLATES.find((t) => t.id === templateId)!;
  const [title, setTitle] = useState('');

  return (
    <Modal
      title={parentTitle ? `New page under "${parentTitle}"` : 'New page'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" type="button" onClick={onClose}>Cancel</button>
          <button
            className="btn primary"
            type="button"
            disabled={!title.trim() || create.isPending}
            onClick={() =>
              create.mutate(
                { title: title.trim(), parentId, content: template.body },
                { onSuccess: (p) => { toast.ok('Created', title.trim()); onCreated(p.id); }, onError: (e) => toast.error(e) },
              )
            }
          >
            Create and edit
          </button>
        </>
      }
    >
      <div className="wiki-templates" role="radiogroup" aria-label="Template">
        {WIKI_TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={t.id === templateId}
            className={t.id === templateId ? 'radio on' : 'radio'}
            style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2, padding: '10px 12px', minHeight: 0 }}
            onClick={() => {
              setTemplateId(t.id);
              if (!title || WIKI_TEMPLATES.some((x) => x.title && title === x.title)) setTitle(t.title);
            }}
          >
            <b>{t.name}</b>
            <span className="muted" style={{ fontSize: 12, fontWeight: 500 }}>{t.hint}</span>
          </button>
        ))}
      </div>
      <label className="field">
        Title
        <input className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Payment retries design" />
      </label>
    </Modal>
  );
}
