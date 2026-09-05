import assert from 'node:assert/strict';
import test from 'node:test';
import { auditChanges, auditCsv, melbourneDayBoundary } from '../lib/operations/audit.ts';
import { taskUrgency, compareTeamTasks } from '../lib/operations/task-order.ts';
import { readFile } from 'node:fs/promises';

test('audit Melbourne boundaries cover DST and cross-year inclusive ranges', () => {
  assert.equal(melbourneDayBoundary('2026-10-04'), '2026-10-03T14:00:00.000Z');
  assert.equal(melbourneDayBoundary('2026-10-04', true), '2026-10-04T13:00:00.000Z');
  assert.equal(melbourneDayBoundary('2026-04-05'), '2026-04-04T13:00:00.000Z');
  assert.equal(melbourneDayBoundary('2026-04-05', true), '2026-04-05T14:00:00.000Z');
  assert.equal(melbourneDayBoundary('2026-12-31', true), '2026-12-31T13:00:00.000Z');
});
test('audit diff hides internal identity fields and reports real changes', () => {
  const changes = auditChanges({beforeData:{status:'pending',priority:false,version:1,auth_user_id:'old'},afterData:{status:'in_progress',priority:true,version:2,auth_user_id:'new'}});
  assert.deepEqual(changes.map(change=>change.field),['status','priority']);
  assert.equal(changes[0].before,'pending');
  assert.equal(changes[0].after,'in_progress');
});
test('CSV export quotes content and prevents formula injection', () => {
  const csv = auditCsv([{actorName:'=SUM(A1)',entityType:'tasks',action:'update',beforeData:{},afterData:{invoice:'INV-"42"\nline'},createdAt:'2026-09-05T00:00:00Z'}]);
  assert.match(csv, /"'=SUM\(A1\)"/);
  assert.match(csv, /INV-""42""\nline/);
});
test('team work queue ranks overdue, today, priority, upcoming, then complete', () => {
  const task=(invoice,status,isoDate,priority='Low')=>({invoice,status,isoDate,priority});
  const tasks=[task('complete','Complete','2026-09-01'),task('upcoming','Pending','2026-09-09'),task('priority','Pending','2026-09-10','High'),task('today','In Progress','2026-09-05'),task('late','Delayed','2026-09-04')];
  assert.deepEqual([...tasks].sort((a,b)=>compareTeamTasks(a,b,'2026-09-05')).map(t=>t.invoice),['late','today','priority','upcoming','complete']);
  assert.equal(taskUrgency(tasks[0],'2026-09-05'),'Complete');
});
test('audit API checks manager authorization and uses bounded keyset pagination', async () => {
  const source=await readFile(new URL('../app/actions/audit.ts',import.meta.url),'utf8');
  assert.match(source,/await requireManager\(\)/); assert.match(source,/limit\(51\)/);
  assert.match(source,/created_at\.lt\./); assert.match(source,/id\.lt\./);
  assert.doesNotMatch(source,/createSupabaseAdminClient/);
});
test('recovery uses the authenticated account, never a client-supplied recipient', async () => {
  const source=await readFile(new URL('../app/actions/auth.ts',import.meta.url),'utf8');
  assert.match(source,/requestOwnPasswordResetAction\(\)/);
  assert.match(source,/resetPasswordForEmail\(context\.data\.profile\.email/);
  assert.match(source,/signInWithPassword\(\{ email: profile\.email/);
});
test('operational emails stay paused and nested dialogs ignore inert backgrounds', async () => {
  const [worker,page]=await Promise.all([readFile(new URL('../lib/email/outbox.ts',import.meta.url),'utf8'),readFile(new URL('../app/page.tsx',import.meta.url),'utf8')]);
  assert.match(worker,/OPERATIONS_EMAIL_ENABLED !== "true"/);
  assert.match(page,/container\.closest\("\[inert\]"\)/);
  assert.match(page,/Assigned to me/); assert.match(page,/Read-only company task/);
});
test('dashboard and audit filters use consistent rounded controls', async () => {
  const [css, page, audit] = await Promise.all([
    readFile(new URL('../app/components/assessment-updates.css', import.meta.url), 'utf8'),
    readFile(new URL('../app/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/components/AuditHistory.tsx', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(page, /<select/);
  assert.doesNotMatch(audit, /<select/);
  assert.match(css, /\.overview-warehouse-filter \.task-filter-select__trigger \{[^}]*height: 64px/);
  assert.match(css, /\.audit-filters \.date-filter__trigger \{[^}]*height: 48px/);
  assert.match(css, /\.audit-toolbar \.secondary-button \{ width: auto; max-width: 100%;/);
  assert.match(css, /@media \(max-width: 520px\) \{\s*\.audit-filters \{ grid-template-columns: minmax\(0, 1fr\)/);
});
test('In Progress uses a dedicated purple icon instead of the Pending clock', async () => {
  const [page, icon] = await Promise.all([
    readFile(new URL('../app/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../public/assets/icon-stat-progress.svg', import.meta.url), 'utf8'),
  ]);
  assert.match(page, /progress: "\/assets\/icon-stat-progress\.svg"/);
  assert.match(icon, /viewBox="0 0 24 24"/);
  assert.match(icon, /stroke="#7C3AED"/);
});
