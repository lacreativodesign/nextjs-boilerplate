import {
  ChartBarSquareIcon,
  CurrencyDollarIcon,
  BoltIcon,
  RocketLaunchIcon,
  UserGroupIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline';
import type { ForwardRefExoticComponent, RefAttributes, SVGProps } from 'react';

export type HelpIcon = ForwardRefExoticComponent<
  Omit<SVGProps<SVGSVGElement>, 'ref'> & RefAttributes<SVGSVGElement>
>;

export type ArticleBlock =
  | { type: 'paragraph'; content: string }
  | { type: 'list'; items: string[] }
  | { type: 'steps'; items: string[] }
  | { type: 'code'; language: 'bash' | 'json' | 'typescript'; content: string }
  | { type: 'video'; title: string; embedUrl: string; duration: string }
  | { type: 'image'; src: string; alt: string; caption: string }
  | { type: 'callout'; tone: 'info' | 'warning'; content: string };

export type ArticleSection = {
  heading: string;
  blocks: ArticleBlock[];
};

export type HelpArticle = {
  slug: string;
  title: string;
  excerpt: string;
  lastUpdated: string;
  readTime: string;
  keywords: string[];
  relatedSlugs: string[];
  sections: ArticleSection[];
};

export type HelpCategory = {
  id: string;
  name: string;
  icon: HelpIcon;
  articles: HelpArticle[];
};

export const helpCategories: HelpCategory[] = [
  {
    id: 'getting-started',
    name: 'Getting Started',
    icon: RocketLaunchIcon,
    articles: [
      {
        slug: 'quick-start-guide',
        title: 'Quick Start Guide',
        excerpt: 'Launch your workspace in less than 30 minutes with the recommended setup path.',
        lastUpdated: '2026-01-12',
        readTime: '6 min',
        keywords: ['workspace', 'onboarding', 'setup'],
        relatedSlugs: ['inviting-team-members', 'understanding-roles-and-permissions'],
        sections: [
          {
            heading: 'Before You Begin',
            blocks: [
              {
                type: 'list',
                items: [
                  'Confirm your tenant has an active subscription.',
                  'Prepare your company legal name, billing address, and default currency.',
                  'Collect integration credentials for Google Workspace, Slack, or QuickBooks if needed.',
                ],
              },
            ],
          },
          {
            heading: 'Recommended Setup Order',
            blocks: [
              {
                type: 'steps',
                items: [
                  'Open Settings > Company and complete branding, tax profile, and fiscal year settings.',
                  'Create at least one client and one internal cost center.',
                  'Invite finance and operations users with role-based access before enabling automation.',
                  'Connect key integrations and run the sync diagnostics report.',
                ],
              },
              {
                type: 'code',
                language: 'bash',
                content:
                  '# Optional: validate SMTP settings\ncurl -X POST https://your-domain.com/api/public/support/health \\\n  -H "Content-Type: application/json" \\\n  -d \'{"channel":"email"}\'',
              },
            ],
          },
          {
            heading: 'Video Tutorial',
            blocks: [
              {
                type: 'video',
                title: 'Workspace setup walkthrough',
                embedUrl: 'https://www.youtube.com/embed/PkZNo7MFNFg',
                duration: '4:18',
              },
            ],
          },
        ],
      },
      {
        slug: 'creating-your-first-invoice',
        title: 'Creating Your First Invoice',
        excerpt: 'Create and send a production invoice with taxes, due dates, and payment links.',
        lastUpdated: '2026-01-19',
        readTime: '7 min',
        keywords: ['invoice', 'finance', 'payments', 'billing'],
        relatedSlugs: ['creating-invoices', 'multi-currency-invoicing', 'recurring-invoices'],
        sections: [
          {
            heading: 'Before You Begin',
            blocks: [
              {
                type: 'list',
                items: [
                  "Make sure you've added at least one client.",
                  'Set up your company details in Settings.',
                  'Verify your default tax rules and payment terms.',
                ],
              },
            ],
          },
          {
            heading: 'Steps',
            blocks: [
              {
                type: 'steps',
                items: [
                  'Navigate to Finance > Invoices.',
                  'Click Create Invoice.',
                  'Select the client from the dropdown.',
                  'Add line items, discounts, and taxes.',
                  'Choose due date and send method (email or shareable link).',
                ],
              },
              {
                type: 'image',
                src: '/help/invoice-builder-annotated.svg',
                alt: 'Annotated invoice creation screen',
                caption:
                  'Invoice builder with highlighted client selector, line item table, and send action.',
              },
            ],
          },
          {
            heading: 'Automation Example',
            blocks: [
              {
                type: 'code',
                language: 'json',
                content:
                  '{\n  "invoiceNumber": "INV-1042",\n  "currency": "USD",\n  "paymentTermsDays": 30,\n  "lineItems": [\n    {\n      "description": "Creative retainer",\n      "quantity": 1,\n      "unitPrice": 3500\n    }\n  ]\n}',
              },
              {
                type: 'callout',
                tone: 'info',
                content: 'Enable auto-reminders in Finance Settings to reduce overdue receivables.',
              },
            ],
          },
          {
            heading: 'Video Tutorial',
            blocks: [
              {
                type: 'video',
                title: 'Create your first invoice in under 2 minutes',
                embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
                duration: '1:58',
              },
            ],
          },
        ],
      },
      {
        slug: 'inviting-team-members',
        title: 'Inviting Team Members',
        excerpt:
          'Add users securely, assign least-privilege roles, and enforce onboarding controls.',
        lastUpdated: '2026-01-15',
        readTime: '5 min',
        keywords: ['team', 'users', 'invite', 'permissions'],
        relatedSlugs: ['understanding-roles-and-permissions'],
        sections: [
          {
            heading: 'Invitation Checklist',
            blocks: [
              {
                type: 'steps',
                items: [
                  'Go to Admin > User Management.',
                  'Click Invite User and enter corporate email.',
                  'Assign role and module scope.',
                  'Set invite expiration policy (recommended: 72 hours).',
                ],
              },
              {
                type: 'callout',
                tone: 'warning',
                content:
                  'Use company email domains only. External addresses can be blocked by tenant policy.',
              },
            ],
          },
        ],
      },
      {
        slug: 'understanding-roles-and-permissions',
        title: 'Understanding Roles & Permissions',
        excerpt: 'Reference matrix for role capabilities and tenant-safe access boundaries.',
        lastUpdated: '2026-01-10',
        readTime: '8 min',
        keywords: ['rbac', 'permissions', 'security'],
        relatedSlugs: ['inviting-team-members'],
        sections: [
          {
            heading: 'Role Matrix',
            blocks: [
              {
                type: 'paragraph',
                content:
                  'Permissions are enforced by route guards and API policy checks. Assign the minimum role required for each user.',
              },
              {
                type: 'code',
                language: 'typescript',
                content:
                  'const salesCapabilities = ["leads.read", "deals.write", "reports.read"];\nconst financeCapabilities = ["invoices.write", "payments.read"];',
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'finance',
    name: 'Finance & Invoicing',
    icon: CurrencyDollarIcon,
    articles: [
      {
        slug: 'creating-invoices',
        title: 'Creating Invoices',
        excerpt: 'Configure invoice templates, taxes, and payment terms at scale.',
        lastUpdated: '2026-01-14',
        readTime: '6 min',
        keywords: ['invoices', 'templates', 'tax'],
        relatedSlugs: ['creating-your-first-invoice', 'recurring-invoices'],
        sections: [
          {
            heading: 'Template Configuration',
            blocks: [
              {
                type: 'paragraph',
                content:
                  'Use invoice templates to standardize branding and legal text across all business units.',
              },
              {
                type: 'image',
                src: '/help/invoice-template-annotated.svg',
                alt: 'Invoice template settings',
                caption:
                  'Template editor with placeholders for terms, tax IDs, and payment blocks.',
              },
            ],
          },
        ],
      },
      {
        slug: 'multi-currency-invoicing',
        title: 'Multi-currency Invoicing',
        excerpt: 'Issue invoices in customer currency while preserving base-currency reporting.',
        lastUpdated: '2026-01-18',
        readTime: '5 min',
        keywords: ['currency', 'fx', 'reporting'],
        relatedSlugs: ['creating-your-first-invoice'],
        sections: [
          {
            heading: 'Configuration',
            blocks: [
              {
                type: 'steps',
                items: [
                  'Enable multi-currency in Finance Settings.',
                  'Set base currency and rounding policy.',
                  'Choose FX source and refresh cadence.',
                ],
              },
            ],
          },
        ],
      },
      {
        slug: 'recurring-invoices',
        title: 'Recurring Invoices',
        excerpt: 'Automate periodic billing schedules with retry and reminder workflows.',
        lastUpdated: '2026-01-16',
        readTime: '4 min',
        keywords: ['recurring', 'billing', 'automation'],
        relatedSlugs: ['creating-your-first-invoice'],
        sections: [
          {
            heading: 'Set Up Schedule',
            blocks: [
              {
                type: 'steps',
                items: [
                  'Create a recurring profile from any draft invoice.',
                  'Set frequency, start date, and optional end date.',
                  'Enable dunning reminders for failed payments.',
                ],
              },
              {
                type: 'video',
                title: 'Recurring billing setup',
                embedUrl: 'https://www.youtube.com/embed/ysz5S6PUM-U',
                duration: '3:44',
              },
            ],
          },
        ],
      },
      {
        slug: 'payment-tracking',
        title: 'Payment Tracking',
        excerpt: 'Monitor settlements, partial payments, and reconciliation exceptions.',
        lastUpdated: '2026-01-11',
        readTime: '5 min',
        keywords: ['payments', 'reconciliation'],
        relatedSlugs: ['creating-invoices'],
        sections: [
          {
            heading: 'Tracking States',
            blocks: [
              {
                type: 'list',
                items: ['Pending', 'Partially Paid', 'Paid', 'Overdue', 'Disputed'],
              },
            ],
          },
        ],
      },
      {
        slug: 'tax-calculation',
        title: 'Tax Calculation',
        excerpt: 'Apply jurisdiction rules and verify tax liabilities before filing.',
        lastUpdated: '2026-01-08',
        readTime: '5 min',
        keywords: ['tax', 'vat', 'compliance'],
        relatedSlugs: ['creating-invoices'],
        sections: [
          {
            heading: 'Tax Rules',
            blocks: [
              {
                type: 'paragraph',
                content:
                  'Configure tax rules by region and product type for accurate invoice totals.',
              },
            ],
          },
        ],
      },
      {
        slug: 'financial-reports',
        title: 'Financial Reports',
        excerpt: 'Generate receivable aging, revenue trend, and tax summary reports.',
        lastUpdated: '2026-01-06',
        readTime: '4 min',
        keywords: ['reports', 'finance'],
        relatedSlugs: ['payment-tracking'],
        sections: [
          {
            heading: 'Key Reports',
            blocks: [{ type: 'list', items: ['A/R Aging', 'Cash Collected', 'Tax Liability'] }],
          },
        ],
      },
    ],
  },
  {
    id: 'hr',
    name: 'HR & Time Tracking',
    icon: UserGroupIcon,
    articles: [
      {
        slug: 'time-tracking-setup',
        title: 'Time Tracking Setup',
        excerpt: 'Configure timesheets and approval policies.',
        lastUpdated: '2026-01-09',
        readTime: '4 min',
        keywords: ['time', 'timesheets'],
        relatedSlugs: [],
        sections: [
          {
            heading: 'Setup',
            blocks: [
              { type: 'paragraph', content: 'Define work schedules and submit/approval windows.' },
            ],
          },
        ],
      },
      {
        slug: 'leave-management',
        title: 'Leave Management',
        excerpt: 'Create leave policies and automate balances.',
        lastUpdated: '2026-01-05',
        readTime: '4 min',
        keywords: ['leave', 'pto'],
        relatedSlugs: [],
        sections: [
          {
            heading: 'Policies',
            blocks: [
              { type: 'paragraph', content: 'Publish leave policy rules and accrual cadence.' },
            ],
          },
        ],
      },
      {
        slug: 'employee-onboarding',
        title: 'Employee Onboarding',
        excerpt: 'Standardize onboarding tasks and document collection.',
        lastUpdated: '2026-01-07',
        readTime: '3 min',
        keywords: ['onboarding', 'hr'],
        relatedSlugs: [],
        sections: [
          {
            heading: 'Workflow',
            blocks: [
              {
                type: 'steps',
                items: ['Create onboarding checklist', 'Assign manager', 'Track completion'],
              },
            ],
          },
        ],
      },
      {
        slug: 'performance-reviews',
        title: 'Performance Reviews',
        excerpt: 'Run review cycles with calibration workflows.',
        lastUpdated: '2026-01-03',
        readTime: '5 min',
        keywords: ['performance', 'reviews'],
        relatedSlugs: [],
        sections: [
          {
            heading: 'Cycle Setup',
            blocks: [
              { type: 'paragraph', content: 'Set frequency, reviewers, and scoring rubric.' },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'crm',
    name: 'CRM & Sales',
    icon: ChartBarSquareIcon,
    articles: [
      {
        slug: 'managing-leads',
        title: 'Managing Leads',
        excerpt: 'Capture and qualify leads with SLA tracking.',
        lastUpdated: '2026-01-04',
        readTime: '4 min',
        keywords: ['leads', 'crm'],
        relatedSlugs: [],
        sections: [
          {
            heading: 'Lead Flow',
            blocks: [{ type: 'steps', items: ['Import leads', 'Assign owner', 'Set lead score'] }],
          },
        ],
      },
      {
        slug: 'deal-pipeline',
        title: 'Deal Pipeline',
        excerpt: 'Customize stage gates and forecast confidence.',
        lastUpdated: '2026-01-02',
        readTime: '4 min',
        keywords: ['deals', 'pipeline'],
        relatedSlugs: [],
        sections: [
          {
            heading: 'Stages',
            blocks: [
              {
                type: 'paragraph',
                content: 'Define stage entry and exit criteria for reporting consistency.',
              },
            ],
          },
        ],
      },
      {
        slug: 'email-templates',
        title: 'Email Templates',
        excerpt: 'Standardize outreach templates with personalization fields.',
        lastUpdated: '2026-01-01',
        readTime: '3 min',
        keywords: ['email', 'templates'],
        relatedSlugs: [],
        sections: [
          {
            heading: 'Template Library',
            blocks: [
              {
                type: 'paragraph',
                content: 'Create approved templates per campaign type and segment.',
              },
            ],
          },
        ],
      },
      {
        slug: 'sales-reports',
        title: 'Sales Reports',
        excerpt: 'Measure conversion, velocity, and win-rate trends.',
        lastUpdated: '2025-12-29',
        readTime: '4 min',
        keywords: ['reports', 'sales'],
        relatedSlugs: [],
        sections: [
          {
            heading: 'KPIs',
            blocks: [
              {
                type: 'list',
                items: ['Conversion rate', 'Sales cycle length', 'Average deal size'],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'integrations',
    name: 'Integrations',
    icon: BoltIcon,
    articles: [
      {
        slug: 'google-workspace-setup',
        title: 'Google Workspace Setup',
        excerpt: 'Connect calendar and email sync securely.',
        lastUpdated: '2026-01-13',
        readTime: '4 min',
        keywords: ['google', 'integration'],
        relatedSlugs: [],
        sections: [
          {
            heading: 'OAuth Setup',
            blocks: [
              {
                type: 'paragraph',
                content: 'Register redirect URI and grant minimum scopes required.',
              },
            ],
          },
        ],
      },
      {
        slug: 'quickbooks-sync',
        title: 'QuickBooks Sync',
        excerpt: 'Sync chart of accounts and invoice states.',
        lastUpdated: '2026-01-09',
        readTime: '5 min',
        keywords: ['quickbooks', 'accounting'],
        relatedSlugs: [],
        sections: [
          {
            heading: 'Sync Rules',
            blocks: [
              {
                type: 'paragraph',
                content: 'Map accounts and define conflict resolution behavior.',
              },
            ],
          },
        ],
      },
      {
        slug: 'slack-notifications',
        title: 'Slack Notifications',
        excerpt: 'Route ERP events into operational channels.',
        lastUpdated: '2026-01-12',
        readTime: '3 min',
        keywords: ['slack', 'notifications'],
        relatedSlugs: [],
        sections: [
          {
            heading: 'Webhooks',
            blocks: [
              {
                type: 'paragraph',
                content: 'Create incoming webhook and configure event subscriptions.',
              },
            ],
          },
        ],
      },
      {
        slug: 'zapier-automation',
        title: 'Zapier Automation',
        excerpt: 'Trigger no-code workflows from ERP activity.',
        lastUpdated: '2026-01-08',
        readTime: '4 min',
        keywords: ['zapier', 'automation'],
        relatedSlugs: [],
        sections: [
          {
            heading: 'Trigger Setup',
            blocks: [
              {
                type: 'paragraph',
                content: 'Use signed webhooks for trusted automation callbacks.',
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'admin',
    name: 'Admin & Settings',
    icon: Cog6ToothIcon,
    articles: [
      {
        slug: 'user-management',
        title: 'User Management',
        excerpt: 'Manage users, roles, and lifecycle actions.',
        lastUpdated: '2026-01-07',
        readTime: '5 min',
        keywords: ['users', 'admin'],
        relatedSlugs: ['inviting-team-members'],
        sections: [
          {
            heading: 'Actions',
            blocks: [{ type: 'list', items: ['Invite', 'Suspend', 'Reset MFA', 'Deactivate'] }],
          },
        ],
      },
      {
        slug: 'billing-subscriptions',
        title: 'Billing & Subscriptions',
        excerpt: 'Update plans, seats, and invoices.',
        lastUpdated: '2026-01-06',
        readTime: '4 min',
        keywords: ['billing', 'subscription'],
        relatedSlugs: [],
        sections: [
          {
            heading: 'Plan Changes',
            blocks: [
              {
                type: 'paragraph',
                content: 'Plan changes prorate automatically and apply at checkout.',
              },
            ],
          },
        ],
      },
      {
        slug: 'security-settings',
        title: 'Security Settings',
        excerpt: 'Configure SSO, MFA, and session policies.',
        lastUpdated: '2026-01-14',
        readTime: '6 min',
        keywords: ['security', 'mfa', 'sso'],
        relatedSlugs: [],
        sections: [
          {
            heading: 'Baseline',
            blocks: [
              { type: 'list', items: ['Require MFA', 'Set session timeout', 'Enable audit logs'] },
            ],
          },
        ],
      },
      {
        slug: 'white-label-branding',
        title: 'White-label Branding',
        excerpt: 'Apply tenant-specific logos, domain, and color palette.',
        lastUpdated: '2026-01-10',
        readTime: '4 min',
        keywords: ['branding', 'white-label'],
        relatedSlugs: [],
        sections: [
          {
            heading: 'Brand Assets',
            blocks: [
              {
                type: 'paragraph',
                content: 'Upload SVG logo and set verified custom domain for tenant portal.',
              },
            ],
          },
        ],
      },
    ],
  },
];

export type SearchResult = {
  categoryId: string;
  categoryName: string;
  slug: string;
  title: string;
  excerpt: string;
  searchableText: string;
  lastUpdated: string;
};

export const allArticles: SearchResult[] = helpCategories.flatMap((category) =>
  category.articles.map((article) => ({
    categoryId: category.id,
    categoryName: category.name,
    slug: article.slug,
    title: article.title,
    excerpt: article.excerpt,
    lastUpdated: article.lastUpdated,
    searchableText: [
      article.title,
      article.excerpt,
      article.keywords.join(' '),
      article.sections.map((section) => section.heading).join(' '),
      article.sections
        .flatMap((section) =>
          section.blocks.flatMap((block) => {
            if (block.type === 'paragraph' || block.type === 'callout') return [block.content];
            if (block.type === 'list' || block.type === 'steps') return block.items;
            if (block.type === 'code') return [block.content];
            if (block.type === 'video') return [block.title];
            if (block.type === 'image') return [block.caption, block.alt];
            return [];
          }),
        )
        .join(' '),
    ]
      .join(' ')
      .toLowerCase(),
  })),
);

export function getCategoryById(categoryId: string) {
  return helpCategories.find((category) => category.id === categoryId) || null;
}

export function getArticleBySlug(categoryId: string, slug: string) {
  const category = getCategoryById(categoryId);
  if (!category) return null;
  const article = category.articles.find((item) => item.slug === slug) || null;
  return article ? { category, article } : null;
}

export function findRelatedArticles(slugs: string[]) {
  if (!slugs.length) return [];
  const target = new Set(slugs);
  return allArticles.filter((item) => target.has(item.slug));
}

export function searchArticles(query: string, categoryFilter?: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    const base = categoryFilter
      ? allArticles.filter((item) => item.categoryId === categoryFilter)
      : allArticles;
    return base.slice(0, 12);
  }

  const terms = normalized.split(/\s+/).filter(Boolean);

  return allArticles
    .filter((article) => (categoryFilter ? article.categoryId === categoryFilter : true))
    .map((article) => {
      const score = terms.reduce((total, term) => {
        if (article.title.toLowerCase().includes(term)) return total + 5;
        if (article.excerpt.toLowerCase().includes(term)) return total + 3;
        if (article.searchableText.includes(term)) return total + 1;
        return total;
      }, 0);
      return { article, score };
    })
    .filter((row) => row.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || Date.parse(b.article.lastUpdated) - Date.parse(a.article.lastUpdated),
    )
    .map((row) => row.article)
    .slice(0, 20);
}
