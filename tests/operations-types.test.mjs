import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  canTeamTransition,
  isTaskInRange,
  normalizeDateRange,
} from "../lib/operations/types.ts";

test("date ranges are inclusive in the Melbourne timezone", () => {
  const utcNewYearsEve = "2026-12-31T13:30:00.000Z";
  assert.equal(isTaskInRange(utcNewYearsEve, { from: "2027-01-01", to: "2027-01-01" }), true);
  assert.equal(isTaskInRange(utcNewYearsEve, { from: "2026-12-31", to: "2026-12-31" }), false);
});

test("an inverted date range is rejected instead of silently reversed", () => {
  assert.deepEqual(normalizeDateRange({ from: "2027-02-10", to: "2027-02-01" }), { from: null, to: null });
});

test("warehouse team transitions follow the approved state machine", () => {
  assert.equal(canTeamTransition("pending", "in_progress"), true);
  assert.equal(canTeamTransition("pending", "complete"), false);
  assert.equal(canTeamTransition("in_progress", "complete"), true);
  assert.equal(canTeamTransition("delayed", "complete"), true);
  assert.equal(canTeamTransition("complete", "pending"), true);
  assert.equal(canTeamTransition("complete", "in_progress"), true);
  assert.equal(canTeamTransition("complete", "delayed"), true);
});

test("the frontend does not restore demo persistence or staff presence", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
  assert.doesNotMatch(source, /team-online|Online status|Supabase Presence/);
  assert.match(source, /Sign in to Operations/);
  assert.match(source, /<span>Email<\/span>/);
  assert.match(source, /placeholder="Enter email"/);
  assert.match(source, /placeholder="Enter password"/);
  assert.match(source, /Remember this device/);
  assert.match(source, /Forgot password/);
  assert.doesNotMatch(source, /Choose your access type/);
});

test("identity is rendered without photographic profile images", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /function IdentityMark/);
  assert.doesNotMatch(source, /<img\s+src=\{(?:account|task|administrator)[^}]*\.avatar/);
  assert.doesNotMatch(source, /admin-reference-avatar/);
});

test("warehouse team status changes require confirmation", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(source, /function StatusChangeConfirmation/);
  assert.match(source, /role="alertdialog"/);
  assert.match(source, /requestTaskStatusChange\(task, status\)/);
  assert.match(source, /Yes, change status/);
  assert.match(source, /updateTaskStatus\(pendingStatusChange\.invoice, pendingStatusChange\.toStatus\)/);
});

test("the date picker exposes a visible confirmation action and every warehouse status has an icon", async () => {
  const [page, dateFilter] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/DateFilter.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(dateFilter, /date-filter__actions/);
  assert.match(dateFilter, />Done<\/button>/);
  const progressIcon = page.match(/progress:\s*"(\/assets\/[^\"]+\.svg)"/);
  assert.ok(progressIcon, "In Progress must map to a real SVG asset");
  const icon = await readFile(new URL(`../public${progressIcon[1]}`, import.meta.url), "utf8");
  assert.match(icon, /<svg\b/);
});
