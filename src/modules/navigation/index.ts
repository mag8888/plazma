import { Telegraf, Markup } from 'telegraf';
import { Context } from '../../bot/context.js';
import { BotModule } from '../../bot/types.js';
import { logUserAction } from '../../services/user-history.js';

const greeting = `👋 Добро пожаловать!
Plazma Water — жидкие витамины и минералы в наноформе.
💧 Усвоение — до 99,9% (в отличие от таблеток 1–10%).
⚡ Быстро, легко и без нагрузки на печень и почки — питание прямо в клетки.

Хотите узнать больше? 👇`;

const introDetails = `✨ Plazma Water — это источник энергии нового поколения.

💧 Уникальная наноструктура усваивается до 99,9%, доставляя витамины и микроэлементы прямо в клетки.
⚡ Забудьте про усталость — почувствуйте лёгкость, ясность и заряд сил на весь день.

🌿 Поддержка здоровья без нагрузки на печень и почки.
🛡 Надёжная защита от вирусов и патогенов.
💚 Восстановление организма на клеточном уровне.

👩‍🦰 Улучшение состояния кожи и волос — добавляйте Plazma Water в косметику и уход.
🏡 Забота о доме и природе — подходит даже для полива растений, усиливая их рост.

🔥 Один продукт — десятки применений: для энергии, здоровья, красоты и гармонии.
Попробуйте и убедитесь сами — результат ощущается уже после первых дней.`;

export function mainKeyboard() {
  return Markup.keyboard([
    ['Магазин', 'Партнёрка'],
    ['Отзывы', 'О нас'],
  ]).resize();
}

export const navigationModule: BotModule = {
  async register(bot: Telegraf<Context>) {
    bot.start(async (ctx) => {
      await logUserAction(ctx, 'command:start');
      await ctx.reply(greeting, mainKeyboard());
      await ctx.reply('✨ Plazma Water — это источник энергии нового поколения.', {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: 'Подробнее',
                callback_data: 'nav:more',
              },
            ],
          ],
        },
      });
    });


    bot.hears(['Меню', 'Главное меню', 'Назад'], async (ctx) => {
      await logUserAction(ctx, 'menu:main');
      await ctx.reply(greeting, mainKeyboard());
    });

    bot.action('nav:more', async (ctx) => {
      await ctx.answerCbQuery();
      await logUserAction(ctx, 'cta:detailed-intro');
      await ctx.reply(introDetails);
    });
  },
};
