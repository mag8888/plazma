import { Telegraf } from 'telegraf';
import { Context } from './context.js';
import { BotModule } from './types.js';
import { navigationModule } from '../modules/navigation/index.js';
import { shopModule } from '../modules/shop/index.js';
import { partnerModule } from '../modules/partner/index.js';
import { reviewsModule } from '../modules/reviews/index.js';
import { aboutModule } from '../modules/about/index.js';
import { adminModule } from '../modules/admin/index.js';

const modules: BotModule[] = [
  shopModule,        // Register shop module first to handle shop button
  navigationModule,
  partnerModule,
  reviewsModule,
  aboutModule,
  adminModule,
];

export async function applyBotModules(bot: Telegraf<Context>) {
  for (const module of modules) {
    await module.register(bot);
  }
}
