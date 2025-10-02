import { Markup, Telegraf } from 'telegraf';
import { BotModule } from '../../bot/types.js';
import { Context } from '../../bot/context.js';
import { logUserAction } from '../../services/user-history.js';
import { getCartItems, cartItemsToText, clearCart, increaseProductQuantity, decreaseProductQuantity, removeProductFromCart } from '../../services/cart-service.js';

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
    console.log('🛍️ Cart: Starting showCart function');
    const userId = ctx.from?.id?.toString();
    console.log('🛍️ Cart: User ID:', userId);
    
    if (!userId) {
      console.log('🛍️ Cart: No user ID found');
      await ctx.reply('❌ Ошибка: не удалось определить пользователя');
      return;
    }

    console.log('🛍️ Cart: Getting cart items for user:', userId);
    const cartItems = await getCartItems(userId);
    console.log('🛍️ Cart: Found cart items:', cartItems.length);
    
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

    // Send each cart item separately with quantity controls
    for (const item of cartItems) {
      const rubPrice = (item.product.price * 100).toFixed(2);
      const pzPrice = item.product.price.toFixed(2);
      const itemTotalRub = (item.product.price * item.quantity * 100).toFixed(2);
      const itemTotalPz = (item.product.price * item.quantity).toFixed(2);
      
      const itemText = `🛍️ ${item.product.title}\n📦 Количество: ${item.quantity}\n💰 Цена: ${rubPrice} ₽ / ${pzPrice} PZ\n💵 Итого: ${itemTotalRub} ₽ / ${itemTotalPz} PZ`;
      
      await ctx.reply(itemText, {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '➖ Убрать 1',
                callback_data: `cart:decrease:${item.productId}`,
              },
              {
                text: '➕ Добавить 1',
                callback_data: `cart:increase:${item.productId}`,
              },
            ],
            [
              {
                text: '🗑️ Удалить товар',
                callback_data: `cart:remove:${item.productId}`,
              },
            ],
          ],
        },
      });
    }
    
    // Send total and action buttons
    const total = cartItems.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
    const totalRub = (total * 100).toFixed(2);
    const totalPz = total.toFixed(2);
    
    await ctx.reply(`💰 Итого к оплате: ${totalRub} ₽ / ${totalPz} PZ`, {
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
    console.error('🛍️ Cart: Error showing cart:', error);
    console.error('🛍️ Cart: Error details:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
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

      // Send order to all admins
      const { sendToAllAdmins } = await import('../../config/env.js');
      await sendToAllAdmins(ctx, orderText);
      
      // Clear cart after successful order
      await clearCart(userId);
      
      await ctx.reply('✅ Заказ отправлен! Мы свяжемся с вами в ближайшее время.');
    } catch (error) {
      console.error('Error processing checkout:', error);
      await ctx.reply('❌ Ошибка оформления заказа. Попробуйте позже.');
    }
  });

  // Handle increase quantity
  bot.action(/^cart:increase:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    await logUserAction(ctx, 'cart:increase');
    
    const match = ctx.match as RegExpExecArray;
    const productId = match[1];
    const userId = ctx.from?.id?.toString();
    
    if (!userId) {
      await ctx.reply('❌ Ошибка: не удалось определить пользователя');
      return;
    }

    try {
      await increaseProductQuantity(userId, productId);
      await ctx.reply('✅ Количество увеличено!');
      // Refresh cart display
      await showCart(ctx);
    } catch (error) {
      console.error('Error increasing quantity:', error);
      await ctx.reply('❌ Ошибка изменения количества. Попробуйте позже.');
    }
  });

  // Handle decrease quantity
  bot.action(/^cart:decrease:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    await logUserAction(ctx, 'cart:decrease');
    
    const match = ctx.match as RegExpExecArray;
    const productId = match[1];
    const userId = ctx.from?.id?.toString();
    
    if (!userId) {
      await ctx.reply('❌ Ошибка: не удалось определить пользователя');
      return;
    }

    try {
      await decreaseProductQuantity(userId, productId);
      await ctx.reply('✅ Количество уменьшено!');
      // Refresh cart display
      await showCart(ctx);
    } catch (error) {
      console.error('Error decreasing quantity:', error);
      await ctx.reply('❌ Ошибка изменения количества. Попробуйте позже.');
    }
  });

  // Handle remove product
  bot.action(/^cart:remove:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    await logUserAction(ctx, 'cart:remove');
    
    const match = ctx.match as RegExpExecArray;
    const productId = match[1];
    const userId = ctx.from?.id?.toString();
    
    if (!userId) {
      await ctx.reply('❌ Ошибка: не удалось определить пользователя');
      return;
    }

    try {
      await removeProductFromCart(userId, productId);
      await ctx.reply('✅ Товар удален из корзины!');
      // Refresh cart display
      await showCart(ctx);
    } catch (error) {
      console.error('Error removing product:', error);
      await ctx.reply('❌ Ошибка удаления товара. Попробуйте позже.');
    }
  });
}
