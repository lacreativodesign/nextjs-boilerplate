"use client";
import TeamList from "@/components/manager/TeamList";

export default function AmManagerTeamPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Team</h1>
        <p className="page-subtitle">Your account managers.</p>
      </div>
      <TeamList endpoint="/api/am_manager/team" title="My Account Managers" />
    </div>
  );
}
