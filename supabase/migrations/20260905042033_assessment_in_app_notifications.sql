-- Operational delivery is in-app only. Supabase Auth invitation/recovery
-- delivery is separate and is intentionally unchanged. Historical outbox rows
-- are retained, and the application worker is disabled unless explicitly enabled.
drop trigger if exists queue_notification_email_trigger on public.notifications;

alter table public.notifications add column if not exists notification_key text;
create unique index if not exists notifications_deduplication_index
  on public.notifications(notification_key) where notification_key is not null;
create index if not exists audit_events_paging_index on public.audit_events(created_at desc, id desc);
create index if not exists audit_events_actor_paging_index on public.audit_events(actor_id, created_at desc, id desc);

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- One change alert per task update. Deferred evaluation uses the final assignment
-- set, rather than notifying staff whose access was removed in the same action.
create or replace function private.notify_task_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.current_staff_id();
  event_type public.notification_event_type := 'task_changed';
  heading text;
  changes text[] := '{}'::text[];
begin
  if actor is null then return new; end if;
  if old.archived_at is distinct from new.archived_at then
    heading := case when new.archived_at is null then 'Task restored' else 'Task archived' end;
    changes := array_append(changes, case when new.archived_at is null then 'restored' else 'archived' end);
  end if;
  if old.status is distinct from new.status then
    if old.status = 'complete' then heading := coalesce(heading, 'Task reopened');
    elsif new.status = 'complete' then heading := coalesce(heading, 'Task completed'); event_type := 'task_completed';
    elsif new.status = 'delayed' then heading := coalesce(heading, 'Task delayed'); event_type := 'task_delayed';
    else heading := coalesce(heading, 'Task status updated'); end if;
    changes := array_append(changes, 'status: ' || initcap(replace(new.status::text, '_', ' ')));
  end if;
  if old.priority is distinct from new.priority then
    heading := coalesce(heading, 'Task priority changed');
    changes := array_append(changes, case when new.priority then 'high priority' else 'normal priority' end);
  end if;
  if old.scheduled_at is distinct from new.scheduled_at then changes := array_append(changes, 'schedule changed'); end if;
  if old.warehouse_id is distinct from new.warehouse_id then changes := array_append(changes, 'warehouse changed'); end if;
  if old.description is distinct from new.description or old.type is distinct from new.type then changes := array_append(changes, 'details changed'); end if;
  if cardinality(changes) = 0 then return new; end if;
  insert into public.notifications(staff_id, event, title, body, task_id)
  select recipient.id, event_type, coalesce(heading, 'Task details updated'),
    new.invoice || ' — ' || array_to_string(changes, '; ') || '.', new.id
  from public.staff_profiles recipient
  where recipient.status = 'active' and recipient.archived_at is null and recipient.id <> actor
    and (recipient.role = 'manager' or exists (
      select 1 from public.task_assignees ta where ta.task_id = new.id and ta.staff_id = recipient.id
    ));
  return new;
end;
$$;
revoke all on function private.notify_task_change() from public, anon, authenticated;
drop trigger if exists notify_task_change on public.tasks;
create constraint trigger notify_task_change after update on public.tasks
deferrable initially deferred for each row execute function private.notify_task_change();

create or replace function private.notify_staff_access_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.current_staff_id(); detail text;
begin
  if actor is null then return new; end if;
  if old.role is distinct from new.role then
    detail := 'role changed to ' || case when new.role = 'manager' then 'Manager' else 'Warehouse Team' end;
  end if;
  if old.status is distinct from new.status then
    detail := concat_ws('; ', detail, case
      when old.status = 'invited' and new.status = 'active' then 'invitation accepted'
      when new.status = 'suspended' then 'account suspended'
      when new.status = 'archived' then 'account archived'
      when new.status = 'active' then 'account activated'
      else 'access status changed to ' || new.status::text end);
  end if;
  if detail is null then return new; end if;
  insert into public.notifications(staff_id, event, title, body)
  select id, 'task_changed', 'Staff access updated', new.full_name || ' — ' || detail || '.'
  from public.staff_profiles
  where role = 'manager' and status = 'active' and archived_at is null and id <> actor;
  return new;
