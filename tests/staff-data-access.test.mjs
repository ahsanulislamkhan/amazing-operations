import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../supabase/migrations/20260904154153_restrict_team_staff_pii.sql", import.meta.url);

test("warehouse-team RLS exposes only the caller's profile and memberships", async () => {
  const migration = await readFile(migrationUrl, "utf8");

  assert.match(migration, /drop policy if exists "active staff read directory" on public\.staff_profiles/i);
  assert.match(migration, /create policy "staff read own profile"[\s\S]*using \(id = \(select public\.current_staff_id\(\)\)\)/i);
  assert.match(migration, /drop policy if exists "active staff read memberships" on public\.staff_warehouses/i);
  assert.match(migration, /create policy "staff read own memberships"[\s\S]*using \(staff_id = \(select public\.current_staff_id\(\)\)\)/i);
});

test("the task-name projection is narrow and inaccessible to browser roles", async () => {
  const migration = await readFile(migrationUrl, "utf8");

  assert.match(migration, /create or replace view public\.staff_name_directory[\s\S]*select id, full_name[\s\S]*from public\.staff_profiles/i);
  assert.match(migration, /with \(security_invoker = true, security_barrier = true\)/i);
  assert.match(migration, /revoke all on public\.staff_name_directory from authenticated/i);
  assert.match(migration, /revoke all on public\.staff_name_directory from anon/i);
  assert.match(migration, /grant select on public\.staff_name_directory to service_role/i);
  assert.doesNotMatch(migration, /grant select on public\.staff_name_directory to (?:authenticated|anon)/i);
});

test("team snapshots use the server-only name view and omit the staff directory", async () => {
  const server = await readFile(new URL("../lib/operations/server.ts", import.meta.url), "utf8");

  assert.match(server, /assignments:task_assignees\(staff_id\)/);
  assert.match(server, /notes:task_notes\(id, author_id, body, created_at\)/);
  assert.match(server, /profile\.role === "manager"[\s\S]*from\("staff_profiles"\)[\s\S]*Promise\.resolve\(\{ data: \[\], error: null \}\)/);
  assert.match(server, /createSupabaseAdminClient\(\)[\s\S]*from\("staff_name_directory"\)[\s\S]*select\("id, full_name"\)/);
  assert.match(server, /staff: profile\.role === "manager" \? staffRows\.map\(mapStaff\) : \[\]/);
  assert.doesNotMatch(server, /avatar_url/);
  assert.doesNotMatch(server, /assignments:task_assignees\(staff:staff_profiles/);
});

test("task assignee data contains identity only, not contact or photo fields", async () => {
  const types = await readFile(new URL("../lib/operations/types.ts", import.meta.url), "utf8");

  assert.match(types, /export type TaskAssigneeDTO = Pick<StaffDTO, "id" \| "fullName">;/);
  assert.doesNotMatch(types, /avatarUrl/);
});
