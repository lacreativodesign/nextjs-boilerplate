# Plan, role, and module matrix

This matrix records locked commercial entitlement separately from role
authorization. Access requires both: the tenant's plan/explicit Super Admin
override must enable a module, and the caller's role/resource policy must allow
the requested operation.

## Plan entitlements

| Module / limit                     | Starter       | Pro            | Enterprise     |
| ---------------------------------- | ------------- | -------------- | -------------- |
| CRM and clients                    | Yes           | Yes            | Yes            |
| Sales pipeline                     | Yes           | Yes            | Yes            |
| Projects                           | Yes           | Yes            | Yes            |
| Client Portal                      | Yes, 10 seats | Yes, unlimited | Yes, unlimited |
| Notifications / basic reporting    | Yes           | Yes            | Yes            |
| Finance                            | No            | Yes            | Yes            |
| Production                         | No            | Yes            | Yes            |
| Approvals supporting Pro workflows | No            | Yes            | Yes            |
| AI Workforce BYOK                  | No            | Yes            | Yes            |
| Website Embed                      | No            | Yes            | Yes            |
| HR                                 | No            | No             | Yes            |
| Stripe Connect client payments     | No            | No             | Yes            |
| White-label                        | No            | No             | Yes            |
| Internal users                     | 10            | 20             | Unlimited      |
| Storage                            | 20 GB         | 75 GB          | 250 GB         |

A trial receives the explicit module map for its selected plan. A missing or
malformed plan/module map fails to the Starter/least-privilege baseline; it must
never grant all paid modules. Super Admin overrides are explicit, time-bounded
or permanent, and audited.

## Role domain defaults

| Role                 | Primary scope                            | Normal mutation authority                                  |
| -------------------- | ---------------------------------------- | ---------------------------------------------------------- |
| `super_admin`        | Platform and explicitly selected tenants | Platform governance and audited tenant administration      |
| `admin`              | One tenant                               | Tenant administration and enabled modules                  |
| `sales_manager`      | One tenant's sales domain                | Team pipeline, approvals, assignments, discounts           |
| `sales`              | One tenant's sales domain                | Assigned/allowed leads and deals                           |
| `am_manager`         | One tenant's account-management domain   | Team clients, projects, change requests                    |
| `am`                 | One tenant's account-management domain   | Assigned clients/projects/change requests                  |
| `production_manager` | One tenant's production domain           | Production team, resources, stages, QA                     |
| `production`         | One tenant's production domain           | Assigned production work and allowed files                 |
| `finance`            | One tenant's finance domain              | Invoices, payments, expenses, reports under finance policy |
| `hr`                 | One tenant's HR domain                   | Employees and HR documents under HR policy                 |
| `client`             | One tenant and its own client resources  | Own portal profile, projects, files, invoices, requests    |

Namespace middleware is only the first gate. Each object read/mutation must
also verify tenant ownership, resource relationship, method/action, plan
entitlement, and field policy. Custom roles resolve within the same tenant and
default to deny when no matching permission exists. “Own records only” fails
closed if the target owner is not supplied.

## Server enforcement expectations

- `/api/super_admin/**`: `super_admin` only; every cross-tenant mutation audited.
- `/api/admin/**`: `admin` or `super_admin`, plus same-tenant resource binding.
- Department namespaces: corresponding contributor/manager plus tenant admins.
- `/api/client/**`: own client-portal resources only; never the tenant's internal
  CRM list, internal notes, employee files, or other clients' deliverables.
- `/api/import/**` and `/api/export/**`: tenant admin or Super Admin only.
- `/api/public/**`: capability token or cryptographic/provider proof; public
  identifiers alone do not authorize data access.
- Firestore and Storage client rules remain narrower than API permissions;
  Admin SDK routes re-check tenant and role because Admin bypasses rules.
