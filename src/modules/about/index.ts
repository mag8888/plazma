import { Telegraf, Markup } from 'telegraf';
import { Context } from '../../bot/context.js';
import { BotModule } from '../../bot/types.js';
import { logUserAction } from '../../services/user-history.js';

const aboutText = `💧 <b>О PLAZMA WATER</b>

✨ <b>Plazma Water</b> — это революционная форма витаминов и микроэлементов в плазменной наноформе.

🚀 <b>Преимущества:</b>
• Усвоение до 99,9% (в отличие от таблеток 1-10%)
• Проникает напрямую в клетки
• Без нагрузки на печень и почки
• Поддержка иммунитета и восстановление клеток

🤝 <b>Мы в соцсетях</b> — присоединяйтесь к сообществу!
Следите за новостями, делитесь опытом и приглашайте друзей 💧

<b>Наши ресурсы:</b>
VK: https://vk.com/iplazma
Инстаграм: https://www.instagram.com/iplazmanano/
Каталог: https://iplazma.tilda.ws/
Telegram: https://t.me/iplasmanano`;

export const aboutModule: BotModule = {
  async register(bot: Telegraf<Context>) {
    bot.hears(['ℹ️ О PLAZMA'], async (ctx) => {
      await logUserAction(ctx, 'menu:about');
      await showAbout(ctx);
    });
  },
};

export async function showAbout(ctx: Context) {
  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.url('📱 VK', 'https://vk.com/iplazma'),
      Markup.button.url('📸 Instagram', 'https://www.instagram.com/iplazmanano/')
    ],
    [
      Markup.button.url('🌐 Каталог', 'https://iplazma.tilda.ws/'),
      Markup.button.url('💬 Telegram', 'https://t.me/iplasmanano')
    ]
  ]);

  await ctx.reply(aboutText, keyboard);
}
