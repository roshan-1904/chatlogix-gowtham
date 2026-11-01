import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import morgan from 'morgan';
import { env, isFxRefreshLoopEnabled } from './config/env.js';
import { logger, requestLogger } from './logger.js';
import { webhookRouter } from './routes/webhook.js';
import { vendorsRouter } from './routes/vendors.js';
import { conversationsRouter } from './routes/conversations.js';
import { messagesRouter } from './routes/messages.js';
import { usageRouter } from './routes/usage.js';
import { ordersRouter } from './routes/orders.js';
import { publicPayRouter } from './routes/publicPay.js';
import { paymentsRouter } from './routes/payments.js';
import { shippingRouter } from './routes/shipping.js';
import { productsRouter } from './routes/products.js';
import { productMediaRouter } from './routes/productMedia.js';
import { faqsRouter } from './routes/faqs.js';
import { customerQueriesRouter } from './routes/customerQueries.js';
import { catalogImportRouter } from './routes/catalogImport.js';
import { catalogEnhanceRouter } from './routes/catalogEnhance.js';
import { openApiSpec } from './docs/openapi.js';
import { mountSwagger } from './docs/swagger.js';
import { authRouter } from './routes/auth.js';
import { vendorOnboardingRouter } from './routes/vendorOnboarding.js';
import { vendorWalletRouter } from './routes/vendorWallet.js';
import { vendorWhatsAppRouter } from './routes/vendorWhatsApp.js';
import { adminSettingsRouter } from './routes/adminSettings.js';
import { adminTaxReportsRouter } from './routes/adminTaxReports.js';
import { adminDashboardRouter } from './routes/adminDashboard.js';
import { adminUsageRouter } from './routes/adminUsage.js';
import { adminReliabilityRouter } from './routes/adminReliability.js';
import { adminSupportRouter } from './routes/adminSupport.js';
import { adminControlsRouter } from './routes/adminControls.js';
import { startFxRateRefreshLoop } from './services/platformSettingsService.js';
import { startAutoRechargeBackgroundLoops } from './services/wallet/autoRechargeService.js';
import { walletEnv } from './config/env.js';
import { 
  enhancedGlobalErrorHandler, 
  notFoundHandler, 
  setupUnhandledRejectionHandler, 
  setupUncaughtExceptionHandler,
  ErrorMonitor,
  ErrorRateMonitor
} from './middleware/errorHandler.js';
import { authenticate } from './middleware/authenticate.js';
import { requireRole } from './middleware/authorize.js';
import { razorpayWebhookHandler } from './routes/razorpayWebhook.js';
import { bootstrapRouteClientFromEnv } from './services/payments/routeClient.js';
import { bootstrapLinkedAccountClientFromEnv } from './services/payments/linkedAccountClient.js';
import {
  runSettlementDailySweep,
  runSettlementIntentSweep
} from './services/payments/paymentReconciliationService.js';
import { expireRefundDrafts, releaseDueTransfers } from './services/payments/settlementService.js';

