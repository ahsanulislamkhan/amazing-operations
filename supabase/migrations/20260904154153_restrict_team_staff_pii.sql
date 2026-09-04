-- Warehouse-team sessions only need their own profile and memberships. Managers
-- retain the existing broad policies used by Role Management.
drop policy if exists "active staff read directory" on public.staff_profiles;
create policy "staff read own profile"
  on public.staff_profiles
  for select
  to authenticated
  using (id = (select public.current_staff_id()));

drop policy if exists "active staff read memberships" on public.staff_warehouses;
create policy "staff read own memberships"
  on public.staff_warehouses
  for select
  to authenticated
  using (staff_id = (select public.current_staff_id()));

-- Task cards still need human-readable assignee and note-author names. Keep that
-- projection server-only so authenticated browser clients cannot enumerate it.
create or replace view public.staff_name_directory
with (security_invoker = true, security_barrier = true)
as
select id, full_name
from public.staff_profiles;

revoke all on public.staff_name_directory from public;
revoke all on public.staff_name_directory from anon;
revoke all on public.staff_name_directory from authenticated;
grant select on public.staff_name_directory to service_role;
