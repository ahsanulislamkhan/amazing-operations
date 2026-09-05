-- Remove only the fixed-ID sample records installed by the original demo seed.
-- The three operating warehouses are retained; real users and tasks use random UUIDs.

delete from public.audit_events
where actor_id::text like '20000000-0000-0000-0000-000000000%';

delete from public.tasks
where id::text like '30000000-0000-0000-0000-00000001%';

delete from public.staff_profiles
where id::text like '20000000-0000-0000-0000-000000000%';

-- Cascading deletes can emit audit rows, so remove those sample-only traces last.
delete from public.audit_events
where entity_id::text like '20000000-0000-0000-0000-000000000%'
   or entity_id::text like '30000000-0000-0000-0000-00000001%'
   or coalesce(before_data ->> 'id', '') like '20000000-0000-0000-0000-000000000%'
   or coalesce(after_data ->> 'id', '') like '20000000-0000-0000-0000-000000000%'
   or coalesce(before_data ->> 'task_id', '') like '30000000-0000-0000-0000-00000001%'
   or coalesce(after_data ->> 'task_id', '') like '30000000-0000-0000-0000-00000001%'
   or coalesce(before_data ->> 'staff_id', '') like '20000000-0000-0000-0000-000000000%'
   or coalesce(after_data ->> 'staff_id', '') like '20000000-0000-0000-0000-000000000%';
