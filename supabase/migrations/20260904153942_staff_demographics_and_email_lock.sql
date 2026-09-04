alter table public.staff_profiles
  add column if not exists gender text not null default 'Prefer not to say',
  add column if not exists date_of_birth date,
  add column if not exists pre_archive_status public.staff_status;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.staff_profiles'::regclass
      and conname = 'staff_profiles_gender_check'
  ) then
    alter table public.staff_profiles
      add constraint staff_profiles_gender_check
      check (gender in ('Male', 'Female', 'Prefer not to say'));
  end if;
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.staff_profiles'::regclass
      and conname = 'staff_profiles_pre_archive_status_check'
  ) then
    alter table public.staff_profiles
      add constraint staff_profiles_pre_archive_status_check
      check (pre_archive_status is null or pre_archive_status <> 'archived');
  end if;
end;
$$;

drop function if exists public.save_staff_profile(uuid, text, text, public.app_role, text, uuid[]);

create function public.save_staff_profile(
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

  delete from public.staff_warehouses where staff_id = saved_id;
  insert into public.staff_warehouses(staff_id, warehouse_id)
  select saved_id, warehouse_id
  from unnest(staff_warehouse_ids) warehouse_id
  on conflict do nothing;

  insert into public.audit_events(actor_id, entity_type, entity_id, action, after_data)
  values (
    actor,
    'staff_warehouses',
    saved_id,
    'replace',
    jsonb_build_object('warehouseIds', staff_warehouse_ids)
  );
  return saved_id;
end;
$$;

revoke all on function public.save_staff_profile(uuid, text, text, public.app_role, text, uuid[], text, date) from public;
grant execute on function public.save_staff_profile(uuid, text, text, public.app_role, text, uuid[], text, date) to authenticated;

create or replace function public.set_staff_state(target_staff_id uuid, state_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.staff_profiles%rowtype;
  next_status public.staff_status;
begin
  perform public.assert_manager();

  select * into existing
  from public.staff_profiles
  where id = target_staff_id
  for update;
  if not found then
    raise exception 'Staff member not found.' using errcode = 'no_data_found';
  end if;

  if state_action = 'archive' then
    if existing.status = 'archived' then
      raise exception 'Staff member is already archived.' using errcode = 'check_violation';
    end if;
    update public.staff_profiles
    set pre_archive_status = existing.status,
        status = 'archived',
        archived_at = now()
    where id = target_staff_id;
    return;
  end if;

  if state_action = 'restore' then
    if existing.status <> 'archived' then
      raise exception 'Only archived staff members can be restored.' using errcode = 'check_violation';
    end if;
    next_status := coalesce(
      existing.pre_archive_status,
      case when existing.auth_user_id is null then 'uninvited'::public.staff_status else 'active'::public.staff_status end
    );
    update public.staff_profiles
    set status = next_status,
        archived_at = null,
        pre_archive_status = null
    where id = target_staff_id;
    return;
  end if;

  if state_action = 'suspend' then
    next_status := 'suspended';
  elsif state_action = 'reactivate' then
    next_status := 'active';
  else
    raise exception 'Unsupported staff action.' using errcode = 'check_violation';
  end if;

  update public.staff_profiles
  set status = next_status,
      archived_at = null,
      pre_archive_status = null
  where id = target_staff_id;
end;
$$;

revoke all on function public.set_staff_state(uuid, text) from public;
grant execute on function public.set_staff_state(uuid, text) to authenticated;
