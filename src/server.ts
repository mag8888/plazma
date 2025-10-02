// Ensure production mode for AdminJS
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

import express from 'express';
import session from 'express-session';
import { session as telegrafSession, Telegraf } from 'telegraf';
import { env } from './config/env.js';
import { Context, SessionData } from './bot/context.js';
import { applyBotModules } from './bot/setup-modules.js';
import { prisma } from './lib/prisma.js';
import { ensureInitialData } from './lib/bootstrap.js';
import { setupAdminPanel } from './admin/index.js';
import { adminWebRouter } from './admin/web.js';

async function bootstrap() {
  try {
    await prisma.$connect();
    console.log('Database connected');
    
    await ensureInitialData();
    console.log('Initial data ensured');

    const app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Configure session middleware
    app.use(session({
      secret: process.env.SESSION_SECRET || 'plazma-bot-secret-key',
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
    }));

    // Web admin panel
    app.use('/admin', adminWebRouter);

    const port = Number(process.env.PORT ?? 3000);
    app.get('/health', (_req, res) => {
      res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });

    // Initialize bot separately
    const bot = new Telegraf<Context>(env.botToken, {
      handlerTimeout: 30_000,
    });

    bot.use(telegrafSession<SessionData, Context>({ defaultSession: (): SessionData => ({}) }));
    await applyBotModules(bot);
    
    // Register cart actions
    const { registerCartActions } = await import('./modules/cart/index.js');
    registerCartActions(bot);

    console.log('Starting bot in long polling mode...');
    
    // Clear any existing webhook first
    try {
      await bot.telegram.deleteWebhook();
      console.log('Cleared existing webhook');
    } catch (error) {
      console.log('No webhook to clear or error clearing:', error instanceof Error ? error.message : String(error));
    }
    
    // Try to launch bot with error handling
    try {
      await bot.launch();
      console.log('Bot launched successfully');
    } catch (error) {
      console.error('Bot launch failed, but web server is running:', error);
    }

    process.once('SIGINT', () => {
      void bot.stop('SIGINT');
    });

    process.once('SIGTERM', () => {
      void bot.stop('SIGTERM');
    });

  } catch (error) {
    console.error('Bootstrap error:', error);
    process.exit(1);
  }
}

bootstrap().catch((error) => {
  console.error('Fatal error during bootstrap', error);
  process.exit(1);
});
