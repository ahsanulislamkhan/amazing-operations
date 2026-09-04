create or replace function public.assert_manager()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare actor uuid;
begin
  actor := public.current_staff_id();
  if actor is null or not public.is_manager() then
    raise exception 'Manager access is required.' using errcode = 'insufficient_privilege';
  end if;
  return actor;
end;
$$;

create or replace function public.assert_eligible_assignees(target_warehouse_id uuid, assignee_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare eligible_count integer;
begin
  if coalesce(array_length(assignee_ids, 1), 0) = 0 then
    raise exception 'Choose at least one assignee.' using errcode = 'check_violation';
  end if;
  select count(distinct staff.id) into eligible_count
  from public.staff_profiles staff
  join public.staff_warehouses membership on membership.staff_id = staff.id
  where staff.id = any(assignee_ids)
    and staff.role = 'warehouse_team'
    and staff.status = 'active'
    and staff.archived_at is null
    and membership.warehouse_id = target_warehouse_id;
  if eligible_count <> cardinality(assignee_ids) then
    raise exception 'Every assignee must be an active team member connected to the selected warehouse.' using errcode = 'check_violation';
  end if;
end;
$$;

create or replace function public.create_operations_task(
  task_invoice text,
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
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  created_task_id uuid;
  assignee_id uuid;
  item jsonb;
begin
  actor := public.assert_manager();
  if not exists (select 1 from public.warehouses where id = task_warehouse_id and status = 'active' and archived_at is null) then
    raise exception 'Choose an active warehouse.' using errcode = 'check_violation';
  end if;
  perform public.assert_eligible_assignees(task_warehouse_id, task_assignee_ids);
  if jsonb_typeof(task_items_value) <> 'array' or jsonb_array_length(task_items_value) = 0 then
    raise exception 'Add at least one task item.' using errcode = 'check_violation';
  end if;

  insert into public.tasks(invoice, type, warehouse_id, scheduled_at, status, description, priority, created_by)
  values (upper(trim(task_invoice)), task_type_value, task_warehouse_id, task_scheduled_at, task_status_value, trim(task_description), task_priority, actor)
  returning id into created_task_id;

  for item in select value from jsonb_array_elements(task_items_value) loop
    insert into public.task_items(task_id, name, quantity, sort_order)
    values (created_task_id, trim(item ->> 'name'), trim(item ->> 'quantity'), coalesce((item ->> 'sortOrder')::integer, 0));
  end loop;
  foreach assignee_id in array task_assignee_ids loop
    insert into public.task_assignees(task_id, staff_id, assigned_by) values (created_task_id, assignee_id, actor);
    insert into public.notifications(staff_id, event, title, body, task_id)
    values (assignee_id, 'assignment', 'New task assigned', upper(trim(task_invoice)) || ' has been assigned to you.', created_task_id);
  end loop;
  if task_note is not null and char_length(trim(task_note)) > 0 then
    insert into public.task_notes(task_id, author_id, body) values (created_task_id, actor, trim(task_note));
  end if;
  return created_task_id;
end;
$$;

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
  details_changed boolean;
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
  details_changed := existing.warehouse_id <> task_warehouse_id or existing.scheduled_at <> task_scheduled_at
    or existing.description <> trim(task_description) or existing.type <> task_type_value or existing.priority <> task_priority;

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
  if details_changed then
    insert into public.notifications(staff_id, event, title, body, task_id)
    select staff_id, 'task_changed', 'Task details updated', updated.invoice || ' schedule, warehouse, or details changed.', target_task_id
    from public.task_assignees where task_id = target_task_id;
  end if;
  if existing.status <> task_status_value and task_status_value in ('delayed', 'complete') then
    insert into public.notifications(staff_id, event, title, body, task_id)
    select distinct recipient.id,
      case when task_status_value = 'delayed' then 'task_delayed'::public.notification_event_type else 'task_completed'::public.notification_event_type end,
      case when task_status_value = 'delayed' then 'Task delayed' else 'Task completed' end,
      updated.invoice || ' is now ' || initcap(task_status_value::text) || '.',
      target_task_id
    from public.staff_profiles recipient
    where recipient.status = 'active' and recipient.archived_at is null and recipient.id <> actor
      and (recipient.role = 'manager' or exists (select 1 from public.task_assignees ta where ta.task_id = target_task_id and ta.staff_id = recipient.id));
  end if;
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

create or replace function public.set_task_archived(target_task_id uuid, restore_task boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_manager();
  update public.tasks set archived_at = case when restore_task then null else now() end, version = version + 1 where id = target_task_id;
  if not found then raise exception 'Task not found.' using errcode = 'no_data_found'; end if;
end;
$$;

create or replace function public.save_staff_profile(
  target_staff_id uuid,
  staff_full_name text,
  staff_email text,
  staff_role public.app_role,
  staff_location text,
  staff_warehouse_ids uuid[]
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid; saved_id uuid;
begin
  actor := public.assert_manager();
  if staff_role = 'warehouse_team' and coalesce(array_length(staff_warehouse_ids, 1), 0) = 0 then
    raise exception 'Choose at least one warehouse for a team member.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.warehouses where id = any(staff_warehouse_ids) and (status <> 'active' or archived_at is not null)) then
    raise exception 'Warehouse access can only use active warehouses.' using errcode = 'check_violation';
  end if;
  if target_staff_id is null then
    insert into public.staff_profiles(full_name, email, role, status, location)
    values (trim(staff_full_name), lower(trim(staff_email)), staff_role, 'uninvited', trim(staff_location)) returning id into saved_id;
  else
    update public.staff_profiles set full_name = trim(staff_full_name), email = lower(trim(staff_email)), role = staff_role, location = trim(staff_location)
    where id = target_staff_id returning id into saved_id;
    if saved_id is null then raise exception 'Staff member not found.' using errcode = 'no_data_found'; end if;
  end if;
  delete from public.staff_warehouses where staff_id = saved_id;
  insert into public.staff_warehouses(staff_id, warehouse_id)
  select saved_id, warehouse_id from unnest(staff_warehouse_ids) warehouse_id
  on conflict do nothing;
  insert into public.audit_events(actor_id, entity_type, entity_id, action, after_data)
  values (actor, 'staff_warehouses', saved_id, 'replace', jsonb_build_object('warehouseIds', staff_warehouse_ids));
  return saved_id;
end;
$$;

create or replace function public.set_staff_state(target_staff_id uuid, state_action text)
returns void language plpgsql security definer set search_path = '' as $$
declare next_status public.staff_status; next_archived_at timestamptz;
begin
  perform public.assert_manager();
  if state_action = 'suspend' then next_status := 'suspended'; next_archived_at := null;
  elsif state_action = 'reactivate' then next_status := 'active'; next_archived_at := null;
  elsif state_action = 'archive' then next_status := 'archived'; next_archived_at := now();
  elsif state_action = 'restore' then
    select case when auth_user_id is null then 'uninvited'::public.staff_status else 'active'::public.staff_status end into next_status
    from public.staff_profiles where id = target_staff_id;
    next_archived_at := null;
  else raise exception 'Unsupported staff action.' using errcode = 'check_violation'; end if;
  update public.staff_profiles set status = next_status, archived_at = next_archived_at where id = target_staff_id;
  if not found then raise exception 'Staff member not found.' using errcode = 'no_data_found'; end if;
end;
$$;

create or replace function public.save_warehouse(target_warehouse_id uuid, warehouse_office_type text, warehouse_name text, warehouse_address text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare saved_id uuid;
begin
  perform public.assert_manager();
  if target_warehouse_id is null then
    insert into public.warehouses(office_type, name, address) values (trim(warehouse_office_type), trim(warehouse_name), trim(warehouse_address)) returning id into saved_id;
  else
    update public.warehouses set office_type = trim(warehouse_office_type), name = trim(warehouse_name), address = trim(warehouse_address)
    where id = target_warehouse_id returning id into saved_id;
    if saved_id is null then raise exception 'Warehouse not found.' using errcode = 'no_data_found'; end if;
  end if;
  return saved_id;
end;
$$;

create or replace function public.set_warehouse_archived(target_warehouse_id uuid, restore_warehouse boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_manager();
  update public.warehouses set status = case when restore_warehouse then 'active' else 'archived' end,
    archived_at = case when restore_warehouse then null else now() end
  where id = target_warehouse_id;
  if not found then raise exception 'Warehouse not found.' using errcode = 'no_data_found'; end if;
end;
$$;

create or replace function public.save_notification_preferences(next_preferences jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid;
begin
  actor := public.current_staff_id();
  if actor is null then raise exception 'Authentication required.' using errcode = 'insufficient_privilege'; end if;
  insert into public.notification_preferences(staff_id, preferences) values (actor, next_preferences)
  on conflict (staff_id) do update set preferences = excluded.preferences;
end;
$$;

create or replace function public.mark_notifications_read(notification_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid;
begin
  actor := public.current_staff_id();
  if actor is null then raise exception 'Authentication required.' using errcode = 'insufficient_privilege'; end if;
  update public.notifications set read_at = coalesce(read_at, now()) where staff_id = actor and id = any(notification_ids);
end;
$$;

create or replace function public.activate_invited_profile()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode = 'insufficient_privilege'; end if;
  update public.staff_profiles
  set status = 'active'
  where auth_user_id = auth.uid() and status = 'invited' and archived_at is null;
  if not found and not exists (
    select 1 from public.staff_profiles where auth_user_id = auth.uid() and status = 'active' and archived_at is null
  ) then
    raise exception 'This invitation is not connected to an active staff profile.' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

create or replace function public.update_own_profile(profile_full_name text, profile_location text)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid;
begin
  actor := public.current_staff_id();
  if actor is null then raise exception 'Authentication required.' using errcode = 'insufficient_privilege'; end if;
  update public.staff_profiles set full_name = trim(profile_full_name), location = trim(profile_location) where id = actor;
end;
$$;

revoke all on function public.assert_manager() from public;
revoke all on function public.assert_eligible_assignees(uuid, uuid[]) from public;
revoke all on function public.create_operations_task(text, public.task_type, uuid, timestamptz, public.task_status, text, boolean, uuid[], jsonb, text) from public;
revoke all on function public.update_operations_task(uuid, integer, public.task_type, uuid, timestamptz, public.task_status, text, boolean, uuid[], jsonb, text) from public;
revoke all on function public.set_task_archived(uuid, boolean) from public;
revoke all on function public.save_staff_profile(uuid, text, text, public.app_role, text, uuid[]) from public;
revoke all on function public.set_staff_state(uuid, text) from public;
revoke all on function public.save_warehouse(uuid, text, text, text) from public;
revoke all on function public.set_warehouse_archived(uuid, boolean) from public;
revoke all on function public.save_notification_preferences(jsonb) from public;
revoke all on function public.mark_notifications_read(uuid[]) from public;
revoke all on function public.activate_invited_profile() from public;
revoke all on function public.update_own_profile(text, text) from public;

grant execute on function public.create_operations_task(text, public.task_type, uuid, timestamptz, public.task_status, text, boolean, uuid[], jsonb, text) to authenticated;
grant execute on function public.update_operations_task(uuid, integer, public.task_type, uuid, timestamptz, public.task_status, text, boolean, uuid[], jsonb, text) to authenticated;
grant execute on function public.set_task_archived(uuid, boolean) to authenticated;
grant execute on function public.save_staff_profile(uuid, text, text, public.app_role, text, uuid[]) to authenticated;
grant execute on function public.set_staff_state(uuid, text) to authenticated;
grant execute on function public.save_warehouse(uuid, text, text, text) to authenticated;
grant execute on function public.set_warehouse_archived(uuid, boolean) to authenticated;
grant execute on function public.save_notification_preferences(jsonb) to authenticated;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
grant execute on function public.activate_invited_profile() to authenticated;
grant execute on function public.update_own_profile(text, text) to authenticated;

drop policy if exists "staff update own notifications" on public.notifications;
drop policy if exists "staff update own preferences" on public.notification_preferences;
