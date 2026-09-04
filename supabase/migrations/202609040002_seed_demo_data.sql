insert into public.warehouses (id, office_type, name, address)
values
  ('10000000-0000-0000-0000-000000000001', 'Head Office', 'Sunshine', '616 Somerville Road, Sunshine West VIC 3020'),
  ('10000000-0000-0000-0000-000000000002', 'Regional Office', 'Geelong', '45 Corio Bay Road, Geelong VIC 3220'),
  ('10000000-0000-0000-0000-000000000003', 'Branch Office', 'Ballarat', '89 Lydiard Street, Ballarat VIC 3350')
on conflict (id) do update set office_type = excluded.office_type, name = excluded.name, address = excluded.address;

insert into public.staff_profiles (id, full_name, email, role, status, avatar_url, location)
values
  ('20000000-0000-0000-0000-000000000001', 'Ramie Shelbie', 'ramieshelbie@gmail.com', 'manager', 'uninvited', '/assets/avatar-ramie.png', 'Sunshine, Victoria'),
  ('20000000-0000-0000-0000-000000000002', 'Rumin Rjazier', 'ruminraizer@gmail.com', 'manager', 'uninvited', '/assets/avatar-ehsanul.png', 'Melbourne, Victoria'),
  ('20000000-0000-0000-0000-000000000003', 'Jason Lee', 'jason.lee@example.invalid', 'manager', 'uninvited', '/assets/avatar-david.png', 'Melbourne, Victoria'),
  ('20000000-0000-0000-0000-000000000101', 'Ehsanul Islam', 'ehsanul@example.invalid', 'warehouse_team', 'uninvited', '/assets/avatar-ehsanul.png', 'Sunshine, Victoria'),
  ('20000000-0000-0000-0000-000000000102', 'Ryan Kim', 'ryan@example.invalid', 'warehouse_team', 'uninvited', '/assets/avatar-ryan.png', 'Sunshine, Victoria'),
  ('20000000-0000-0000-0000-000000000103', 'Sam D’Souza', 'sam@example.invalid', 'warehouse_team', 'uninvited', '/assets/avatar-sam.png', 'Geelong, Victoria'),
  ('20000000-0000-0000-0000-000000000104', 'Alice Johnson', 'alice@example.invalid', 'warehouse_team', 'uninvited', '/assets/avatar-alice.png', 'Geelong, Victoria'),
  ('20000000-0000-0000-0000-000000000105', 'David Lee', 'david@example.invalid', 'warehouse_team', 'uninvited', '/assets/avatar-david.png', 'Ballarat, Victoria'),
  ('20000000-0000-0000-0000-000000000106', 'Laura Chen', 'laura@example.invalid', 'warehouse_team', 'uninvited', '/assets/avatar-laura.png', 'Ballarat, Victoria'),
  ('20000000-0000-0000-0000-000000000107', 'Mark Thompson', 'mark@example.invalid', 'warehouse_team', 'uninvited', '/assets/avatar-mark.png', 'Sunshine, Victoria'),
  ('20000000-0000-0000-0000-000000000108', 'Emma Watson', 'emma@example.invalid', 'warehouse_team', 'uninvited', '/assets/avatar-emma.png', 'Sunshine, Victoria'),
  ('20000000-0000-0000-0000-000000000109', 'James Smith', 'james@example.invalid', 'warehouse_team', 'uninvited', '/assets/avatar-james.png', 'Geelong, Victoria'),
  ('20000000-0000-0000-0000-000000000110', 'Sophia Patel', 'sophia@example.invalid', 'warehouse_team', 'uninvited', '/assets/avatar-sophia.png', 'Ballarat, Victoria')
on conflict (id) do update set full_name = excluded.full_name, email = excluded.email, role = excluded.role, avatar_url = excluded.avatar_url, location = excluded.location;

insert into public.staff_warehouses (staff_id, warehouse_id)
values
  ('20000000-0000-0000-0000-000000000101', '10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000102', '10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000102', '10000000-0000-0000-0000-000000000002'),
  ('20000000-0000-0000-0000-000000000103', '10000000-0000-0000-0000-000000000002'),
  ('20000000-0000-0000-0000-000000000104', '10000000-0000-0000-0000-000000000002'),
  ('20000000-0000-0000-0000-000000000105', '10000000-0000-0000-0000-000000000003'),
  ('20000000-0000-0000-0000-000000000106', '10000000-0000-0000-0000-000000000003'),
  ('20000000-0000-0000-0000-000000000107', '10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000108', '10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000109', '10000000-0000-0000-0000-000000000002'),
  ('20000000-0000-0000-0000-000000000110', '10000000-0000-0000-0000-000000000003')
on conflict do nothing;

