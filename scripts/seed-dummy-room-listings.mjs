import '../dist/config/load-env.js';
import 'reflect-metadata';
import fs from 'node:fs';
import path from 'node:path';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { AppConfigService } from '../dist/config/app-config.service.js';
import { PrismaService } from '../dist/database/prisma.service.js';
import { LISTING_DAYS, normalKey, RENTAL_AREAS } from '../dist/room-hunting/room-hunting.rules.js';

// LOCAL TESTING ONLY: 100 sample "rooms for rent" listings across the Indore rental areas, each with drawn sample
// photographs (some listings have several, shown as a carousel). Refuses any database other than npsi_local.
//
//   npm run build
//   node scripts/seed-dummy-room-listings.mjs [--count 100] [--api http://localhost:4001] [--apply]
//   node scripts/seed-dummy-room-listings.mjs --remove [--apply]
//
// Rows have the reference DUMMY-Lnnn and the description ends with "Sample listing for testing"; they are published
// (APPROVED) for LISTING_DAYS days, owned by the first administrator, with fictional names and 9xxxx00nnn mobiles.
// Photos are written to UPLOADS_DIR as dummy-room-*.jpg. --remove deletes exactly those rows and files.

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const arg = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const apply = flag('apply');
const remove = flag('remove');
const COUNT = Math.min(Number(arg('count') || 100), 999);
const LOCAL_DB = 'npsi_local';
const PREFIX = 'DUMMY-L';
const PHOTO_PREFIX = 'dummy-room-';
// Photo URLs are full API URLs, like real uploads (POST /uploads returns http(s)://<api host>/uploads/<file>).
// The default is the local backend on port 4001 (.env's API_PORT is not what runs locally).
const API_BASE = (arg('api') || 'http://localhost:4001').replace(/\/$/, '');

const config = new AppConfigService(new ConfigService());
const uploads = config.uploadsDir;
const prisma = new PrismaService(config);

// Deterministic pseudo-random numbers, so re-running produces the same sample set.
let seed = 20261119;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (list) => list[Math.floor(rand() * list.length)];

const FIRST = ['Ramesh', 'Suresh', 'Mahesh', 'Dinesh', 'Rakesh', 'Kamal', 'Vijay', 'Sanjay', 'Anil', 'Sunil', 'Manoj', 'Rajesh', 'Pankaj', 'Deepak', 'Ashok', 'Mukesh', 'Prakash', 'Santosh', 'Kavita', 'Sunita', 'Rekha', 'Meena', 'Anita', 'Pooja', 'Neha', 'Priya', 'Seema', 'Lalita', 'Hemant', 'Gopal'];
const LAST = ['Patidar', 'Mukati', 'Choudhary', 'Patel', 'Verma', 'Sharma', 'Joshi', 'Yadav', 'Rathore', 'Solanki', 'Chouhan', 'Gupta'];
const TYPES = [
  ['Single Room', 3500, 7000], ['Shared Room', 2500, 4500], ['1 BHK', 6000, 11000], ['2 BHK', 10000, 18000], ['3 BHK', 16000, 28000],
  ['Flat', 9000, 20000], ['Hostel / PG', 4000, 8000], ['Independent House', 15000, 32000], ['Row House', 14000, 26000],
];
const FEATURES = ['Furnished', 'Semi-furnished', '24x7 water', 'Covered parking', 'Near bus stop', 'Lift and power backup', 'Separate entrance', 'Near market', 'Wi-Fi ready', 'Balcony', 'Modular kitchen', 'Family-friendly society'];
const LANDMARKS = ['Main road', 'Near school', 'Behind temple', 'Near garden', 'Opposite petrol pump', 'Near hospital', 'Lane 2', 'Sector B'];
const PALETTES = [['#f97316', '#7c2d12'], ['#0ea5e9', '#0c4a6e'], ['#10b981', '#064e3b'], ['#a855f7', '#4c1d95'], ['#eab308', '#713f12'], ['#ef4444', '#7f1d1d'], ['#14b8a6', '#134e4a'], ['#6366f1', '#312e81']];
const ROOMS = ['Living room', 'Bedroom', 'Kitchen', 'Balcony', 'Bathroom', 'Building'];

