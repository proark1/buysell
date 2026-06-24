import 'dotenv/config';
import { prisma } from '../db/prisma.js';
import { importSoldWinnerCsvFile } from '../services/soldWinnerSeeds.js';

const path = process.argv[2];

if (!path) {
  console.error('Usage: npm run sold-winners:import -w backend -- /absolute/path/to/sold-winners.csv');
  process.exitCode = 1;
} else {
  try {
    const summary = await importSoldWinnerCsvFile(prisma, path);
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}
