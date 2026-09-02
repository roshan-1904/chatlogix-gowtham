# WhatsApp Ecommerce — Frontend & Mobile Plan (Vendor + Admin)

> Detailed implementation plan, architecture, tech stack, folder structure, milestones, DB sketch, API endpoints, deployment, and next steps.
>
> Generated for: Murali V S
> Date: 2025-11-15 (Asia/Kolkata)

> **Early planning doc — actual build diverged in several places.** The monorepo (`frontend_v2/`, Turborepo + npm workspaces) and general shape did land close to this plan, but key tech choices here are not what was built: auth is Firebase phone-number auth mediated through the backend (see `authentication.md`), not Clerk/Auth0; the queue is AWS SQS (LocalStack for dev), not BullMQ; message pipeline is AWS Lambda, not ECS/Fargate/Render/Fly.io. Treat this as historical context for the original intent, not a description of what's running today — see the repo root `CLAUDE.md` for the current architecture summary.

---

## 1. Project Summary (High level)

You are building a SaaS platform to help small vendors manage WhatsApp-based customer interactions, catalogs, and orders.  
This plan covers the **frontend (web)** for **vendors** and **admins**, plus a **vendor mobile app** (React Native / Expo). The admin will not have a dedicated mobile app.

Goals:
- Fast cross-platform delivery (web + mobile).
- Reusable code and components via a mono-repo.
- Scalable backend integration with WhatsApp Cloud API and common logistics/payment providers.
- Clear MVP → MMP (Minimum Marketable Product) → Growth roadmap.

---

## 2. Chosen Tech Stack (unified)

### Frontend / Mobile
- **Web:** React.js + Vite + TypeScript + TailwindCSS
- **Mobile:** React Native + Expo + TypeScript + NativeWind (Tailwind for RN)
- **Shared UI & logic:** TypeScript, shared packages in mono-repo (Nx / Turborepo)
- **State & data:** Zustand (or Redux Toolkit) + React Query (TanStack Query)
- **Forms / validation:** React Hook Form + Zod
- **Charts:** Recharts (web) / victory-native (mobile) if needed

### Backend (already planned)
- **API:** Node.js + Express + TypeScript
- **ORM:** Prisma
- **DB:** PostgreSQL
- **Queue:** BullMQ + Redis (for background tasks)
- **Authentication:** Clerk / Auth0 / Firebase Auth (choose one) — supports web + mobile.
- **Storage:** S3-compatible (AWS S3 / DigitalOcean Spaces)
- **Notifications:** FCM (mobile push) + email provider (SendGrid / SES)

### DevOps
- **Hosting (frontend):** Vercel / Netlify for web
- **Mobile builds:** Expo EAS (managed) + Play Store / App Store
- **Backend hosting:** AWS (ECS/Fargate) or Render / Fly.io
- **CI/CD:** GitHub Actions
- **Monitoring:** Sentry + Logflare / Datadog

---

## 3. Mono-repo Layout (recommended)

```
/apps
  /web                  # React app (vendor + admin)
  /vendor-mobile        # React Native (Expo)
  /backend              # Node + Express

/packages
  /ui                   # shared UI primitives (buttons, inputs, cards)
  /design-tokens        # colors, spacing, fonts
  /api-client           # api wrappers (fetch/axios)
  /hooks                # shared hooks (useAuth, useToast)
  /schemas              # shared zod schemas & types
  /utils                # helpers (date, currency)
  /config               # shared config (env schemas)
```

Use Nx or Turborepo to manage builds and caching.

---

## 4. Role & Auth Model

### Roles
- `super_admin` — full access
- `admin` — manage vendors, billing, analytics
- `vendor_owner` — vendor account owner
- `vendor_staff` — limited vendor access

### Authentication Flow
- OAuth or email+password via Clerk/Auth0
- JWT tokens for API calls
- Refresh tokens for session management
- Role-based access enforced server-side and client-side route guards

---

## 5. Core Features (MVP → MMP)

### Vendor Web & Mobile (MVP)
- Authentication (SSO)
- Dashboard (usage, recent orders)
- Catalog CRUD (products, images, price)
- Orders list & order detail
- WhatsApp templates & auto-replies
- Business hours & greetings
- Billing overview (subscription & usage)
- Push notifications (mobile: new order)

