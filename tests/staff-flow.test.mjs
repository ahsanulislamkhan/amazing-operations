import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createStaffInputSchema,
  normalizeStaffInput,
  staffInvitationCanRetry,
  staffInvitationError,
  staffPersistenceError,
} from "../lib/operations/staff.ts";

const warehouseId = "10000000-0000-0000-0000-000000000001";

test("warehouse team members require at least one warehouse", () => {
  const result = createStaffInputSchema.safeParse({
    fullName: "Alex Morgan",
    email: "alex@example.com",
    role: "warehouse_team",
    location: "Sunshine, Australia",
    warehouseIds: [],
    gender: "Prefer not to say",
    dateOfBirth: "",
  });

  assert.equal(result.success, false);
  assert.equal(result.error?.issues[0]?.message, "Choose at least one warehouse for a team member.");
});

test("manager input is normalized without warehouse memberships", () => {
  const parsed = createStaffInputSchema.parse({
    fullName: "Alex Morgan",
    email: "Alex.Morgan@Example.com",
    role: "manager",
    location: "Melbourne, Australia",
    warehouseIds: [warehouseId, warehouseId],
    gender: "Female",
    dateOfBirth: "1990-04-12",
  });

  assert.deepEqual(normalizeStaffInput(parsed), {
    ...parsed,
    email: "alex.morgan@example.com",
    warehouseIds: [],
  });
});

test("staff errors are translated into actionable messages", () => {
  assert.match(staffPersistenceError({ code: "23505", message: "duplicate key" }), /already uses this email/i);
  assert.match(staffInvitationError({ message: "User already registered" }), /login already exists/i);
  assert.equal(staffInvitationCanRetry({ message: "User already registered" }), false);
  assert.match(staffInvitationError({ message: "Email rate limit exceeded" }), /rate limit/i);
  assert.equal(staffInvitationCanRetry({ message: "Email rate limit exceeded" }), true);
});

test("the Add Member dialog awaits the dedicated create-and-invite action", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /await createAndInviteStaffAction\(/);
  assert.match(source, /Sending invitation…/);
  assert.match(source, /result\.profileCreated/);
  assert.match(source, /result = await onAdministratorsChange\(administratorDraft\)/);
  assert.match(source, /setAdministratorDraft\(staffFromSnapshot\(result\.data\)\)/);
  assert.match(source, /isRoleChangesSaving \? "Saving…" : "Save change"/);
});

test("seeded identifiers and linked-account safety checks are retained", async () => {
  const actionSource = await readFile(new URL("../app/actions/operations.ts", import.meta.url), "utf8");
  const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(actionSource, /const uuid = z\.guid\(\)/);
  assert.doesNotMatch(actionSource, /deleteUser\(/);
  assert.match(actionSource, /select\("id, email, full_name, status, auth_user_id"\)/);
  assert.match(actionSource, /staff\.auth_user_id/);
  assert.match(actionSource, /email_confirmed_at/);
  assert.doesNotMatch(actionSource, /resetPasswordForEmail/);
  assert.match(actionSource, /generateLink\(\{ type: "recovery"/);
  assert.match(actionSource, /sendStaffAccessEmail/);

  const emailSource = await readFile(new URL("../lib/email/staff-access.ts", import.meta.url), "utf8");
  assert.match(emailSource, /amazing-operations-email-logo\.png/);
  assert.match(emailSource, /url\.searchParams\.set\("token_hash"/);
  assert.match(emailSource, /url\.pathname = "\/auth\/update-password"/);
  assert.match(emailSource, /idempotencyKey: `staff-access/);
  assert.match(pageSource, /authUserId: staff\.authUserId/);
  assert.match(pageSource, /staffStatus: staff\.status/);
  assert.match(pageSource, /disabled=\{Boolean\(editingAdministrator\?\.authUserId\)\}/);
});

test("the staff migration persists demographics and locks linked login emails", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20260904153942_staff_demographics_and_email_lock.sql", import.meta.url), "utf8");

  assert.match(migration, /add column if not exists gender/);
  assert.match(migration, /add column if not exists date_of_birth/);
  assert.match(migration, /actor := public\.assert_manager\(\)/);
  assert.match(migration, /existing\.auth_user_id is not null and existing\.email <> lower\(trim\(staff_email\)\)/);
  assert.match(migration, /revoke all on function public\.save_staff_profile\(uuid, text, text, public\.app_role, text, uuid\[\], text, date\) from public/);
  assert.match(migration, /grant execute on function public\.save_staff_profile\(uuid, text, text, public\.app_role, text, uuid\[\], text, date\) to authenticated/);
});

test("archiving restores the exact prior staff status without bypassing safeguards", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20260904153942_staff_demographics_and_email_lock.sql", import.meta.url), "utf8");
  const baseSchema = await readFile(new URL("../supabase/migrations/202609040001_operations_schema.sql", import.meta.url), "utf8");

  assert.match(migration, /pre_archive_status = existing\.status/);
  assert.match(migration, /next_status := coalesce\(\s*existing\.pre_archive_status/);
  assert.match(migration, /perform public\.assert_manager\(\)/);
  assert.doesNotMatch(migration, /drop trigger if exists protect_last_manager_trigger/);
  assert.doesNotMatch(migration, /drop trigger if exists prevent_staff_archive_trigger/);
  assert.match(baseSchema, /create trigger protect_last_manager_trigger/);
  assert.match(baseSchema, /create trigger prevent_staff_archive_trigger/);
});
