import { Telegraf } from 'telegraf';
import { Context } from '../../bot/context.js';
import { BotModule } from '../../bot/types.js';
import { getActiveReviews } from '../../services/review-service.js';
import { logUserAction } from '../../services/user-history.js';

export const reviewsModule: BotModule = {
  async register(bot: Telegraf<Context>) {
    console.log('⭐ Registering reviews module...');
    bot.hears(['Отзывы', '⭐ Отзывы'], async (ctx) => {
      console.log('⭐ Reviews button pressed by user:', ctx.from?.id, ctx.message?.text);
      await logUserAction(ctx, 'menu:reviews');
      const reviews = await getActiveReviews();

      if (reviews.length === 0) {
        await ctx.reply('Отзывов пока нет. Добавьте их в админке.');
        return;
      }

      for (const review of reviews) {
        const caption = [`⭐ ${review.name}`, review.content];
        if (review.link) {
          caption.push(`Подробнее: ${review.link}`);
        }

        if (review.photoUrl) {
          await ctx.replyWithPhoto(review.photoUrl, { caption: caption.join('\n\n') });
        } else {
          await ctx.reply(caption.join('\n\n'));
        }
      }
    });
  },
};
