create table if not exists public.task_attachments (
  id uuid primary key default extensions.gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  storage_path text not null unique check (char_length(trim(storage_path)) between 3 and 500),
  file_name text not null check (char_length(trim(file_name)) between 1 and 240),
  mime_type text not null default 'application/pdf' check (mime_type = 'application/pdf'),
  file_size bigint not null check (file_size between 1 and 12582912),
  uploaded_by uuid references public.staff_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists task_attachments_task_index
  on public.task_attachments (task_id, created_at);

alter table public.task_attachments enable row level security;

grant select, insert, delete on table public.task_attachments to authenticated;

create policy "active staff read task attachments"
  on public.task_attachments
  for select
  to authenticated
  using (public.is_active_staff());

create policy "managers add task attachments"
  on public.task_attachments
  for insert
  to authenticated
  with check (
    public.is_manager()
    and uploaded_by = public.current_staff_id()
    and storage_path like task_id::text || '/%'
  );

create policy "managers remove task attachments"
  on public.task_attachments
  for delete
  to authenticated
  using (public.is_manager());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('task-invoices', 'task-invoices', false, 12582912, array['application/pdf'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "active staff read task invoice files"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'task-invoices' and public.is_active_staff());

create policy "managers upload task invoice files"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'task-invoices' and public.is_manager());

create policy "managers remove task invoice files"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'task-invoices' and public.is_manager());

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'task_attachments'
    )
  then
    alter publication supabase_realtime add table public.task_attachments;
  end if;
end;
$$;
