/* eslint-disable @typescript-eslint/no-require-imports */
/*
 * Deduplicates image columns for every vehicle by combining image_main/image_2/image_3/gallery_all,
 * removing repeated URLs, and reassigning the first three unique links back to the main columns.
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const TABLE = 'vehicles_for_chatbot';
const PRIMARY_COLUMNS = ['image_main', 'image_2', 'image_3'];

function loadEnv() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return;
  }

  const envPath = path.join(__dirname, '.env.local');
  if (!fs.existsSync(envPath)) {
    throw new Error('Missing .env.local with Supabase credentials.');
  }

  const contents = fs.readFileSync(envPath, 'utf8');
  for (const line of contents.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
    const [key, ...rest] = line.split('=');
    const raw = rest.join('=').trim();
    const cleaned = raw.replace(/^['"](.*)['"]$/, '$1');
    if (!process.env[key]) {
      process.env[key] = cleaned;
    }
  }
}

loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase credentials.');
}

const supabase = createClient(supabaseUrl, supabaseKey);

const splitUrls = (value) => {
  if (!value) return [];
  return String(value)
    .split('|')
    .map((v) => v.trim())
    .filter(Boolean);
};

const joinUrls = (values) => values.join('|');

const photoKey = (url) => {
  try {
    const file = new URL(url).pathname.split('/').pop() ?? url;
    return file.replace(/^(?:image_(?:main|2|3)|gallery_all)-\d+-/i, '');
  } catch {
    return url;
  }
};

function selectImages(row) {
  const usedKeys = new Set();
  const selected = [];

  const tryAdd = (candidate) => {
    if (!candidate || selected.length >= PRIMARY_COLUMNS.length) return;
    splitUrls(candidate).forEach((url) => {
      if (selected.length >= PRIMARY_COLUMNS.length) return;
      const key = photoKey(url);
      if (usedKeys.has(key)) return;
      usedKeys.add(key);
      selected.push(url);
    });
  };

  // Always prioritize whatever is in image_main first
  tryAdd(row.image_main);

  const galleryList = splitUrls(row.gallery_all);
  const pool = [row.image_2, row.image_3, ...galleryList];
  pool.forEach((candidate) => tryAdd(candidate));

  const remaining = pool
    .flatMap((cand) => splitUrls(cand))
    .filter((url) => !selected.includes(url));

  return { selected, remaining };
}

async function processRow(row) {
  const { selected, remaining } = selectImages(row);
  const updates = {};
  let changed = false;

  PRIMARY_COLUMNS.forEach((col, idx) => {
    const nextValue = selected[idx] ?? null;
    const current = row[col] ?? null;
    if (current !== nextValue) {
      updates[col] = nextValue;
      changed = true;
    }
  });

  const nextGallery = remaining.length ? joinUrls(remaining) : null;
  const currentGallery = row.gallery_all ?? null;
  if (currentGallery !== nextGallery) {
    updates.gallery_all = nextGallery;
    changed = true;
  }

  if (!changed) {
    return;
  }

  console.log(`Updating ${row.id} (${row.vehicle_title})`);
  const { error } = await supabase.from(TABLE).update(updates).eq('id', row.id);
  if (error) {
    throw new Error(`Update failed for ${row.id}: ${error.message}`);
  }
}

async function main() {
  const pageSize = 200;
  let from = 0;

  while (true) {
    console.log(`Fetching rows ${from} - ${from + pageSize - 1}`);
    const { data, error } = await supabase
      .from(TABLE)
      .select(`id, vehicle_title, ${PRIMARY_COLUMNS.join(', ')}, gallery_all`)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(`Fetch error: ${error.message}`);
    }

    if (!data || data.length === 0) {
      break;
    }

    for (const row of data) {
      await processRow(row);
    }

    if (data.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  console.log('Normalization complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
