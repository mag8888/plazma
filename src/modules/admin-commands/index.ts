import { Markup, Telegraf } from 'telegraf';
import { BotModule } from '../../bot/types.js';
import { Context } from '../../bot/context.js';
import { addPZToUser, deductPZFromUser, getUserTransactionHistory } from '../../services/partner-service.js';
import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';

export const adminCommandsModule: BotModule = {
  async register(bot: Telegraf<Context>) {
    // Check if user is admin
    const isAdmin = (ctx: Context) => {
      return ctx.from?.id?.toString() === env.adminChatId;
    };

    // Add PZ command
    bot.command('addpz', async (ctx) => {
      if (!isAdmin(ctx)) {
        await ctx.reply('❌ У вас нет прав для выполнения этой команды');
        return;
      }

      const args = ctx.message.text.split(' ').slice(1);
      if (args.length < 3) {
        await ctx.reply('❌ Использование: /addpz <telegram_id> <amount> <description>\nПример: /addpz 123456789 10.50 Бонус за активность');
        return;
      }

      const [telegramId, amountStr, ...descriptionParts] = args;
      const amount = parseFloat(amountStr);
      const description = descriptionParts.join(' ');

      if (isNaN(amount) || amount <= 0) {
        await ctx.reply('❌ Неверная сумма');
        return;
      }

      try {
        // Find user by telegram ID
        const user = await prisma.user.findFirst({
          where: { telegramId: telegramId }
        });

        if (!user) {
          await ctx.reply(`❌ Пользователь с Telegram ID ${telegramId} не найден`);
          return;
        }

        await addPZToUser(user.id, amount, description);
        await ctx.reply(`✅ Начислено ${amount} PZ пользователю ${user.firstName || 'Пользователь'} (${telegramId})\nОписание: ${description}`);
      } catch (error) {
        console.error('Add PZ command error:', error);
        await ctx.reply('❌ Ошибка начисления PZ');
      }
    });

    // Deduct PZ command
    bot.command('deductpz', async (ctx) => {
      if (!isAdmin(ctx)) {
        await ctx.reply('❌ У вас нет прав для выполнения этой команды');
        return;
      }

      const args = ctx.message.text.split(' ').slice(1);
      if (args.length < 3) {
        await ctx.reply('❌ Использование: /deductpz <telegram_id> <amount> <description>\nПример: /deductpz 123456789 5.25 Штраф за нарушение');
        return;
      }

      const [telegramId, amountStr, ...descriptionParts] = args;
      const amount = parseFloat(amountStr);
      const description = descriptionParts.join(' ');

      if (isNaN(amount) || amount <= 0) {
        await ctx.reply('❌ Неверная сумма');
        return;
      }

      try {
        // Find user by telegram ID
        const user = await prisma.user.findFirst({
          where: { telegramId: telegramId }
        });

        if (!user) {
          await ctx.reply(`❌ Пользователь с Telegram ID ${telegramId} не найден`);
          return;
        }

        await deductPZFromUser(user.id, amount, description);
        await ctx.reply(`✅ Списано ${amount} PZ у пользователя ${user.firstName || 'Пользователь'} (${telegramId})\nОписание: ${description}`);
      } catch (error) {
        console.error('Deduct PZ command error:', error);
        if (error instanceof Error && error.message === 'Insufficient balance') {
          await ctx.reply('❌ Недостаточно средств на балансе');
        } else {
          await ctx.reply('❌ Ошибка списания PZ');
        }
      }
    });

    // Check balance command
    bot.command('balance', async (ctx) => {
      if (!isAdmin(ctx)) {
        await ctx.reply('❌ У вас нет прав для выполнения этой команды');
        return;
      }

      const args = ctx.message.text.split(' ').slice(1);
      if (args.length < 1) {
        await ctx.reply('❌ Использование: /balance <telegram_id>\nПример: /balance 123456789');
        return;
      }

      const telegramId = args[0];

      try {
        // Find user by telegram ID
        const user = await prisma.user.findFirst({
          where: { telegramId: telegramId },
          include: { partner: true }
        });

        if (!user) {
          await ctx.reply(`❌ Пользователь с Telegram ID ${telegramId} не найден`);
          return;
        }

        const balance = user.partner?.balance || 0;
        await ctx.reply(`💰 Баланс пользователя ${user.firstName || 'Пользователь'} (${telegramId}): ${balance.toFixed(2)} PZ`);
      } catch (error) {
        console.error('Balance command error:', error);
        await ctx.reply('❌ Ошибка получения баланса');
      }
    });

    // Transaction history command
    bot.command('history', async (ctx) => {
      if (!isAdmin(ctx)) {
        await ctx.reply('❌ У вас нет прав для выполнения этой команды');
        return;
      }

      const args = ctx.message.text.split(' ').slice(1);
      if (args.length < 1) {
        await ctx.reply('❌ Использование: /history <telegram_id>\nПример: /history 123456789');
        return;
      }

      const telegramId = args[0];

      try {
        // Find user by telegram ID
        const user = await prisma.user.findFirst({
          where: { telegramId: telegramId }
        });

        if (!user) {
          await ctx.reply(`❌ Пользователь с Telegram ID ${telegramId} не найден`);
          return;
        }

        const transactions = await getUserTransactionHistory(user.id, 10);
        
        if (transactions.length === 0) {
          await ctx.reply(`📋 История операций пользователя ${user.firstName || 'Пользователь'} пуста`);
          return;
        }

        let message = `📋 История операций пользователя ${user.firstName || 'Пользователь'} (${telegramId}):\n\n`;
        
        transactions.forEach(tx => {
          const sign = tx.type === 'CREDIT' ? '+' : '-';
          const date = new Date(tx.createdAt).toLocaleString('ru-RU');
          message += `${sign}${Number(tx.amount).toFixed(2)} PZ — ${tx.description}\n${date}\n\n`;
        });

        await ctx.reply(message);
      } catch (error) {
        console.error('History command error:', error);
        await ctx.reply('❌ Ошибка получения истории операций');
      }
    });

    // Help command for admin
    bot.command('adminhelp', async (ctx) => {
      if (!isAdmin(ctx)) {
        await ctx.reply('❌ У вас нет прав для выполнения этой команды');
        return;
      }

      const helpText = `🔧 Админские команды:

/addpz <telegram_id> <amount> <description>
Начислить PZ пользователю
Пример: /addpz 123456789 10.50 Бонус за активность

/deductpz <telegram_id> <amount> <description>
Списать PZ у пользователя
Пример: /deductpz 123456789 5.25 Штраф за нарушение

/balance <telegram_id>
Проверить баланс пользователя
Пример: /balance 123456789

/history <telegram_id>
Показать историю операций пользователя
Пример: /history 123456789

/adminhelp
Показать эту справку`;

      await ctx.reply(helpText);
    });
  },
};
