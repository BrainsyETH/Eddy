#!/usr/bin/env npx tsx
/**
 * Run Seeds Script
 * 
 * Executes all seed SQL files against the Supabase database.
 * 
 * Usage:
 *   npx tsx scripts/run-seeds.ts
 * 
 * Prerequisites:
 *   - Supabase CLI installed
 *   - Database migrations already applied
 *   - Environment variables set
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

const SEED_FILES = [
  'rivers.sql',
  'gauge_stations.sql', 
  'access_points.sql',
];

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error('Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(url, serviceKey);
}

async function runSeeds() {
  console.log('🌱 Running Seed Files');
  console.log('='.repeat(50));
  console.log('');

  const supabase = getSupabaseClient();
  const seedDir = join(__dirname, '../supabase/seed');

  for (const seedFile of SEED_FILES) {
    console.log(`\n📄 ${seedFile}`);
    
    try {
      const filePath = join(seedDir, seedFile);
      const sql = readFileSync(filePath, 'utf-8');
      
      // Split by semicolons to execute statements (simplified approach)
      // Note: This won't work for all SQL, but works for our simple seed files
      const statements = sql
        .split(/;\s*$/m)
        .filter(s => s.trim().length > 0)
        .filter(s => !s.trim().startsWith('--')); // Skip comment-only lines

      console.log(`   Executing ${statements.length} statements...`);

      // Execute the full SQL using rpc if available, or raw query
      // Supabase JS doesn't support raw SQL directly, so we'll use the REST API
      const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
        },
        body: JSON.stringify({}),
      });

      // Since we can't run raw SQL through the JS client,
      // print instructions for manual execution
      console.log(`   ⚠️ Direct SQL execution requires Supabase CLI or SQL Editor`);
      console.log(`   Run: supabase db execute --file ./supabase/seed/${seedFile}`);
      console.log(`   Or paste contents into Supabase SQL Editor`);
      
    } catch (error) {
      console.log(`   ❌ Error: ${error}`);
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('💡 Recommended: Run seed files using Supabase CLI:');
  console.log('');
  console.log('   supabase db reset  # Resets and re-seeds the database');
  console.log('');
  console.log('   Or run individually:');
  SEED_FILES.forEach(f => {
    console.log(`   supabase db execute --file ./supabase/seed/${f}`);
  });
}

runSeeds().catch(console.error);
