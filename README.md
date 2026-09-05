# Amazing Operations

Amazing Operations is a responsive warehouse operations application for managers and warehouse team members. The existing interface is backed by Supabase Auth, Postgres, Row Level Security, private Realtime broadcasts, and a Resend email outbox.

## Local setup

1. Install Node.js 22 or later and run `npm install`.
2. Copy `.env.example` to `.env.local` and add the Supabase values. Resend is not required while operational notifications are in-app only.
3. Link a Supabase project with the Supabase CLI, then run `npm run db:migrate`.
4. Set `INITIAL_MANAGER_EMAIL` and run `npm run db:bootstrap-manager` once.
5. Run `npm run dev` for the local app.

The initial manager receives an invitation link and chooses their own password. Sample data is removed by the cleanup migration; staff must be explicitly invited.

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

Configure Preview and Production separately with the variables in `.env.example`. Configure Supabase redirect URLs for `/auth/callback` and keep `CRON_SECRET` private. Invitations and password recovery continue through Supabase Auth.

Operational notifications are currently **in-app only**. The notification-to-email trigger has been removed and the Resend worker is disabled by default. Historical outbox rows are retained, not retried or deleted. Enabling email later requires a reviewed migration to restore the queue trigger, a verified sender, and an explicit worker configuration; setting an API key alone will not enable it.

## Assessment updates

- Overview status totals and the compact warehouse breakdown open the filtered Tasks screen, preserving the inclusive Melbourne date range.
- Team task totals filter the work queue; overdue and due-today tasks are shown first. Unassigned company tasks remain read-only. Status actions in the details drawer share the existing confirmation flow.
- Create/edit scheduling uses the shared calendar. Done applies the selection; Cancel/Escape discard it. Arrow keys navigate days; Page Up/Down navigate months (Shift changes years).
- Audit History is manager-only, searchable/filterable, and paged in batches of 50. CSV exports explicitly contain only loaded results. The detail drawer shows before/after changes and opens related records.
- Both roles share current-password changes and signed-in password recovery.
- Due-today/overdue reminders are generated on app load and visible-session refresh, once per task schedule/recipient/category. No background presence tracking is used.
