import { HelpCenterPageContent } from '@/components/help-center/HelpCenterPageContent';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Help Center',
  description: 'Role-specific guides, tutorials, and documentation for BIZOSTO ERP.',
};

export default function HelpCenterPage() {
  return <HelpCenterPageContent />;
}
