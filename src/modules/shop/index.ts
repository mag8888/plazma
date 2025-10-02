import { Markup, Telegraf } from 'telegraf';
import { Context } from '../../bot/context.js';
import { BotModule } from '../../bot/types.js';
import { ensureUser, logUserAction } from '../../services/user-history.js';
import { getActiveCategories, getCategoryById, getProductById, getProductsByCategory } from '../../services/shop-service.js';
import { addProductToCart, cartItemsToText, getCartItems } from '../../services/cart-service.js';
import { createOrderRequest } from '../../services/order-service.js';
import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';

const CATEGORY_ACTION_PREFIX = 'shop:cat:';
const PRODUCT_MORE_PREFIX = 'shop:prod:more:';
const PRODUCT_CART_PREFIX = 'shop:prod:cart:';
const PRODUCT_BUY_PREFIX = 'shop:prod:buy:';

export async function showCategories(ctx: Context) {
  await logUserAction(ctx, 'shop:open');
  
  try {
    console.log('🛍️ Loading categories...');
    const categories = await getActiveCategories();
    console.log('🛍️ Found active categories:', categories.length);
    
    // Debug: also check all categories
    const allCategories = await prisma.category.findMany();
    console.log('🛍️ Total categories in DB:', allCategories.length);
    allCategories.forEach(cat => {
      console.log(`  - ${cat.name} (ID: ${cat.id}, Active: ${cat.isActive})`);
    });
    
    if (categories.length === 0) {
      console.log('🛍️ No active categories found, showing empty message');
      await ctx.reply('🛍️ Каталог товаров Plazma Water\n\nКаталог пока пуст. Добавьте категории и товары в админке.');
      return;
    }

    // Show catalog with products grouped by categories
    await ctx.reply('🛍️ Каталог товаров Plazma Water\n\nВыберите категорию:', {
      reply_markup: {
        inline_keyboard: categories.map((category: any) => [
          {
            text: `📂 ${category.name}`,
            callback_data: `${CATEGORY_ACTION_PREFIX}${category.id}`,
          },
        ]),
      },
    });
  } catch (error) {
    console.error('Error loading categories:', error);
    await ctx.reply('🛍️ Каталог товаров Plazma Water\n\n❌ Ошибка загрузки каталога. Попробуйте позже.');
  }
}

function formatProductMessage(product: { title: string; summary: string; price: unknown }) {
  const pzPrice = Number(product.price);
  const rubPrice = (pzPrice * 100).toFixed(2);
  return `💧 ${product.title}\n${product.summary}\n\nЦена: ${rubPrice} ₽ / ${pzPrice} PZ`;
}

async function sendProductCards(ctx: Context, categoryId: string) {
  try {
    const category = await getCategoryById(categoryId);
    if (!category) {
      await ctx.reply('❌ Категория не найдена.');
      return;
    }

    const products = await getProductsByCategory(categoryId);
    if (products.length === 0) {
      await ctx.reply(`📂 ${category.name}\n\nВ этой категории пока нет товаров.`);
      return;
    }

    // Show category header
    await ctx.reply(`📂 ${category.name}\n\nТовары в категории:`);

    // Send products in a grid layout
    for (const product of products) {
      console.log(`🛍️ Product: ${product.title}, ImageUrl: ${product.imageUrl}`);
      
      const buttons = [];
      if (product.description) {
        buttons.push(Markup.button.callback('📖 Подробнее', `${PRODUCT_MORE_PREFIX}${product.id}`));
      }
      buttons.push(Markup.button.callback('🛒 В корзину', `${PRODUCT_CART_PREFIX}${product.id}`));
      buttons.push(Markup.button.callback('💳 Купить', `${PRODUCT_BUY_PREFIX}${product.id}`));

      const message = formatProductMessage(product);
      
      if (product.imageUrl && product.imageUrl.trim() !== '') {
        console.log(`🛍️ Sending product with image: ${product.imageUrl}`);
        await ctx.replyWithPhoto(product.imageUrl, {
          caption: message,
          ...Markup.inlineKeyboard([buttons]),
        });
      } else {
        console.log(`🛍️ Sending product without image (no imageUrl)`);
        await ctx.reply(message, Markup.inlineKeyboard([buttons]));
      }
    }

  } catch (error) {
    console.error('Error loading products:', error);
    await ctx.reply('❌ Ошибка загрузки товаров. Попробуйте позже.');
  }
}

