import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "mongodb+srv://PLAZMA:s8eH4N8JRM4xIPbd@cluster1.pgqk3k.mongodb.net/plazma_bot?retryWrites=true&w=majority&appName=Cluster1"
    }
  }
});

async function createTestCategory() {
  try {
    console.log('Connecting to database...');
    await prisma.$connect();
    console.log('Connected successfully!');

    console.log('Creating test category...');
    const category = await prisma.category.create({
      data: {
        name: 'Тестовая категория',
        slug: 'test-category',
        description: 'Категория для тестирования',
        isActive: true
      }
    });

    console.log('Category created:', category);

    // Check existing categories
    const categories = await prisma.category.findMany();
    console.log('All categories:', categories);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createTestCategory();
