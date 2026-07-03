import { NextRequest, NextResponse } from 'next/server';
import { currencyConverter } from '@/lib/currency/currencyConverter';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    if (currencyConverter.needsUpdate()) {
      await currencyConverter.fetchRates();
    }

    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    if (from && to) {
      const rate = currencyConverter.getRate(from.toUpperCase(), to.toUpperCase());
      return NextResponse.json({ from: from.toUpperCase(), to: to.toUpperCase(), rate });
    }

    return NextResponse.json({
      message: 'Rates cached',
      lastUpdated: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: 'Failed to fetch rates',
        details: error?.message || 'Unknown error',
      },
      { status: 500 },
    );
  }
}
