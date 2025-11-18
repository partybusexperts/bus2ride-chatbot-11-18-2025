import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // server-side only

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

export async function getVehiclesByZip(zip: string) {
  const { data, error } = await supabase
    .from('vehicles_for_chatbot')
    .select('*')
    .eq('zip', zip)
    .order('capacity', { ascending: true });

  if (error) {
    console.error('Supabase error:', error);
    throw error;
  }

  return data || [];
}
