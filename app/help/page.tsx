import { HelpCenterPageContent } from "@/components/help-center/HelpCenterPageContent";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Help Center",
  description: "Documentation, video tutorials, FAQs, and support for BIZOSTO ERP.",
};

export default function HelpCenterPage() {
  return <HelpCenterPageContent />;
}
