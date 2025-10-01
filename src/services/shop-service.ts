import { prisma } from '../lib/prisma.js';

export async function getActiveCategories() {
  return prisma.category.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  });
}

export async function getCategoryById(id: number) {
  return prisma.category.findUnique({
    where: { id },
  });
}

export async function getProductsByCategory(categoryId: number) {
  return prisma.product.findMany({
    where: { categoryId, isActive: true },
    orderBy: { title: 'asc' },
  });
}

export async function getProductById(productId: number) {
  return prisma.product.findUnique({
    where: { id: productId },
  });
}
