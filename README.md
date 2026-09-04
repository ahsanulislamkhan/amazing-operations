# Amazing Operations

Amazing Operations is a responsive warehouse operations application for managers and warehouse team members. The existing interface is backed by Supabase Auth, Postgres, Row Level Security, private Realtime broadcasts, and a Resend email outbox.

## Local setup

1. Install Node.js 22 or later and run `npm install`.
2. Copy `.env.example` to `.env.local` and add the Supabase and Resend values.
3. Link a Supabase project with the Supabase CLI, then run `npm run db:migrate`.
4. Set `INITIAL_MANAGER_EMAIL` and run `npm run db:bootstrap-manager` once.
5. Run `npm run dev` for the local app.

The initial manager receives an invitation link and chooses their own password. Sample staff remain non-login records until a manager invites them.

## Data and security

- `supabase/migrations/` contains the version-controlled schema, seed data, RLS policies, workflow functions, Realtime broadcasts, audit log, and email outbox.
- Authentication is cookie based. Passwords and permissions are never stored in browser storage.
- Managers can manage company operations. Warehouse team members can view active company data, but can only change progress or add activity notes on assigned tasks.
- Records are archived and restored rather than permanently deleted.
- Schedules are stored in UTC and displayed in `Australia/Melbourne`.
- Presence and online status are intentionally not collected or shown.

## Commands

- `npm run dev` — start the local application
- `npm run vercel-build` — build the production Next.js app
- `npm run typecheck` — run TypeScript validation
- `npm run lint` — run ESLint
- `npm run db:migrate` — push Supabase migrations
- `npm run db:bootstrap-manager` — invite or reconnect the initial manager

## Vercel configuration

Configure Preview and Production separately with the variables in `.env.example`. Install the Supabase and Resend integrations in the existing Vercel project, verify the company sender domain, configure Supabase redirect URLs for `/auth/callback`, and keep `CRON_SECRET` private. Operational emails are attempted immediately after a mutation; the daily scheduled route recovers failed or interrupted deliveries with idempotency keys.
