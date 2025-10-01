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

const programIntro = `✨ Описание партнёрской программы

👋 Станьте партнёром Plazma Water!
Вы можете рекомендовать друзьям здоровье и получать пассивный доход.`;

const cardTemplate = (params: {
  balance: string;
  partners: number;
  direct: number;
  bonus: string;
  referral?: string;
  transactions: string[];
}) => `🧾 Карточка клиента (личный кабинет)
 • 💰 Баланс: ${params.balance} ₽
 • 👥 Партнёры: ${params.partners}
 • 🎁 Бонусы: ${params.bonus} ₽
${params.referral ? ` • 🔗 Ваша ссылка: ${params.referral}` : ' • 🔗 Ваша ссылка: выберите формат программы'}
${params.transactions.length ? ` • 📊 История начислений:\n${params.transactions.join('\n')}` : ' • 📊 История начислений: пока нет данных'}`;

const directPlanText = `Прямая комиссия — 25%
Делитесь ссылкой → получаете 25% от всех покупок друзей.
📲 Выбирайте удобный формат и начинайте зарабатывать уже сегодня! (выбрав этот формат вы не будете получать доход от партнеров второго и 3го уровня)`;

const multiPlanText = `Многоуровневая система — 15% + 5% + 5%
 • 15% с покупок ваших друзей (1-й уровень)
 • 5% с покупок их друзей (2-й уровень)
 • 5% с покупок следующего уровня (3-й уровень)

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
    referral: buildReferralLink(profile.referralCode),
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
  await ctx.reply(`${message}\n\nВаша ссылка: ${buildReferralLink(profile.referralCode)}`, partnerActionsKeyboard());
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

  await ctx.answerCbQuery('Ссылка скопирована', { show_alert: false });
  await ctx.reply(`Поделитесь ссылкой: ${buildReferralLink(dashboard.profile.referralCode)}`);
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
  },
};
