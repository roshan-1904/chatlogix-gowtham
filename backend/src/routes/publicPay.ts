import { Router } from 'express';
import { verifyUpiPayLinkToken } from '../services/payments/upiPayLinkToken.js';
import { loadUpiPayPageForOrder } from '../services/payments/upiPayPageService.js';

export const publicPayRouter = Router();

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderPayPage(view: {
  orderNumber: string;
  payeeName: string;
  upiVpa: string;
  amountLabel: string;
  upiUri: string;
  shopName: string;
}): string {
  const upiHref = escapeHtml(view.upiUri);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Pay ${escapeHtml(view.orderNumber)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: Inter, system-ui, -apple-system, sans-serif;
      background: #f9fafb;
      color: #111827;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.25rem;
    }
    .card {
      width: 100%;
      max-width: 22rem;
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 0.75rem;
      padding: 1.5rem;
      box-shadow: 0 1px 3px rgba(0,0,0,.06);
    }
    h1 { font-size: 1.125rem; margin: 0 0 0.25rem; }
    .muted { color: #6b7280; font-size: 0.875rem; margin: 0 0 1rem; }
    .amount { font-size: 1.75rem; font-weight: 700; margin: 0 0 0.5rem; }
    .row { font-size: 0.875rem; margin: 0.25rem 0; }
    .btn {
      display: block;
      width: 100%;
      margin-top: 1.25rem;
      padding: 0.875rem 1rem;
      text-align: center;
      text-decoration: none;
      font-weight: 600;
      font-size: 1rem;
      color: #fff;
      background: #072349;
      border-radius: 0.5rem;
    }
    .hint { margin-top: 1rem; font-size: 0.75rem; color: #6b7280; line-height: 1.4; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${escapeHtml(view.shopName)}</h1>
    <p class="muted">Order ${escapeHtml(view.orderNumber)}</p>
    <p class="amount">${escapeHtml(view.amountLabel)}</p>
    <p class="row"><strong>Pay to:</strong> ${escapeHtml(view.payeeName)}</p>
    <p class="row"><strong>UPI:</strong> ${escapeHtml(view.upiVpa)}</p>
    <a class="btn" href="${upiHref}">Tap to pay</a>
    <p class="hint">Choose GPay, PhonePe, Paytm, or your bank app when your phone asks. You can also scan the QR in WhatsApp.</p>
  </div>
</body>
</html>`;
}

function renderErrorPage(message: string): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Payment link</title></head>
<body style="font-family:system-ui;padding:2rem;text-align:center;color:#374151">
<p>${escapeHtml(message)}</p>
</body></html>`;
}

publicPayRouter.get('/u/:token', async (req, res) => {
  try {
    const { orderId } = verifyUpiPayLinkToken(req.params.token);
    const view = await loadUpiPayPageForOrder(orderId);
    if (!view) {
      res.status(410).send(renderErrorPage('This payment link is no longer valid.'));
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderPayPage(view));
  } catch {
    res.status(400).send(renderErrorPage('Invalid payment link.'));
  }
});
