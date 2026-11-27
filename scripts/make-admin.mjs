import '../dist/config/load-env.js';
import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { AppConfigService } from '../dist/config/app-config.service.js';
import { PrismaService } from '../dist/database/prisma.service.js';

// Makes an existing account a full administrator (users.role = 'admin', the "super admin" of Admin → Assign roles).
// Sub-admins with limited work are given in the admin panel instead (Admin → Assign roles); this is for full admins only.
//
//   npm run build
//   node scripts/make-admin.mjs --email someone@example.com            (dry run: shows the account, changes nothing)
//   node scripts/make-admin.mjs --email someone@example.com --apply
//
// The account must already exist (the person registers / logs in once first). Admins sign in with their password plus
// a code emailed to this address, so the email must be one they can read. Any sub-admin entry is removed, since a full
// admin already has every area. Safe to re-run.

const args = process.argv.slice(2);
const arg = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const email = String(arg('email') || '').trim().toLowerCase();
const apply = args.includes('--apply');
if (!email.includes('@')) {
  console.error('Usage: node scripts/make-admin.mjs --email <email> [--apply]');
  process.exit(1);
}

const prisma = new PrismaService(new AppConfigService(new ConfigService()));
try {
  const user = await prisma.user.findFirst({ where: { email } });
  if (!user) throw new Error(`No account with the email ${email} in ${process.env.MYSQL_DATABASE}. They need to register first.`);
  console.log(`${process.env.MYSQL_DATABASE}: ${user.fullName || '—'} <${user.email}> · role ${user.role || 'user'} · status ${user.status} · ${apply ? 'APPLY' : 'DRY RUN (nothing is written)'}`);
  if (user.role === 'admin') {
    console.log('Already an admin. Nothing to do.');
  } else if (user.status !== 'active') {
    throw new Error(`The account is ${user.status}, not active; activate it first.`);
  } else if (apply) {
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { role: 'admin' } }),
      prisma.adminAccess.deleteMany({ where: { userId: user.id } }),
    ]);
    console.log(`Done. ${user.email} is now an admin (next login asks for the emailed code).`);
  } else {
    console.log('Would set role to admin. Re-run with --apply.');
  }
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
