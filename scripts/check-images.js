/* eslint-disable @typescript-eslint/no-require-imports */
/*
 * Quick helper for inspecting which image URLs are currently stored on each vehicle.
 * Usage:
 *   node scripts/check-images.js [limit] [cityPrefix]
 * Example:
 *   node scripts/check-images.js 10 Phoenix
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

function ensureEnvLoaded() {
	if (process.env.NEXT_PUBLIC_SUPABASE_URL &&
			(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)) {
		return;
	}

	const envPath = path.join(__dirname, '..', '.env.local');
	if (!fs.existsSync(envPath)) {
		return;
	}

	const contents = fs.readFileSync(envPath, 'utf8');
	for (const line of contents.split(/\r?\n/)) {
		if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
			const [key, ...rest] = line.split('=');
			if (!process.env[key] && key) {
				const raw = rest.join('=').trim();
				const cleaned = raw.replace(/^['"](.*)['"]$/, '$1');
				process.env[key] = cleaned;
		}
	}
}

ensureEnvLoaded();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
	console.error('Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
	process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
	const limit = Number(process.argv[2] ?? '5');
	const cityPrefix = process.argv[3];

		let query = supabase
			.from('vehicles_for_chatbot')
			.select('id, vehicle_title, city, image_main, image_2, image_3, gallery_all')
		.limit(Number.isFinite(limit) && limit > 0 ? limit : 5);

	if (cityPrefix) {
		query = query.ilike('city', `${cityPrefix}%`);
	}

	const { data, error } = await query;
	if (error) {
		console.error('Supabase error:', error.message);
		process.exit(1);
	}

	if (!data || data.length === 0) {
		console.log('No rows matched the provided criteria.');
		return;
	}

	for (const row of data) {
		console.log(`\n${row.vehicle_title} (${row.city ?? 'City unknown'}) [${row.id}]`);
			['image_main', 'image_2', 'image_3'].forEach((field) => {
			const value = row[field];
			if (!value) {
				console.log(`  ${field}: (empty)`);
				return;
			}
			const host = (() => {
				try {
					return new URL(value).host;
				} catch {
					return 'invalid-url';
				}
			})();
					console.log(`  ${field}: ${value} [${host}]`);
		});

				if (row.gallery_all) {
					const galleryItems = row.gallery_all.split('|').filter(Boolean);
					console.log(`  gallery_all count: ${galleryItems.length}`);
					console.log(`  gallery_all sample: ${galleryItems.slice(0, 3).join(' | ')}`);
				} else {
					console.log('  gallery_all: (empty)');
				}
	}
}

main().catch((err) => {
	console.error('Unexpected error:', err);
	process.exit(1);
});
