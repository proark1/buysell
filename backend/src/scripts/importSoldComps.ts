import 'dotenv/config';
import { prisma } from '../db/prisma.js';
import { importSoldCompCsvFile } from '../services/soldComps.js';

const path = process.argv[2];
const source = process.argv[3] ?? 'terapeak';
const marketplaceId = process.argv[4] ?? 'EBAY_DE';
const currency = process.argv[5] ?? 'EUR';

if (!path) {
  console.error('Usage: npm run sold-comps:import -w backend -- /absolute/path/to/terapeak.csv [source] [marketplaceId] [currency]');
  process.exitCode = 1;
} else {
  try {
    const summary = await importSoldCompCsvFile(prisma, path, { source, marketplaceId, currency });
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}
