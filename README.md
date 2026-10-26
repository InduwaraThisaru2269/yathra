# Yathra

*Yathra* (යාත්‍රා) is Sinhala for "journey": every project's journey from plan to release, in one place. This repo holds phase 1: **Planning** (Jira-style sprints and boards). Development (GitHub) and Testing come next.

| Part | Stack |
| --- | --- |
| `apps/api` | NestJS 10, Prisma 5, PostgreSQL (Supabase), `jose` for tokens, scrypt passwords |
| `apps/web` | React 18, Vite, TanStack Query, React Router, MSAL (Microsoft popup), Google Identity Services |

## What Planning covers

- **Sign-in**: Microsoft, Google, or email and password (with email verification and password reset). Anyone can create an account; they see no projects until a PM adds them.
- **Projects and roles**: BA, Lead, Dev, QA, PM per project; org admins via `ADMIN_EMAILS`.
- **Issues**: epics, stories, tasks, bugs, sub-tasks; points, priority, assignee, labels, epic link, comments, issue links (blocks / relates / duplicates), full change history.
- **Workflow** with role rules: BA In Progress → BA On Hold → Lead Review → To Groom → Dev To Do → Dev In Progress → Dev Code Review → QA To Do → QA In Progress → On Hold → Done. Hold needs a reason, returning to the BA or failing QA needs a comment, Lead review needs a description.
- **Backlog**: ranked backlog and sprints, drag-and-drop between them, epics panel, quick filters, inline create. Only groomed issues can be planned.
- **Sprints**: create, edit, delete (planned only), start (dates, goal, capacity vs velocity), complete (open issues go to the next sprint, a new sprint or the backlog, with a carry-over count). Adding to an active sprint is recorded as scope change.
- **Boards**: Dev & QA board for the active sprint (WIP limits, swimlanes by assignee or epic) and the BA & Lead board.
- **Reports**: sprint burndown, sprint outcome lists, velocity for the last 10 sprints.
- **Notifications**: a bell with an unread count and a panel, plus email for the types each person picks (defaults: assigned, mentioned, returned to BA, failed QA, added to a project). People are told when they're assigned or @mentioned, when someone comments on their issue, when a story needs Lead review, is returned to the BA, is ready for QA, fails QA or is done, when they're added to a project, and when a sprint starts or completes. Nobody is notified about their own action, and mentions only reach project members.
- **Retro**: one board per sprint (opens when the sprint starts, and straight after completing it) with Went well / To improve / Actions, anonymous notes, dot voting (5 votes per person), and actions that become `retro-action` tasks in the next planned sprint or the backlog. Each retro starts by showing the previous retro's actions and whether they got done. Leads and PMs close and reopen retros.
- **Wiki**: a page tree per project (drag to reorder or nest), Markdown with a formatting toolbar and live preview, templates (spec, decision record, meeting notes, runbook, release checklist), search, and full version history with diffs and restore. Ticket keys such as `TN-12` become live status chips, and each issue lists the pages that mention it. Two people saving the same page at once get a clear conflict instead of overwriting each other; unsaved edits are kept as a local draft.

## How sign-in works

Every method ends the same way: the API issues its own 15-minute access token (kept in memory by the web app) and a 30-day refresh token in an `httpOnly` cookie scoped to `/api/auth`. Refresh tokens rotate on each use; reusing an old one ends all of that user's sessions.

| Method | What the API checks |
| --- | --- |
| Microsoft | Entra access token for `api://<client id>/access_as_user` (signature, tenant, audience, scope) |
| Google | Google ID token (signature, audience = your client id, `email_verified`) |
| Email and password | scrypt hash; sign-in is blocked until the email is verified |

The same email from different providers is one account. A provider-verified email can claim an account that was registered but never verified; that account's password is removed so a squatter cannot keep access. Sign-in, sign-up and email endpoints are rate-limited per IP and per email (in memory, per API instance).

## 1. Microsoft sign-in (optional)

Azure portal → **Microsoft Entra ID → App registrations → New registration**:

1. Name: `Yathra`. Supported accounts: *this organizational directory only*.
2. Platform **Single-page application**, redirect URI `http://localhost:5173/blank.html` (add your deployed `https://<host>/blank.html` later).
3. Copy the **Application (client) ID** and **Directory (tenant) ID**.
4. **Expose an API** → Application ID URI `api://<client id>` → **Add a scope** `access_as_user`.
5. **API permissions** → Add → *My APIs* → Yathra → `access_as_user`; grant admin consent if your tenant needs it.
6. Recommended: **Manifest** → `"accessTokenAcceptedVersion": 2`.