### Admin Web (MVP)
- Vendor onboarding & approval
- Vendor status management (suspend/activate)
- Template approval workflow
- Billing & subscription management
- Global analytics (messages, revenue, usage)
- Webhook & error logs
- Message queue health dashboard

### MMP (after MVP)
- Chat inbox (centralized, read-only analytics for vendor)
- Catalog import (CSV / Shopify / WooCommerce)
- Auto-workflows (keyword→action)
- Shipment gateway integrations (Porter / Delhivery)
- Multi-language support
- Multi-tenant branding (custom domain / white-label)

---

## 6. UX / UI Screens (by app)

### Vendor Web
- Login / Register / Forgot password
- Dashboard (cards + charts)
- Catalog → List / Add / Edit / Bulk import
- Orders → List / Detail / Export
- Templates → List / Create / Send for approval
- Settings → Business info, WhatsApp config, Webhook
- Billing → Plan, Payment methods, Invoices
- Support → Chat / Tickets (link to external Zendesk or email)

### Vendor Mobile (React Native)
- Onboarding splash
- Login / OTP (if desired)
- Home Dashboard (compact)
- Catalog → List / Add/Edit (mobile friendly)
- Orders → List / Detail + quick actions
- Notifications screen
- Settings → Business hours, Auto-replies
- Billing (view only / redirect to web for payments)

### Admin Web
- Login (SSO)
- Admin Dashboard (KPIs)
- Vendors → Search, filter, view, approve, edit
- Templates → Pending approvals
- Billing → Revenue, invoices, refunds
- Logs → Webhook & message queue
- System → Settings, integrations, users

---

## 7. Database Schema (summary / starter)

High-level tables (Prisma models recommended):

- `User` (id, name, email, role, vendorId?, createdAt)
- `Vendor` (id, name, email, status, settings, billingPlanId, createdAt)
- `Product` (id, vendorId, title, description, price, sku, images, metadata, createdAt)
- `Order` (id, vendorId, customerInfo JSON, items JSON, amount, status, createdAt, updatedAt)
- `MessageTemplate` (id, vendorId, content, status, type, createdAt)
- `WhatsAppSession` (id, vendorId, phoneNumber, token, webhookUrl, connectedAt)
- `BillingRecord` (id, vendorId, type, amount, periodStart, periodEnd, status)
- `WebhookLog` (id, vendorId, eventType, payload JSON, status, createdAt)
- `JobQueue` (for background tasks if needed — or use BullMQ + Redis directly)

Note: Use JSON columns sparingly. Normalize data for reporting needs.

---

## 8. Example API Endpoints (REST)

