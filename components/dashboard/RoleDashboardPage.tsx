import CustomizableDashboard from '@/components/dashboard/CustomizableDashboard';

type Props = {
  heading: string;
  subtitle: string;
  kpis: string[];
  tableTitle: string;
};

export default function RoleDashboardPage({ heading, subtitle }: Props) {
  return <CustomizableDashboard heading={heading} subtitle={subtitle} />;
}