async function handleAddToCart(ctx: Context, productId: string) {
  const user = await ensureUser(ctx);
  if (!user) {
    await ctx.reply('Не удалось определить пользователя. Попробуйте позже.');
    return;
  }

  const product = await getProductById(productId);
  if (!product) {
    await ctx.reply('Товар не найден.');
    return;
  }

  await addProductToCart(user.id, product.id);
  await logUserAction(ctx, 'shop:add-to-cart', { productId: product.id });
  await ctx.answerCbQuery('Добавлено в корзину ✅');
  await ctx.reply(`«${product.title}» добавлен(а) в корзину.`);
}

async function handleProductMore(ctx: Context, productId: string) {
  const product = await getProductById(productId);
  if (!product || !product.description) {
    await ctx.answerCbQuery('Описание не найдено');
    return;
  }

  await logUserAction(ctx, 'shop:product-details', { productId });
  await ctx.answerCbQuery();
  await ctx.reply(`ℹ️ ${product.title}\n\n${product.description}`);
}

async function handleBuy(ctx: Context, productId: string) {
  const user = await ensureUser(ctx);
  if (!user) {
    await ctx.reply('Не удалось определить пользователя. Попробуйте позже.');
    return;
  }

  const product = await getProductById(productId);
  if (!product) {
    await ctx.reply('Товар не найден.');
    return;
  }

  const cartItems = await getCartItems(user.id);
  const summaryText = cartItemsToText(cartItems);
  const adminChatId = env.adminChatId;

  const lines = [
    '🛒 Запрос на покупку',
    `Пользователь: ${user.firstName ?? ''} ${user.lastName ?? ''}`.trim(),
    user.username ? `@${user.username}` : undefined,
    `Telegram ID: ${user.telegramId}`,
    '',
    `Основной товар: ${product.title}`,
  ].filter(Boolean);

  if (cartItems.length > 0) {
    lines.push('', 'Корзина:', summaryText);
  } else {
    lines.push('', 'Корзина: пока пусто.');
  }

  const message = lines.join('\n');

  const itemsPayload = cartItems.map((item: any) => ({
    productId: item.productId,
    title: item.product.title,
    price: Number(item.product.price),
    quantity: item.quantity,
  }));

  itemsPayload.push({
    productId: product.id,
    title: product.title,
    price: Number(product.price),
    quantity: 1,
  });

  await createOrderRequest({
    userId: user.id,
    message: `Покупка через бота. Основной товар: ${product.title}`,
    items: itemsPayload,
  });

  await logUserAction(ctx, 'shop:buy', { productId });

  if (adminChatId) {
    await ctx.telegram.sendMessage(adminChatId, `${message}\n\nЗдравствуйте, хочу приобрести товар…`);
  }

  await ctx.answerCbQuery();
  await ctx.reply('Заявка отправлена администратору. Мы свяжемся с вами в ближайшее время!');
}

export const shopModule: BotModule = {
  async register(bot: Telegraf<Context>) {
    console.log('🛍️ Registering shop module...');
    bot.hears(['Магазин', 'Каталог', '🛒 Магазин'], async (ctx) => {
      console.log('🛍️ Shop button pressed by user:', ctx.from?.id);
      await showCategories(ctx);
    });

    bot.action(new RegExp(`^${CATEGORY_ACTION_PREFIX}(.+)$`), async (ctx) => {
      const match = ctx.match as RegExpExecArray;
      const categoryId = match[1];
      await ctx.answerCbQuery();
      await logUserAction(ctx, 'shop:category', { categoryId });
      await sendProductCards(ctx, categoryId);
    });

    bot.action(new RegExp(`^${PRODUCT_MORE_PREFIX}(.+)$`), async (ctx) => {
      const match = ctx.match as RegExpExecArray;
      const productId = match[1];
      await handleProductMore(ctx, productId);
    });

    bot.action(new RegExp(`^${PRODUCT_CART_PREFIX}(.+)$`), async (ctx) => {
      const match = ctx.match as RegExpExecArray;
      const productId = match[1];
      await handleAddToCart(ctx, productId);
    });

    bot.action(new RegExp(`^${PRODUCT_BUY_PREFIX}(.+)$`), async (ctx) => {
      const match = ctx.match as RegExpExecArray;
      const productId = match[1];
      await handleBuy(ctx, productId);
    });

  },
};
