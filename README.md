# Bizosto ERP

Multi-tenant ERP platform built on Next.js App Router with Firebase services.

## Development

```bash
npm run dev
```

## Quality standards

- ESLint strict rules (`.eslintrc.json`)
- Prettier formatting (`.prettierrc`)
- TypeScript strict mode (`tsconfig.json`)
- Husky + lint-staged pre-commit checks (`.husky/pre-commit`)

## API documentation

- Generate OpenAPI: `npm run docs:api`
- OpenAPI spec: `docs/api/openapi.yaml`
- Runtime spec endpoint: `GET /api/openapi`
- Swagger UI: `/api-docs`

## CI quality gates

GitHub Actions enforces:

- lint
- type checks
- coverage thresholds
- build verification
- bundle size budget
- license compliance
- optional SonarQube scan when secrets are configured

## Architecture documentation

- ADR index: `docs/architecture/README.md`
- Database schema: `docs/database/schema.md`