Leave the `ENTRA_*` / `VITE_ENTRA_*` settings empty to hide the Microsoft button.

## 2. Google sign-in (optional)

Google Cloud console → **APIs & Services → Credentials → Create credentials → OAuth client ID**:

1. If asked, configure the OAuth consent screen (External or Internal; scopes `openid`, `email`, `profile`).
2. Application type **Web application**.
3. **Authorized JavaScript origins**: `http://localhost` and `http://localhost:5173` (add your deployed origin later). No redirect URI is needed.
4. Copy the **Client ID** into `GOOGLE_CLIENT_ID` in `apps/api/.env`. The web app reads it from the API.

## 3. Email (verification and password reset)

Without `RESEND_API_KEY` the API prints each email, including its link, to the API log, which is enough for local development. For real email, create a [Resend](https://resend.com) API key, verify your sending domain, and set `RESEND_API_KEY` and `MAIL_FROM`.

## 4. Database (Supabase)

1. Create a Supabase project.
2. Click **Connect** → **Connection string** and copy two pooler URLs:
   - **Transaction pooler** (port 6543) → `DATABASE_URL`, with `?pgbouncer=true&connection_limit=5` added.
   - **Session pooler** (port 5432) → `DIRECT_URL`, used for migrations.

   Don't use *Direct connection*: its host (`db.<ref>.supabase.co`) is IPv6-only and fails with `P1001: Can't reach database server` on IPv4-only networks. Pooler usernames look like `postgres.<project-ref>`.

## 5. Configure and run

```bash
npm install
cp apps/api/.env.example apps/api/.env      # DATABASE_URL, DIRECT_URL, JWT_SECRET, providers, ADMIN_EMAILS
cp apps/web/.env.example apps/web/.env      # VITE_ENTRA_* (only for Microsoft sign-in)
npm run db:deploy                           # applies prisma/migrations to Supabase
npm run dev:api                             # http://localhost:3000/api
npm run dev:web                             # http://localhost:5173
```

Create `JWT_SECRET` with `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.

Open http://localhost:5173, create an account or sign in, create a project, then add teammates on **Settings** (they need a verified account first).

## Changing the database

Edit `apps/api/prisma/schema.prisma`, then from `apps/api` run `npx prisma migrate dev --name <change>` against a development database. Commit the generated folder under `prisma/migrations`.

## API overview

All routes are under `/api`. Routes under `/api/auth` and `GET /api/health` are public; everything else needs `Authorization: Bearer <Yathra access token>`.

| Area | Routes |
| --- | --- |
| Auth | `GET /auth/providers`, `POST /auth/{microsoft,google,login,register,verify-email,resend-verification,forgot-password,reset-password,refresh,logout}` |
| Me | `GET /me`, `GET /users?q=` |
| Projects | `GET/POST /projects`, `GET/PATCH /projects/:key`, `GET/POST /projects/:key/members`, `PATCH/DELETE /projects/:key/members/:userId` |
| Issues | `GET/POST /projects/:key/issues`, `GET/PATCH/DELETE /issues/:issueKey`, `POST /issues/:issueKey/transition`, `POST /issues/:issueKey/move`, comments and links under `/issues/:issueKey/...` |
| Sprints | `GET/POST /projects/:key/sprints`, `PATCH/DELETE /sprints/:id`, `POST /sprints/:id/start`, `POST /sprints/:id/complete` |
| Boards | `GET /projects/:key/backlog`, `GET /projects/:key/board`, `GET /projects/:key/ba-board` |
| Reports | `GET /sprints/:id/report`, `GET /projects/:key/reports/velocity` |
| Notifications | `GET /notifications`, `GET /notifications/unread-count`, `POST /notifications/:id/read`, `POST /notifications/read-all`, `GET/PUT /notifications/settings` |
| Retro | `GET /projects/:key/retros`, `GET /sprints/:id/retro`, `POST /sprints/:id/retro/{items,close,reopen}`, `PATCH/DELETE /retro-items/:id`, `POST /retro-items/:id/{vote,ticket}` |
| Wiki | `GET/POST /projects/:key/wiki`, `GET /projects/:key/wiki/search?q=`, `GET/PATCH/DELETE /wiki/:id`, `POST /wiki/:id/move`, `GET /wiki/:id/versions`, `GET /wiki/:id/versions/:n`, `POST /wiki/:id/versions/:n/restore` |