end;
$$;
revoke all on function private.notify_staff_access_change() from public, anon, authenticated;
drop trigger if exists notify_staff_access_change on public.staff_profiles;
create constraint trigger notify_staff_access_change after update on public.staff_profiles
deferrable initially deferred for each row execute function private.notify_staff_access_change();

-- Call on app load/refresh. No client-supplied recipient/date: each caller can only
-- create their own relevant reminders. Unique keys prevent refresh/realtime loops.
create or replace function private.refresh_my_task_reminders()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.current_staff_id();
  manager boolean := public.is_manager();
  melbourne_today date := (now() at time zone 'Australia/Melbourne')::date;
  inserted_count integer;
begin
  if actor is null then raise exception 'Authentication required.' using errcode = 'insufficient_privilege'; end if;
  insert into public.notifications(staff_id, event, title, body, task_id, notification_key)
  select actor, 'task_changed',
    case when (task.scheduled_at at time zone 'Australia/Melbourne')::date < melbourne_today then 'Task overdue' else 'Task due today' end,
    task.invoice || ' at ' || warehouse.name || case
      when (task.scheduled_at at time zone 'Australia/Melbourne')::date < melbourne_today then ' is overdue and still unfinished.'
      else ' is due today.' end,
    task.id,
    'reminder:' || actor::text || ':' || task.id::text || ':' || task.scheduled_at::text || ':' ||
      case when (task.scheduled_at at time zone 'Australia/Melbourne')::date < melbourne_today then 'overdue' else 'today' end
  from public.tasks task join public.warehouses warehouse on warehouse.id = task.warehouse_id
  where task.archived_at is null and warehouse.archived_at is null and task.status <> 'complete'
    and (task.scheduled_at at time zone 'Australia/Melbourne')::date <= melbourne_today
    and (
      (manager and (task.scheduled_at at time zone 'Australia/Melbourne')::date < melbourne_today)
      or exists(select 1 from public.task_assignees ta where ta.task_id = task.id and ta.staff_id = actor)
    )
  on conflict (notification_key) where notification_key is not null do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;
revoke all on function private.refresh_my_task_reminders() from public, anon;
grant execute on function private.refresh_my_task_reminders() to authenticated;

create or replace function public.refresh_my_task_reminders()
returns integer language sql security invoker set search_path = ''
as $$ select private.refresh_my_task_reminders(); $$;
revoke all on function public.refresh_my_task_reminders() from public, anon;
grant execute on function public.refresh_my_task_reminders() to authenticated;

-- Keep existing permission/version/transition checks. Task change notifications
-- now have one source so manager/team updates do not produce duplicate messages.
create or replace function public.update_operations_task(
  target_task_id uuid,
  expected_version integer,
  task_type_value public.task_type,
  task_warehouse_id uuid,
  task_scheduled_at timestamptz,
  task_status_value public.task_status,
  task_description text,
  task_priority boolean,
  task_assignee_ids uuid[],
  task_items_value jsonb,
  task_note text default null
)
returns public.tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  existing public.tasks%rowtype;
  updated public.tasks%rowtype;
  assignee_id uuid;
  item jsonb;
  removed_assignees uuid[];
  added_assignees uuid[];
