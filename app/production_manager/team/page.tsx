'use client';
import TeamList from '@/components/manager/TeamList';

export default function ProductionManagerTeamPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Team</h1>
        <p className="page-subtitle">Your production team.</p>
      </div>
      <TeamList endpoint="/api/production_manager/team" title="My Production Team" />
    </div>
  );
}
