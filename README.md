# ChatLogix

WhatsApp-based e-commerce SaaS platform with AI-powered conversation management.

## Primary Business Goal

**Chat-Based Order Assistance via WhatsApp**

ChatLogix enables customers to place orders and get questions answered through natural WhatsApp conversations. The multi-stage AI system automates **90% of vendor time** spent on repetitive questions, allowing vendors to focus on their business while AI handles customer service.

### Key Value Propositions

**For Customers:**
- Natural chat-based ordering experience
- Instant answers to product inquiries, order status, delivery questions
- Conversational order placement (no forms or complex flows)
- Multi-language support (Tamil, Hindi, English)

**For Vendors:**
- **90% time savings** on repetitive questions
- Automated order processing and customer service
- 24/7 availability without manual intervention
- Scale customer service without scaling manual effort

### Success Metrics

- 90% reduction in vendor time on repetitive questions
- Natural, conversational order placement experience
- Automated question answering (product inquiries, order status, etc.)
- Complete order processing without manual intervention
- Cost-effective AI processing (<$0.0022 per message)

## Project Structure

```
ChatLogix/
├── backend/          # Backend API (Express, TypeScript, Prisma)
├── frontend/         # Frontend application (legacy)
├── frontend_v2/      # Frontend v2 (monorepo with multiple apps)
├── docs/             # Project documentation
├── scripts/          # Deployment and utility scripts
└── requirements/     # Requirements and planning documents
```

## Quick Start

### Backend Setup

See [Backend README](./backend/README.md) for detailed setup instructions.

Quick setup:
```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your configuration
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

### Frontend Setup

See [Frontend v2 README](./frontend_v2/README.md) for frontend setup.

## Documentation

All documentation has been organized in the [`docs/`](./docs/) directory:

- **[Deployment Guides](./docs/deployment/)** - Deployment instructions for various platforms
- **[Setup Guides](./docs/setup/)** - Setup and configuration guides
- **[Development Guides](./docs/development/)** - Development documentation and best practices
- **[Architecture Documentation](./docs/architecture/)** - System architecture and design decisions

## Scripts

Deployment and utility scripts are organized in the [`scripts/`](./scripts/) directory:

- **[Deployment Scripts](./scripts/deployment/)** - Deployment automation scripts
- **[Database Scripts](./scripts/database/)** - Database utilities and backups

## Requirements

See the [`requirements/`](./requirements/) directory for:
- Business requirements
- Technical specifications
- Implementation plans
- Testing strategies

## Contributing

When adding new documentation:
1. Place it in the appropriate `docs/` subdirectory
2. Update the relevant README.md index file
3. Follow the existing documentation style

## License

[Add your license information here]

