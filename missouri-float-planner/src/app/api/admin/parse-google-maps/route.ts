// src/app/api/admin/parse-google-maps/route.ts
// POST /api/admin/parse-google-maps - Parse Google Maps URL to extract name and coordinates

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface ParsedGoogleMapsData {
  name: string | null;
  latitude: number | null;
  longitude: number | null;
  expandedUrl: string | null;
  placeId: string | null;
}

/**
 * Extract coordinates from various Google Maps URL formats
 */
function extractCoordinates(url: string): { lat: number; lng: number } | null {
  // Format: /@37.7749,-122.4194,15z or @37.7749,-122.4194
  const atMatch = url.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (atMatch) {
    return {
      lat: parseFloat(atMatch[1]),
      lng: parseFloat(atMatch[2]),
    };
  }

  // Format: ?q=37.7749,-122.4194 or &q=37.7749,-122.4194
  const qMatch = url.match(/[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (qMatch) {
    return {
      lat: parseFloat(qMatch[1]),
      lng: parseFloat(qMatch[2]),
    };
  }

  // Format: /place/37.7749,-122.4194
  const placeMatch = url.match(/\/place\/(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (placeMatch) {
    return {
      lat: parseFloat(placeMatch[1]),
      lng: parseFloat(placeMatch[2]),
    };
  }

  // Format: ll=37.7749,-122.4194
  const llMatch = url.match(/ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (llMatch) {
    return {
      lat: parseFloat(llMatch[1]),
      lng: parseFloat(llMatch[2]),
    };
  }

  // Format: !3d37.7749!4d-122.4194 (embedded maps)
  const embedMatch = url.match(/!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/);
  if (embedMatch) {
    return {
      lat: parseFloat(embedMatch[1]),
      lng: parseFloat(embedMatch[2]),
    };
  }

  return null;
}

/**
 * Extract place name from Google Maps URL
 */
function extractPlaceName(url: string): string | null {
  // Format: /place/Place+Name/ or /place/Place%20Name/
  const placeMatch = url.match(/\/place\/([^/@]+)/);
  if (placeMatch) {
    const encodedName = placeMatch[1];
    try {
      // Decode URL encoding and replace + with spaces
      return decodeURIComponent(encodedName.replace(/\+/g, ' '));
    } catch {
      return encodedName.replace(/\+/g, ' ');
    }
  }

  // Format: q=Place+Name or q=Place%20Name (before coordinates)
  const qMatch = url.match(/[?&]q=([^&@,]+)/);
  if (qMatch && !/^-?\d+\.?\d*$/.test(qMatch[1])) {
    try {
      return decodeURIComponent(qMatch[1].replace(/\+/g, ' '));
    } catch {
      return qMatch[1].replace(/\+/g, ' ');
    }
  }

  return null;
}

/**
 * Extract place ID from Google Maps URL
 */
function extractPlaceId(url: string): string | null {
  // Format: place_id=ChIJ... or !1s...
  const placeIdMatch = url.match(/place_id=([^&]+)/) || url.match(/!1s([^!]+)/);
  if (placeIdMatch) {
    return placeIdMatch[1];
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      );
    }

    // Validate it looks like a Google Maps URL
    const isGoogleMapsUrl = url.includes('google.com/maps') ||
      url.includes('maps.google.com') ||
      url.includes('goo.gl/maps') ||
      url.includes('maps.app.goo.gl');

    if (!isGoogleMapsUrl) {
      return NextResponse.json(
        { error: 'URL must be a Google Maps link' },
        { status: 400 }
      );
    }

    let expandedUrl = url;
    let finalUrl = url;

    // If it's a shortened URL, follow redirects to get the full URL
    if (url.includes('goo.gl') || url.includes('maps.app.goo.gl')) {
      try {
        // Follow redirects to get the expanded URL
        const response = await fetch(url, {
          method: 'HEAD',
          redirect: 'follow',
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Eddy/1.0)',
          },
        });
        expandedUrl = response.url;
        finalUrl = expandedUrl;
      } catch (fetchError) {
        // Try with GET request if HEAD fails
        try {
          const response = await fetch(url, {
            method: 'GET',
            redirect: 'follow',
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; Eddy/1.0)',
            },
          });
          expandedUrl = response.url;
          finalUrl = expandedUrl;
        } catch {
          // If we can't expand it, continue with the original URL
          console.warn('Could not expand shortened URL:', fetchError);
        }
      }
    }

    // Extract data from the URL
    const coordinates = extractCoordinates(finalUrl);
    const placeName = extractPlaceName(finalUrl);
    const placeId = extractPlaceId(finalUrl);

    const result: ParsedGoogleMapsData = {
      name: placeName,
      latitude: coordinates?.lat || null,
      longitude: coordinates?.lng || null,
      expandedUrl: expandedUrl !== url ? expandedUrl : null,
      placeId,
    };

    // Check if we got useful data
    const hasData = result.name || result.latitude;

    return NextResponse.json({
      success: hasData,
      data: result,
      message: hasData
        ? 'Successfully parsed Google Maps URL'
        : 'Could not extract location data from URL. Try using the full Google Maps URL instead of a shortened link.',
    });
  } catch (error) {
    console.error('Error parsing Google Maps URL:', error);
    return NextResponse.json(
      { error: 'Failed to parse Google Maps URL' },
      { status: 500 }
    );
  }
}
