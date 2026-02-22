const fs = require('fs');

for (const l of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z_]+)=(.*)/);
  if (m) process.env[m[1]] = m[2].trim();
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  // Try to create via Supabase Management API / SQL endpoint
  const sql = `
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
  `;

  // Try the /rest/v1/rpc route (won't work without a function)
  // Instead, try inserting directly — if the table exists it'll work,
  // if not we need to create it via the Supabase dashboard
  const { createClient } = require('@supabase/supabase-js');
  const s = createClient(url, key);

  // Check if table exists by trying to query it
  const { error } = await s.from('app_settings').select('key').limit(1);

  if (error) {
    console.log('Table does not exist yet. Creating via SQL API...');

    // Use the Supabase SQL API (available with service role key)
    const sqlUrl = `${url}/rest/v1/`;
    
    // Try using the pg_net extension or direct query
    // Actually, the simplest approach: use the Supabase client to upsert into a table
    // that we create on first use. Let's try the query endpoint.
    const resp = await fetch(`${url}/rest/v1/rpc/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
        'apikey': key,
      },
      body: JSON.stringify({}),
    });
    
    console.log('');
    console.log('=== ACTION REQUIRED ===');
    console.log('Go to your Supabase dashboard:');
    console.log(`  ${url.replace('.supabase.co', '.supabase.co')}`);
    console.log('');
    console.log('Click "SQL Editor" and run this SQL:');
    console.log('');
    console.log(sql);
    console.log('');
    console.log('Then re-run this script to verify.');
  } else {
    console.log('app_settings table exists!');
    
    // Test insert
    const { error: upsertErr } = await s
      .from('app_settings')
      .upsert({ key: '_test', value: { test: true }, updated_at: new Date().toISOString() });
    
    if (upsertErr) {
      console.log('Upsert test failed:', upsertErr.message);
    } else {
      console.log('Upsert test passed!');
      // Clean up
      await s.from('app_settings').delete().eq('key', '_test');
      console.log('Ready to use.');
    }
  }
}

main().catch(console.error);
