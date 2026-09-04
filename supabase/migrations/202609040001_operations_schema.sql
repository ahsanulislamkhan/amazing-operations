create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;

do $$ begin
  create type public.app_role as enum ('manager', 'warehouse_team');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.staff_status as enum ('uninvited', 'invited', 'active', 'suspended', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.task_status as enum ('pending', 'in_progress', 'complete', 'delayed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.task_type as enum ('delivery', 'pickup', 'container');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.notification_event_type as enum (
    'assignment', 'reassignment', 'task_changed', 'note_added',
    'task_delayed', 'task_completed', 'invitation', 'password_reset'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.staff_profiles (
  id uuid primary key default extensions.gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  email extensions.citext not null unique,
  role public.app_role not null default 'warehouse_team',
  status public.staff_status not null default 'uninvited',
  avatar_url text not null default '/assets/avatar-james.png',
  location text not null default 'Melbourne, Australia',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint archived_staff_state check ((status = 'archived') = (archived_at is not null))
);

create table if not exists public.warehouses (
  id uuid primary key default extensions.gen_random_uuid(),
  office_type text not null,
  name text not null unique,
  address text not null,
  status text not null default 'active' check (status in ('active', 'archived')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint archived_warehouse_state check ((status = 'archived') = (archived_at is not null))
);

create table if not exists public.staff_warehouses (
  staff_id uuid not null references public.staff_profiles(id) on delete cascade,
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (staff_id, warehouse_id)
);

create table if not exists public.tasks (
  id uuid primary key default extensions.gen_random_uuid(),
  invoice extensions.citext not null unique,
  type public.task_type not null,
  warehouse_id uuid not null references public.warehouses(id),
  scheduled_at timestamptz not null,
  status public.task_status not null default 'pending',
  description text not null default '',
  priority boolean not null default false,
  created_by uuid references public.staff_profiles(id) on delete set null,
  archived_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_schedule_index on public.tasks (scheduled_at);
create index if not exists tasks_warehouse_status_index on public.tasks (warehouse_id, status) where archived_at is null;

create table if not exists public.task_items (
  id uuid primary key default extensions.gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  quantity text not null check (char_length(trim(quantity)) > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists task_items_task_index on public.task_items (task_id, sort_order);

create table if not exists public.task_assignees (
  task_id uuid not null references public.tasks(id) on delete cascade,
  staff_id uuid not null references public.staff_profiles(id),
  assigned_by uuid references public.staff_profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (task_id, staff_id)
);

create index if not exists task_assignees_staff_index on public.task_assignees (staff_id, task_id);

create table if not exists public.task_notes (
  id uuid primary key default extensions.gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  author_id uuid not null references public.staff_profiles(id),
  body text not null check (char_length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists task_notes_task_index on public.task_notes (task_id, created_at);

create table if not exists public.notification_preferences (
  staff_id uuid primary key references public.staff_profiles(id) on delete cascade,
  preferences jsonb not null default '{
    "assignment":{"inApp":true,"email":true},
    "reassignment":{"inApp":true,"email":true},
    "task_changed":{"inApp":true,"email":true},
    "note_added":{"inApp":true,"email":false},
    "task_delayed":{"inApp":true,"email":true},
    "task_completed":{"inApp":true,"email":true}
  }'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default extensions.gen_random_uuid(),
  staff_id uuid not null references public.staff_profiles(id) on delete cascade,
  event public.notification_event_type not null,
  title text not null,
  body text not null,
  task_id uuid references public.tasks(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_staff_index on public.notifications (staff_id, created_at desc);

create table if not exists public.email_outbox (
  id uuid primary key default extensions.gen_random_uuid(),
  notification_id uuid unique references public.notifications(id) on delete cascade,
  to_email extensions.citext not null,
  event public.notification_event_type not null,
  subject text not null,
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text not null unique,
  state text not null default 'pending' check (state in ('pending', 'processing', 'sent', 'failed', 'suppressed')),
  provider_message_id text,
  attempt_count integer not null default 0,
  last_error text,
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_outbox_retry_index on public.email_outbox (state, next_attempt_at)
  where state in ('pending', 'failed');

create table if not exists public.audit_events (
  id uuid primary key default extensions.gen_random_uuid(),
  actor_id uuid references public.staff_profiles(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_events_entity_index on public.audit_events (entity_type, entity_id, created_at desc);

create or replace function public.current_staff_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id
  from public.staff_profiles
  where auth_user_id = auth.uid()
    and status = 'active'
    and archived_at is null
  limit 1
$$;

create or replace function public.is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_staff_id() is not null
$$;

create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.staff_profiles
    where id = public.current_staff_id() and role = 'manager'
  )
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists staff_profiles_touch_updated_at on public.staff_profiles;
create trigger staff_profiles_touch_updated_at before update on public.staff_profiles
for each row execute function public.touch_updated_at();
drop trigger if exists warehouses_touch_updated_at on public.warehouses;
create trigger warehouses_touch_updated_at before update on public.warehouses
for each row execute function public.touch_updated_at();
drop trigger if exists tasks_touch_updated_at on public.tasks;
create trigger tasks_touch_updated_at before update on public.tasks
for each row execute function public.touch_updated_at();
drop trigger if exists notification_preferences_touch_updated_at on public.notification_preferences;
create trigger notification_preferences_touch_updated_at before update on public.notification_preferences
for each row execute function public.touch_updated_at();
drop trigger if exists email_outbox_touch_updated_at on public.email_outbox;
create trigger email_outbox_touch_updated_at before update on public.email_outbox
for each row execute function public.touch_updated_at();

create or replace function public.record_audit_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_row jsonb;
  after_row jsonb;
  row_id uuid;
begin
  before_row := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  after_row := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  row_id := coalesce((after_row ->> 'id')::uuid, (before_row ->> 'id')::uuid);
  insert into public.audit_events(actor_id, entity_type, entity_id, action, before_data, after_data)
  values (public.current_staff_id(), tg_table_name, row_id, lower(tg_op), before_row, after_row);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists audit_staff_profiles on public.staff_profiles;
create trigger audit_staff_profiles after insert or update or delete on public.staff_profiles
for each row execute function public.record_audit_event();
drop trigger if exists audit_warehouses on public.warehouses;
create trigger audit_warehouses after insert or update or delete on public.warehouses
for each row execute function public.record_audit_event();
drop trigger if exists audit_tasks on public.tasks;
create trigger audit_tasks after insert or update or delete on public.tasks
for each row execute function public.record_audit_event();

create or replace function public.protect_last_manager()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'manager' and old.status = 'active' and old.archived_at is null
     and (new.role <> 'manager' or new.status <> 'active' or new.archived_at is not null)
     and not exists (
       select 1 from public.staff_profiles
       where id <> old.id and role = 'manager' and status = 'active' and archived_at is null
     ) then
    raise exception 'The final active manager cannot be demoted, suspended, or archived.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_last_manager_trigger on public.staff_profiles;
create trigger protect_last_manager_trigger before update on public.staff_profiles
for each row execute function public.protect_last_manager();

create or replace function public.prevent_staff_archive_with_open_tasks()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.archived_at is null and new.archived_at is not null and exists (
    select 1 from public.task_assignees ta
    join public.tasks t on t.id = ta.task_id
    where ta.staff_id = old.id and t.archived_at is null and t.status <> 'complete'
  ) then
    raise exception 'Reassign or complete this staff member''s open tasks before archiving.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_staff_archive_trigger on public.staff_profiles;
create trigger prevent_staff_archive_trigger before update on public.staff_profiles
for each row execute function public.prevent_staff_archive_with_open_tasks();

create or replace function public.prevent_warehouse_archive_with_open_tasks()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.archived_at is null and new.archived_at is not null and exists (
    select 1 from public.tasks
    where warehouse_id = old.id and archived_at is null and status <> 'complete'
  ) then
    raise exception 'Reassign, complete, or archive open tasks before archiving this warehouse.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_warehouse_archive_trigger on public.warehouses;
create trigger prevent_warehouse_archive_trigger before update on public.warehouses
for each row execute function public.prevent_warehouse_archive_with_open_tasks();

create or replace function public.queue_notification_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient public.staff_profiles%rowtype;
  channel_enabled boolean;
begin
  select * into recipient from public.staff_profiles where id = new.staff_id;
  if recipient.id is null or recipient.status not in ('invited', 'active') or recipient.archived_at is not null then
    return new;
  end if;
  if new.event in ('invitation', 'password_reset') then
    channel_enabled := true;
  else
    select coalesce((preferences -> new.event::text ->> 'email')::boolean, true)
      into channel_enabled
      from public.notification_preferences where staff_id = new.staff_id;
    channel_enabled := coalesce(channel_enabled, true);
  end if;
  if channel_enabled then
    insert into public.email_outbox(notification_id, to_email, event, subject, payload, idempotency_key)
    values (
      new.id,
      recipient.email,
      new.event,
      new.title,
      jsonb_build_object('name', recipient.full_name, 'title', new.title, 'body', new.body, 'taskId', new.task_id),
      new.event::text || '/' || new.id::text
    ) on conflict (notification_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists queue_notification_email_trigger on public.notifications;
create trigger queue_notification_email_trigger after insert on public.notifications
for each row execute function public.queue_notification_email();

create or replace function public.update_assigned_task_progress(
  target_task_id uuid,
  next_status public.task_status,
  note_body text default null,
  expected_version integer default null
)
returns public.tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  current_task public.tasks%rowtype;
  updated_task public.tasks%rowtype;
begin
  actor := public.current_staff_id();
  if actor is null then raise exception 'Authentication required.' using errcode = 'insufficient_privilege'; end if;

  select * into current_task from public.tasks where id = target_task_id for update;
  if current_task.id is null or current_task.archived_at is not null then raise exception 'Task not found.' using errcode = 'no_data_found'; end if;
  if not exists (select 1 from public.task_assignees where task_id = target_task_id and staff_id = actor) then
    raise exception 'Only an assigned team member can update this task.' using errcode = 'insufficient_privilege';
  end if;
  if expected_version is not null and current_task.version <> expected_version then
    raise exception 'This task changed in another session. Refresh and try again.' using errcode = 'serialization_failure';
  end if;
  if not (
    current_task.status = next_status
    or (current_task.status = 'pending' and next_status in ('in_progress', 'delayed'))
    or (current_task.status = 'in_progress' and next_status in ('complete', 'delayed'))
    or (current_task.status = 'delayed' and next_status in ('in_progress', 'complete'))
  ) then
    raise exception 'That status transition is not allowed for warehouse team members.' using errcode = 'check_violation';
  end if;

  update public.tasks
    set status = next_status, version = version + 1
    where id = target_task_id
    returning * into updated_task;

  if note_body is not null and char_length(trim(note_body)) > 0 then
    insert into public.task_notes(task_id, author_id, body) values (target_task_id, actor, trim(note_body));
  end if;

  insert into public.notifications(staff_id, event, title, body, task_id)
  select distinct recipient.id,
    case when next_status = 'complete' then 'task_completed'::public.notification_event_type
         when next_status = 'delayed' then 'task_delayed'::public.notification_event_type
         else 'task_changed'::public.notification_event_type end,
    'Task status updated',
    updated_task.invoice || ' is now ' || initcap(replace(next_status::text, '_', ' ')) || '.',
    target_task_id
  from public.staff_profiles recipient
  where recipient.status = 'active' and recipient.archived_at is null and recipient.id <> actor
    and (
      recipient.role = 'manager'
      or exists (select 1 from public.task_assignees ta where ta.task_id = target_task_id and ta.staff_id = recipient.id)
    );

  return updated_task;
end;
$$;

revoke all on function public.update_assigned_task_progress(uuid, public.task_status, text, integer) from public;
grant execute on function public.update_assigned_task_progress(uuid, public.task_status, text, integer) to authenticated;

alter table public.staff_profiles enable row level security;
alter table public.warehouses enable row level security;
alter table public.staff_warehouses enable row level security;
alter table public.tasks enable row level security;
alter table public.task_items enable row level security;
alter table public.task_assignees enable row level security;
alter table public.task_notes enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notifications enable row level security;
alter table public.email_outbox enable row level security;
alter table public.audit_events enable row level security;

create policy "active staff read directory" on public.staff_profiles for select to authenticated using (public.is_active_staff());
create policy "managers manage staff" on public.staff_profiles for all to authenticated using (public.is_manager()) with check (public.is_manager());
create policy "active staff read warehouses" on public.warehouses for select to authenticated using (public.is_active_staff());
create policy "managers manage warehouses" on public.warehouses for all to authenticated using (public.is_manager()) with check (public.is_manager());
create policy "active staff read memberships" on public.staff_warehouses for select to authenticated using (public.is_active_staff());
create policy "managers manage memberships" on public.staff_warehouses for all to authenticated using (public.is_manager()) with check (public.is_manager());
create policy "active staff read tasks" on public.tasks for select to authenticated using (public.is_active_staff());
create policy "managers manage tasks" on public.tasks for all to authenticated using (public.is_manager()) with check (public.is_manager());
create policy "active staff read items" on public.task_items for select to authenticated using (public.is_active_staff());
create policy "managers manage items" on public.task_items for all to authenticated using (public.is_manager()) with check (public.is_manager());
create policy "active staff read assignments" on public.task_assignees for select to authenticated using (public.is_active_staff());
create policy "managers manage assignments" on public.task_assignees for all to authenticated using (public.is_manager()) with check (public.is_manager());
create policy "active staff read notes" on public.task_notes for select to authenticated using (public.is_active_staff());
create policy "managers add notes" on public.task_notes for insert to authenticated with check (public.is_manager() and author_id = public.current_staff_id());
create policy "assigned team add notes" on public.task_notes for insert to authenticated with check (
  author_id = public.current_staff_id()
  and exists (select 1 from public.task_assignees ta where ta.task_id = task_id and ta.staff_id = public.current_staff_id())
);
create policy "staff read own preferences" on public.notification_preferences for select to authenticated using (staff_id = public.current_staff_id());
create policy "staff create own preferences" on public.notification_preferences for insert to authenticated with check (staff_id = public.current_staff_id());
create policy "staff update own preferences" on public.notification_preferences for update to authenticated using (staff_id = public.current_staff_id()) with check (staff_id = public.current_staff_id());
create policy "staff read own notifications" on public.notifications for select to authenticated using (staff_id = public.current_staff_id());
create policy "staff mark own notifications" on public.notifications for update to authenticated using (staff_id = public.current_staff_id()) with check (staff_id = public.current_staff_id());
create policy "managers read email outbox" on public.email_outbox for select to authenticated using (public.is_manager());
create policy "managers read audit trail" on public.audit_events for select to authenticated using (public.is_manager());

create or replace function public.broadcast_operations_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.broadcast_changes(
    'operations:' || tg_table_name,
    tg_op,
    tg_op,
    tg_table_name,
    tg_table_schema,
    new,
    old
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array['tasks','task_assignees','task_notes','warehouses','notifications'] loop
    execute format('drop trigger if exists broadcast_%I_changes on public.%I', table_name, table_name);
    execute format('create trigger broadcast_%I_changes after insert or update or delete on public.%I for each row execute function public.broadcast_operations_change()', table_name, table_name);
  end loop;
end $$;

do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute 'alter table realtime.messages enable row level security';
    execute 'drop policy if exists "active staff receive operations broadcasts" on realtime.messages';
    execute 'create policy "active staff receive operations broadcasts" on realtime.messages for select to authenticated using (public.is_active_staff() and topic like ''operations:%'')';
  end if;
end $$;
