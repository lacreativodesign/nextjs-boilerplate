# Role and permission verification matrix

The product role model is fixed in `docs/product/PRODUCT_CONSTITUTION.md`. This
file is the QA matrix used to prove enforcement. “Allowed” always means inside
the caller's tenant, on a resource the caller is entitled to access, and only
when the tenant's plan enables the module.

| Role                 | Dashboard             | API namespace baseline                                  | Cross-tenant          | Required negative cases                                               |
| -------------------- | --------------------- | ------------------------------------------------------- | --------------------- | --------------------------------------------------------------------- |
| `super_admin`        | `/super_admin`        | Platform APIs and explicitly selected tenant operations | Explicit/audited only | Missing platform role; arbitrary tenant body; unaudited mutation      |
| `admin`              | `/dashboard`          | Tenant admin and enabled department APIs                | Never                 | Other tenant ID/doc; Super Admin route; disabled module               |
| `sales_manager`      | `/sales_manager`      | Sales manager + sales                                   | Never                 | Other tenant lead/deal; finance/HR mutation; >20% unapproved discount |
| `sales`              | `/sales`              | Sales                                                   | Never                 | Unassigned/forbidden owner; manager approval; other tenant            |
| `am_manager`         | `/am_manager`         | AM manager + AM                                         | Never                 | Other tenant/client; finance/HR; client-private data                  |
| `am`                 | `/am`                 | AM                                                      | Never                 | Unassigned client/project; manager-only action; other tenant          |
| `production_manager` | `/production_manager` | Production manager + production                         | Never                 | Other tenant project/task; finance/HR; unauthorized file              |
| `production`         | `/production`         | Production                                              | Never                 | Unassigned task/file; manager-only action; other tenant               |
| `finance`            | `/finance`            | Finance                                                 | Never                 | Other tenant invoice/payment; history rewrite; HR/Sales admin         |
| `hr`                 | `/hr`                 | HR                                                      | Never                 | Other tenant employee/document; finance/client data                   |
| `client`             | `/client`             | Client portal                                           | Never                 | Internal CRM/search; other client; employee/internal notes/files      |

## Resource-check contract

For every route/method/resource combination, tests should exercise:

1. no session;
2. wrong role;
3. correct role and tenant;
4. correct role but wrong tenant;
5. correct tenant but wrong resource owner/relationship;
6. missing or malformed ownership metadata;
7. disabled plan module;
8. explicit Super Admin override where supported;
9. soft/hard subscription lock exceptions such as checkout and billing;
10. duplicate/retried mutation.

Client portal authorization additionally requires all three server-derived
bindings: role `client`, the authenticated user's tenant claim matching the
resource tenant, and the authenticated user's client ID matching the resource
client. Starter permits ten active client identities; Pro and Enterprise are
unlimited. A missing legacy binding fails closed and requires owner-reviewed
migration rather than inference from a request field.

## Current verification state

Source-level route-contract and ownership suites exist for many namespaces, and
this release adds focused negative tests for signup, demo mutation, managed-file
ACLs, client identity/seats, closed-won activation, webhook tenant binding, and
workflow mutation binding. Full live-browser
execution across all eleven roles is `BLOCKED` until preview is isolated from
production Firebase. A passing static namespace test is not equivalent to
resource-level authorization proof; gaps remain tracked in
`BLOCKER_REGISTER.md`.
