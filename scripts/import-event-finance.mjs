import '../dist/config/load-env.js';
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { ConfigService } from '@nestjs/config';
import { AppConfigService } from '../dist/config/app-config.service.js';
import { PrismaService } from '../dist/database/prisma.service.js';

// Imports a verified event finance statement (contributions + expenses) into an existing event.
//
//   npm run build
//   node scripts/import-event-finance.mjs --file database/finance/maa-na-garba-2026.json --actor admin@example.com [--event <id|slug>]
//        [--void-existing-expenses] [--apply]
//
// Without --apply nothing is written: it prints what would change and the totals the event would show.
// Safe to re-run: every statement line has an import key, so a line already imported is skipped (never duplicated,
// never overwritten, so later admin corrections stay). A contribution typed in by hand with the same name, amount and
// group is reported and not imported again. --void-existing-expenses voids (soft-deletes, kept in history) the event's
// expenses that did not come from this statement, e.g. an older draft of the same statement.
// Every created or voided record gets an audit entry under --actor (an admin account). Uses the API's own connection
// (.env.local, then .env).
//
// Revised statements: when the printed list is reissued (rows inserted, names or amounts corrected), give the file a new
// datasetId, set previousDatasetId to the old one, and give each line that was already in the old statement its old
// serial number as previousSerialNo. A line imported under the old statement is then revised in place (re-keyed to the
// new serial number; name, village, amount and review note set to the revised statement, each change printed in the
// dry run and recorded as an UPDATE in the history) instead of being imported twice. Its approval status is kept.
// Lines with no previousSerialNo are new. A line of the old statement missing from the revised one stops the import.

const args = process.argv.slice(2);
const arg = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const flag = (name) => args.includes(`--${name}`);
const file = arg('file');
const actorEmail = arg('actor');
if (!file || !actorEmail) {
  console.error('Usage: node scripts/import-event-finance.mjs --file <statement.json> --actor <admin email> [--event <id|slug>] [--void-existing-expenses] [--apply]');
  process.exit(1);
}
const apply = flag('apply');
const voidExisting = flag('void-existing-expenses');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const rupees = (n) => `₹${Number(n).toLocaleString('en-IN')}`;
const sum = (rows) => rows.reduce((total, row) => total + Number(row.amount), 0);
const key = (kind, group, serialNo) => `${data.datasetId}:${kind}:${group}:${serialNo}`;
const previousKey = (kind, group, serialNo) =>
  data.previousDatasetId && serialNo != null ? `${data.previousDatasetId}:${kind}:${group}:${serialNo}` : null;
const CONTRIBUTION_FIELDS = ['memberName', 'village', 'amount', 'reviewNote'];
const EXPENSE_FIELDS = ['title', 'titleHi', 'description', 'descriptionHi', 'amount'];
// What a revised statement line changes on the record it was imported as (besides its key and serial number).
const changesOf = (old, row, fields) =>
  Object.fromEntries(
    fields
      .filter((field) => row[field] !== undefined)
      .filter((field) => (field === 'amount' ? Number(old.amount) !== Number(row.amount) : (old[field] ?? null) !== (row[field] ?? null)))
      .map((field) => [field, row[field] ?? null]),
  );
const same = (a, b) => String(a || '').trim().toLowerCase().replace(/\s+/g, ' ') === String(b || '').trim().toLowerCase().replace(/\s+/g, ' ');

// 1. The statement must agree with its own printed totals before anything else happens.
const approved = data.contributions.filter((row) => row.status === 'APPROVED');
const fileTotals = {
  generalApproved: sum(approved.filter((row) => row.group === 'GENERAL')),
  bhogPrasadApproved: sum(approved.filter((row) => row.group === 'BHOG_PRASAD')),
  contributionsApproved: sum(approved),
  eventExpenses: sum(data.expenses.filter((row) => row.group === 'EVENT')),
  organizationExpenses: sum(data.expenses.filter((row) => row.group === 'ORGANIZATION')),
  expenses: sum(data.expenses),
  pendingFlagged: sum(data.contributions.filter((row) => row.status === 'PENDING')),
};
fileTotals.balance = fileTotals.contributionsApproved - fileTotals.expenses;
const mismatches = Object.entries(data.expected).filter(([name, value]) => fileTotals[name] !== value);
if (mismatches.length) {
  console.error('The statement file does not match its expected totals:', mismatches.map(([name, value]) => `${name}: file ${fileTotals[name]} vs expected ${value}`));
  process.exit(1);
}
const keys = [...data.contributions.map((row) => key('C', row.group, row.serialNo)), ...data.expenses.map((row) => key('E', row.group, row.serialNo))];
if (new Set(keys).size !== keys.length) { console.error('Two statement lines share a group and serial number.'); process.exit(1); }

