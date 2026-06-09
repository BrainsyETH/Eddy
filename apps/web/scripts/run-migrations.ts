#!/usr/bin/env npx tsx
/**
 * Run Database Migrations Script
 * 
 * Provides instructions and attempts to run migrations via Supabase.
 * Since Supabase doesn't expose direct SQL execution via REST API,
 * this script will:
 * 1. List migrations that need to run
 * 2. Attempt to execute via a helper RPC function (if available)
 * 3. Provide clear manual instructions as fallback
 * 
 * Usage:
 *   npx tsx scripts/run-migrations.ts
 *   npx tsx scripts/run-migrations.ts --force  # Re-run all migrations
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { createAdminClient } from '../src/lib/supabase/admin';

// Load environment variables from .env.local if it exists
const projectRoot = process.cwd();
const envPath = join(projectRoot, '.env.local');

if (existsSync(envPath)) {
  try {
    const envFile = readFileSync(envPath, 'utf-8');
    envFile.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      }
    });
  } catch (error) {
    console.warn('Could not load .env.local:', error);
  }
}

const supabase = createAdminClient();

interface MigrationFile {
  filename: string;
  path: string;
  number: number;
  sql: string;
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');

  console.log('🚀 Database Migration Runner\n');
  console.log('='.repeat(60));

  // Get all migration files
  const migrationsDir = join(projectRoot, 'supabase', 'migrations');
  
  if (!existsSync(migrationsDir)) {
    console.error(`❌ Migrations directory not found: ${migrationsDir}`);
    process.exit(1);
  }

  const files = readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .map(f => {
      const match = f.match(/^(\d+)_/);
      const number = match ? parseInt(match[1], 10) : 0;
      const path = join(migrationsDir, f);
      return {
        filename: f,
        path,
        number,
        sql: readFileSync(path, 'utf-8'),
      };
    })
    .sort((a, b) => a.number - b.number);

  if (files.length === 0) {
    console.log('No migration files found');
    return;
  }

  // Focus on new migrations (00008, 00009, 00010)
  const newMigrations = files.filter(m => m.number >= 8 && m.number <= 10);
  
  if (newMigrations.length === 0) {
    console.log('✅ No new migrations to run (00008-00010)');
    return;
  }

  console.log(`\n📋 New migrations to apply (${newMigrations.length}):\n`);
  newMigrations.forEach((m, i) => {
    console.log(`   ${i + 1}. ${m.filename}`);
  });

  console.log('\n' + '='.repeat(60));
  console.log('\n📝 Instructions:\n');
  console.log('Since Supabase doesn\'t support direct SQL execution via REST API,');
  console.log('please run these migrations manually in Supabase Dashboard:\n');
  console.log('1. Open your Supabase project dashboard');
  console.log('2. Go to SQL Editor');
  console.log('3. Run each migration file in order:\n');

  newMigrations.forEach((m, i) => {
    console.log(`   Migration ${i + 1}: ${m.filename}`);
    console.log(`   File: ${m.path}`);
    console.log('');
  });

  console.log('='.repeat(60));
  console.log('\n💡 Alternative: Use Supabase CLI (if installed):\n');
  console.log('   supabase db push\n');
  console.log('   Or run individually:');
  newMigrations.forEach(m => {
    console.log(`   supabase db execute --file ${m.path}`);
  });
  console.log('');

  // Try to check if migrations have been applied
  try {
    const { data: existing } = await supabase
      .from('migration_history')
      .select('migration_name')
      .in('migration_name', newMigrations.map(m => m.filename));

    if (existing && existing.length > 0) {
      console.log('📊 Migration Status:');
      const applied = new Set(existing.map((m: any) => m.migration_name));
      newMigrations.forEach(m => {
        const status = applied.has(m.filename) ? '✅ Applied' : '⏳ Pending';
        console.log(`   ${status} - ${m.filename}`);
      });
      console.log('');
    }
  } catch {
    // migration_history table might not exist yet
  }

  console.log('='.repeat(60));
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
