import { describe, it, expect, afterAll } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { mountSwagger } from '../swagger.js';

const spec = {
  openapi: '3.0.3',
  info: { title: 'ChatLogix API', version: '0.0.0' },
  paths: {},
};

const app = express();
mountSwagger(app, '/docs', spec);
mountSwagger(app, '/api/docs', spec);
app.use('/api', (_req, res) => {
  res.status(401).json({ error: { message: 'Authentication token missing' } });
});

const server = app.listen(0);
await new Promise<void>((resolve) => server.once('listening', resolve));
const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

afterAll(() => {
  server.close();
});

describe('swagger mounts', () => {
  it('redirects the bare /docs path so relative assets stay under /docs', async () => {
    const res = await fetch(`${baseUrl}/docs`, { redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/docs/');

    const withQuery = await fetch(`${baseUrl}/docs?url=https%3A%2F%2Fexample.com%2Fspec.json`, {
      redirect: 'manual',
    });
    expect(withQuery.status).toBe(302);
    expect(withQuery.headers.get('location')).toBe('/docs/?url=https%3A%2F%2Fexample.com%2Fspec.json');
  });

  it('serves the UI, spec, and init script at /docs/', async () => {
    const page = await fetch(`${baseUrl}/docs/`);
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    expect(await page.text()).toContain('swagger-ui-init.js');

    const specRes = await fetch(`${baseUrl}/docs/openapi.json`);
    expect(specRes.status).toBe(200);
    expect(await specRes.json()).toMatchObject({ info: { title: 'ChatLogix API' } });

    const init = await fetch(`${baseUrl}/docs/swagger-ui-init.js`);
    expect(init.status).toBe(200);
    expect(await init.text()).toContain('"/docs/openapi.json"');

    const css = await fetch(`${baseUrl}/docs/swagger-ui.css`);
    expect(css.status).toBe(200);
  });

  it('serves /api/docs ahead of the /api auth catch-all', async () => {
    const page = await fetch(`${baseUrl}/api/docs/`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('ChatLogix API Documentation');

    const init = await fetch(`${baseUrl}/api/docs/swagger-ui-init.js`);
    expect(await init.text()).toContain('"/api/docs/openapi.json"');

    const blocked = await fetch(`${baseUrl}/api/orders`);
    expect(blocked.status).toBe(401);
  });
});
