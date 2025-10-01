import { Context } from '../bot/context.js';
import { prisma } from '../lib/prisma.js';

export async function ensureUser(ctx: Context) {
  const from = ctx.from;
  if (!from) return null;

  const data = {
    telegramId: String(from.id),
    firstName: from.first_name ?? null,
    lastName: from.last_name ?? null,
    username: from.username ?? null,
    languageCode: from.language_code ?? null,
  } as const;

  const user = await prisma.user.upsert({
    where: { telegramId: data.telegramId },
    update: {
      firstName: data.firstName,
      lastName: data.lastName,
      username: data.username,
      languageCode: data.languageCode,
    },
    create: data,
  });

  return user;
}

export async function logUserAction(ctx: Context, action: string, payload?: any) {
  const user = await ensureUser(ctx);
  if (!user) return;

  await prisma.userHistory.create({
    data: {
      userId: user.id,
      action,
      payload: payload ?? undefined,
    },
  });
}
