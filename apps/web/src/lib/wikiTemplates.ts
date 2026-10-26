export interface WikiTemplate {
  id: string;
  name: string;
  hint: string;
  title: string;
  body: string;
}

export const WIKI_TEMPLATES: WikiTemplate[] = [
  { id: 'blank', name: 'Blank page', hint: 'Start from nothing', title: '', body: '' },
  {
    id: 'spec',
    name: 'Story spec',
    hint: 'What a BA writes before Lead review',
    title: 'Spec: ',
    body: `## Summary
What are we building and why?

## Users and roles
Who uses it, and what can each role do?

## Acceptance criteria
- [ ]
- [ ]

## Out of scope


## Open questions
-

## Related tickets
`,
  },
  {
    id: 'adr',
    name: 'Decision record',
    hint: 'Capture a technical or product decision',
    title: 'Decision: ',
    body: `**Status:** Proposed
**Date:** ${new Date().toISOString().slice(0, 10)}

## Context
What forces us to decide?

## Options considered
1.
2.

## Decision
We will …

## Consequences
What gets easier, what gets harder?
`,
  },
  {
    id: 'meeting',
    name: 'Meeting notes',
    hint: 'Agenda, notes and action items',
    title: `Meeting ${new Date().toISOString().slice(0, 10)}: `,
    body: `**Attendees:**

## Agenda
1.

## Notes


## Action items
- [ ] Owner — action — due date
`,
  },
  {
    id: 'runbook',
    name: 'Runbook',
    hint: 'Steps to operate or recover something',
    title: 'Runbook: ',
    body: `## When to use this


## Before you start
- Access needed:
- Risk:

## Steps
1.
2.

## Verify


## Roll back
`,
  },
  {
    id: 'release',
    name: 'Release checklist',
    hint: 'Before promoting to staging or production',
    title: 'Release checklist: ',
    body: `## Scope
Tickets in this release:

## Before release
- [ ] All tickets are Done
- [ ] Regression cycle passed
- [ ] No open Critical or High defects
- [ ] Database migrations reviewed

## After release
- [ ] Smoke test passed
- [ ] Release notes sent
`,
  },
];
