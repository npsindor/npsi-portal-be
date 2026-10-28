import '../dist/config/load-env.js';
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { AppConfigService } from '../dist/config/app-config.service.js';
import { PrismaService } from '../dist/database/prisma.service.js';
import { SehatService } from '../dist/sehat-saathi/sehat.service.js';
const db = new PrismaService(new AppConfigService(new ConfigService()));
const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
const rollback = new Error('ROLLBACK_SEHAT_VERIFICATION'); let checks = 0;
try {
  try {
    await db.$transaction(async tx => {
      const users = [], memberships = [];
      for (const [index, id] of ids.entries()) {
        const email = `sehat-verification-${id}@example.invalid`;
        users.push(await tx.user.create({ data: { id, email, fullName: 'Sehat Transaction Verification', phone: '9000000000', status: 'active', isVerified: true, role: index === 0 ? 'admin' : 'user' } }));
        const familyId = `SEHAT-QA-${id}`;
        await tx.family.create({ data: { id: randomUUID(), familyId, email, status: 'ACTIVE', contactNumber: '9000000000', headName: 'Sehat Verification' } });
        const membershipId = `SEHAT-MEM-${id}`; memberships.push(membershipId);
        await tx.familyMember.create({ data: { id: randomUUID(), membershipId, familyId, name: 'Sehat Verification', relationship: 'Head', email, mobile: '9000000000', status: 'ACTIVE' } });
      }
      const transactional = new Proxy(tx, { get(target, key) { return key === '$transaction' ? work => work(tx) : Reflect.get(target, key); } });
      const service = new SehatService(transactional, { capabilities: () => ({ email: false, whatsapp: false, inApp: true }), send: () => { throw new Error('Unexpected external message'); } });
      const mrInput = index => ({ name: 'Sehat Verification MR', membershipId: memberships[index], company: 'Fictional verification company', role: 'MR', city: 'Indore', areas: ['Vijay Nagar'], phone: '9000000000', assistance: 'BOTH', publishContact: index === 2, emailOptIn: false, whatsappOptIn: false, lang: 'hi', consent: true });
      const mr = await service.saveMr(mrInput(2), users[2]); const otherMr = await service.saveMr(mrInput(3), users[3]);
      assert.equal((await service.publicData()).mrs.some(row => row.id === mr.id), false); checks++;
      assert.equal((await service.saveMr(mrInput(1), users[0])).userId, users[1].id); checks++;
      await assert.rejects(() => service.adminMr(otherMr.id, { publishContact: true }, users[0])); checks++;
      await assert.rejects(() => service.adminData(users[1])); checks++;
      await service.adminMr(mr.id, { status: 'APPROVED' }, users[0]); await service.adminMr(otherMr.id, { status: 'APPROVED' }, users[0]);
      const directory = (await service.publicData()).mrs; assert.ok(directory.some(row => row.id === mr.id)); assert.equal(directory.some(row => row.id === otherMr.id), false); checks++;
      const input = { clientRequestId: randomUUID(), medicine: 'TEST-MEDICINE-NOT-REAL', quantity: 1, assistance: 'ALTERNATIVES', city: 'इंदौर', area: 'विजय नगर', name: 'Private Test Member', phone: '9000000000', emailOptIn: false, whatsappOptIn: false, lang: 'hi', consent: true };
      const request = await service.createRequest(input, users[1]);
      assert.equal((await service.createRequest(input, users[1])).id, request.id); checks++;
      await assert.rejects(() => service.adminRequest(request.id, { emailOptIn: true }, users[0])); checks++;
      const summary = (await service.mine(users[2])).routed.find(row => row.id === request.id); assert.equal(summary.details, null); assert.equal(JSON.stringify(summary).includes(input.medicine), false); checks++;
      await assert.rejects(() => service.closeRequest(request.id, users[3])); checks++;
      await service.mrAction(request.id, 'ACCEPT', users[2]);
      assert.equal((await service.mine(users[2])).routed.find(row => row.id === request.id).details.medicine, input.medicine); checks++;
      await assert.rejects(() => service.mrAction(request.id, 'ACCEPT', users[3])); checks++;
      assert.equal((await service.mine(users[1])).requests.find(row => row.id === request.id).assignedMr.phone, '9000000000'); checks++;
      await service.mrAction(request.id, 'ASSISTANCE_FOUND', users[2]); await service.closeRequest(request.id, users[1]);
      assert.equal((await service.mine(users[2])).routed.some(row => row.id === request.id), false); checks++;
      const report = await service.report({ targetType: 'MR', targetId: mr.id, message: 'Verification complaint only' }, users[1]); await service.adminReport(report.id, { status: 'RESOLVED', resolution: 'Test resolution' }, users[0]);
      assert.equal((await service.mine(users[1])).reports.find(row => row.id === report.id).status, 'RESOLVED'); checks++;
      const resource = await service.saveResource({ titleEn: 'Verification only', titleHi: 'केवल सत्यापन', descriptionEn: 'Test resource in rollback transaction.', descriptionHi: 'रोलबैक लेनदेन में परीक्षण संसाधन।', source: 'Test', url: 'https://www.mohfw.gov.in/', category: 'HEALTH', published: true, verified: true }, users[0]);
      assert.ok((await service.publicData()).resources.some(row => row.id === resource.id)); checks++;
      await service.saveResource({ published: false }, users[0], resource.id); assert.equal((await service.publicData()).resources.some(row => row.id === resource.id), false); checks++;
      const second = await service.createRequest({ ...input, clientRequestId: randomUUID() }, users[1]);
      await service.adminRequest(second.id, { assignedMrId: otherMr.id }, users[0]); await service.mrAction(second.id, 'DECLINE', users[3]);
      assert.equal((await service.mine(users[2])).routed.find(row => row.id === second.id).routingStatus, 'INVITED'); checks++;
      await service.mrAction(second.id, 'ACCEPT', users[2]); await service.adminMr(mr.id, { status: 'SUSPENDED' }, users[0]);
      assert.equal((await service.mine(users[1])).requests.find(row => row.id === second.id).status, 'PENDING'); checks++;
      assert.equal((await service.publicData()).mrs.some(row => row.id === mr.id), false); checks++;
      assert.equal((await service.saveMr(mrInput(1), users[0])).userId, users[1].id); checks++;
      await assert.rejects(() => service.adminMr(otherMr.id, { publishContact: true }, users[0])); checks++;
      await service.remove('resources', resource.id, users[0]); await service.remove('reports', report.id, users[0]); await service.remove('requests', second.id, users[0]); await service.remove('mrs', otherMr.id, users[0]);
      const admin = await service.adminData(users[0]); assert.ok(admin.audits.some(row => row.action === 'DELETE' && row.actorId === users[0].id)); checks++;
      await assert.rejects(() => service.remove('audits', admin.audits[0].id, users[0])); checks++;
      assert.equal((await service.publicData()).mrs.some(row => 'membershipId' in row || 'userId' in row), false); checks++;
      assert.ok((await service.mine(users[1])).notifications.length > 0); checks++;
      throw rollback;
    }, { isolationLevel: 'Serializable', timeout: 90000 });
  } catch (error) { if (error !== rollback) throw error; }
  assert.equal(await db.user.count({ where: { id: { in: ids } } }), 0);
  assert.equal(await db.sehatRequest.count({ where: { userId: { in: ids } } }), 0);
  console.log(JSON.stringify({ checks, database: 'real transaction', rolledBack: true, testAccountsRemain: false, externalMessagesSent: 0 }));
} catch (error) { console.error('Sehat verification failed:', error?.code || error?.constructor?.name, error?.message === 'Api Error' ? JSON.stringify(error.getResponse()) : error?.message); process.exitCode = 1; }
finally { await db.$disconnect(); }
