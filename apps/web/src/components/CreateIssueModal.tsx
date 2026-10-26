import { useState } from 'react';
import { useEpics, useMembers, usePlanning } from '../api/queries';
import type { IssueType, Priority, Project } from '../api/types';
import { PRIORITIES, PRIORITY_LABEL, STORY_POINTS, TYPE_META } from '../lib/workflow';
import { useToast } from './Toast';
import { Modal } from './ui';

const CREATABLE: IssueType[] = ['STORY', 'TASK', 'BUG', 'EPIC'];

export function CreateIssueModal({
  project,
  sprintId,
  defaultType = 'STORY',
  onClose,
  onCreated,
}: {
  project: Project;
  sprintId?: string;
  defaultType?: IssueType;
  onClose: () => void;
  onCreated?: (key: string) => void;
}) {
  const { createIssue } = usePlanning(project.key);
  const { data: members = [] } = useMembers(project.key);
  const { data: epics = [] } = useEpics(project.key);
  const toast = useToast();

  const [type, setType] = useState<IssueType>(defaultType);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('MEDIUM');
  const [points, setPoints] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [parentId, setParentId] = useState('');

  const submit = () =>
    createIssue.mutate(
      {
        type,
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        storyPoints: points === '' ? undefined : Number(points),
        assigneeId: assigneeId || undefined,
        parentId: type !== 'EPIC' ? parentId || undefined : undefined,
        sprintId: type === 'STORY' || type === 'EPIC' ? undefined : sprintId,
      },
      {
        onSuccess: (issue) => {
          toast.ok('Created', `${issue.key} · ${issue.title}`);
          onCreated?.(issue.key);
          onClose();
        },
        onError: (e) => toast.error(e),
      },
    );

  return (
    <Modal
      title="Create issue"
      onClose={onClose}
      footer={
        <>
          <button className="btn" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" type="button" disabled={!title.trim() || createIssue.isPending} onClick={submit}>
            Create
          </button>
        </>
      }
    >
      <div className="row wrap" role="radiogroup" aria-label="Issue type">
        {CREATABLE.map((t) => (
          <button key={t} type="button" role="radio" aria-checked={type === t} className={type === t ? 'chip on' : 'chip'} onClick={() => setType(t)}>
            {TYPE_META[t].label}
          </button>
        ))}
      </div>
      <div className="muted" style={{ fontSize: 13 }}>
        {type === 'STORY' || type === 'EPIC'
          ? 'Stories and epics start in BA In Progress and go through Lead review before planning.'
          : 'Tasks and bugs start in To Groom and can be planned straight away.'}
      </div>
      <label className="field">
        Summary
        <input className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && title.trim() && submit()} />
      </label>
      <label className="field">
        Description
        <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What and why, plus acceptance criteria" />
      </label>
      <div className="grid2">
        <label className="field">
          Priority
          <select className="select" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Story points
          <select className="select" value={points} onChange={(e) => setPoints(e.target.value)}>
            <option value="">Not estimated</option>
            {STORY_POINTS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Assignee
          <select className="select" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.user.id} value={m.user.id}>
                {m.user.name}
              </option>
            ))}
          </select>
        </label>
        {type !== 'EPIC' && (
          <label className="field">
            Epic
            <select className="select" value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">No epic</option>
              {epics.map((ep) => (
                <option key={ep.id} value={ep.id}>
                  {ep.key} · {ep.title}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </Modal>
  );
}
