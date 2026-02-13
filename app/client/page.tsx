import RoleDashboardPage from "@/components/dashboard/RoleDashboardPage";
import CalendlyMeetingCenter from "@/components/client/CalendlyMeetingCenter";
import { getCurrentUser } from "@/app/api/admin/_utils";
import { getCalendlyIntegration } from "@/lib/integrations/calendly";

export default async function ClientPage() {
  const me = await getCurrentUser();
  const calendly = me?.tenantId ? await getCalendlyIntegration(me.tenantId).catch(() => null) : null;

  return (
    <div className="space-y-6">
      <RoleDashboardPage
        heading="Client Dashboard"
        subtitle="Client portal for project and billing visibility."
        kpis={["Active Projects", "Milestones This Month", "Open Invoices", "Support Tickets"]}
        tableTitle="Project Status Table"
      />
      <CalendlyMeetingCenter prefillName={me?.name || me?.fullName || ""} prefillEmail={me?.email || ""} widgetUrl={calendly?.widgetUrl || null} />
    </div>
  );
}
