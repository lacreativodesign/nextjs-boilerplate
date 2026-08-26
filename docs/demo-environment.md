# Demo Environment

## Safety status

The Bizosto demo tenant is `bizosto-demo`. Demo mutations are disabled by default and must never
run against the production Firebase project. The current production and preview deployments have
been observed using the same Firebase project, so the deployed demo seed and reset controls remain
blocked until preview/staging has an isolated Firebase project.

The seed library, API routes, and CLI all apply the same fail-closed guard. A Super Admin session
alone is not enough to enable a mutation.

## Required environment contract

Configure these names only in a Firebase emulator environment or an owner-approved isolated
staging project:

- `DEMO_DATA_MUTATIONS_ENABLED=true`
- `BIZOSTO_ENVIRONMENT=development`, `test`, or `staging` (Vercel preview deployments use
  `staging`)
- `DEMO_FIREBASE_PROJECT_ID` set to the isolated project ID when not using emulators
- `FIREBASE_PRODUCTION_PROJECT_ID` set to the production project ID
- `DEMO_USER_PASSWORDS_JSON` stored as a secret, containing one distinct strong password for every
  demo account
- `E2E_DEMO_PASSWORDS_JSON` stored as a CI secret with the same per-account shape when deployment
  smoke tests are enabled
- `E2E_ISOLATED_ENVIRONMENT=true` set only after the smoke-test URL and Firebase project have been
  independently verified as isolated
- `E2E_EXPECTED_FIREBASE_PROJECT_ID` set to the isolated project expected from the remote smoke
  target

Emulator use additionally requires both `FIRESTORE_EMULATOR_HOST` and
`FIREBASE_AUTH_EMULATOR_HOST`. A partial emulator configuration is rejected.

The guard always rejects:

- `VERCEL_ENV=production` or another production/live environment label
- the known production Firebase project
- a target project that differs from `DEMO_FIREBASE_PROJECT_ID`
- any tenant ID other than `bizosto-demo`
- missing explicit enablement, project metadata, or credential configuration

## Credential handling

The ten demo emails remain visible to Super Admins so role-specific login links can be prepared.
Passwords are not stored in Git, documentation, client bundles, API responses, or logs. Every demo
account must have a different password in `DEMO_USER_PASSWORDS_JSON`, managed in the approved
password manager. Passwords must be at least 16 characters and contain uppercase, lowercase,
numeric, and special characters.

The required JSON keys are:

- `demo_admin@bizosto.com`
- `demo_sales@bizosto.com`
- `demo_sales_manager@bizosto.com`
- `demo_am@bizosto.com`
- `demo_am_manager@bizosto.com`
- `demo_production@bizosto.com`
- `demo_production_manager@bizosto.com`
- `demo_finance@bizosto.com`
- `demo_hr@bizosto.com`
- `demo_client@bizosto.com`

Do not commit the JSON value. Store it only in the approved secret store for the isolated
environment.

Authenticated smoke helpers reject known production Bizosto hosts. Remote targets also require
the explicit `E2E_ISOLATED_ENVIRONMENT=true` acknowledgement; localhost remains available for
emulator-backed tests. Before submitting a remote login, the helper reads the deployment's public
Firebase configuration and requires it to match `E2E_EXPECTED_FIREBASE_PROJECT_ID` while differing
from `FIREBASE_PRODUCTION_PROJECT_ID`.

## Seeded data

The guarded operation provisions sample clients, leads, invoices, projects, production jobs,
employees, notifications, users, and an audit entry. Before provisioning, it deletes only records
in the known demo collections whose `tenantId` is exactly `bizosto-demo`, plus that exact tenant
document. This makes safe retries deterministic instead of appending duplicate sample data.

Firebase Auth accounts are retained and updated with their externally configured distinct
passwords.

## Running through the CLI

Initial or repeatable seed:

```bash
npm run seed:demo -- --confirm=SEED_BIZOSTO_DEMO
```

Explicit reset:

```bash
npm run seed:demo:reset -- --confirm=RESET_BIZOSTO_DEMO
```

The CLI rejects `--tenant`; it cannot be repointed at another workspace. Do not run either command
until the environment contract above is satisfied and the resolved Firebase Admin project has
been independently verified.

## Running through the UI

Log in as `super_admin`, then open **Super Admin → Demo Environment**. Tenant admins cannot read or
change this platform-level control. The API requires an explicit operation confirmation and applies
the same environment/project guard before any write. The status endpoint evaluates that policy
without mutating data; the UI keeps seed/reset controls disabled unless the result is explicitly
safe.

Never use the demo tenant for real business data. Reset it only inside the isolated environment.
