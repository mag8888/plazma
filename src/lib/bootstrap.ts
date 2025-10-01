import { prisma } from './prisma.js';

export async function ensureInitialData() {
  try {
    const reviewCount = await prisma.review.count();
    if (reviewCount === 0) {
      await prisma.review.create({
        data: {
          name: 'Дмитрий',
          content: 'Будущее наступило ребята\nЭто действительно биохакинг нового поколения. Мне было трудно поверить в такую эффективность. Я забыл что такое усталость!',
          isActive: true,
          isPinned: true,
        },
      });
    }
  } catch (error) {
    console.warn('Failed to initialize data:', error);
    // Continue without initial data if DB connection fails
  }
}
