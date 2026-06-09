import { NextResponse } from 'next/server';
import { X402_PAY_TO, X402_NETWORK, X402_FACILITATOR_URL } from '@/lib/x402-config';

export async function GET() {
  if (!X402_PAY_TO) {
    return NextResponse.json(
      { error: 'x402 payments not configured' },
      { status: 503 }
    );
  }

  return NextResponse.json({
    version: '1.0',
    protocol: 'x402',
    payTo: X402_PAY_TO,
    network: X402_NETWORK,
    currency: 'USDC',
    facilitator: X402_FACILITATOR_URL,
    routes: {
      '/api/rivers': { price: '$0.005', description: 'River data access' },
      '/api/rivers/:slug': { price: '$0.005', description: 'River detail data' },
      '/api/rivers/:slug/access-points': { price: '$0.005', description: 'River access points data' },
      '/api/rivers/:slug/access/:accessSlug': { price: '$0.005', description: 'Access point detail data' },
      '/api/rivers/:slug/hazards': { price: '$0.01', description: 'River hazards data' },
      '/api/rivers/:slug/services': { price: '$0.01', description: 'River services data' },
      '/api/rivers/:slug/pois': { price: '$0.01', description: 'River points of interest data' },
      '/api/gauges': { price: '$0.001', description: 'Gauge stations data' },
      '/api/gauges/:siteId/history': { price: '$0.005', description: 'Gauge history data' },
      '/api/gauge-thresholds': { price: '$0.001', description: 'Gauge thresholds data' },
      '/api/vessel-types': { price: '$0.001', description: 'Vessel types data' },
      '/api/conditions/:riverId': { price: '$0.01', description: 'River conditions data' },
      '/api/weather': { price: '$0.01', description: 'Weather data' },
      '/api/weather/:riverSlug': { price: '$0.01', description: 'River weather data' },
      '/api/weather/:riverSlug/forecast': { price: '$0.01', description: 'Weather forecast data' },
      '/api/blog': { price: '$0.005', description: 'Blog posts data' },
      '/api/blog/:slug': { price: '$0.005', description: 'Blog post data' },
      '/api/chat': { price: '$0.02', description: 'AI chat access' },
      '/api/plan': { price: '$0.02', description: 'Float plan data' },
      '/api/plan/campgrounds': { price: '$0.01', description: 'Campgrounds data' },
      '/api/eddy-update/:riverSlug': { price: '$0.01', description: 'Eddy update data' },
    },
  });
}
