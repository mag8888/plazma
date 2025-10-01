import { Context } from '../bot/context.js';
import { prisma } from '../lib/prisma.js';

function generateObjectId(telegramId: number): string {
  // Convert Telegram ID to a valid MongoDB ObjectId (24 hex chars)
  const hex = telegramId.toString(16).padStart(24, '0');
  return hex.substring(0, 24);
}

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

  try {
    const user = await prisma.user.upsert({
      where: { telegramId: data.telegramId },
      update: {
        firstName: data.firstName,
        lastName: data.lastName,
        username: data.username,
        languageCode: data.languageCode,
      },
      create: {
        ...data,
        id: generateObjectId(from.id),
      },
    });

    return user;
  } catch (error) {
    console.warn('Failed to ensure user:', error);
    // Return mock user object to continue without DB
    return {
      id: generateObjectId(from.id),
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}

export async function logUserAction(ctx: Context, action: string, payload?: any) {
  try {
    const user = await ensureUser(ctx);
    if (!user) return;

    await prisma.userHistory.create({
      data: {
        userId: user.id,
        action,
        payload: payload ?? undefined,
      },
    });
  } catch (error) {
    console.warn('Failed to log user action:', error);
    // Continue without logging if DB fails
  }
}
