/* eslint-disable @typescript-eslint/no-require-imports */
// migrate_images.js
// This script migrates ALL image URLs in vehicles_for_chatbot
// away from partybusquotes.com → into your Supabase Storage bucket "vehicles"

const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

// Service role key loaded from environment variable for security
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error('Error: SUPABASE_SERVICE_ROLE_KEY environment variable is not set.');
  process.exit(1);
}

// DO NOT CHANGE ANYTHING ELSE BELOW ↓↓↓↓↓↓↓↓↓↓↓↓↓↓

const SUPABASE_URL = 'https://uxmiyfizeqbpeeikogre.supabase.co';
const BUCKET = 'vehicles';
const TABLE = 'vehicles_for_chatbot';

// Exact columns you told me:
const IMAGE_COLUMNS = ['image_main', 'image_2', 'image_3', 'gallery_all'];

const OLD_HOST = 'partybusquotes.com';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Splits pipe-separated gallery lists
function splitUrls(value) {
  if (!value) return [];
  return String(value)
    .split('|')
    .map(v => v.trim())
    .filter(v => v.length > 0);
}

function joinUrls(values) {
  return values.join('|');
}

function getFileNameFromUrl(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/');
    return parts[parts.length - 1] || 'image.png';
  } catch {
    return 'image.png';
  }
}

async function downloadImage(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function uploadToSupabase(path, buffer, contentType = 'image/png') {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { upsert: true, contentType });

  if (error) {
    throw new Error(`Upload error for ${path}: ${error.message}`);
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

async function migrateRow(row) {
  let changed = false;
  const updated = {};

  for (const col of IMAGE_COLUMNS) {
    const value = row[col];
    if (!value) continue;

    const urls = splitUrls(value);
    const newUrls = [];
    let changedCol = false;

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];

      // Skip images that already aren't from partybusquotes.com
      if (!url.includes(OLD_HOST)) {
        newUrls.push(url);
        continue;
      }

      try {
        console.log(`  Downloading ${url}`);
        const buffer = await downloadImage(url);
        const filename = getFileNameFromUrl(url);

        const safeTitle = (row.vehicle_title || 'vehicle')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');

        const idPart = row.id || safeTitle;
        const objectPath = `${idPart}/${col}-${i}-${filename}`;

        const newUrl = await uploadToSupabase(objectPath, buffer);
        console.log(`  Uploaded to ${newUrl}`);

        newUrls.push(newUrl);
        changedCol = true;
      } catch (err) {
        console.error(`  Error with ${url}: ${err.message}`);
        newUrls.push(url);
      }
    }

    if (changedCol) {
      updated[col] = joinUrls(newUrls);
      changed = true;
    }
  }

  if (changed) {
    console.log(`Updating row id=${row.id}`);
    const { error } = await supabase
      .from(TABLE)
      .update(updated)
      .eq('id', row.id);

    if (error) {
      console.error(`  Update failed for id=${row.id}: ${error.message}`);
    }
  } else {
    console.log(`No partybusquotes.com URLs for id=${row.id}`);
  }
}

async function migrateAll() {
  let from = 0;
  const pageSize = 200;

  while (true) {
    console.log(`\nFetching rows ${from}–${from + pageSize - 1}`);

    const fields = ['id', 'vehicle_title', ...IMAGE_COLUMNS].join(',');
    const { data, error } = await supabase
      .from(TABLE)
      .select(fields)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      console.error('Fetch error:', error.message);
      break;
    }

    if (!data || data.length === 0) {
      console.log('All done.');
      break;
    }

    for (const row of data) {
      console.log(`\nRow id=${row.id} (${row.vehicle_title})`);
      await migrateRow(row);
    }

    from += pageSize;
  }

  console.log('\nMigration complete.');
}

migrateAll().catch(err => console.error('Fatal error:', err));
