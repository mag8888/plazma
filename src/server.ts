// Ensure production mode for AdminJS
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

import express from 'express';
import { session, Telegraf } from 'telegraf';
import { env } from './config/env.js';
import { Context, SessionData } from './bot/context.js';
import { applyBotModules } from './bot/setup-modules.js';
import { prisma } from './lib/prisma.js';
import { ensureInitialData } from './lib/bootstrap.js';
import { setupAdminPanel } from './admin/index.js';

async function bootstrap() {
  await prisma.$connect();
  await ensureInitialData();

  const bot = new Telegraf<Context>(env.botToken, {
    handlerTimeout: 30_000,
  });

  bot.use(session<SessionData, Context>({ defaultSession: (): SessionData => ({}) }));
  await applyBotModules(bot);

  const app = express();
  app.use(express.json());

  // await setupAdminPanel(app); // Disabled for MongoDB compatibility

  // Force long polling for now to ensure bot works
  console.log('Starting bot in long polling mode...');
  await bot.launch();
  console.log('Bot launched in long polling mode');

  const port = Number(process.env.PORT ?? 3000);
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });

  process.once('SIGINT', () => {
    void bot.stop('SIGINT');
  });

  process.once('SIGTERM', () => {
    void bot.stop('SIGTERM');
  });
}

bootstrap().catch((error) => {
  console.error('Fatal error during bootstrap', error);
  process.exit(1);
});
