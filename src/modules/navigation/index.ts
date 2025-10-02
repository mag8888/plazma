import { Telegraf, Markup } from 'telegraf';
import { Context } from '../../bot/context.js';
import { BotModule } from '../../bot/types.js';
import { logUserAction, ensureUser } from '../../services/user-history.js';
import { createPartnerReferral, recordPartnerTransaction } from '../../services/partner-service.js';

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
    ['🛒 Магазин', '🛍️ Корзина'],
    ['💰 Партнёрка'],
    ['⭐ Отзывы', 'ℹ️ О нас'],
  ]).resize();
}

export const navigationModule: BotModule = {
  async register(bot: Telegraf<Context>) {
    bot.start(async (ctx) => {
      await logUserAction(ctx, 'command:start');
      
      // Check if user came from referral link
      const startPayload = ctx.startPayload;
      console.log('🔗 Referral: startPayload =', startPayload);
      
      if (startPayload && (startPayload.startsWith('ref_direct_') || startPayload.startsWith('ref_multi_'))) {
        const parts = startPayload.split('_');
        console.log('🔗 Referral: parts =', parts);
        
        const programType = parts[1] === 'direct' ? 'DIRECT' : 'MULTI_LEVEL';
        const referralCode = parts.slice(2).join('_'); // Join remaining parts in case code contains underscores
        
        console.log('🔗 Referral: programType =', programType, 'referralCode =', referralCode);
        
        try {
          // Find partner profile by referral code
          const { prisma } = await import('../../lib/prisma.js');
          console.log('🔗 Referral: Searching for partner profile with code:', referralCode);
          
          const partnerProfile = await prisma.partnerProfile.findUnique({
            where: { referralCode },
            include: { user: true }
          });
          
          console.log('🔗 Referral: Found partner profile:', partnerProfile ? 'YES' : 'NO');
          
          if (partnerProfile) {
            // Ensure user exists first
            const user = await ensureUser(ctx);
            if (!user) {
              console.log('🔗 Referral: Failed to ensure user');
              await ctx.reply('❌ Ошибка при регистрации пользователя.');
              return;
            }
            
            console.log('🔗 Referral: User ensured, creating referral record');
            // Create referral record using user ID (ObjectId)
            await createPartnerReferral(partnerProfile.id, 1, user.id);
            
            // Award 3PZ to the inviter
            console.log('🔗 Referral: Awarding 3PZ bonus to inviter');
            await recordPartnerTransaction(
              partnerProfile.id, 
              3, 
              'Бонус за приглашение друга', 
              'CREDIT'
            );
            console.log('🔗 Referral: Bonus awarded successfully');
            
            // Send notification to inviter
            try {
              console.log('🔗 Referral: Sending notification to inviter:', partnerProfile.user.telegramId);
              await ctx.telegram.sendMessage(
                partnerProfile.user.telegramId,
                '🎉 Ваш счет пополнен на 3PZ, приглашайте больше друзей и получайте продукцию за бонусы!'
              );
              console.log('🔗 Referral: Notification sent successfully');
            } catch (error) {
              console.warn('🔗 Referral: Failed to send notification to inviter:', error);
            }
            
            const programText = programType === 'DIRECT' 
              ? 'прямой программе (25% с покупок)'
              : 'многоуровневой программе (15% + 5% + 5%)';
              
            const bonusText = `\n\n💡 Условия бонуса:
• Ваш бонус 10%
• Бонус ${programType === 'DIRECT' ? '25%' : '15%+5%+5%'} начнет действовать при Вашей активности 200PZ в месяц`;
              
          console.log('🔗 Referral: Sending welcome message with bonus info');
          await ctx.reply(`🎉 Добро пожаловать! Вы перешли по ссылке от ${partnerProfile.user.firstName || 'партнёра'} в ${programText}!${bonusText}`);
          console.log('🔗 Referral: Welcome message sent');
          
          await logUserAction(ctx, 'partner:referral_joined', {
            referralCode,
            partnerId: partnerProfile.id,
            programType
          });
          console.log('🔗 Referral: User action logged');
        } else {
          console.log('🔗 Referral: Partner profile not found for code:', referralCode);
          await ctx.reply('❌ Реферальная ссылка недействительна. Партнёр не найден.');
        }
      } catch (error) {
        console.error('🔗 Referral: Error processing referral:', error);
        await ctx.reply('❌ Ошибка при обработке реферальной ссылки. Попробуйте позже.');
      }
    }

    await ctx.reply(greeting, mainKeyboard());

    // Send welcome message with video button
    const videoUrl = 'https://res.cloudinary.com/dt4r1tigf/video/upload/v1759337188/%D0%9F%D0%9E%D0%A7%D0%95%D0%9C%D0%A3_%D0%91%D0%90%D0%94%D0%AB_%D0%BD%D0%B5_%D1%80%D0%B0%D0%B1%D0%BE%D1%82%D0%B0%D1%8E%D1%82_%D0%95%D1%81%D1%82%D1%8C_%D1%80%D0%B5%D1%88%D0%B5%D0%BD%D0%B8%D0%B5_gz54oh.mp4';
    
    await ctx.reply('✨ Plazma Water — это источник энергии нового поколения.', {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🎥 Смотреть видео',
              url: videoUrl,
            },
          ],
          [
            {
              text: '📖 Подробнее',
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
      
      // Send welcome message with video button
      const videoUrl = 'https://res.cloudinary.com/dt4r1tigf/video/upload/v1759337188/%D0%9F%D0%9E%D0%A7%D0%95%D0%9C%D0%A3_%D0%91%D0%90%D0%94%D0%AB_%D0%BD%D0%B5_%D1%80%D0%B0%D0%B1%D0%BE%D1%82%D0%B0%D1%8E%D1%82_%D0%95%D1%81%D1%82%D1%8C_%D1%80%D0%B5%D1%88%D0%B5%D0%BD%D0%B8%D0%B5_gz54oh.mp4';
      
      await ctx.reply('✨ Plazma Water — это источник энергии нового поколения.', {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '🎥 Смотреть видео',
                url: videoUrl,
              },
            ],
            [
              {
                text: '📖 Подробнее',
                callback_data: 'nav:more',
              },
            ],
          ],
        },
      });
    });


    bot.action('nav:more', async (ctx) => {
      await ctx.answerCbQuery();
      await logUserAction(ctx, 'cta:detailed-intro');
      await ctx.reply(introDetails);
    });

    // Handle "О нас" button
    bot.hears(['ℹ️ О нас'], async (ctx) => {
      await logUserAction(ctx, 'menu:about');
      await ctx.reply(introDetails);
    });


  },
};
