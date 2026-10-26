import { useState } from 'react';
import { usePlanning } from '../api/queries';
import type { IssueCard, Project, Status } from '../api/types';
import { canUse, findRule, STATUS_LABEL } from '../lib/workflow';
import { PromptModal } from './PromptModal';
import { useToast } from './Toast';

type Pending = { issue: Pick<IssueCard, 'key' | 'type' | 'status' | 'holdFromStatus'>; to: Status; needs: 'reason' | 'comment'; label: string };

/**
 * Runs a workflow move. Checks the rule locally first so the user gets an instant answer,
 * and asks for a reason or comment when the rule needs one.
 */
export function useMoveWithPrompt(project: Project) {
  const { transition } = usePlanning(project.key);
  const toast = useToast();
  const [pending, setPending] = useState<Pending | null>(null);

  const run = (issue: Pending['issue'], to: Status, extra: { reason?: string; comment?: string } = {}) =>
    transition.mutate(
      { key: issue.key, to, ...extra },
      {
        onSuccess: () =>
          to === 'DONE'
            ? toast.ok('Done', `${issue.key} completed`)
            : toast.ok('Moved', `${issue.key} → ${STATUS_LABEL[to]}`),
        onError: (e) => toast.error(e),
      },
    );

  const move = (issue: Pending['issue'], to: Status) => {
    if (issue.status === to) return;
    const rule = findRule(project, issue.type, issue.status, to, issue.holdFromStatus);
    if (!rule) {
      toast.error(new Error(`${STATUS_LABEL[issue.status]} → ${STATUS_LABEL[to]} is not an allowed move`));
      return;
    }
    if (!canUse(project, rule)) {
      toast.error(new Error(`Only ${rule.roles.join(', ')} can ${rule.label.toLowerCase()}`));
      return;
    }
    if (rule.needs === 'reason' || rule.needs === 'comment') {
      setPending({ issue, to, needs: rule.needs, label: rule.label });
      return;
    }
    run(issue, to);
  };

  const prompt = pending && (
    <PromptModal
      title={`${pending.label} · ${pending.issue.key}`}
      label={pending.needs === 'reason' ? 'Why is it on hold?' : 'Comment (visible on the issue)'}
      placeholder={pending.needs === 'reason' ? 'e.g. waiting on IFS sandbox access' : 'What needs to change?'}
      confirmText={pending.label}
      onCancel={() => setPending(null)}
      onConfirm={(text) => {
        run(pending.issue, pending.to, pending.needs === 'reason' ? { reason: text } : { comment: text });
        setPending(null);
      }}
    />
  );

  return { move, prompt, busy: transition.isPending };
}
