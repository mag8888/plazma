import { Telegraf } from 'telegraf';
import { Context } from '../../bot/context.js';
import { BotModule } from '../../bot/types.js';
import { logUserAction } from '../../services/user-history.js';

const aboutText = `👋 Добро пожаловать в Plazma Water
Корпорация плазменных технологий будущего 🌍

✨ Наша миссия — улучшать жизнь и здоровье людей с помощью плазмы, энергии и свободной энергетики.
Эталонное мировое качество ⚡

⸻

🔹 Что такое Plazma Water?

💧 Жидкие витамины и минералы в наноформе.
📊 Усвояемость — до 99,9% (вместо 1–10% у таблеток).
⚡ Проникает прямо в клетки, минуя барьеры.
💚 Без побочных эффектов и нагрузки на органы.

⸻

🔹 Польза

🌿 Нормализует ЦНС и снижает стресс
❤️ Восстанавливает сердце и сосуды
🧠 Улучшает работу мозга и память
⚖️ Балансирует гормоны
✨ Омолаживает организм
🛡 Укрепляет иммунитет и защищает от вирусов`;

export const aboutModule: BotModule = {
  async register(bot: Telegraf<Context>) {
        bot.hears([/о\s*нас/i, 'ℹ️ О нас'], async (ctx) => {
      await logUserAction(ctx, 'menu:about');
      await showAbout(ctx);
    });
  },
};

export async function showAbout(ctx: Context) {
  await ctx.reply(aboutText);
}
