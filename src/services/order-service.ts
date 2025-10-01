import { prisma } from '../lib/prisma.js';

interface OrderItemPayload {
  productId: string;
  title: string;
  price: number;
  quantity: number;
}

export async function createOrderRequest(params: {
  userId?: string;
  contact?: string;
  message: string;
  items: OrderItemPayload[];
}) {
  const itemsJson = params.items.map((item) => ({
    ...item,
    price: Number(item.price),
  }));

  return prisma.orderRequest.create({
    data: {
      userId: params.userId,
      contact: params.contact,
      message: params.message,
      itemsJson,
    },
  });
}
