import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

interface OrderItemPayload {
  productId: number;
  title: string;
  price: number;
  quantity: number;
}

export async function createOrderRequest(params: {
  userId?: number;
  contact?: string;
  message: string;
  items: OrderItemPayload[];
}) {
  const itemsJson = params.items.map((item) => ({
    ...item,
    price: Number(item.price),
  })) as unknown as Prisma.JsonArray;

  return prisma.orderRequest.create({
    data: {
      userId: params.userId,
      contact: params.contact,
      message: params.message,
      itemsJson,
    },
  });
}
