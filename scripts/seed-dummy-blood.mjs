import '../dist/config/load-env.js';
import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { AppConfigService } from '../dist/config/app-config.service.js';
import { PrismaService } from '../dist/database/prisma.service.js';
import { BLOOD_GROUPS, DEFAULT_DONATION_GAP_DAYS } from '../dist/blood-help/blood-help.rules.js';

// LOCAL DEMO ONLY: a Blood Help Network sample — 22 donors (all eight blood groups, Nimad villages and towns) and
// 6 blood requests (4 in progress, 2 completed), so /community-services shows its figures, recent requests and donor
// suggestions. Refuses any database other than npsi_local; never run it against the test or live server.
//
//   npm run build
//   node scripts/seed-dummy-blood.mjs [--apply]
//   node scripts/seed-dummy-blood.mjs --remove [--apply]
//
// Every row is easy to find and remove:
// - donors: a user account per donor with id demo-blood-uNN, name ending "(Demo)", no email, no password and an
//   unverified phone (so nobody can sign in as them and no real login matches them), mobile 90000001NN;
// - requests: id demo-blood-rNN, reference BR-DEMO00NN, patient name ending "(Demo)", contact mobile 90000002NN.
// No notification, SMS, WhatsApp or e-mail is sent: rows are written straight to the local database.
// --remove deletes exactly those rows (requests, donors, then the demo user accounts).

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const remove = args.includes('--remove');
const LOCAL_DB = 'npsi_local';
const USER_PREFIX = 'demo-blood-u';
const REQUEST_PREFIX = 'demo-blood-r';
const TAG = ' (Demo)';

const prisma = new PrismaService(new AppConfigService(new ConfigService()));
const pad = (n) => String(n).padStart(2, '0');
const DAY = 86_400_000;
const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
const daysAgo = (n) => new Date(today.getTime() - n * DAY);

// [name, blood group, town, days since last donation (null = never donated), available]
const DONORS = [
  ['Ramesh Patidar', 'O+', 'Indore', 120, true],
  ['Suresh Mukati', 'B+', 'Khargone', null, true],
  ['Kavita Patidar', 'A+', 'Kasrawad', 200, true],
  ['Mahesh Choudhary', 'AB+', 'Barwani', 95, true],
  ['Dinesh Patidar', 'O-', 'Sanawad', 150, true],
  ['Sunita Mukati', 'B-', 'Maheshwar', null, true],
  ['Vijay Patel', 'A-', 'Mandleshwar', 40, true],
  ['Pooja Patidar', 'O+', 'Dhamnod', 300, true],
  ['Anil Solanki', 'B+', 'Indore', 20, true],
  ['Rekha Choudhary', 'AB-', 'Borawan', 180, true],
  ['Sanjay Patidar', 'A+', 'Bhikangaon', null, true],
  ['Meena Mukati', 'O+', 'Khandwa', 110, true],
  ['Rakesh Patidar', 'B+', 'Sendhwa', 400, true],
  ['Neha Choudhary', 'A+', 'Indore', 60, false],
  ['Kamal Patidar', 'O-', 'Khargone', 130, true],
  ['Priya Patel', 'AB+', 'Kasrawad', null, true],
  ['Manoj Mukati', 'A-', 'Barwani', 220, true],
  ['Anita Patidar', 'B-', 'Indore', 100, false],
  ['Deepak Choudhary', 'O+', 'Maheshwar', 92, true],
  ['Seema Patidar', 'A+', 'Sanawad', 75, true],
  ['Gopal Mukati', 'B+', 'Dhamnod', null, true],
  ['Hemant Patidar', 'AB+', 'Indore', 160, false],
];

// [patient, blood group, units, hospital, city, contact, days ago, completed by ("REQUESTER" | "ADMIN" | null)]
const REQUESTS = [
  ['Shanti Bai Patidar', 'B+', 2, 'Maharaja Yeshwantrao Hospital', 'Indore', 'Ramesh Patidar', 0, null],
  ['Gopal Mukati', 'O-', 1, 'District Hospital Khargone', 'Khargone', 'Suresh Mukati', 1, null],
  ['Lalita Choudhary', 'A+', 3, 'CHL Hospital', 'Indore', 'Mahesh Choudhary', 1, null],
  ['Baby of Kavita Patidar', 'AB-', 1, 'Choithram Hospital', 'Indore', 'Dinesh Patidar', 2, null],
  ['Ramprasad Patidar', 'O+', 2, 'Bombay Hospital', 'Indore', 'Pooja Patidar', 9, 'REQUESTER'],
  ['Kamla Bai Mukati', 'B-', 1, 'District Hospital Barwani', 'Barwani', 'Meena Mukati', 15, 'ADMIN'],
];