async function bootstrap() {
  // Setup global error handlers
  setupUnhandledRejectionHandler();
  setupUncaughtExceptionHandler();
  await bootstrapRouteClientFromEnv();
  await bootstrapLinkedAccountClientFromEnv();

  const app = express();

  // Behind nginx/Lightsail TLS termination; required so Secure refresh cookies are set
  // (req.secure / X-Forwarded-Proto) and rate limits see the real client IP.
  app.set('trust proxy', 1);

  // Add request logging middleware before other middleware
  app.use(requestLogger());

  const corsOrigins = env.CORS_ALLOWED_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (corsOrigins.includes(origin)) return callback(null, true);
      if (env.NODE_ENV === 'development' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true
  }));
  app.use(cookieParser());
  // Helmet 7 defaults CORP to same-origin. This API is fetched from the
  // vendor dashboard on a different origin in local dev (and whenever the
  // SPA is not served from the same host). cors() does not override CORP,
  // so image/audio responses would otherwise be unreadable.
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  }));
  app.use(morgan('combined'));
  // Note: webhook routes need raw body; attach JSON parser after mounting them
  app.use('/webhook', webhookRouter);
  app.post(
    '/api/payments/razorpay/webhook',
    express.raw({ type: 'application/json' }),
    razorpayWebhookHandler
  );
  app.use(express.json({ limit: '2mb' }));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', env: env.NODE_ENV, time: new Date().toISOString() });
  });

  app.use('/pay', publicPayRouter);

  // Error monitoring endpoint
  app.get('/api/errors/stats', authenticate, requireRole('admin'), (req, res) => {
    const errorStats = ErrorMonitor.getErrorStats();
    const currentErrorRate = ErrorRateMonitor.getCurrentErrorRate();
    
    res.json({
      ...errorStats,
      currentErrorRate,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage()
    });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/vendors', authenticate, vendorsRouter);
  app.use('/api/vendors', authenticate, vendorOnboardingRouter);
  app.use('/api/vendors', authenticate, vendorWalletRouter);
  app.use('/api/vendors', authenticate, vendorWhatsAppRouter);
  app.use('/api/conversations', authenticate, conversationsRouter);
  app.use('/api/messages', authenticate, messagesRouter);
  app.use('/api/usage', authenticate, usageRouter);
  app.use('/api/orders', authenticate, ordersRouter);
  // Mounted first so /:id/media/* resolves before the generic /:id handlers.
  app.use('/api/products', authenticate, productMediaRouter);
  app.use('/api/products', authenticate, productsRouter);
  app.use('/api/faqs', authenticate, faqsRouter);
  app.use('/api/customer-queries', authenticate, customerQueriesRouter);
  // catalog-import mounts its own auth: SSE needs to accept ?token= because
  // EventSource cannot set Authorization headers. The router-level middleware
  // accepts header or query and falls through to the kill switch.
  app.use('/api/catalog-import', catalogImportRouter);
  app.use('/api/catalog-enhance', authenticate, catalogEnhanceRouter);

  // Mount before the `/api` routers below. Those attach `authenticate` to
  // every `/api/*` path, so a later `/api/docs` mount never runs and the
  // public URL comes back 401.
  if (env.ENABLE_SWAGGER === 'true' || env.NODE_ENV !== 'production') {
    mountSwagger(app, '/docs', openApiSpec);
    mountSwagger(app, '/api/docs', openApiSpec);
    app.get('/openapi.json', (_req, res) => res.json(openApiSpec));
  }

  app.use('/api', authenticate, paymentsRouter);
  app.use('/api', authenticate, shippingRouter);
  app.use('/api/admin/settings', authenticate, requireRole('admin'), adminSettingsRouter);
  app.use('/api/admin/tax-reports', authenticate, requireRole('admin'), adminTaxReportsRouter);
  app.use('/api/admin', authenticate, requireRole('admin'), adminDashboardRouter);
  app.use('/api/admin/usage', authenticate, requireRole('admin'), adminUsageRouter);
  app.use('/api/admin/reliability', authenticate, requireRole('admin'), adminReliabilityRouter);
  app.use('/api/admin/support', authenticate, requireRole('admin'), adminSupportRouter);
  app.use('/api/admin', authenticate, requireRole('admin'), adminControlsRouter);

  // Error handling middleware (must be last)
  app.use(notFoundHandler);
  app.use(enhancedGlobalErrorHandler);

  const port = Number(env.PORT);
  let fxRefreshTimer: NodeJS.Timeout | undefined;
  let autoRechargeTimer: NodeJS.Timeout | undefined;
  let refundDraftTimer: NodeJS.Timeout | undefined;
  let releaseTransfersTimer: NodeJS.Timeout | undefined;
  let settlementIntentTimer: NodeJS.Timeout | undefined;
  let settlementDailyTimer: NodeJS.Timeout | undefined;
  const server = app.listen(port, () => {
    logger.info({ port }, 'HTTP server started');
    if (env.NODE_ENV !== 'test') {
      releaseTransfersTimer = setInterval(() => {
        void releaseDueTransfers().catch((err) => {
          logger.error({ err }, 'releaseDueTransfers job failed');
        });
      }, 5 * 60 * 1000);
      refundDraftTimer = setInterval(() => {
        void expireRefundDrafts().catch((err) => {
          logger.error({ err }, 'expireRefundDrafts job failed');
        });
      }, 15 * 60 * 1000);
      settlementIntentTimer = setInterval(() => {
        void runSettlementIntentSweep().catch((err) => {
          logger.error({ err }, 'runSettlementIntentSweep job failed');
        });
      }, 15 * 60 * 1000);
      void runSettlementIntentSweep().catch((err) => {
        logger.error({ err }, 'runSettlementIntentSweep initial run failed');
      });
      settlementDailyTimer = setInterval(() => {
        void runSettlementDailySweep().catch((err) => {
          logger.error({ err }, 'runSettlementDailySweep job failed');
        });
      }, 24 * 60 * 60 * 1000);
      void runSettlementDailySweep().catch((err) => {
        logger.error({ err }, 'runSettlementDailySweep initial run failed');
      });
      if (walletEnv.paymentProvider === 'razorpay') {
        autoRechargeTimer = startAutoRechargeBackgroundLoops();
      }
      if (isFxRefreshLoopEnabled) {
        fxRefreshTimer = startFxRateRefreshLoop();
      } else {
        logger.info(
          { nodeEnv: env.NODE_ENV, fxRefreshEnabled: env.FX_REFRESH_ENABLED ?? null },
          'FX refresh loop disabled — billing will use the stored/seeded USD/INR rate. ' +
            'Set FX_REFRESH_ENABLED=true to refresh from this process; ' +
            'POST /api/admin/settings/refresh-fx works either way.'
        );
      }
    }
    process.send?.('ready');
  });
  server.on('error', (err: NodeJS.ErrnoException) => {
    logger.error({ err, port }, 'HTTP server failed to listen');
    process.exit(1);
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutting down HTTP server');
    if (fxRefreshTimer) clearInterval(fxRefreshTimer);
    if (autoRechargeTimer) clearInterval(autoRechargeTimer);
    if (refundDraftTimer) clearInterval(refundDraftTimer);
    if (releaseTransfersTimer) clearInterval(releaseTransfersTimer);
    if (settlementIntentTimer) clearInterval(settlementIntentTimer);
    if (settlementDailyTimer) clearInterval(settlementDailyTimer);
    server.close((err) => {
      if (err) {
        logger.error({ err }, 'Error during HTTP server shutdown');
        process.exit(1);
      }
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((error) => {
  console.error('Backend failed to start', error);
  process.exitCode = 1;
});


