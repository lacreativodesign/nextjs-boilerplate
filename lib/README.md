# Lib Module

Shared domain and infrastructure logic for API and UI layers.

## Standards
- Keep tenant checks explicit and deterministic.
- Exported utility functions must include JSDoc.
- Avoid module cross-coupling that bypasses role or tenant guards.