try {
  const [{ db }] = await prisma.$queryRawUnsafe('SELECT DATABASE() AS db');
  if (db !== LOCAL_DB) throw new Error(`Refusing to touch "${db}": demo data goes only into the local database (${LOCAL_DB}).`);

  const userWhere = { id: { startsWith: USER_PREFIX } };
  const requestWhere = { id: { startsWith: REQUEST_PREFIX } };

  if (remove) {
    const [requests, donors, users] = await Promise.all([
      prisma.bloodRequest.count({ where: requestWhere }),
      prisma.bloodDonor.count({ where: { userId: { startsWith: USER_PREFIX } } }),
      prisma.user.count({ where: userWhere }),
    ]);
    console.log(`Database: ${db}. Demo rows: ${requests} requests, ${donors} donors, ${users} user accounts.`);
    if (!apply) { console.log('Dry run: add --apply to delete them.'); process.exit(0); }
    await prisma.$transaction([
      prisma.bloodRequest.deleteMany({ where: requestWhere }),
      prisma.bloodDonor.deleteMany({ where: { userId: { startsWith: USER_PREFIX } } }),
      prisma.notification.deleteMany({ where: { recipientUserId: { startsWith: USER_PREFIX } } }),
      prisma.user.deleteMany({ where: userWhere }),
    ]);
    console.log('Removed the demo blood donors, requests and their user accounts.');
    process.exit(0);
  }

  for (const [name, group] of DONORS) if (!BLOOD_GROUPS.includes(group)) throw new Error(`Bad blood group for ${name}: ${group}`);
  const admin = await prisma.user.findFirst({ where: { role: 'admin' }, orderBy: { createdAt: 'asc' }, select: { id: true } });
  if (!admin) throw new Error('No administrator in the local database (needed for the admin-verified request).');

  const users = DONORS.map(([name], i) => ({
    id: `${USER_PREFIX}${pad(i + 1)}`,
    fullName: `${name}${TAG}`,
    email: null,
    passwordHash: null,
    role: 'user',
    status: 'active',
    isVerified: false,
    phone: `90000001${pad(i + 1)}`,
    phoneVerified: false,
    createdAt: daysAgo(30 - i),
  }));
  const donors = DONORS.map(([name, bloodGroup, city, lastDays, available], i) => ({
    id: `demo-blood-d${pad(i + 1)}`,
    userId: users[i].id,
    name: `${name}${TAG}`,
    mobile: users[i].phone,
    city,
    bloodGroup,
    lastDonationDate: lastDays == null ? null : daysAgo(lastDays),
    available,
    createdAt: daysAgo(30 - i),
  }));
  const byName = new Map(DONORS.map(([name], i) => [name, users[i].id]));
  const requests = REQUESTS.map(([patientName, bloodGroup, units, hospital, city, contactName, ago, completedBy], i) => {
    const userId = byName.get(contactName);
    const createdAt = new Date(Date.now() - ago * DAY - (i + 1) * 3_600_000);
    const history = [{ at: createdAt.toISOString(), status: 'IN_PROGRESS', source: 'CREATED', byId: userId }];
    let completion = {};
    if (completedBy) {
      const completedAt = new Date(createdAt.getTime() + 2 * DAY);
      const byId = completedBy === 'ADMIN' ? admin.id : userId;
      history.push({ at: completedAt.toISOString(), status: 'COMPLETED', source: completedBy, byId, note: completedBy === 'ADMIN' ? 'Verified by the Sangathan' : 'Blood received' });
      completion = { status: 'COMPLETED', completedAt, completedById: byId, completionSource: completedBy, lastPromptedAt: completedAt };
    } else {
      completion = { status: 'IN_PROGRESS', lastPromptedAt: new Date() };
    }
    return {
      id: `${REQUEST_PREFIX}${pad(i + 1)}`,
      reference: `BR-DEMO00${pad(i + 1)}`,
      userId,
      patientName: `${patientName}${TAG}`,
      bloodGroup,
      units,
      hospital,
      city,
      contactName,
      contactPhone: `90000002${pad(i + 1)}`,
      history,
      createdAt,
      ...completion,
    };
  });

  const [haveUsers, haveRequests] = await Promise.all([
    prisma.user.findMany({ where: userWhere, select: { id: true } }).then((rows) => new Set(rows.map((r) => r.id))),
    prisma.bloodRequest.findMany({ where: requestWhere, select: { id: true } }).then((rows) => new Set(rows.map((r) => r.id))),
  ]);
  const clash = await prisma.user.findMany({ where: { phone: { in: users.map((u) => u.phone) }, id: { notIn: users.map((u) => u.id) } }, select: { id: true, phone: true } });
  if (clash.length) throw new Error(`These demo mobiles already belong to real accounts, stopping: ${clash.map((c) => c.phone).join(', ')}`);

  const freshUsers = users.filter((u) => !haveUsers.has(u.id));
  const freshDonors = donors.filter((d) => !haveUsers.has(d.userId));
  const freshRequests = requests.filter((r) => !haveRequests.has(r.id));
  const eligible = donors.filter((d) => d.available && (!d.lastDonationDate || today - d.lastDonationDate >= DEFAULT_DONATION_GAP_DAYS * DAY)).length;
  console.log(`Database: ${db}. To add: ${freshUsers.length} donors (with user accounts), ${freshRequests.length} requests. Already loaded: ${users.length - freshUsers.length} donors, ${requests.length - freshRequests.length} requests.`);
  console.log(`Sample: ${donors.filter((d) => d.available).length} available donors (${eligible} can donate today), ${requests.filter((r) => r.status === 'IN_PROGRESS').length} requests in progress, ${requests.filter((r) => r.status === 'COMPLETED').length} completed.`);
  if (!apply) { console.log('Dry run: add --apply to write them.'); process.exit(0); }

  await prisma.$transaction([
    prisma.user.createMany({ data: freshUsers, skipDuplicates: true }),
    prisma.bloodDonor.createMany({ data: freshDonors, skipDuplicates: true }),
    prisma.bloodRequest.createMany({ data: freshRequests, skipDuplicates: true }),
  ]);
  console.log(`Added ${freshDonors.length} demo donors and ${freshRequests.length} demo blood requests.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
