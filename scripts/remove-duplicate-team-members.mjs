import '../dist/config/load-env.js';
import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { AppConfigService } from '../dist/config/app-config.service.js';
import { PrismaService } from '../dist/database/prisma.service.js';
import { EventMembersService, nameKey, sameEntry } from '../dist/event-members/event-members.service.js';

// Takes repeated people off a team page (e.g. the Core Team), keeping one card per person.
//
//   npm run build
//   node scripts/remove-duplicate-team-members.mjs --section CORE_TEAM --actor admin@example.com
//        [--same-person "Rakesh Patidar" --same-person "Alkesh Patidar"] [--keep "Nitin Patidar=Dongargoan"] [--apply]
//
// Duplicates are approved cards of the same section with the same name and village, where spelling variants of the
// village count as one (Dongargaon/Dongargoan; the API's own rule, sameEntry). A name given with --same-person is one
// person whatever village the cards show (an admin's decision, e.g. the same member listed from two villages).
// Of each group the card that comes first in the team's order stays, unless --keep "Name=Village" names the one to keep; the others are removed through the API's own
// "remove" (status REMOVED, reason and admin in the history, roster entry ended), never deleted.
// Without --apply nothing is written: it prints what it would keep and remove. Safe to re-run.

const args = process.argv.slice(2);
const arg = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const all = (name) => args.flatMap((value, i) => (args[i - 1] === `--${name}` ? [value] : []));
const apply = args.includes('--apply');
const sectionKey = String(arg('section') || '').toUpperCase();
const actorEmail = arg('actor');
if (!sectionKey || !actorEmail) {
  console.error('Usage: node scripts/remove-duplicate-team-members.mjs --section <KEY> --actor <admin email> [--same-person "<name>" ...] [--apply]');
  process.exit(1);
}
const samePerson = new Set(all('same-person').map(nameKey));
const keepChoices = all('keep').map((value) => {
  const [name, village] = value.split('=');
  if (!name || !village) { console.error(`--keep takes "Name=Village", got: ${value}`); process.exit(1); }
  return { name, village };
});

const prisma = new PrismaService(new AppConfigService(new ConfigService()));
try {
  const section = await prisma.eventMemberSection.findFirst({ where: { key: sectionKey } });
  if (!section) throw new Error(`No team section ${sectionKey}`);
  const actor = await prisma.user.findFirst({ where: { email: actorEmail.trim().toLowerCase(), role: 'admin' } });
  if (!actor) throw new Error(`No admin account with the email ${actorEmail}`);
  const cards = await prisma.eventMemberApplication.findMany({
    where: { sectionId: section.id, status: 'APPROVED' },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  });
  const unknown = [...samePerson].filter((key) => !cards.some((card) => nameKey(card.name) === key));
  if (unknown.length) throw new Error(`--same-person names not on ${sectionKey}: ${unknown.join(', ')}`);

  // Group in team order, so the first card of each group is the one shown first today.
  const groups = [];
  for (const card of cards) {
    const group = groups.find(([first]) => sameEntry(first, card) || (samePerson.has(nameKey(card.name)) && nameKey(first.name) === nameKey(card.name)));
    if (group) group.push(card);
    else groups.push([card]);
  }
  const repeated = groups.filter((group) => group.length > 1);
  // --keep: the chosen card goes first in its group (exact village as shown on the card, case and spaces aside).
  const exact = (a, b) => String(a || '').replace(/\s+/g, '').toLowerCase() === String(b || '').replace(/\s+/g, '').toLowerCase();
  for (const choice of keepChoices) {
    const group = repeated.find((cards) => cards.some((card) => nameKey(card.name) === nameKey(choice.name)));
    const chosen = group?.find((card) => nameKey(card.name) === nameKey(choice.name) && exact(card.village, choice.village));
    if (!chosen) throw new Error(`--keep ${choice.name}=${choice.village}: no such repeated card on ${sectionKey}`);
    group.splice(group.indexOf(chosen), 1);
    group.unshift(chosen);
  }
  const label = (card) => `#${card.sortOrder} ${card.name} (${card.village || '—'}) [${card.source}${card.mobileDigits ? ', has mobile' : ''}${card.memberId ? ', linked member' : ''}]`;
  console.log(`${section.label}: ${cards.length} cards on the website · ${repeated.length} repeated people · ${apply ? 'APPLY' : 'DRY RUN (nothing is written)'}`);
  for (const [keep, ...extra] of repeated) {
    console.log(`  keep   ${label(keep)}`);
    for (const card of extra) console.log(`  remove ${label(card)}`);
  }
  if (!apply || !repeated.length) process.exit(0);

  const service = new EventMembersService(prisma, { verify: async () => true });
  for (const [keep, ...extra] of repeated) {
    for (const card of extra) {
      await service.remove(card.id, { reason: `Duplicate of ${keep.name} (${keep.village || '—'}) on ${section.label}; one card per person.` }, actor);
    }
  }
  const left = await prisma.eventMemberApplication.count({ where: { sectionId: section.id, status: 'APPROVED' } });
  console.log(`Done. ${section.label} now shows ${left} cards.`);
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
