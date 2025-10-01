import { PrismaClient } from '@prisma/client';

// Log database URL for debugging (without sensitive info)
const dbUrl = process.env.DATABASE_URL;
if (dbUrl) {
  console.log('Database URL configured:', dbUrl.substring(0, 20) + '...');
} else {
  console.error('DATABASE_URL not found in environment variables');
}

export const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});
