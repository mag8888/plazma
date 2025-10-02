import { Telegraf, Markup } from 'telegraf';
import { Context } from '../../bot/context.js';
import { BotModule } from '../../bot/types.js';
import { logUserAction } from '../../services/user-history.js';
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
    ['🛒 Магазин', '💰 Партнёрка'],
    ['⭐ Отзывы', 'ℹ️ О нас'],
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
            
            // Award 3PZ to the inviter
            await recordPartnerTransaction(
              partnerProfile.id, 
              3, 
              'Бонус за приглашение друга', 
              'CREDIT'
            );
            
            // Send notification to inviter
            try {
              await ctx.telegram.sendMessage(
                partnerProfile.user.telegramId,
                '🎉 Ваш счет пополнен на 3PZ, приглашайте больше друзей и получайте продукцию за бонусы!'
              );
            } catch (error) {
              console.warn('Failed to send notification to inviter:', error);
            }
            
            const programText = programType === 'DIRECT' 
              ? 'прямой программе (25% с покупок)'
              : 'многоуровневой программе (15% + 5% + 5%)';
              
            const bonusText = `\n\n💡 Условия бонуса:
• Ваш бонус 10%
• Бонус ${programType === 'DIRECT' ? '25%' : '15%+5%+5%'} начнет действовать при Вашей активности 200PZ в месяц`;
              
          await ctx.reply(`🎉 Добро пожаловать! Вы перешли по ссылке от ${partnerProfile.user.firstName || 'партнёра'} в ${programText}!${bonusText}`);
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

    // Send welcome message with video button
    await ctx.reply('✨ Plazma Water — это источник энергии нового поколения.', {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🎥 Посмотреть видео',
              callback_data: 'nav:video',
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
      await ctx.reply('✨ Plazma Water — это источник энергии нового поколения.', {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '🎥 Посмотреть видео',
                callback_data: 'nav:video',
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

    bot.action('nav:video', async (ctx) => {
      await ctx.answerCbQuery();
      await logUserAction(ctx, 'cta:video');
      
      const videoUrl = 'https://res.cloudinary.com/dt4r1tigf/video/upload/v1759337188/%D0%9F%D0%9E%D0%A7%D0%95%D0%9C%D0%A3_%D0%91%D0%90%D0%94%D0%AB_%D0%BD%D0%B5_%D1%80%D0%B0%D0%B1%D0%BE%D1%82%D0%B0%D1%8E%D1%82_%D0%95%D1%81%D1%82%D1%8C_%D1%80%D0%B5%D1%88%D0%B5%D0%BD%D0%B8%D0%B5_gz54oh.mp4';
      
      try {
        // Try to send video as URL first
        await ctx.replyWithVideo(videoUrl, {
          caption: '🎥 Plazma Water — источник энергии нового поколения',
        });
      } catch (error) {
        console.error('Error sending video:', error);
        try {
          // Try with different parameters
          await ctx.replyWithVideo(videoUrl);
        } catch (error2) {
          console.error('Error sending video (second attempt):', error2);
          // Final fallback - send as text with inline keyboard
          await ctx.reply('🎥 Plazma Water — источник энергии нового поколения', {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: '🎥 Смотреть видео',
                    url: videoUrl,
                  },
                ],
              ],
            },
          });
        }
      }
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

    // Handle "Партнёрка" button  
    bot.hears(['💰 Партнёрка'], async (ctx) => {
      await logUserAction(ctx, 'menu:partner');
      // This will be handled by partner module
      await ctx.reply('Переходим в партнёрскую программу...');
    });
  },
};
