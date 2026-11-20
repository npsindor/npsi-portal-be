import '../dist/config/load-env.js';
import 'reflect-metadata';
import fs from 'node:fs';
import { ConfigService } from '@nestjs/config';
import { AppConfigService } from '../dist/config/app-config.service.js';
import { PrismaService } from '../dist/database/prisma.service.js';
import { normalKey, REQUIREMENT_DAYS } from '../dist/room-hunting/room-hunting.rules.js';

// LOCAL TESTING ONLY: loads sample "people looking for rooms" (room requirements) so the Room Hunting search has
// something to show. It refuses to run against any database other than the local one (npsi_local).
//
//   npm run build
//   node scripts/seed-dummy-room-requirements.mjs --file ~/Downloads/dummy_rental_leads_500.json [--apply]
//   node scripts/seed-dummy-room-requirements.mjs --remove [--apply]
//
// Every sample row has the reference DUMMY-nnnn and the note "Sample entry for testing", is published (APPROVED) for
// REQUIREMENT_DAYS days and keeps its mobile / email hidden from the public. Re-running skips rows already loaded;
// --remove deletes exactly the DUMMY- rows and nothing else. Without --apply nothing is written.

const args = process.argv.slice(2);
const arg = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const flag = (name) => args.includes(`--${name}`);
const apply = flag('apply');
const remove = flag('remove');
const file = arg('file');
const LOCAL_DB = 'npsi_local';
const PREFIX = 'DUMMY-';
if (!remove && !file) {
  console.error('Usage: node scripts/seed-dummy-room-requirements.mjs --file <leads.json> [--apply] | --remove [--apply]');
  process.exit(1);
}

const prisma = new PrismaService(new AppConfigService(new ConfigService()));
try {
  const [{ db }] = await prisma.$queryRawUnsafe('SELECT DATABASE() AS db');
  if (db !== LOCAL_DB) throw new Error(`Refusing to touch "${db}": sample data goes only into the local database (${LOCAL_DB}).`);

  if (remove) {
    const count = await prisma.rentalRequirement.count({ where: { reference: { startsWith: PREFIX } } });
    console.log(`${count} sample requirements (${PREFIX}*) in ${db}.`);
    if (apply) {
      const { count: deleted } = await prisma.rentalRequirement.deleteMany({ where: { reference: { startsWith: PREFIX } } });
      console.log(`Deleted ${deleted}.`);
    } else console.log('Dry run: add --apply to delete them.');
    process.exit(0);
  }

  const leads = JSON.parse(fs.readFileSync(file, 'utf8'));
  const tenant = { family: 'FAMILY', student: 'STUDENT' };
  const today = new Date().toISOString().slice(0, 10);
  const problems = [];
  const rows = leads.map((lead) => {
    const n = String(lead.id).padStart(4, '0');
    const type = String(lead.propertyType || '').trim().toUpperCase().replace(/\s+/g, ' '); // "1 bhk" -> "1 BHK"
    if (!/^\d{10}$/.test(String(lead.mobileno))) problems.push(`#${lead.id}: mobile "${lead.mobileno}"`);
    if (!type || !lead.area || !lead.budgetMax) problems.push(`#${lead.id}: type, area or max budget missing`);
    if (lead.budgetMin != null && lead.budgetMin > lead.budgetMax) problems.push(`#${lead.id}: min budget above max`);
    return {
      id: `dummy-rq-${n}`,
      reference: `${PREFIX}${n}`,
      clientRequestId: `dummy-${n}`,
      userId: null,
      name: String(lead.name).trim(),
      mobile: String(lead.mobileno),
      email: lead.email || null,
      propertyType: type,
      typeKey: normalKey(type),
      tenantType: tenant[lead.lookingAs] || 'ANY',
      area: String(lead.area).trim(),
      areaKey: normalKey(String(lead.area)),
      minBudget: lead.budgetMin ?? null,
      maxBudget: lead.budgetMax,
      // A move-in date already past is dropped rather than shown as overdue.
      moveInDate: lead.preferredMoveIn && lead.preferredMoveIn >= today ? new Date(`${lead.preferredMoveIn}T00:00:00Z`) : null,
      note: 'Sample entry for testing',
      showMobile: false,
      showEmail: false,
      status: 'APPROVED',
      expiresAt: new Date(Date.now() + REQUIREMENT_DAYS * 86_400_000),
    };
  });
  if (problems.length) throw new Error(`The file has problems:\n  ${problems.join('\n  ')}`);
  if (new Set(rows.map((row) => row.id)).size !== rows.length) throw new Error('Two leads share an id.');

  const existing = new Set((await prisma.rentalRequirement.findMany({ where: { reference: { startsWith: PREFIX } }, select: { id: true } })).map((row) => row.id));
  const fresh = rows.filter((row) => !existing.has(row.id));
  const by = (key) => Object.entries(fresh.reduce((acc, row) => ({ ...acc, [row[key]]: (acc[row[key]] || 0) + 1 }), {})).map(([k, v]) => `${k} ${v}`).join(', ');
  console.log(`Database: ${db}. File: ${rows.length} leads. Already loaded: ${rows.length - fresh.length}. To add: ${fresh.length}.`);
  if (fresh.length) console.log(`  Types: ${by('propertyType')}\n  Tenants: ${by('tenantType')}\n  Areas: ${new Set(fresh.map((row) => row.area)).size}`);
  if (!apply) { console.log('Dry run: add --apply to write them.'); process.exit(0); }
  const { count } = await prisma.rentalRequirement.createMany({ data: fresh, skipDuplicates: true });
  console.log(`Added ${count} sample requirements.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