insert into public.tasks (id, invoice, type, warehouse_id, scheduled_at, status, description, priority, created_by)
values
  ('30000000-0000-0000-0000-000000010458', 'INV-10458', 'delivery', '10000000-0000-0000-0000-000000000001', '2026-07-25 09:00:00+10', 'complete', 'Tiles delivery for the Hawthorn renovation project.', false, '20000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000010459', 'INV-10459', 'pickup', '10000000-0000-0000-0000-000000000001', '2026-07-26 10:30:00+10', 'in_progress', 'Customer pickup prepared at the Sunshine dispatch bay.', true, '20000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000010460', 'INV-10460', 'container', '10000000-0000-0000-0000-000000000002', '2026-07-27 13:00:00+10', 'delayed', 'Inbound container unloading and stock allocation.', true, '20000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000010461', 'INV-10461', 'delivery', '10000000-0000-0000-0000-000000000002', '2026-07-28 09:00:00+10', 'complete', 'Geelong commercial order delivery.', false, '20000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000010462', 'INV-10462', 'pickup', '10000000-0000-0000-0000-000000000003', '2026-07-29 11:00:00+10', 'pending', 'Pickup order awaiting final stock check.', false, '20000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000010463', 'INV-10463', 'container', '10000000-0000-0000-0000-000000000003', '2026-07-30 12:00:00+10', 'complete', 'Container received and reconciled.', false, '20000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000010464', 'INV-10464', 'delivery', '10000000-0000-0000-0000-000000000001', '2026-07-31 14:00:00+10', 'complete', 'Residential tiles delivery to Werribee.', false, '20000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000010465', 'INV-10465', 'delivery', '10000000-0000-0000-0000-000000000001', '2026-08-01 09:30:00+10', 'pending', 'St Albans project delivery staged and ready.', false, '20000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000010466', 'INV-10466', 'pickup', '10000000-0000-0000-0000-000000000002', '2026-08-02 10:00:00+10', 'pending', 'Trade customer collection.', false, '20000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000010467', 'INV-10467', 'container', '10000000-0000-0000-0000-000000000003', '2026-08-03 13:30:00+10', 'pending', 'Container slot booked for the Ballarat branch.', false, '20000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000010482', 'INV-10482', 'delivery', '10000000-0000-0000-0000-000000000001', '2026-08-19 09:00:00+10', 'pending', 'Calacatta Cloud tiles for Hawthorn Renovations.', false, '20000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000010483', 'INV-10483', 'pickup', '10000000-0000-0000-0000-000000000001', '2026-08-19 10:30:00+10', 'in_progress', 'Crown molding installation materials for Downtown Office.', false, '20000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000010484', 'INV-10484', 'delivery', '10000000-0000-0000-0000-000000000002', '2026-08-20 13:00:00+10', 'delayed', 'Exterior materials for Riverside Apartments.', true, '20000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000010485', 'INV-10485', 'pickup', '10000000-0000-0000-0000-000000000003', '2026-08-21 11:00:00+10', 'pending', 'Landscape materials for Maple Park.', false, '20000000-0000-0000-0000-000000000001')
on conflict (id) do update set invoice = excluded.invoice, type = excluded.type, warehouse_id = excluded.warehouse_id, scheduled_at = excluded.scheduled_at, status = excluded.status, description = excluded.description, priority = excluded.priority;

insert into public.task_assignees (task_id, staff_id, assigned_by)
values
  ('30000000-0000-0000-0000-000000010458', '20000000-0000-0000-0000-000000000101', '20000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000010459', '20000000-0000-0000-0000-000000000102', '20000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000010460', '20000000-0000-0000-0000-000000000103', '20000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000010461', '20000000-0000-0000-0000-000000000104', '20000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000010462', '20000000-0000-0000-0000-000000000105', '20000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000010463', '20000000-0000-0000-0000-000000000106', '20000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000010464', '20000000-0000-0000-0000-000000000107', '20000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000010465', '20000000-0000-0000-0000-000000000108', '20000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000010466', '20000000-0000-0000-0000-000000000109', '20000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000010467', '20000000-0000-0000-0000-000000000110', '20000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000010482', '20000000-0000-0000-0000-000000000101', '20000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000010482', '20000000-0000-0000-0000-000000000102', '20000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000010483', '20000000-0000-0000-0000-000000000102', '20000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000010484', '20000000-0000-0000-0000-000000000103', '20000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000010485', '20000000-0000-0000-0000-000000000105', '20000000-0000-0000-0000-000000000001')
on conflict do nothing;

insert into public.task_items (id, task_id, name, quantity, sort_order)
select extensions.gen_random_uuid(), task.id,
  case task.type when 'container' then 'Container stock' when 'pickup' then 'Prepared order' else 'Tiles and materials' end,
  case when task.priority then 'Priority allocation' else '1 order' end,
  0
from public.tasks task
where task.id::text like '30000000-0000-0000-0000-00000001%'
  and not exists (select 1 from public.task_items item where item.task_id = task.id);

insert into public.task_notes (id, task_id, author_id, body, created_at)
values
  ('40000000-0000-0000-0000-000000010458', '30000000-0000-0000-0000-000000010458', '20000000-0000-0000-0000-000000000101', 'Confirm access with the site supervisor before arrival.', '2026-07-24 15:00:00+10'),
  ('40000000-0000-0000-0000-000000010459', '30000000-0000-0000-0000-000000010459', '20000000-0000-0000-0000-000000000102', 'Photo ID is required for collection.', '2026-07-25 15:00:00+10'),
  ('40000000-0000-0000-0000-000000010460', '30000000-0000-0000-0000-000000010460', '20000000-0000-0000-0000-000000000103', 'Carrier reported a revised arrival window.', '2026-07-26 15:00:00+10'),
  ('40000000-0000-0000-0000-000000010482', '30000000-0000-0000-0000-000000010482', '20000000-0000-0000-0000-000000000101', 'Check that the delivery area is clear before unloading.', '2026-08-18 15:00:00+10')
on conflict (id) do nothing;

insert into public.notification_preferences (staff_id)
select id from public.staff_profiles
on conflict (staff_id) do nothing;