const esc = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// A simple drawn room: wall gradient, floor, window, door and furniture, with the type / area / room label.
const roomSvg = ({ type, area, room, palette: [light, dark], n }) => `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
  <defs><linearGradient id="w" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></linearGradient></defs>
  <rect width="960" height="540" fill="url(#w)"/>
  <polygon points="0,400 960,400 960,540 0,540" fill="#000" opacity="0.25"/>
  <rect x="${90 + (n % 3) * 40}" y="90" width="230" height="170" rx="8" fill="#e0f2fe" stroke="#fff" stroke-width="10"/>
  <line x1="${205 + (n % 3) * 40}" y1="90" x2="${205 + (n % 3) * 40}" y2="260" stroke="#fff" stroke-width="8"/>
  <rect x="700" y="170" width="140" height="230" rx="6" fill="#78350f" opacity="0.85"/><circle cx="815" cy="290" r="7" fill="#fde68a"/>
  ${room === 'Kitchen'
    ? '<rect x="330" y="300" width="300" height="100" fill="#f5f5f4"/><rect x="330" y="290" width="300" height="14" fill="#57534e"/><rect x="360" y="200" width="80" height="60" fill="#f5f5f4" opacity="0.9"/>'
    : room === 'Bedroom'
      ? '<rect x="340" y="300" width="300" height="80" rx="10" fill="#fef3c7"/><rect x="340" y="250" width="30" height="130" fill="#92400e"/><rect x="380" y="280" width="80" height="30" rx="8" fill="#fff"/>'
      : room === 'Building'
        ? '<rect x="360" y="120" width="260" height="280" fill="#f8fafc" opacity="0.9"/><g fill="#38bdf8">' +
          [0, 1, 2, 3].map((r) => [0, 1, 2].map((c) => `<rect x="${385 + c * 80}" y="${140 + r * 62}" width="50" height="38"/>`).join('')).join('') + '</g>'
        : '<rect x="350" y="310" width="260" height="70" rx="16" fill="#fafaf9"/><rect x="350" y="290" width="260" height="40" rx="14" fill="#e7e5e4"/><rect x="420" y="390" width="120" height="10" fill="#44403c"/>'}
  <rect x="0" y="420" width="960" height="85" fill="#000" opacity="0.45"/>
  <text x="32" y="458" font-family="Helvetica, Arial, sans-serif" font-size="34" font-weight="700" fill="#fff">${esc(type)} · ${esc(area)}</text>
  <text x="32" y="490" font-family="Helvetica, Arial, sans-serif" font-size="22" fill="#e5e7eb">${esc(room)} — sample photo (not a real property)</text>
</svg>`;

