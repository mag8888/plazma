import { Markup, Telegraf } from 'telegraf';
import { PartnerProgramType } from '@prisma/client';
import { Context } from '../../bot/context.js';
import { BotModule } from '../../bot/types.js';
import { ensureUser, logUserAction } from '../../services/user-history.js';
import { buildReferralLink, getOrCreatePartnerProfile, getPartnerDashboard } from '../../services/partner-service.js';

const DASHBOARD_ACTION = 'partner:dashboard';
const DIRECT_PLAN_ACTION = 'partner:plan:direct';
const MULTI_PLAN_ACTION = 'partner:plan:multi';
const PARTNERS_ACTION = 'partner:list';
const INVITE_ACTION = 'partner:invite';
const INVITE_DIRECT_ACTION = 'partner:invite:direct';
const INVITE_MULTI_ACTION = 'partner:invite:multi';
const PARTNERS_LEVEL_1_ACTION = 'partner:level:1';
const PARTNERS_LEVEL_2_ACTION = 'partner:level:2';
const PARTNERS_LEVEL_3_ACTION = 'partner:level:3';

const programIntro = `✨ Описание партнёрской программы

👋 Станьте партнёром Plazma Water!
Вы можете рекомендовать друзьям здоровье и получать пассивный доход.

💸 25% от каждой покупки по вашей ссылке.
🔗 Достаточно поделиться своей персональной ссылкой.

⸻

📌 У нас есть 2 формата участия:`;

const cardTemplate = (params: {
  balance: string;
  partners: number;
  direct: number;
  bonus: string;
  referral?: string;
  transactions: string[];
}) => `🧾 Карточка клиента (личный кабинет)
	•	💰 Баланс: [${params.balance} ₽]
	•	👥 Партнёры: [${params.partners}]
	•	🎁 Бонусы: [${params.bonus} ₽]
${params.referral ? `	•	🔗 Ваша ссылка: [${params.referral}]` : '	•	🔗 Ваша ссылка: [выберите формат программы]'}
${params.transactions.length ? `	•	📊 История начислений: [список транзакций]\n${params.transactions.join('\n')}` : '	•	📊 История начислений: [список транзакций]'}`;

const directPlanText = `(на кнопку 25%) Прямая комиссия — 25%
Делитесь ссылкой → получаете 25% от всех покупок друзей.

📲 Выбирайте удобный формат и начинайте зарабатывать уже сегодня!`;

const multiPlanText = `(на кнопку 15% + 5% + 5%) Многоуровневая система — 15% + 5% + 5%
	•	15% с покупок ваших друзей (1-й уровень)
	•	5% с покупок их друзей (2-й уровень)
	•	5% с покупок следующего уровня (3-й уровень)

📲 Выбирайте удобный формат и начинайте зарабатывать уже сегодня!`;

function planKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Карточка клиента', DASHBOARD_ACTION)],
    [Markup.button.callback('25%', DIRECT_PLAN_ACTION), Markup.button.callback('15% + 5% + 5%', MULTI_PLAN_ACTION)],
  ]);
}

function partnerActionsKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Мои партнёры', PARTNERS_ACTION), Markup.button.callback('Пригласить друга', INVITE_ACTION)],
    [Markup.button.callback('Ссылка 25%', INVITE_DIRECT_ACTION), Markup.button.callback('Ссылка 15%+5%+5%', INVITE_MULTI_ACTION)],
    [Markup.button.callback('Партнёры: 1-й', PARTNERS_LEVEL_1_ACTION), Markup.button.callback('Партнёры: 2-й', PARTNERS_LEVEL_2_ACTION), Markup.button.callback('Партнёры: 3-й', PARTNERS_LEVEL_3_ACTION)],
  ]);
}

async function showDashboard(ctx: Context) {
  const user = await ensureUser(ctx);
  if (!user) {
    await ctx.reply('Не удалось загрузить кабинет. Попробуйте позже.');
    return;
  }

  const dashboard = await getPartnerDashboard(user.id);
  if (!dashboard) {
    await ctx.reply('Вы ещё не активировали партнёрскую программу. Выберите формат участия.');
    return;
  }

  const { profile, stats } = dashboard;
  const transactions = profile.transactions.map((tx) => {
    const sign = tx.type === 'CREDIT' ? '+' : '-';
    const amount = Number(tx.amount).toFixed(2);
    return `${sign}${amount} ₽ — ${tx.description}`;
  });

  const message = cardTemplate({
    balance: Number(profile.balance).toFixed(2),
    partners: stats.partners,
    direct: stats.directPartners,
    bonus: Number(profile.bonus).toFixed(2),
    referral: buildReferralLink(profile.referralCode, profile.programType),
    transactions,
  });

  await ctx.reply(message, partnerActionsKeyboard());
}

async function handlePlanSelection(ctx: Context, programType: PartnerProgramType, message: string) {
  const user = await ensureUser(ctx);
  if (!user) {
    await ctx.reply('Не удалось активировать программу. Попробуйте позже.');
    return;
  }

  const profile = await getOrCreatePartnerProfile(user.id, programType);
  await logUserAction(ctx, 'partner:select-program', { programType });
  await ctx.answerCbQuery('Программа активирована');
  await ctx.reply(`${message}\n\nВаша ссылка: ${buildReferralLink(profile.referralCode, programType)}`, partnerActionsKeyboard());
}

