import '../dist/config/load-env.js';
import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { AppConfigService } from '../dist/config/app-config.service.js';
import { PrismaService } from '../dist/database/prisma.service.js';
import { SehatService } from '../dist/sehat-saathi/sehat.service.js';
const db = new PrismaService(new AppConfigService(new ConfigService()));
const resources = [
 { titleEn: 'Ministry of Health and Family Welfare', titleHi: 'स्वास्थ्य और परिवार कल्याण मंत्रालय', descriptionEn: 'Official Government of India health information and public health updates.', descriptionHi: 'भारत सरकार की आधिकारिक स्वास्थ्य जानकारी और जन स्वास्थ्य सूचनाएँ।', source: 'MoHFW, Government of India', url: 'https://www.mohfw.gov.in/', category: 'HEALTH' },
 { titleEn: 'Ayushman Bharat PM-JAY', titleHi: 'आयुष्मान भारत पीएम-जय', descriptionEn: 'Official National Health Authority information about PM-JAY. Check eligibility and scheme details directly at the source.', descriptionHi: 'राष्ट्रीय स्वास्थ्य प्राधिकरण से पीएम-जय की आधिकारिक जानकारी। पात्रता और योजना का विवरण सीधे स्रोत से जाँचें।', source: 'National Health Authority', url: 'https://nha.gov.in/PM-JAY', category: 'HEALTH' },
 { titleEn: 'Emergency Response Support System', titleHi: 'आपातकालीन प्रतिक्रिया सहायता प्रणाली', descriptionEn: 'Official information about India’s 112 emergency response service. This website does not handle emergency requests.', descriptionHi: 'भारत की 112 आपातकालीन सेवा की आधिकारिक जानकारी। यह वेबसाइट आपातकालीन अनुरोध नहीं संभालती।', source: 'ERSS, Government of India', url: 'https://112.gov.in/', category: 'EMERGENCY' },
 { titleEn: 'Central Drugs Standard Control Organization', titleHi: 'केंद्रीय औषधि मानक नियंत्रण संगठन', descriptionEn: 'Official drug-regulatory information. This is a reference source, not a diagnosis or prescription service.', descriptionHi: 'औषधि नियमन की आधिकारिक जानकारी। यह संदर्भ स्रोत है, निदान या पर्चा देने की सेवा नहीं।', source: 'CDSCO, Government of India', url: 'https://cdsco.gov.in/opencms/opencms/en/Home/', category: 'MEDICINE' },
];
try {
 const service = new SehatService(db, { capabilities: () => ({ email: false, whatsapp: false }), send: () => { throw new Error('No notifications during resource seed'); } });
 const actor = { id: 'system-sehat-resource-seed', role: 'admin', status: 'active' };
 let created = 0;
 for (const item of resources) { if (await db.sehatResource.findFirst({ where: { url: item.url } })) continue; await service.saveResource({ ...item, published: true, verified: true }, actor); created++; }
 console.log(JSON.stringify({ officialResourcesCreated: created, directoryProfilesInvented: 0 }));
} finally { await db.$disconnect(); }
