import { Telegraf } from 'telegraf';
import { Context } from './context.js';

export interface BotModule {
  register(bot: Telegraf<Context>): void | Promise<void>;
}
