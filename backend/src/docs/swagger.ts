import type { Express, RequestHandler } from 'express';
import swaggerUi from 'swagger-ui-express';
import type { JsonObject, SwaggerUiOptions } from 'swagger-ui-express';

const swaggerUiOptions: SwaggerUiOptions = {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'ChatLogix API Documentation',
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    tryItOutEnabled: true,
    supportedSubmitMethods: ['get', 'post', 'put', 'delete', 'patch'],
    validatorUrl: null,
  },
};

/**
 * Swagger UI loads `./swagger-ui.css` relative to the page URL. Without a
 * trailing slash that resolves at the host root (`/swagger-ui.css`), which
 * nginx does not proxy. Redirect the bare mount to the slashed path, and
 * point the spec at an absolute URL so it does not depend on that slash.
 *
 * `serveFiles` (not the shared `serve` array) so two mounts do not overwrite
 * each other's generated `swagger-ui-init.js`.
 */
export function mountSwagger(app: Express, mountPath: string, spec: JsonObject): void {
  const specPath = `${mountPath}/openapi.json`;
  const options: SwaggerUiOptions = {
    ...swaggerUiOptions,
    swaggerOptions: {
      ...swaggerUiOptions.swaggerOptions,
      url: specPath,
    },
  };
  const handlers: RequestHandler[] = swaggerUi.serveFiles(spec, options);

  app.get(specPath, (_req, res) => {
    res.json(spec);
  });
  // Express treats `/docs` and `/docs/` as the same route unless strict
  // routing is on, so a `app.get(mountPath)` redirect loops. Match the
  // unsuffixed path on the original URL instead.
  app.use(mountPath, (req, res, next) => {
    const queryIndex = req.originalUrl.indexOf('?');
    const path = queryIndex === -1 ? req.originalUrl : req.originalUrl.slice(0, queryIndex);
    if (path !== mountPath) {
      next();
      return;
    }
    const query = queryIndex === -1 ? '' : req.originalUrl.slice(queryIndex);
    res.redirect(302, `${mountPath}/${query}`);
  });
  app.use(mountPath, ...handlers, swaggerUi.setup(spec, options));
}
