import { Markup, Telegraf } from 'telegraf';
import { BotModule } from '../../bot/types.js';
import { Context } from '../../bot/context.js';
import { logUserAction } from '../../services/user-history.js';
import { getCartItems, cartItemsToText, clearCart } from '../../services/cart-service.js';

export const cartModule: BotModule = {
  async register(bot: Telegraf<Context>) {
    // Handle "Корзина" button
    bot.hears(['🛍️ Корзина'], async (ctx) => {
      await logUserAction(ctx, 'menu:cart');
      await showCart(ctx);
    });
  },
};

async function showCart(ctx: Context) {
  try {
    const userId = ctx.from?.id?.toString();
    if (!userId) {
      await ctx.reply('❌ Ошибка: не удалось определить пользователя');
      return;
    }

    const cartItems = await getCartItems(userId);
    
    if (cartItems.length === 0) {
      await ctx.reply('🛍️ Ваша корзина пуста\n\nДобавьте товары из магазина!', {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '🛒 Перейти в магазин',
                callback_data: 'cart:go_to_shop',
              },
            ],
          ],
        },
      });
      return;
    }

    const cartText = cartItemsToText(cartItems);
    
    await ctx.reply(`🛍️ Ваша корзина:\n\n${cartText}`, {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '💳 Оформить заказ',
              callback_data: 'cart:checkout',
            },
          ],
          [
            {
              text: '🗑️ Очистить корзину',
              callback_data: 'cart:clear',
            },
          ],
          [
            {
              text: '🛒 Продолжить покупки',
              callback_data: 'cart:continue_shopping',
            },
          ],
        ],
      },
    });
  } catch (error) {
    console.error('Error showing cart:', error);
    await ctx.reply('❌ Ошибка загрузки корзины. Попробуйте позже.');
  }
}

// Handle cart actions
export function registerCartActions(bot: Telegraf<Context>) {
  // Go to shop
  bot.action('cart:go_to_shop', async (ctx) => {
    await ctx.answerCbQuery();
    await logUserAction(ctx, 'cart:go_to_shop');
    
    // Import shop module dynamically to avoid circular dependency
    const { showCategories } = await import('../shop/index.js');
    await showCategories(ctx);
  });

  // Continue shopping
  bot.action('cart:continue_shopping', async (ctx) => {
    await ctx.answerCbQuery();
    await logUserAction(ctx, 'cart:continue_shopping');
    
    const { showCategories } = await import('../shop/index.js');
    await showCategories(ctx);
  });

  // Clear cart
  bot.action('cart:clear', async (ctx) => {
    await ctx.answerCbQuery();
    await logUserAction(ctx, 'cart:clear');
    
    const userId = ctx.from?.id?.toString();
    if (!userId) {
      await ctx.reply('❌ Ошибка: не удалось определить пользователя');
      return;
    }

    await clearCart(userId);
    await ctx.reply('🗑️ Корзина очищена');
  });

  // Checkout
  bot.action('cart:checkout', async (ctx) => {
    await ctx.answerCbQuery();
    await logUserAction(ctx, 'cart:checkout');
    
    const userId = ctx.from?.id?.toString();
    if (!userId) {
      await ctx.reply('❌ Ошибка: не удалось определить пользователя');
      return;
    }

    try {
      const cartItems = await getCartItems(userId);
      
      if (cartItems.length === 0) {
        await ctx.reply('🛍️ Ваша корзина пуста');
        return;
      }

      const cartText = cartItemsToText(cartItems);
      const orderText = `🛍️ Новый заказ от ${ctx.from?.first_name || 'Пользователь'}\n\n${cartText}\n\n📞 Свяжитесь с покупателем: @${ctx.from?.username || 'нет username'}`;

      // Send order to admin
      const { env } = await import('../../config/env.js');
      if (env.adminChatId) {
        await ctx.telegram.sendMessage(env.adminChatId, orderText);
      }
      
      // Clear cart after successful order
      await clearCart(userId);
      
      await ctx.reply('✅ Заказ отправлен! Мы свяжемся с вами в ближайшее время.');
    } catch (error) {
      console.error('Error processing checkout:', error);
      await ctx.reply('❌ Ошибка оформления заказа. Попробуйте позже.');
    }
  });
}