begin
  actor := public.assert_manager();
  select * into existing from public.tasks where id = target_task_id for update;
  if existing.id is null then raise exception 'Task not found.' using errcode = 'no_data_found'; end if;
  if existing.version <> expected_version then
    raise exception 'This task changed in another session. Refresh and try again.' using errcode = 'serialization_failure';
  end if;
  if not exists (select 1 from public.warehouses where id = task_warehouse_id and status = 'active' and archived_at is null) then
    raise exception 'Choose an active warehouse.' using errcode = 'check_violation';
  end if;
  perform public.assert_eligible_assignees(task_warehouse_id, task_assignee_ids);
  if jsonb_typeof(task_items_value) <> 'array' or jsonb_array_length(task_items_value) = 0 then
    raise exception 'Add at least one task item.' using errcode = 'check_violation';
  end if;

  select coalesce(array_agg(staff_id), '{}'::uuid[]) into removed_assignees
  from public.task_assignees where task_id = target_task_id and not staff_id = any(task_assignee_ids);
  select coalesce(array_agg(candidate), '{}'::uuid[]) into added_assignees
  from unnest(task_assignee_ids) candidate
  where not exists (select 1 from public.task_assignees where task_id = target_task_id and staff_id = candidate);
  update public.tasks set
    type = task_type_value,
    warehouse_id = task_warehouse_id,
    scheduled_at = task_scheduled_at,
    status = task_status_value,
    description = trim(task_description),
    priority = task_priority,
    version = version + 1
  where id = target_task_id returning * into updated;

  delete from public.task_items where task_id = target_task_id;
  for item in select value from jsonb_array_elements(task_items_value) loop
    insert into public.task_items(task_id, name, quantity, sort_order)
    values (target_task_id, trim(item ->> 'name'), trim(item ->> 'quantity'), coalesce((item ->> 'sortOrder')::integer, 0));
  end loop;
  delete from public.task_assignees where task_id = target_task_id;
  foreach assignee_id in array task_assignee_ids loop
    insert into public.task_assignees(task_id, staff_id, assigned_by) values (target_task_id, assignee_id, actor);
  end loop;

  foreach assignee_id in array added_assignees loop
    insert into public.notifications(staff_id, event, title, body, task_id)
    values (assignee_id, 'assignment', 'Task assigned', updated.invoice || ' has been assigned to you.', target_task_id);
  end loop;
  foreach assignee_id in array removed_assignees loop
    insert into public.notifications(staff_id, event, title, body, task_id)
    values (assignee_id, 'reassignment', 'Task reassigned', updated.invoice || ' is no longer assigned to you.', target_task_id);
  end loop;
  if task_note is not null and char_length(trim(task_note)) > 0 then
    insert into public.task_notes(task_id, author_id, body) values (target_task_id, actor, trim(task_note));
    insert into public.notifications(staff_id, event, title, body, task_id)
    select staff_id, 'note_added', 'New task note', actor_profile.full_name || ' added a note to ' || updated.invoice || '.', target_task_id
    from public.task_assignees, lateral (select full_name from public.staff_profiles where id = actor) actor_profile
    where task_id = target_task_id and staff_id <> actor;
  end if;
  return updated;
end;
$$;

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
  note_added boolean;
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
    or (current_task.status = 'complete' and next_status in ('pending', 'in_progress', 'delayed'))
  ) then
    raise exception 'That status transition is not allowed for warehouse team members.' using errcode = 'check_violation';
  end if;

  note_added := note_body is not null and char_length(trim(note_body)) > 0;
  update public.tasks
    set status = next_status, version = version + 1
    where id = target_task_id
    returning * into updated_task;

  if note_added then
    insert into public.task_notes(task_id, author_id, body) values (target_task_id, actor, trim(note_body));
  end if;

  if note_added then
    insert into public.notifications(staff_id, event, title, body, task_id)
    select distinct recipient.id,
      'note_added'::public.notification_event_type,
      'New task note',
      actor_profile.full_name || ' added a note to ' || updated_task.invoice || '.',
      target_task_id
    from public.staff_profiles recipient
    cross join lateral (select full_name from public.staff_profiles where id = actor) actor_profile
    where recipient.status = 'active' and recipient.archived_at is null and recipient.id <> actor
      and (
        recipient.role = 'manager'
        or exists (select 1 from public.task_assignees ta where ta.task_id = target_task_id and ta.staff_id = recipient.id)
      );
  end if;

  return updated_task;
