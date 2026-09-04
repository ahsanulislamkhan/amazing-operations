do $$
declare table_name text;
begin
  if not exists (
    select 1 from pg_proc function_row
    join pg_namespace schema_row on schema_row.oid = function_row.pronamespace
    where schema_row.nspname = 'realtime' and function_row.proname = 'broadcast_changes'
  ) then
    foreach table_name in array array['tasks','task_assignees','task_notes','warehouses','notifications'] loop
      execute format('drop trigger if exists broadcast_%I_changes on public.%I', table_name, table_name);
    end loop;
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.tasks, public.task_assignees, public.task_notes, public.warehouses, public.notifications;
    exception when duplicate_object then null;
    end;
  end if;
end $$;