### Auth
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`

### Vendors (admin)
- `GET /api/admin/vendors`
- `GET /api/admin/vendors/:id`
- `POST /api/admin/vendors/:id/approve`
- `POST /api/admin/vendors/:id/suspend`

### Vendor Portal
- `GET /api/vendors/:vendorId/dashboard`
- `GET /api/vendors/:vendorId/products`
- `POST /api/vendors/:vendorId/products`
- `PUT /api/vendors/:vendorId/products/:productId`
- `DELETE /api/vendors/:vendorId/products/:productId`
- `GET /api/vendors/:vendorId/orders`
- `GET /api/vendors/:vendorId/orders/:orderId`
- `POST /api/vendors/:vendorId/templates` (create template)
- `GET /api/vendors/:vendorId/templates`
- `POST /api/vendors/:vendorId/settings`
- `GET /api/vendors/:vendorId/usage`

### Admin Logs / Billing
- `GET /api/admin/logs/webhooks`
- `GET /api/admin/billing/summary`
- `POST /api/admin/billing/refund`

### Webhooks (WhatsApp)
- `POST /api/webhooks/whatsapp`  — handle incoming messages & events

---

## 9. Frontend Component / UI Strategy

### Shared UI primitives
- `Button`, `Input`, `Modal`, `Table`, `Card`, `Badge`, `Toast`, `Avatar`, `FileUploader`
- Keep components unopinionated — accept className and size props
- Use Tailwind design tokens for consistent theming

### Design tokens
- Colors, spacing, border radii, font-sizes in `/packages/design-tokens`
- Use tokens both in web CSS (Tailwind config) and NativeWind theme values

### Accessibility
- Semantic HTML on web
- Proper labels for forms
- Keyboard navigation for tables and modals

---

## 10. Mobile-specific considerations

- Use **Expo** managed workflow for quicker dev & OTA updates (EAS)
- Optimize image upload (resize + compress before upload)
- Implement offline-first UX for orders and catalog edits using local cache (React Query + async storage)
- Push notifications via FCM (Android) / APNs (iOS) — configure with Expo
- Provide "Open in web" links for payment flows or heavy admin actions

---

## 11. CI/CD & Deployment

### Web (Vendor + Admin)
- GitHub Actions build → Deploy to Vercel or Netlify
- Preview deployments for PRs
- Linting & type checks on PRs

### Vendor Mobile
- GitHub Actions → Expo EAS build → TestFlight / Play Console
- OTA updates via EAS updates (for JS-only changes)

### Backend
- GitHub Actions → Build Docker image → Push to Registry → Deploy to Render / AWS ECS / Fly.io
- Migrations via Prisma migrate in CI step before deploy (with care in prod)

---

## 12. Security & Compliance

- HTTPS everywhere, HSTS
- Store secrets in Vault / Secrets Manager
- Role checks server-side for every endpoint
- Rate limiting & IP allowlist for admin routes
- Data retention policy, GDPR-ish data deletion endpoints
- PCI: If storing cards, avoid; integrate Stripe Checkout to minimize PCI scope

---

## 13. Monitoring & Observability

- Error tracking: Sentry
- Logs: structured logs to Logflare / CloudWatch
- Metrics: Prometheus or hosted provider
- Alerts: Slack / email for critical failures

---

## 14. Cost & Time Estimates (Rough)

> Assumptions: Small team (1 PM, 1 full-stack dev, 1 frontend dev, 1 mobile dev, 1 QA) — approx estimates.

### MVP (3 months)
- Specs & infra: 1–2 weeks
- Backend APIs: 6–8 weeks (parallel)
- Web vendor portal (MVP): 6–8 weeks
- Mobile vendor app (MVP): 6–8 weeks
- Admin portal (MVP): 3–4 weeks
- QA, polish, deployment: 2–3 weeks

### Estimated cost (contractor rates vary)
- If hiring contractors at ₹1.5–2.5 L/month per developer, MVP cost ~ ₹6–12 L (3 months, 3 devs approximate). Adjust per local rates.

---

## 15. Risks & Mitigations

- **WhatsApp API limits / policy changes** — Mitigate: design provider-agnostic abstraction layer for messaging.
- **Payment disputes / chargebacks** — Mitigate: clear receipts, invoices, and refund flows.
- **Scale surprises (message volume spikes)** — Mitigate: autoscaling backend + queueing (BullMQ).
- **Mobile OS differences** — Mitigate: strong E2E device testing, Expo simplifies many differences.

---

## 16. Next Immediate Steps (30-day plan)

1. Create mono-repo and scaffold apps (Nx/Turborepo + TypeScript).
2. Implement auth (Clerk/Auth0) integration for web + mobile.
3. Build core backend endpoints for auth, vendor, product, order.
4. Implement vendor catalog CRUD on web (MVP).
5. Scaffold mobile app with Expo, implement product list and order notification.
6. Setup CI/CD for web and backend.
7. Set up staging environment and integrate WhatsApp webhook receiver (staging).
8. Prepare admin web basic pages: vendor list, logs, approvals.

---

## 17. Deliverables in this README (what I've included)
- Tech stack & rationale
- Folder structure (mono-repo)
- MVP & MMP feature lists
- UI screen map
- DB models summary
- API endpoint examples
- CI/CD & deployment guidance
- Cost & timeline estimates
- 30-day immediate action plan
- Risks & mitigations

---

## 18. How I can help next
I can generate any of these immediately (pick one):
- UI wireframes for Vendor Web + Mobile (Figma-like markdown or component list)
- Full Prisma schema file from the DB sketch
- Detailed API spec (OpenAPI/Swagger)
- GitHub Actions CI examples
- Starter repo scaffolding (scripts + sample components)
- Estimation breakdown per sprint (2-week sprints)

Tell me which deliverable you want and I’ll add it to the repo/readme.

---

### Notes
This README is intentionally vendor-focused and optimized for reusability between web and mobile. If you want to white-label or support multiple languages, we can add those specifics into the roadmap.

---

**End of README**