end;
$$;

revoke all on function public.update_assigned_task_progress(uuid, public.task_status, text, integer) from public;
grant execute on function public.update_assigned_task_progress(uuid, public.task_status, text, integer) to authenticated;


create or replace function public.save_staff_profile(
  target_staff_id uuid,
  staff_full_name text,
  staff_email text,
  staff_role public.app_role,
  staff_location text,
  staff_warehouse_ids uuid[],
  staff_gender text,
  staff_date_of_birth date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  saved_id uuid;
  existing public.staff_profiles%rowtype;
  previous_warehouse_ids uuid[];
begin
  actor := public.assert_manager();

  if staff_role = 'warehouse_team' and coalesce(array_length(staff_warehouse_ids, 1), 0) = 0 then
    raise exception 'Choose at least one warehouse for a team member.' using errcode = 'check_violation';
  end if;
  if staff_role = 'manager' then
    staff_warehouse_ids := '{}'::uuid[];
  end if;
  if exists (
    select 1
    from public.warehouses
    where id = any(staff_warehouse_ids)
      and (status <> 'active' or archived_at is not null)
  ) then
    raise exception 'Warehouse access can only use active warehouses.' using errcode = 'check_violation';
  end if;
  if staff_gender not in ('Male', 'Female', 'Prefer not to say') then
    raise exception 'Choose a valid gender option.' using errcode = 'check_violation';
  end if;

  if target_staff_id is null then
    insert into public.staff_profiles(full_name, email, role, status, location, gender, date_of_birth)
    values (
      trim(staff_full_name),
      lower(trim(staff_email)),
      staff_role,
      'uninvited',
      trim(staff_location),
      staff_gender,
      staff_date_of_birth
    )
    returning id into saved_id;
  else
    select * into existing
    from public.staff_profiles
    where id = target_staff_id
    for update;
    if not found then
      raise exception 'Staff member not found.' using errcode = 'no_data_found';
    end if;
    if existing.auth_user_id is not null and existing.email <> lower(trim(staff_email)) then
      raise exception 'A linked login email cannot be changed here. Ask a Supabase administrator to migrate the login first.' using errcode = 'check_violation';
    end if;

    update public.staff_profiles
    set full_name = trim(staff_full_name),
        email = lower(trim(staff_email)),
        role = staff_role,
        location = trim(staff_location),
        gender = staff_gender,
        date_of_birth = staff_date_of_birth
    where id = target_staff_id
    returning id into saved_id;
  end if;

  select coalesce(array_agg(warehouse_id order by warehouse_id), '{}'::uuid[])
  into previous_warehouse_ids from public.staff_warehouses where staff_id = saved_id;
  select coalesce(array_agg(distinct id order by id), '{}'::uuid[])
  into staff_warehouse_ids from unnest(staff_warehouse_ids) id;

  delete from public.staff_warehouses
  where staff_id = saved_id and not (warehouse_id = any(staff_warehouse_ids));
  insert into public.staff_warehouses(staff_id, warehouse_id)
  select saved_id, warehouse_id from unnest(staff_warehouse_ids) warehouse_id
  on conflict do nothing;

  if previous_warehouse_ids is distinct from staff_warehouse_ids then
    insert into public.audit_events(actor_id, entity_type, entity_id, action, before_data, after_data)
    values (actor, 'staff_warehouses', saved_id, 'warehouse_access_changed',
      jsonb_build_object('warehouse_ids', previous_warehouse_ids),
      jsonb_build_object('warehouse_ids', staff_warehouse_ids));
    insert into public.notifications(staff_id, event, title, body)
    select id, 'task_changed', 'Warehouse access changed',
      trim(staff_full_name) || '''s warehouse access has changed. Review Role Management for details.'
    from public.staff_profiles
    where role = 'manager' and status = 'active' and archived_at is null and id <> actor;
  end if;
  return saved_id;
end;
$$;
