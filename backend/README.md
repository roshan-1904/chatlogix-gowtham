# ChatLogix Backend

A TypeScript Express API providing WhatsApp webhook handling, SQS queues, workers, Prisma PostgreSQL models, and basic billing/credits.

## Requirements
- Node.js 18+
- PostgreSQL database
- Docker (for Redis/LocalStack - optional)

## Setup
1. Copy `.env.example` to `.env` in the backend directory and fill values.
2. Start infra:
```bash
docker-compose up -d
```
3. Install deps and generate Prisma client:
```bash
cd backend
npm install
npm run prisma:generate
npm run prisma:migrate
```
4. Start API:
```bash
npm run dev
```
5. Start workers (in separate terminals):
```bash
npm run worker:incoming
npm run worker:response
```

## Env Vars
See `.env.example` for all variables. All config is driven via env.

## Endpoints
- GET `/health`
- GET `/webhook` (verification)
- POST `/webhook` (events)
- POST `/api/vendors/register`
- GET `/api/vendors/:id/usage-analytics`

## Documentation

For detailed documentation, see:
- [Setup Guides](../docs/setup/) - Database setup, configuration, troubleshooting
- [Development Guides](../docs/development/) - Logging, error management, OpenAI integration
- [Architecture Documentation](../docs/architecture/) - System architecture and design decisions
- [Deployment Guides](../docs/deployment/) - Deployment instructions

## Scripts

Utility scripts are located in:
- `backend/scripts/` - Backend-specific utility scripts
- `scripts/database/` - Database scripts and backups
- `scripts/deployment/` - Deployment automation scripts

