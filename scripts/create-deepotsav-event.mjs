import 'dotenv/config';
import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { AppConfigService } from '../dist/config/app-config.service.js';
import { PrismaService } from '../dist/database/prisma.service.js';
import { EventsRepository } from '../dist/events/events.repository.js';
import { EventsService } from '../dist/events/events.service.js';

// Uses the API's service and MYSQL_* configuration; runs no migrations.
const payload = {
  title: 'Sneh Deepotsav 2026', titleHi: 'स्नेह दीपोत्सव 2026', slug: 'sneh-deepotsav-2026', date: '2026-11-29',
  venue: 'Indore, Madhya Pradesh — placeholder venue; final address to be announced',
  description: 'Nimar Patidar Sangathan, Indore, welcomes community members and families to Sneh Deepotsav 2026 on 29 November 2026. Join us in celebrating light, togetherness, and cultural traditions. Venue: Indore, Madhya Pradesh (placeholder only; the confirmed address will be announced). Time will be announced.',
  descriptionHi: 'निमाड़ पाटीदार संगठन, इंदौर द्वारा 29 नवंबर 2026 को स्नेह दीपोत्सव 2026 में समाज के सदस्यों और परिवारों का स्वागत है। आइए प्रकाश, स्नेह, एकता और सांस्कृतिक परंपराओं का उत्सव साथ मनाएँ। स्थान: इंदौर, मध्य प्रदेश (केवल अस्थायी विवरण; पुष्ट पता बाद में घोषित किया जाएगा)। समय बाद में घोषित किया जाएगा।',
  organizer: 'Nimar Patidar Sangathan, Indore', status: 'PUBLISHED',
};
if (!process.argv.includes('--apply')) {
  console.log(JSON.stringify({ mode: 'preview', payload }, null, 2));
} else {
  const prisma = new PrismaService(new AppConfigService(new ConfigService()));
  try {
    const matching = await prisma.event.findMany({ where: { OR: [{ slug: payload.slug }, { title: payload.title, date: new Date('2026-11-29T00:00:00Z') }] }, select: { id: true }, take: 2 });
    if (matching.length > 1) throw new Error('Multiple matching events; no changes made.');
    const service = new EventsService(new EventsRepository(prisma));
    const record = matching.length ? await service.update(matching[0].id, payload) : await service.create(payload);
    const publicRecords = await service.list({ order: '-createdAt', limit: 50 }, null);
    const visible = publicRecords.some(event => event.id === record.id);
    console.log(JSON.stringify({ action: matching.length ? 'updated' : 'created', id: record.id, title: record.title, date: record.date, venue: record.venue, status: record.status, publicListVerified: visible, posterAttached: Boolean(record.bannerUrl) }, null, 2));
    if (!visible) process.exitCode = 1;
  } catch (error) {
    console.error('Event operation failed:', error?.code || error?.constructor?.name || 'Unknown error');
    process.exitCode = 1;
  } finally { await prisma.$disconnect(); }
}
