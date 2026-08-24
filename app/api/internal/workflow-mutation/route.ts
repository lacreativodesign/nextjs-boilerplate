import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Mutations now execute in-process through the run/action-bound automation
 * service. Keeping a header-authenticated HTTP mutation bus created an
 * unnecessary cross-environment capability: a preview could call production
 * when NEXT_PUBLIC_APP_URL pointed at the production origin.
 */
export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: 'The workflow mutation HTTP bus has been decommissioned.',
      code: 'workflow_mutation_bus_decommissioned',
    },
    { status: 410 },
  );
}