const prisma = new PrismaService(new AppConfigService(new ConfigService()));
try {
  const eventRef = arg('event') || data.eventSlug;
  const event = await prisma.event.findFirst({ where: { OR: [{ id: eventRef }, { slug: eventRef }] } });
  if (!event) throw new Error(`Event not found: ${eventRef}`);
  const actor = await prisma.user.findFirst({ where: { email: actorEmail.trim().toLowerCase(), role: 'admin' } });
  if (!actor) throw new Error(`No admin account with the email ${actorEmail}`);

  const [existingContributions, existingExpenses, categories] = await Promise.all([
    prisma.eventContribution.findMany({ where: { eventId: event.id, deletedAt: null } }),
    prisma.eventExpense.findMany({ where: { eventId: event.id, deletedAt: null } }),
    prisma.expenseCategory.findMany(),
  ]);
  const importedKeys = new Set([...existingContributions, ...existingExpenses].map((row) => row.importKey).filter(Boolean));

  // 2. Plan.
  const categoryNames = new Set(categories.map((row) => row.name));
  const newCategories = (data.newCategories || []).filter((row) => !categoryNames.has(row.name));
  const hindiNames = Object.entries(data.categoryHindi || {}).filter(([name]) => categories.some((row) => row.name === name && !row.nameHi));
  const missingCategories = data.expenses.map((row) => row.category).filter((name) => !categoryNames.has(name) && !newCategories.some((row) => row.name === name));
  if (missingCategories.length) throw new Error(`Unknown expense categories: ${[...new Set(missingCategories)].join(', ')}`);

  const byKey = new Map([...existingContributions, ...existingExpenses].filter((row) => row.importKey).map((row) => [row.importKey, row]));
  const revisePlan = []; // { kind, old, importKey, serialNo, changes }
  const claimed = new Set();
  const revise = (kind, row, importKey, fields) => {
    const old = byKey.get(previousKey(kind, row.group, row.previousSerialNo));
    if (!old) return false;
    claimed.add(old.importKey);
    revisePlan.push({ kind, old, row, importKey, serialNo: row.serialNo, changes: changesOf(old, row, fields) });
    return true;
  };

  const contributionPlan = [];
  const alreadyImported = [];
  const matchedByHand = [];
  for (const row of data.contributions) {
    const importKey = key('C', row.group, row.serialNo);
    if (importedKeys.has(importKey)) { alreadyImported.push(importKey); continue; }
    if (revise('C', row, importKey, CONTRIBUTION_FIELDS)) continue;
    const handTyped = existingContributions.find((old) => !old.importKey && same(old.memberName, row.memberName) && Number(old.amount) === row.amount && old.contributionGroup === row.group);
    if (handTyped) { matchedByHand.push(`${row.group} #${row.serialNo} ${row.memberName} ${rupees(row.amount)} (record ${handTyped.id})`); continue; }
    contributionPlan.push({ ...row, importKey });
  }
  const expensePlan = [];
  for (const row of data.expenses) {
    const importKey = key('E', row.group, row.serialNo);
    if (importedKeys.has(importKey)) { alreadyImported.push(importKey); continue; }
    if (revise('E', row, importKey, EXPENSE_FIELDS)) continue;
    expensePlan.push({ ...row, importKey });
  }
  // Every line of the previous statement must be accounted for in the revised one.
  const dropped = data.previousDatasetId
    ? [...byKey.values()].filter((row) => row.importKey.startsWith(`${data.previousDatasetId}:`) && !claimed.has(row.importKey))
    : [];
  if (dropped.length) {
    throw new Error(
      `These records came from the previous statement but have no line (previousSerialNo) in this one; resolve them first:\n${dropped
        .map((row) => `  ${row.importKey} ${row.memberName || row.title} ${rupees(row.amount)}`)
        .join('\n')}`,
    );
  }
  const amountAfter = (row) => {
    const revision = revisePlan.find((plan) => plan.old === row);
    return revision && revision.changes.amount !== undefined ? Number(revision.changes.amount) : Number(row.amount);
  };
  const toVoid = voidExisting ? existingExpenses.filter((row) => !row.importKey) : [];
  const keptOldExpenses = voidExisting ? [] : existingExpenses.filter((row) => !row.importKey);

  // Totals the event would show (approved only), counting what is already there.
  const after = {
    contributions:
      sum(existingContributions.filter((row) => row.status === 'APPROVED').map((row) => ({ amount: amountAfter(row) }))) +
      sum(contributionPlan.filter((row) => row.status === 'APPROVED')),
    expenses:
      sum(existingExpenses.filter((row) => row.status === 'APPROVED' && !toVoid.includes(row)).map((row) => ({ amount: amountAfter(row) }))) +
      sum(expensePlan),
  };
  console.log(`Event: ${event.title} (${event.id}) · actor ${actor.email} · ${apply ? 'APPLY' : 'DRY RUN (nothing is written)'}`);
  console.log(`Statement totals check: OK — Sahyog ${rupees(fileTotals.generalApproved)} + Bhog/Prasad ${rupees(fileTotals.bhogPrasadApproved)} = ${rupees(fileTotals.contributionsApproved)}; expenses ${rupees(fileTotals.eventExpenses)} + ${rupees(fileTotals.organizationExpenses)} = ${rupees(fileTotals.expenses)}; balance ${rupees(fileTotals.balance)}; flagged pending ${rupees(fileTotals.pendingFlagged)}`);
  console.log(`New categories: ${newCategories.map((row) => row.name).join(', ') || 'none'} · Hindi names filled in: ${hindiNames.length}`);
  console.log(`Contributions to add: ${contributionPlan.length} (${contributionPlan.filter((row) => row.status === 'PENDING').length} pending for review) · expenses to add: ${expensePlan.length}`);
  console.log(`Already imported (skipped): ${alreadyImported.length} · matched a hand-entered record (skipped): ${matchedByHand.length}`);
  for (const line of matchedByHand) console.log(`  = ${line}`);
  if (revisePlan.length) {
    const changed = revisePlan.filter((plan) => Object.keys(plan.changes).length);
    console.log(`Revised from ${data.previousDatasetId}: ${revisePlan.length} records re-keyed to the new serial numbers, ${changed.length} of them with corrections:`);
    for (const plan of changed) {
      const label = `${plan.kind === 'C' ? 'contribution' : 'expense'} ${plan.row.group} #${plan.old.serialNo}→#${plan.serialNo}`;
      const what = Object.entries(plan.changes).map(([field, value]) => `${field}: ${JSON.stringify(field === 'amount' ? Number(plan.old.amount) : plan.old[field])} → ${JSON.stringify(value)}`);
      console.log(`  ~ ${label} ${plan.old.memberName || plan.old.title}: ${what.join('; ')}`);
    }
  }
  console.log(`Existing expenses to void: ${toVoid.length}${toVoid.length ? ` (${rupees(sum(toVoid))})` : ''}`);
  for (const row of toVoid) console.log(`  - ${row.title} ${rupees(row.amount)} [${row.status}] ${row.id}`);
  if (keptOldExpenses.length) console.log(`Note: ${keptOldExpenses.length} existing expenses (${rupees(sum(keptOldExpenses))}) are not from this statement and stay as they are.`);
  console.log(`After import the event shows: received ${rupees(after.contributions)} · spent ${rupees(after.expenses)} · balance ${rupees(after.contributions - after.expenses)}`);
  if (!apply) process.exit(0);

  // 3. Apply, all or nothing.
  const now = new Date();
  const json = (value) => (value == null ? null : JSON.parse(JSON.stringify(value)));
  const audit = (tx, entityType, entityId, action, before, afterRow) =>
    tx.eventFinancialAuditLog.create({
      data: { id: randomUUID(), eventId: event.id, actorId: actor.id, entityType, entityId, action, before: json(before) ?? undefined, after: json(afterRow) ?? undefined },
    });
  const source = (data.source || []).join(' + ');
  await prisma.$transaction(
    async (tx) => {
      for (const row of newCategories) {
        await tx.expenseCategory.create({ data: { id: randomUUID(), name: row.name, nameHi: row.nameHi || null, active: true, sortOrder: categories.length } });
      }
      for (const [name, nameHi] of hindiNames) await tx.expenseCategory.updateMany({ where: { name, nameHi: null }, data: { nameHi } });
      const categoryId = new Map((await tx.expenseCategory.findMany()).map((row) => [row.name, row.id]));
      for (const row of toVoid) {
        const voided = await tx.eventExpense.update({
          where: { id: row.id },
          data: { status: 'VOIDED', deletedAt: now, updatedById: actor.id, notes: [row.notes, `Voided on import of ${source}: replaced by the final statement.`].filter(Boolean).join('\n') },
        });
        await audit(tx, 'EXPENSE', row.id, 'VOID', row, voided);
      }
      for (const plan of revisePlan) {
        const corrections = Object.keys(plan.changes).length ? ` Corrected to the revised statement: ${Object.keys(plan.changes).join(', ')}.` : '';
        const patch = {
          ...plan.changes,
          serialNo: plan.serialNo,
          importKey: plan.importKey,
          updatedById: actor.id,
          notes: [plan.old.notes, `Revised statement (${source}): line #${plan.old.serialNo} is now #${plan.serialNo}.${corrections}`].filter(Boolean).join('\n'),
        };
        const model = plan.kind === 'C' ? tx.eventContribution : tx.eventExpense;
        const updated = await model.update({ where: { id: plan.old.id }, data: patch });
        await audit(tx, plan.kind === 'C' ? 'CONTRIBUTION' : 'EXPENSE', plan.old.id, 'UPDATE', plan.old, updated);
      }
      for (const row of contributionPlan) {
        const created = await tx.eventContribution.create({
          data: {
            id: randomUUID(),
            eventId: event.id,
            memberName: row.memberName,
            village: row.village || null,
            amount: row.amount,
            paymentMode: 'CASH',
            status: row.status,
            contributedAt: event.date,
            serialNo: row.serialNo,
            contributionGroup: row.group,
            notes: `Imported from ${source} (amount as printed: ${row.sourceAmount}).`,
            reviewNote: row.reviewNote || null,
            importKey: row.importKey,
            createdById: actor.id,
            updatedById: actor.id,
          },
        });
        await audit(tx, 'CONTRIBUTION', created.id, 'IMPORT', null, created);
      }
      for (const row of expensePlan) {
        const created = await tx.eventExpense.create({
          data: {
            id: randomUUID(),
            eventId: event.id,
            categoryId: categoryId.get(row.category),
            title: row.title,
            titleHi: row.titleHi,
            description: row.description,
            descriptionHi: row.descriptionHi,
            amount: row.amount,
            expenseDate: event.date,
            paymentMode: 'OTHER',
            paymentStatus: 'PAID',
            status: 'APPROVED',
            approvedById: actor.id,
            approvedAt: now,
            expenseGroup: row.group,
            serialNo: row.serialNo,
            importKey: row.importKey,
            notes: `Imported from ${source}; vendor, invoice and payment mode are not given in the statement.`,
            createdById: actor.id,
            updatedById: actor.id,
          },
        });
        await audit(tx, 'EXPENSE', created.id, 'IMPORT', null, created);
      }
    },
    { timeout: 120_000, maxWait: 20_000 },
  );

  // 4. Read back what the event now shows.
  const [received, spent] = await Promise.all([
    prisma.eventContribution.aggregate({ where: { eventId: event.id, status: 'APPROVED', deletedAt: null }, _sum: { amount: true } }),
    prisma.eventExpense.aggregate({ where: { eventId: event.id, status: 'APPROVED', deletedAt: null }, _sum: { amount: true } }),
  ]);
  const r = Number(received._sum.amount || 0);
  const s = Number(spent._sum.amount || 0);
  console.log(`Done. The event now shows: received ${rupees(r)} · spent ${rupees(s)} · balance ${rupees(r - s)}`);
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
