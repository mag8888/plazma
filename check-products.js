import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "mongodb+srv://PLAZMA:s8eH4N8JRM4xIPbd@cluster1.pgqk3k.mongodb.net/plazma_bot?retryWrites=true&w=majority&appName=Cluster1"
    }
  }
});

async function checkProducts() {
  try {
    console.log('Connecting to database...');
    await prisma.$connect();
    console.log('Connected successfully!');

    // Check all products
    const products = await prisma.product.findMany({
      include: { category: true },
      orderBy: { createdAt: 'desc' }
    });

    console.log('Total products:', products.length);
    console.log('Products:');
    products.forEach((product, index) => {
      console.log(`${index + 1}. ${product.title} - ${product.price} PZ - Category: ${product.category.name} - Active: ${product.isActive}`);
    });

    // Check categories
    const categories = await prisma.category.findMany();
    console.log('\nAvailable categories:');
    categories.forEach((cat, index) => {
      console.log(`${index + 1}. ${cat.name} (${cat.id})`);
    });

    // Try to create test product
    if (categories.length > 0) {
      console.log('\nTrying to create test product...');
      const newProduct = await prisma.product.create({
        data: {
          title: 'Тестовый товар',
          summary: 'Краткое описание',
          description: 'Полное описание товара',
          price: 100.50,
          categoryId: categories[0].id,
          isActive: true
        }
      });

      console.log('Product created successfully:', newProduct);
    }

  } catch (error) {
    console.error('Error:', error);
    if (error.code === 'P2002') {
      console.log('Product already exists');
    }
  } finally {
    await prisma.$disconnect();
  }
}

checkProducts();
