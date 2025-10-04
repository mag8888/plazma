import { Telegraf, Markup } from 'telegraf';
import { Context } from '../../bot/context.js';
import { BotModule } from '../../bot/types.js';
import { logUserAction } from '../../services/user-history.js';

const aboutText = `🤝 Мы в соцсетях — присоединяйтесь к сообществу Plazma Water!
Следите за новостями, делитесь опытом и приглашайте друзей 💧

VK: https://vk.com/iplazma
Инстаграм: https://www.instagram.com/iplazmanano/
Каталог: https://iplazma.tilda.ws/
https://t.me/iplasmanano`;

export const aboutModule: BotModule = {
  async register(bot: Telegraf<Context>) {
    // Обработчик перенесен в navigation модуль
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
