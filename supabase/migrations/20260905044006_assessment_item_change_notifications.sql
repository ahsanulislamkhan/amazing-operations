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
  items_changed boolean;
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
  select
    coalesce((select jsonb_agg(jsonb_build_object('name', name, 'quantity', quantity, 'sortOrder', sort_order) order by sort_order, name, quantity) from public.task_items where task_id = target_task_id), '[]'::jsonb)
    is distinct from
    coalesce((select jsonb_agg(jsonb_build_object('name', trim(value->>'name'), 'quantity', trim(value->>'quantity'), 'sortOrder', coalesce((value->>'sortOrder')::integer, 0)) order by coalesce((value->>'sortOrder')::integer, 0), trim(value->>'name'), trim(value->>'quantity')) from jsonb_array_elements(task_items_value)), '[]'::jsonb)
  into items_changed;

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
  -- Changes to items alone do not change the task row's other fields. Notify once,
  -- while mixed edits are covered by the existing deferred task-change trigger.
  if items_changed
    and (existing.type, existing.warehouse_id, existing.scheduled_at, existing.status, existing.description, existing.priority)
      is not distinct from
        (updated.type, updated.warehouse_id, updated.scheduled_at, updated.status, updated.description, updated.priority)
  then
    insert into public.notifications(staff_id, event, title, body, task_id)
    select recipient.id, 'task_changed', 'Task items updated', updated.invoice || ' items or quantities changed.', target_task_id
    from public.staff_profiles recipient
    where recipient.status = 'active' and recipient.archived_at is null and recipient.id <> actor
      and (recipient.role = 'manager' or exists(select 1 from public.task_assignees ta where ta.task_id = target_task_id and ta.staff_id = recipient.id));
  end if;
  if task_note is not null and char_length(trim(task_note)) > 0 then
    insert into public.task_notes(task_id, author_id, body) values (target_task_id, actor, trim(task_note));
    insert into public.notifications(staff_id, event, title, body, task_id)
    select recipient.id, 'note_added', 'New task note', actor_profile.full_name || ' added a note to ' || updated.invoice || '.', target_task_id
    from public.staff_profiles recipient
    cross join lateral (select full_name from public.staff_profiles where id = actor) actor_profile
    where recipient.status = 'active' and recipient.archived_at is null and recipient.id <> actor
      and (recipient.role = 'manager' or exists(select 1 from public.task_assignees ta where ta.task_id = target_task_id and ta.staff_id = recipient.id));
  end if;
  return updated;
end;
$$;
