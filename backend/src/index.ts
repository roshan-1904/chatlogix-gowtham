import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { logger, requestLogger } from './logger.js';
import { webhookRouter } from './routes/webhook.js';
import { vendorsRouter } from './routes/vendors.js';
import { conversationsRouter } from './routes/conversations.js';
import { messagesRouter } from './routes/messages.js';
import { usageRouter } from './routes/usage.js';
import { ordersRouter } from './routes/orders.js';
import { paymentsRouter } from './routes/payments.js';
import { shippingRouter } from './routes/shipping.js';
import { productsRouter } from './routes/products.js';
import { faqsRouter } from './routes/faqs.js';
import { catalogImportRouter } from './routes/catalogImport.js';
import swaggerUi from 'swagger-ui-express';
import { openApiSpec } from './docs/openapi.js';
import { authRouter } from './routes/auth.js';
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

async function bootstrap() {
  // Setup global error handlers
  setupUnhandledRejectionHandler();
  setupUncaughtExceptionHandler();

  const app = express();

  // Add request logging middleware before other middleware
  app.use(requestLogger());

  app.use(cors());
  app.use(helmet());
  app.use(morgan('combined'));
  // Note: webhook route needs raw body; attach JSON parser after mounting webhook
  app.use('/webhook', webhookRouter);
  app.use(express.json({ limit: '2mb' }));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', env: env.NODE_ENV, time: new Date().toISOString() });
  });

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
  app.use('/api/conversations', authenticate, conversationsRouter);
  app.use('/api/messages', authenticate, messagesRouter);
  app.use('/api/usage', authenticate, usageRouter);
  app.use('/api/orders', authenticate, ordersRouter);
  app.use('/api/products', authenticate, productsRouter);
  app.use('/api/faqs', authenticate, faqsRouter);
  // catalog-import mounts its own auth: SSE needs to accept ?token= because
  // EventSource cannot set Authorization headers. The router-level middleware
  // accepts header or query and falls through to the kill switch.
  app.use('/api/catalog-import', catalogImportRouter);
  app.use('/api', authenticate, paymentsRouter);
  app.use('/api', authenticate, shippingRouter);

  if (env.ENABLE_SWAGGER === 'true' || env.NODE_ENV !== 'production') {
    app.get('/openapi.json', (req, res) => res.json(openApiSpec));
    app.get('/docs/openapi.json', (req, res) => res.json(openApiSpec));
    app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'ChatLogix API Documentation',
      swaggerOptions: {
        // Relative, not '/openapi.json': nginx proxies this whole router under
        // /api/docs (not /docs), and an absolute path resolves against the
        // public origin, missing that prefix and falling through to the
        // frontend SPA. A relative path resolves against wherever /docs is
        // actually mounted, proxied or not.
        url: 'openapi.json',
        persistAuthorization: true,
        displayRequestDuration: true,
        tryItOutEnabled: true,
        supportedSubmitMethods: ['get', 'post', 'put', 'delete', 'patch'],
        validatorUrl: null, // Disable validator to avoid HTTPS issues
        onComplete: function() {
          // Swagger UI loaded
        },
        onFailure: function(error: any) {
          logger.error({ error }, 'Swagger UI failed to load');
        }
      }
    }));
  }

  // Error handling middleware (must be last)
  app.use(notFoundHandler);
  app.use(enhancedGlobalErrorHandler);

  const port = Number(env.PORT);
  const server = app.listen(port, () => {
    logger.info({ port }, 'HTTP server started');
    // Tell PM2 (wait_ready: true in ecosystem.config.js) this process is
    // actually listening, so `pm2 reload` waits for us before killing the
    // old instance instead of timing out and racing it for the port.
    process.send?.('ready');
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutting down HTTP server');
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


