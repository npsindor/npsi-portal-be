import '../dist/config/load-env.js';
import 'reflect-metadata';
import fs from 'node:fs';
import { ConfigService } from '@nestjs/config';
import { AppConfigService } from '../dist/config/app-config.service.js';
import { PrismaService } from '../dist/database/prisma.service.js';
import { EventMembersService } from '../dist/event-members/event-members.service.js';

// Adds the Sangathan's own team list (name + village) to a team section, e.g. the Core Team, as approved members shown
// on the website (photo initials until an admin uploads a photo in Admin → Event Members → Edit).
//
//   npm run build
//   node scripts/import-core-team.mjs --file database/core-team/coreteam-2026.json --actor admin@example.com [--apply]
//
// The file: { "section": "CORE_TEAM", "members": [{ "name": "...", "village": "...", "nameHi": "...", "villageHi": "..." }, ...]
// } in display order (the Hindi fields are optional and are shown when the site is in Hindi).
// Without --apply nothing is written: it prints what would be added and what needs a look.
// Every entry goes through the API's own rules (EventMembersService.apply as the admin, approved at once), so it is
// audited under --actor and a name + village already on the team is never added twice. Names and villages are stored
// exactly as written in the file: nothing is corrected. A village that isn't in the portal's village list, and a name
// already on the team with a different village (possibly the same person), are reported for the admin; the latter is
// skipped, never merged. Safe to re-run: someone already on the team only gets the Hindi name / village from the file
// when theirs is still empty (an admin's own Hindi is never overwritten).

const args = process.argv.slice(2);
const arg = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const apply = args.includes('--apply');
const file = arg('file');
const actorEmail = arg('actor');
if (!file || !actorEmail) {
  console.error('Usage: node scripts/import-core-team.mjs --file <list.json> --actor <admin email> [--villages <native-places.js>] [--apply]');
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const sectionKey = String(data.section || 'CORE_TEAM').toUpperCase();
const text = (value) => String(value || '').trim() || undefined;
const members = (data.members || []).map((row) => ({ name: text(row.name) ?? '', village: text(row.village) ?? '', nameHi: text(row.nameHi), villageHi: text(row.villageHi) }));
const key = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

// The portal's village list (frontend src/lib/native-places.js), for the "not in the list" report only.
const villagesFile = arg('villages') || new URL('../../npsi-portal-fe/src/lib/native-places.js', import.meta.url);
let known = null;
try {
  const source = fs.readFileSync(villagesFile, 'utf8');
  const list = source.slice(source.indexOf('NATIVE_VILLAGES'), source.indexOf(']);', source.indexOf('NATIVE_VILLAGES')));
  known = new Set([...list.matchAll(/\['([^']+)'/g)].map((match) => key(match[1])));
} catch {
  console.log('(Village list not found: skipping the village spelling check.)');
}

const prisma = new PrismaService(new AppConfigService(new ConfigService()));
try {
  const bad = members.filter((row) => row.name.length < 2 || !row.village);
  if (bad.length) throw new Error(`Rows without a name or village: ${JSON.stringify(bad)}`);
  const section = await prisma.eventMemberSection.findFirst({ where: { key: sectionKey } });
  if (!section) throw new Error(`Team section not found: ${sectionKey}`);
  const actor = await prisma.user.findFirst({ where: { email: actorEmail.trim().toLowerCase(), role: 'admin' } });
  if (!actor) throw new Error(`No admin account with the email ${actorEmail}`);

  const existing = await prisma.eventMemberApplication.findMany({
    where: { sectionId: section.id, status: { in: ['PENDING', 'APPROVED'] } },
    select: { id: true, name: true, village: true, nameHi: true, villageHi: true, status: true, sortOrder: true },
  });
  const plan = [];
  const seen = new Set();
  for (const row of members) {
    const same = existing.find((other) => key(other.name) === key(row.name) && key(other.village) === key(row.village));
    const sameName = existing.filter((other) => key(other.name) === key(row.name) && key(other.village) !== key(row.village));
    const pair = `${key(row.name)}|${key(row.village)}`;
    const hindi = same && ((row.nameHi && !same.nameHi) || (row.villageHi && !same.villageHi));
    if (seen.has(pair)) plan.push({ ...row, action: 'skip', note: 'listed twice in the file' });
    else if (hindi) plan.push({ ...row, action: 'hindi', id: same.id, note: 'already on the team: adds the missing Hindi name / village' });
    else if (same) plan.push({ ...row, action: 'skip', note: 'already on the team' });
    else if (sameName.length)
      plan.push({ ...row, action: 'review', note: `same name already on the team with village "${sameName.map((other) => `${other.village} (${other.status})`).join(', ')}": not added, admin to decide` });
    else plan.push({ ...row, action: 'add' });
    seen.add(pair);
  }
  const unknownVillages = known ? [...new Set(members.map((row) => row.village).filter((village) => !known.has(key(village))))] : [];

  console.log(`Section: ${section.heading} (${sectionKey}). File: ${members.length} people. Already on the team: ${existing.length}.`);
  for (const [index, row] of plan.entries())
    console.log(`${String(index + 1).padStart(2)}. ${row.action.padEnd(6)} ${row.name} — ${row.village}${row.nameHi ? ` (${row.nameHi} — ${row.villageHi ?? ''})` : ''}${row.note ? `  [${row.note}]` : ''}`);
  if (unknownVillages.length) console.log(`\nVillages not in the portal's village list (stored as written; check the spelling): ${unknownVillages.join(', ')}`);
  const toAdd = plan.filter((row) => row.action === 'add');
  const toFill = plan.filter((row) => row.action === 'hindi');
  console.log(`\nTo add: ${toAdd.length}. Hindi to fill in: ${toFill.length}. Skipped: ${plan.length - toAdd.length - toFill.length}.`);
  if (!apply) {
    console.log('Dry run: add --apply to write them.');
    process.exit(0);
  }

  // The API's own rules, as the admin: approved at once, audited, duplicates refused.
  const service = new EventMembersService(prisma, { verify: async () => true });
  let order = Math.max(0, ...existing.map((row) => row.sortOrder ?? 0));
  let added = 0;
  let filled = 0;
  for (const row of plan) {
    if (row.action === 'hindi') {
      const current = existing.find((other) => other.id === row.id);
      await service.update(row.id, { ...(current.nameHi ? {} : { nameHi: row.nameHi }), ...(current.villageHi ? {} : { villageHi: row.villageHi }) }, actor);
      filled += 1;
      continue;
    }
    if (row.action !== 'add') continue;
    order += 1;
    try {
      const { id } = await service.apply(
        { sectionKey, name: row.name, village: row.village, nameHi: row.nameHi, villageHi: row.villageHi, consent: true, approveNow: true },
        actor,
      );
      await service.update(id, { sortOrder: order }, actor);
      added += 1;
    } catch (error) {
      console.log(`  not added: ${row.name} — ${row.village}: ${error?.response?.error || error.message}`);
    }
  }
  console.log(`Added ${added} people to ${section.heading}; Hindi filled in for ${filled}.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
