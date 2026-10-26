import type { IssueCard } from '../api/types';
import { Avatar, TypeIcon } from './ui';

export function IssueCardView({
  issue,
  selected,
  dragging,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  issue: IssueCard;
  selected?: boolean;
  dragging?: boolean;
  onOpen: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  return (
    <button
      type="button"
      className={`card${selected ? ' selected' : ''}${dragging ? ' dragging' : ''}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', issue.key);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={onOpen}
    >
      <span className="row">
        <TypeIcon type={issue.type} />
        <span className="key">{issue.key}</span>
        <span className="spacer pts">{issue.storyPoints ?? '–'} pts</span>
      </span>
      <span className="card-title">{issue.title}</span>
      {issue.holdReason && <span className="hold-note">On hold: {issue.holdReason}</span>}
      <span className="row wrap">
        {issue.parent && (
          <span className="mini" style={{ background: '#EFE9FF' }} title={issue.parent.title}>
            {issue.parent.key}
          </span>
        )}
        {issue.carryOverCount > 0 && (
          <span className="mini" title="Carried over from earlier sprints">
            ↻ {issue.carryOverCount}
          </span>
        )}
        {issue._count.children > 0 && <span className="mini">{issue._count.children} sub-tasks</span>}
        {issue._count.comments > 0 && <span className="mini">💬 {issue._count.comments}</span>}
        <span className="spacer">
          <Avatar user={issue.assignee} />
        </span>
      </span>
    </button>
  );
}
