import 'dotenv/config';
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { AppConfigService } from '../dist/config/app-config.service.js';
import { PrismaService } from '../dist/database/prisma.service.js';
import { SafarService } from '../dist/safar-saathi/safar.service.js';
const config = new AppConfigService(new ConfigService());
const db = new PrismaService(config);
const ids = [randomUUID(), randomUUID(), randomUUID()];
const completed = new Error('ROLLBACK_SAFAR_VERIFICATION');
let checks = 0;
try {
  try {
    await db.$transaction(async tx => {
      const users = [];
      for (const [index, id] of ids.entries()) {
        const email = `safar-verification-${id}@example.invalid`;
        const user = await tx.user.create({ data: { id, email, fullName: 'Safar Transaction Verification', phone: '9000000000', status: 'active', isVerified: true } });
        await tx.family.create({ data: { id: randomUUID(), familyId: `SAFAR-QA-${index}-${id}`, email, status: 'ACTIVE', contactNumber: '9000000000', headName: 'Safar Transaction Verification' } });
        users.push(user);
      }
      // All service calls stay inside this outer transaction; email is disabled.
      const transactionalDb = new Proxy(tx, { get(target, key) { return key === '$transaction' ? work => work(tx) : Reflect.get(target, key); } });
      const service = new SafarService(transactionalDb, { isConfigured: () => false, send: () => { throw new Error('Unexpected email'); } }, config);
      const input = { clientRequestId: randomUUID(), kind: 'REQUEST', requestType: 'TRAVEL', name: 'Safar Test', phone: '9000000000', origin: 'इंदौर', destination: 'खरगोन', travelDate: '2099-11-29', preferredTime: '10:30', notificationMethod: 'IN_APP', lang: 'hi', consent: true };
      const request = await service.create(input, users[0]);
      const repeat = await service.create(input, users[0]); assert.equal(request.id, repeat.id); checks++;
      const offer = await service.create({ ...input, clientRequestId: randomUUID(), kind: 'OFFER', requestType: 'BOTH', origin: 'Indore', destination: 'Khargone' }, users[1]);
      assert.equal(offer.matches, 1); checks++;
      const first = await service.mine(users[0]); assert.equal(first.matches[0].contact, null); checks++;
      assert.equal((await service.mine(users[2])).matches.length, 0); checks++;
      const matchId = first.matches[0].id;
      await service.decide(matchId, 'ACCEPT', users[0]); assert.equal((await service.mine(users[0])).matches[0].contact, null); checks++;
      await service.decide(matchId, 'ACCEPT', users[1]); assert.equal((await service.mine(users[0])).matches[0].contact.phone, '9000000000'); checks++;
      assert.equal((await service.mine(users[1])).notices.length, 2); checks++;
      await service.decide(matchId, 'COMPLETE', users[0]); assert.equal((await service.mine(users[0])).entries[0].status, 'COMPLETED'); checks++;
      throw completed;
    }, { isolationLevel: 'Serializable', timeout: 60000 });
  } catch (error) { if (error !== completed) throw error; }
  assert.equal(await db.user.count({ where: { id: { in: ids } } }), 0);
  assert.equal(await db.safarEntry.count({ where: { userId: { in: ids } } }), 0);
  console.log(JSON.stringify({ checks, realDatabaseTransaction: true, rolledBack: true, testAccountsRemain: false, emailsSent: 0 }));
} catch (error) {
  console.error('Safar transaction verification failed:', error?.code || error?.constructor?.name);
  process.exitCode = 1;
} finally { await db.$disconnect(); }
