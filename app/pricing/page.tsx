import type { Metadata } from 'next';
import { PricingPageClient } from '@/components/pricing/PricingPageClient';

export const metadata: Metadata = {
  title: 'Bizosto Pricing | Starter, Pro, Enterprise',
  description:
    'Compare Bizosto plans for Starter, Pro, and Enterprise. Start a 14-day free trial or schedule a live demo.',
  keywords: [
    'Bizosto pricing',
    'ERP pricing',
    'SaaS ERP plans',
    'Starter Pro Enterprise',
    '14-day free trial',
  ],
  alternates: {
    canonical: '/pricing',
  },
  openGraph: {
    title: 'Bizosto Pricing',
    description:
      'Transparent pricing with monthly and annual billing for Starter, Pro, and Enterprise.',
    url: '/pricing',
    siteName: 'Bizosto',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Bizosto Pricing',
    description: 'Flexible ERP plans for growing businesses. Start your 14-day free trial.',
  },
};

const pricingStructuredData = {
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: 'Bizosto',
  description: 'Multi-tenant ERP platform for operations, finance, HR, and CRM.',
  brand: {
    '@type': 'Brand',
    name: 'Bizosto',
  },
  offers: [
    {
      '@type': 'Offer',
      name: 'Starter',
      price: '79',
      priceCurrency: 'USD',
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: '79',
        priceCurrency: 'USD',
        billingDuration: 'P1M',
      },
      availability: 'https://schema.org/InStock',
    },
    {
      '@type': 'Offer',
      name: 'Pro',
      price: '149',
      priceCurrency: 'USD',
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: '149',
        priceCurrency: 'USD',
        billingDuration: 'P1M',
      },
      availability: 'https://schema.org/InStock',
    },
    {
      '@type': 'Offer',
      name: 'Enterprise',
      price: '299',
      priceCurrency: 'USD',
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: '299',
        priceCurrency: 'USD',
        billingDuration: 'P1M',
      },
      availability: 'https://schema.org/InStock',
    },
  ],
};

export default function PricingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingStructuredData) }}
      />
      <PricingPageClient />
    </>
  );
}
