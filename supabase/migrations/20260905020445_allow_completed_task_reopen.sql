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
  status_changed boolean;
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

  status_changed := current_task.status <> next_status;
  note_added := note_body is not null and char_length(trim(note_body)) > 0;
  update public.tasks
    set status = next_status, version = version + 1
    where id = target_task_id
    returning * into updated_task;

  if note_added then
    insert into public.task_notes(task_id, author_id, body) values (target_task_id, actor, trim(note_body));
  end if;

  if status_changed then
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