async function showPartners(ctx: Context) {
  const user = await ensureUser(ctx);
  if (!user) {
    await ctx.reply('Не удалось загрузить список партнёров.');
    return;
  }

  const dashboard = await getPartnerDashboard(user.id);
  if (!dashboard) {
    await ctx.reply('Вы ещё не активировали программу.');
    return;
  }

  const { stats } = dashboard;
  await ctx.answerCbQuery();
  await ctx.reply(`👥 Мои партнёры\nВсего: ${stats.partners}\nПрямых: ${stats.directPartners}`);
}

async function showPartnersByLevel(ctx: Context, level: number) {
  const user = await ensureUser(ctx);
  if (!user) {
    await ctx.reply('Не удалось загрузить список партнёров.');
    return;
  }

  const dashboard = await getPartnerDashboard(user.id);
  if (!dashboard) {
    await ctx.reply('Вы ещё не активировали программу.');
    return;
  }

  await ctx.answerCbQuery();
  
  let message = `👥 Партнёры ${level}-го уровня\n\n`;
  
  if (level === 1) {
    message += `Прямые партнёры: ${dashboard.stats.directPartners}\n`;
    message += `Получаете 15% с их покупок`;
  } else if (level === 2) {
    message += `Партнёры 2-го уровня: ${dashboard.stats.multiPartners}\n`;
    message += `Получаете 5% с их покупок`;
  } else if (level === 3) {
    message += `Партнёры 3-го уровня: ${dashboard.stats.partners - dashboard.stats.directPartners - dashboard.stats.multiPartners}\n`;
    message += `Получаете 5% с их покупок`;
  }
  
  await ctx.reply(message);
}

async function showInvite(ctx: Context) {
  const user = await ensureUser(ctx);
  if (!user) {
    await ctx.reply('Не удалось получить ссылку.');
    return;
  }

  const dashboard = await getPartnerDashboard(user.id);
  if (!dashboard) {
    await ctx.reply('Активируйте один из тарифов, чтобы получить ссылку.');
    return;
  }

  await ctx.answerCbQuery('Выберите тип ссылки', { show_alert: false });
  await ctx.reply(`Ваши реферальные ссылки:\n\n🔗 Прямая ссылка (25% с покупок):\n${buildReferralLink(dashboard.profile.referralCode, 'DIRECT')}\n\n🔗 Многоуровневая ссылка (15% + 5% + 5%):\n${buildReferralLink(dashboard.profile.referralCode, 'MULTI_LEVEL')}`);
}

async function showDirectInvite(ctx: Context) {
  const user = await ensureUser(ctx);
  if (!user) {
    await ctx.reply('Не удалось получить ссылку.');
    return;
  }

  const dashboard = await getPartnerDashboard(user.id);
  if (!dashboard) {
    await ctx.reply('Активируйте один из тарифов, чтобы получить ссылку.');
    return;
  }

  await ctx.answerCbQuery('Ссылка скопирована', { show_alert: false });
  await ctx.reply(`🔗 Прямая ссылка (25% с покупок):\n${buildReferralLink(dashboard.profile.referralCode, 'DIRECT')}`);
}

async function showMultiInvite(ctx: Context) {
  const user = await ensureUser(ctx);
  if (!user) {
    await ctx.reply('Не удалось получить ссылку.');
    return;
  }

  const dashboard = await getPartnerDashboard(user.id);
  if (!dashboard) {
    await ctx.reply('Активируйте один из тарифов, чтобы получить ссылку.');
    return;
  }

  await ctx.answerCbQuery('Ссылка скопирована', { show_alert: false });
  await ctx.reply(`🔗 Многоуровневая ссылка (15% + 5% + 5%):\n${buildReferralLink(dashboard.profile.referralCode, 'MULTI_LEVEL')}`);
}

export const partnerModule: BotModule = {
  async register(bot: Telegraf<Context>) {
    bot.hears(['Партнёрка', 'Партнерка'], async (ctx) => {
      await logUserAction(ctx, 'menu:partners');
      await ctx.reply(programIntro, planKeyboard());
    });

    bot.action(DASHBOARD_ACTION, async (ctx) => {
      await ctx.answerCbQuery();
      await logUserAction(ctx, 'partner:dashboard');
      await showDashboard(ctx);
    });

    bot.action(DIRECT_PLAN_ACTION, async (ctx) => {
      await handlePlanSelection(ctx, PartnerProgramType.DIRECT, directPlanText);
    });

    bot.action(MULTI_PLAN_ACTION, async (ctx) => {
      await handlePlanSelection(ctx, PartnerProgramType.MULTI_LEVEL, multiPlanText);
    });

    bot.action(PARTNERS_ACTION, async (ctx) => {
      await logUserAction(ctx, 'partner:list');
      await showPartners(ctx);
    });

    bot.action(INVITE_ACTION, async (ctx) => {
      await logUserAction(ctx, 'partner:invite');
      await showInvite(ctx);
    });

    bot.action(INVITE_DIRECT_ACTION, async (ctx) => {
      await logUserAction(ctx, 'partner:invite:direct');
      await showDirectInvite(ctx);
    });

    bot.action(INVITE_MULTI_ACTION, async (ctx) => {
      await logUserAction(ctx, 'partner:invite:multi');
      await showMultiInvite(ctx);
    });

    bot.action(PARTNERS_LEVEL_1_ACTION, async (ctx) => {
      await logUserAction(ctx, 'partner:level:1');
      await showPartnersByLevel(ctx, 1);
    });

    bot.action(PARTNERS_LEVEL_2_ACTION, async (ctx) => {
      await logUserAction(ctx, 'partner:level:2');
      await showPartnersByLevel(ctx, 2);
    });

    bot.action(PARTNERS_LEVEL_3_ACTION, async (ctx) => {
      await logUserAction(ctx, 'partner:level:3');
      await showPartnersByLevel(ctx, 3);
    });
  },
};
