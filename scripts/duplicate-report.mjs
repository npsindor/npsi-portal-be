import '../dist/config/load-env.js';
import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { AppConfigService } from '../dist/config/app-config.service.js';
import { PrismaService } from '../dist/database/prisma.service.js';
import { loginAccount } from '../dist/common/eligibility/login-account.js';

// READ-ONLY duplicate report for family members, students and login accounts. It changes nothing: it lists groups
// of records that share a reliable identifier so an admin can check them before any merge. Names alone never make
// a group. Usage: node scripts/duplicate-report.mjs [--json]   (same connection as the API: .env.local, then .env)

const prisma = new PrismaService(new AppConfigService(new ConfigService()));
const digits = (value) => String(value || '').replace(/\D/g, '').slice(-10);
const email = (value) => String(value || '').trim().toLowerCase();
const groupBy = (rows, key) => {
  const map = new Map();
  for (const row of rows) {
    const value = key(row);
    if (!value) continue;
    map.set(value, [...(map.get(value) || []), row]);
  }
  return [...map.entries()].filter(([, list]) => list.length > 1).map(([value, list]) => ({ value, records: list }));
};

try {
  const [members, students, users] = await Promise.all([
    prisma.familyMember.findMany({ select: { id: true, membershipId: true, familyId: true, name: true, dob: true, mobile: true, email: true, status: true, linkedStudentId: true } }),
    prisma.student.findMany({ select: { studentId: true, studentName: true, dob: true, mobile: true, email: true, status: true, userId: true, linkedMembershipId: true } }),
    prisma.user.findMany()
  ]);
  const memberLabel = (m) => `${m.membershipId || m.id} ${m.name} [${m.familyId}, ${m.status}]`;
  const studentLabel = (s) => `${s.studentId} ${s.studentName} [${s.status}]`;
  const dob = (value) => (value ? value.toISOString().slice(0, 10) : '');
  const linkedStudentIds = new Set(members.map((m) => m.linkedStudentId).filter(Boolean));
  const report = {
    generatedAt: new Date().toISOString(),
    totals: { familyMembers: members.length, students: students.length, users: users.length },
    // One membership id given to two different member rows (must be unique per person).
    membershipIdUsedTwice: groupBy(members, (m) => m.membershipId).map((g) => ({ membershipId: g.value, records: g.records.map(memberLabel) })),
    // Same person entered twice in families: same mobile in two different families, or same name + birth date + mobile.
    membersSameMobileAcrossFamilies: groupBy(members, (m) => digits(m.mobile).length === 10 && digits(m.mobile))
      .filter((g) => new Set(g.records.map((m) => m.familyId)).size > 1)
      .map((g) => ({ mobile: g.value, records: g.records.map(memberLabel) })),
    membersSameNameDobMobile: groupBy(members, (m) => dob(m.dob) && digits(m.mobile).length === 10 && `${m.name.trim().toLowerCase()}|${dob(m.dob)}|${digits(m.mobile)}`).map((g) => ({ key: g.value, records: g.records.map(memberLabel) })),
    membersSameEmail: groupBy(members, (m) => email(m.email)).map((g) => ({ email: g.value, records: g.records.map(memberLabel) })),
    studentsSameMobile: groupBy(students, (s) => digits(s.mobile).length === 10 && digits(s.mobile)).map((g) => ({ mobile: g.value, records: g.records.map(studentLabel) })),
    studentsSameEmail: groupBy(students, (s) => email(s.email)).map((g) => ({ email: g.value, records: g.records.map(studentLabel) })),
    // A student who is very likely also a family member (same mobile and birth date) but not linked to them.
    studentsMatchingUnlinkedMember: students
      .filter((s) => !linkedStudentIds.has(s.studentId) && !s.linkedMembershipId && digits(s.mobile).length === 10)
      .map((s) => ({ student: studentLabel(s), members: members.filter((m) => digits(m.mobile) === digits(s.mobile) && (!s.dob || !m.dob || dob(s.dob) === dob(m.dob))).map(memberLabel) }))
      .filter((row) => row.members.length),
    usersSameEmail: groupBy(users, (u) => email(u.email)).map((g) => ({ email: g.value, ids: g.records.map((u) => `${u.id} [${u.status}]`) })),
    // One login with both an approved family and an approved student record: it may use Family Member Login only
    // (login-account.ts) until the Sangathan decides whether this person keeps one or two separate logins.
    loginsWithFamilyAndStudent: [],
    studentsSharingOneAccount: groupBy(students.filter((s) => s.userId), (s) => s.userId).map((g) => ({ userId: g.value, records: g.records.map(studentLabel) })),
  };
  const accountTypes = {};
  for (const user of users) {
    const account = await loginAccount(prisma, user);
    accountTypes[`${account.type}/${account.status}`] = (accountTypes[`${account.type}/${account.status}`] || 0) + 1;
    if (account.dual) report.loginsWithFamilyAndStudent.push({ user: `${user.id} ${user.email || user.phone} [${user.status}]`, familyId: account.familyId, portal: account.type });
  }
  report.totals.loginAccountTypes = accountTypes;
  if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`Duplicate report (read-only) — ${report.generatedAt}`);
    console.log(`Totals: ${report.totals.familyMembers} family members, ${report.totals.students} students, ${report.totals.users} users`);
    console.log(`Login portals (type/status): ${JSON.stringify(report.totals.loginAccountTypes)}`);
    for (const [key, rows] of Object.entries(report)) {
      if (!Array.isArray(rows)) continue;
      console.log(`\n${key}: ${rows.length}`);
      for (const row of rows.slice(0, 25)) console.log(`  - ${JSON.stringify(row)}`);
      if (rows.length > 25) console.log(`  … ${rows.length - 25} more (use --json)`);
    }
    console.log('\nNothing was changed. Review each group, back up the database, then merge only verified duplicates.');
  }
} finally {
  await prisma.$disconnect();
}
