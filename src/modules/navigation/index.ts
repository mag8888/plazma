import { Telegraf, Markup } from 'telegraf';
import { Context } from '../../bot/context.js';
import { BotModule } from '../../bot/types.js';
import { logUserAction } from '../../services/user-history.js';
import { createPartnerReferral } from '../../services/partner-service.js';

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
      
      // Check if user came from referral link
      const startPayload = ctx.startPayload;
      if (startPayload && (startPayload.startsWith('ref_direct_') || startPayload.startsWith('ref_multi_'))) {
        const [prefix, referralCode] = startPayload.split('_', 2);
        const programType = prefix === 'ref' ? 'DIRECT' : 'MULTI_LEVEL';
        
        try {
          // Find partner profile by referral code
          const { prisma } = await import('../../lib/prisma.js');
          const partnerProfile = await prisma.partnerProfile.findUnique({
            where: { referralCode },
            include: { user: true }
          });
          
          if (partnerProfile) {
            // Create referral record
            await createPartnerReferral(partnerProfile.id, 1, ctx.from?.id?.toString());
            
            const programText = programType === 'DIRECT' 
              ? 'прямой программе (25% с покупок)'
              : 'многоуровневой программе (15% + 5% + 5%)';
              
            await ctx.reply(`🎉 Добро пожаловать! Вы перешли по ссылке от ${partnerProfile.user.firstName || 'партнёра'} в ${programText}!`);
            await logUserAction(ctx, 'partner:referral_joined', { 
              referralCode, 
              partnerId: partnerProfile.id,
              programType 
            });
          }
        } catch (error) {
          console.error('Error processing referral:', error);
        }
      }
      
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
