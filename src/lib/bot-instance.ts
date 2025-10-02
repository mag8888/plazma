import { Telegraf } from 'telegraf';
import { Context } from '../bot/context.js';
import { SessionData } from '../bot/context.js';
import { env } from '../config/env.js';
import { session as telegrafSession } from 'telegraf';
import { applyBotModules } from '../bot/setup-modules.js';

let botInstance: Telegraf<Context> | null = null;

export async function getBotInstance(): Promise<Telegraf<Context>> {
  if (!botInstance) {
    botInstance = new Telegraf<Context>(env.botToken, {
      handlerTimeout: 30_000,
    });

    // Add session middleware
    botInstance.use(
      telegrafSession<SessionData, Context>({
        defaultSession: (): SessionData => ({ uiMode: 'classic' }),
      })
    );

    // Apply bot modules
    await applyBotModules(botInstance);
    
    // Register cart actions
    const { registerCartActions } = await import('../modules/cart/index.js');
    registerCartActions(botInstance);
  }

  return botInstance;
}

export function setBotInstance(bot: Telegraf<Context>) {
  botInstance = bot;
}

export { botInstance };
