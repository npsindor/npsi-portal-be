import '../dist/config/load-env.js';
import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { AppConfigService } from '../dist/config/app-config.service.js';
import { hashPassword, randomId, randomInvitePassword } from '../dist/common/utils/crypto.js';
import { PrismaService } from '../dist/database/prisma.service.js';

// Makes an account a full administrator (users.role = 'admin', the "super admin" of Admin → Assign roles).
// Sub-admins with limited work are given in the admin panel instead (Admin → Assign roles); this is for full admins only.
//
//   npm run build
//   node scripts/make-admin.mjs --email someone@example.com                          (dry run: shows what it would do)
//   node scripts/make-admin.mjs --email someone@example.com --apply                  (existing account → admin)
//   node scripts/make-admin.mjs --email someone@example.com --set-password --apply   (also a new password)
//   node scripts/make-admin.mjs --email someone@example.com --name "Full Name" --create --set-password --apply
//                                                                                     (no account yet: create it)
//
// --set-password generates a strong random password, prints it once on this screen and stores only its hash; every
// device signed in to that account is signed out. Give it to the person privately; they can change it in Settings.
// Admins sign in with the password plus a code emailed to this address, so the email must be one they can read.
// Any sub-admin entry is removed, since a full admin already has every area. Safe to re-run.

const args = process.argv.slice(2);
const arg = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const email = String(arg('email') || '').trim().toLowerCase();
const name = String(arg('name') || '').trim();
const apply = args.includes('--apply');
const create = args.includes('--create');
const setPassword = args.includes('--set-password');
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Usage: node scripts/make-admin.mjs --email <email> [--name "<full name>" --create] [--set-password] [--apply]');
  process.exit(1);
}

const prisma = new PrismaService(new AppConfigService(new ConfigService()));
try {
  const db = process.env.MYSQL_DATABASE;
  const user = await prisma.user.findFirst({ where: { email } });
  const mode = apply ? 'APPLY' : 'DRY RUN (nothing is written)';
  if (!user && !create) throw new Error(`No account with the email ${email} in ${db}. Ask them to register first, or add --create --name "<full name>".`);
  if (!user && !name) throw new Error('--create needs --name "<full name>".');
  if (!user && !setPassword) throw new Error('--create needs --set-password (a new account needs a password to sign in).');
  if (user && user.status !== 'active') throw new Error(`The account is ${user.status}, not active; activate it first.`);
  console.log(
    user
      ? `${db}: ${user.fullName || '—'} <${user.email}> · role ${user.role || 'user'} · ${mode}`
      : `${db}: no account for ${email} yet; will create "${name}" · ${mode}`,
  );
  const plan = [
    ...(!user ? ['create the account (active, email verified)'] : []),
    ...(user?.role !== 'admin' ? ['make it a full admin'] : []),
    ...(setPassword ? ['set a new random password and sign out its devices'] : []),
  ];
  if (!plan.length) {
    console.log('Already an admin. Nothing to do (add --set-password for a new password).');
  } else if (!apply) {
    console.log(`Would ${plan.join(', ')}. Re-run with --apply.`);
  } else {
    const password = setPassword ? randomInvitePassword() : null;
    const id = user?.id || randomId();
    await prisma.$transaction([
      user
        ? prisma.user.update({ where: { id }, data: { role: 'admin', ...(password ? { passwordHash: hashPassword(password), isVerified: true } : {}) } })
        : prisma.user.create({ data: { id, email, fullName: name, passwordHash: hashPassword(password), role: 'admin', status: 'active', isVerified: true } }),
      prisma.adminAccess.deleteMany({ where: { userId: id } }),
      ...(password && user ? [prisma.session.deleteMany({ where: { userId: id } })] : []),
    ]);
    console.log(`Done: ${plan.join(', ')}. ${email} is a full admin (each login also asks for the code emailed to ${email}).`);
    if (password) console.log(`\n  Password (shown only now, share it privately): ${password}\n`);
  }
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
