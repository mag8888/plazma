import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "mongodb+srv://PLAZMA:s8eH4N8JRM4xIPbd@cluster1.pgqk3k.mongodb.net/plazma_bot?retryWrites=true&w=majority&appName=Cluster1"
    }
  }
});

async function checkCategories() {
  try {
    console.log('Connecting to database...');
    await prisma.$connect();
    console.log('Connected successfully!');

    // Check all categories
    const categories = await prisma.category.findMany({
      orderBy: { createdAt: 'desc' }
    });

    console.log('Total categories:', categories.length);
    console.log('Categories:');
    categories.forEach((cat, index) => {
      console.log(`${index + 1}. ${cat.name} (${cat.slug}) - Active: ${cat.isActive} - Created: ${cat.createdAt}`);
    });

    // Try to create test category
    console.log('\nTrying to create "На каждый день" category...');
    const newCategory = await prisma.category.create({
      data: {
        name: 'На каждый день',
        slug: 'na-kazhdyy-den',
        description: 'Ежедневные продукты',
        isActive: true
      }
    });

    console.log('Category created successfully:', newCategory);

  } catch (error) {
    console.error('Error:', error);
    if (error.code === 'P2002') {
      console.log('Category already exists with this slug');
    }
  } finally {
    await prisma.$disconnect();
  }
}

checkCategories();