try {
  const [{ db }] = await prisma.$queryRawUnsafe('SELECT DATABASE() AS db');
  if (db !== LOCAL_DB) throw new Error(`Refusing to touch "${db}": sample data goes only into the local database (${LOCAL_DB}).`);
  const where = { reference: { startsWith: PREFIX } };

  if (remove) {
    const count = await prisma.rentalListing.count({ where });
    const files = fs.existsSync(uploads) ? fs.readdirSync(uploads).filter((name) => name.startsWith(PHOTO_PREFIX)) : [];
    console.log(`${count} sample listings (${PREFIX}*) in ${db}, ${files.length} sample photos in ${uploads}.`);
    if (apply) {
      await prisma.rentalMatch.deleteMany({ where: { listing: where } });
      await prisma.rentalEnquiry.deleteMany({ where: { listing: where } });
      const { count: deleted } = await prisma.rentalListing.deleteMany({ where });
      for (const name of files) fs.unlinkSync(path.join(uploads, name));
      console.log(`Deleted ${deleted} listings and ${files.length} photos.`);
    } else console.log('Dry run: add --apply to delete them.');
    process.exit(0);
  }

  const owner = await prisma.user.findFirst({ where: { role: 'admin' }, orderBy: { createdAt: 'asc' }, select: { id: true } });
  if (!owner) throw new Error('No administrator account to own the sample listings.');
  const managed = await prisma.addressOption.findMany({ where: { kind: 'RENTAL_AREA', active: true }, select: { value: true } });
  const areas = [...new Set([...RENTAL_AREAS.map(([en]) => en), ...managed.map((row) => row.value)])];

  const now = Date.now();
  const rows = [];
  const photos = [];
  for (let i = 1; i <= COUNT; i += 1) {
    const n = String(i).padStart(3, '0');
    const area = areas[(i - 1) % areas.length]; // every area gets listings
    const [type, low, high] = pick(TYPES);
    const rent = Math.round((low + rand() * (high - low)) / 500) * 500;
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    const palette = pick(PALETTES);
    // About a third have one photo, the rest 2–5 (carousel); every 10th has none.
    const photoCount = i % 10 === 0 ? 0 : i % 3 === 0 ? 1 : 2 + Math.floor(rand() * 4);
    const urls = [];
    for (let p = 0; p < photoCount; p += 1) {
      const file = `${PHOTO_PREFIX}${n}-${p + 1}.jpg`;
      photos.push({ file, svg: roomSvg({ type, area, room: p === 0 ? 'Building' : ROOMS[p % ROOMS.length], palette: p ? pick(PALETTES) : palette, n: i + p }) });
      urls.push(`${API_BASE}/uploads/${file}`);
    }
    const features = [...new Set([pick(FEATURES), pick(FEATURES), pick(FEATURES)])].join(', ');
    const approvedAt = new Date(now - Math.floor(rand() * 20) * 86_400_000 - i * 60_000);
    const availableFor = pick(['ANY', 'ANY', 'FAMILY', 'STUDENT']);
    rows.push({
      id: `dummy-ls-${n}`,
      reference: `${PREFIX}${n}`,
      clientRequestId: `dummy-listing-${n}`,
      userId: owner.id,
      propertyType: type,
      typeKey: normalKey(type),
      availableFor: type === 'Hostel / PG' ? 'STUDENT' : availableFor,
      rentAmount: rent,
      area,
      areaKey: normalKey(area),
      address: `${pick(LANDMARKS)}, ${area}, Indore`,
      showAddress: i % 4 !== 0,
      availableFrom: i % 2 ? new Date(Date.UTC(2026, 11, 1 + (i % 25))) : null,
      description: `${type} in ${area}. ${features}. Sample listing for testing`,
      photoUrl: urls[0] ?? null,
      photoUrls: urls,
      contactName: name,
      contactMobile: `9${String(800000000 + i).slice(-9)}`,
      contactEmail: null,
      showMobile: i % 5 !== 0, // every 5th keeps the mobile hidden (enquiry button)
      showEmail: false,
      ownerConfirmed: true,
      status: 'APPROVED',
      approvedAt,
      expiresAt: new Date(approvedAt.getTime() + LISTING_DAYS * 86_400_000),
    });
  }

  const existing = new Set((await prisma.rentalListing.findMany({ where, select: { id: true } })).map((row) => row.id));
  const fresh = rows.filter((row) => !existing.has(row.id));
  const carousel = fresh.filter((row) => row.photoUrls.length > 1).length;
  console.log(`Database: ${db}. Uploads: ${uploads}. Areas: ${areas.length}. Already loaded: ${rows.length - fresh.length}. To add: ${fresh.length} (${carousel} with a photo carousel).`);
  if (!apply) { console.log('Dry run: add --apply to write them.'); process.exit(0); }

  fs.mkdirSync(uploads, { recursive: true });
  const freshIds = new Set(fresh.map((row) => row.reference.slice(PREFIX.length)));
  let written = 0;
  for (const { file, svg } of photos) {
    if (!freshIds.has(file.slice(PHOTO_PREFIX.length, PHOTO_PREFIX.length + 3))) continue;
    await sharp(Buffer.from(svg)).jpeg({ quality: 78 }).toFile(path.join(uploads, file));
    written += 1;
  }
  const { count } = await prisma.rentalListing.createMany({ data: fresh, skipDuplicates: true });
  console.log(`Added ${count} sample listings and ${written} photos.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
