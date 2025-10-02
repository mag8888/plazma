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

type MenuStats = Partial<Record<'shop' | 'cart' | 'reviews' | 'partner', string>>;

type NavigationItem = {
  id: string;
  title: string;
  emoji: string;
  description: string;
  badgeKey?: keyof MenuStats;
  defaultBadge?: string;
  handler: (ctx: Context) => Promise<void>;
};

const NAVIGATION_ACTION_PREFIX = 'nav:menu:';

async function showSupport(ctx: Context) {
  await ctx.reply(
    '💬 Служба поддержки\n\nНапишите свой вопрос прямо в этот чат — команда Plazma Water ответит как можно быстрее.\n\nЕсли нужен срочный контакт, оставьте номер телефона, и мы перезвоним.'
  );
}

const navigationItems: NavigationItem[] = [
  {
    id: 'shop',
    title: 'Магазин',
    emoji: '🛒',
    description: 'Каталог продукции и сезонные наборы',
    badgeKey: 'shop',
    handler: async (ctx) => {
      const { showRegionSelection } = await import('../shop/index.js');
      await showRegionSelection(ctx);
    },
  },
  {
    id: 'cart',
    title: 'Корзина',
    emoji: '🧺',
    description: 'Выбранные товары и оформление заказа',
    badgeKey: 'cart',
    handler: async (ctx) => {
      const { showCart } = await import('../cart/index.js');
      await showCart(ctx);
    },
  },
  {
    id: 'partner',
    title: 'Партнёрка',
    emoji: '🤝',
    description: 'Реферальные бонусы и личный кабинет',
    handler: async (ctx) => {
      const { showPartnerIntro } = await import('../partner/index.js');
      await showPartnerIntro(ctx);
    },
  },
  {
    id: 'reviews',
    title: 'Отзывы',
    emoji: '⭐',
    description: 'Истории сообщества и результаты клиентов',
    badgeKey: 'reviews',
    handler: async (ctx) => {
      const { showReviews } = await import('../reviews/index.js');
      await showReviews(ctx);
    },
  },
  {
    id: 'about',
    title: 'О нас',
    emoji: 'ℹ️',
    description: 'Миссия, технологии и команда Plazma Water',
    handler: async (ctx) => {
      const { showAbout } = await import('../about/index.js');
      await showAbout(ctx);
    },
  },
  {
    id: 'support',
    title: 'Поддержка',
    emoji: '💬',
    description: 'Ответим на вопросы и поможем с заказом',
    defaultBadge: '24/7',
    handler: showSupport,
  },
];

function chunkArray<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

function getBadge(stats: MenuStats, item: NavigationItem) {
  if (item.badgeKey) {
    const value = stats[item.badgeKey];
    if (value) {
      return value;
    }
  }
  return item.defaultBadge;
}

function buildNavigationKeyboard(stats: MenuStats) {
  const buttons = navigationItems.map((item) => {
    const badge = getBadge(stats, item);
    const label = `${item.emoji} ${item.title}${badge ? ` • ${badge}` : ''}`;
    return Markup.button.callback(label, `${NAVIGATION_ACTION_PREFIX}${item.id}`);
  });

  return Markup.inlineKeyboard(chunkArray(buttons, 2));
}

function formatMenuMessage(stats: MenuStats) {
  const header = '🧭 <b>Навигация и сервисы</b>\n[ 🔍 Поиск по разделам ]';

  const body = navigationItems
    .map((item) => {
      const badge = getBadge(stats, item);
      const lines = [`• <b>${item.emoji} ${item.title}</b>${badge ? ` <code>${badge}</code>` : ''}`, `  ${item.description}`];
      return lines.join('\n');
    })
    .join('\n\n');

  const footer = '👇 Нажмите на карточку, чтобы перейти в нужный раздел.';

  return `${header}\n\n${body}\n\n${footer}`;
}

async function collectMenuStats(ctx: Context): Promise<MenuStats> {
  const stats: MenuStats = {};

  try {
    const [{ getActiveCategories }, { getActiveReviews }] = await Promise.all([
      import('../../services/shop-service.js'),
      import('../../services/review-service.js'),
    ]);

    const [categories, reviews] = await Promise.all([
      getActiveCategories().catch(() => []),
      getActiveReviews().catch(() => []),
    ]);

    if (categories.length > 0) {
      stats.shop = String(categories.length);
    }

    if (reviews.length > 0) {
      stats.reviews = String(reviews.length);
    }
  } catch (error) {
    console.warn('🧭 Navigation: Failed to collect shared stats', error);
  }

  const userId = ctx.from?.id?.toString();
  if (userId) {
    try {
      const { getCartItems } = await import('../../services/cart-service.js');
      const cartItems = await getCartItems(userId);
      const totalQuantity = cartItems.reduce((sum, item) => sum + (item.quantity ?? 0), 0);
      if (totalQuantity > 0) {
        stats.cart = String(totalQuantity);
      }
    } catch (error) {
      console.warn('🧭 Navigation: Failed to collect cart stats', error);
    }
  }

  return stats;
}

async function sendNavigationMenu(ctx: Context) {
  const stats = await collectMenuStats(ctx);
  const message = formatMenuMessage(stats);
  const keyboard = buildNavigationKeyboard(stats);

  await ctx.reply(message, {
    parse_mode: 'HTML',
    ...keyboard,
  });
}

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
            
          console.log('🔗 Referral: Sending welcome message with bonus info');
          await ctx.reply(`👋 Добро пожаловать!

🎉 Вас пригласил ${partnerProfile.user.firstName || 'партнёр'}

✨ Plazma Water — жидкие витамины и минералы в наноформе.
💧 Усвоение — до 99,9% (в отличие от таблеток 1–10%).
⚡ Быстро, легко и без нагрузки на печень и почки — питание прямо в клетки.

Хотите узнать больше? 👇`);
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
    await sendNavigationMenu(ctx);

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
      await sendNavigationMenu(ctx);
      
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

    for (const item of navigationItems) {
      bot.action(`${NAVIGATION_ACTION_PREFIX}${item.id}`, async (ctx) => {
        await ctx.answerCbQuery();
        await logUserAction(ctx, `menu:${item.id}`, { source: 'navigation-card' });

        try {
          await item.handler(ctx);
        } catch (error) {
          console.error(`🧭 Navigation: Failed to open section ${item.id}`, error);
          await ctx.reply('❌ Не удалось открыть раздел. Попробуйте позже.');
        }
      });
    }

    // Handle "О нас" button
    bot.hears(['ℹ️ О нас'], async (ctx) => {
      await logUserAction(ctx, 'menu:about');
      await ctx.reply(introDetails);
    });


  },
};
