import { createClient } from '@supabase/supabase-js';

function normalizeUrl(url: string): string {
  let normalized = (url ?? '').trim();
  if (!normalized) return '';
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = `https://${normalized}`;
  }
  return normalized.replace(/\/+$/, '');
}

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
const rawKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '';

export const supabaseUrl = normalizeUrl(rawUrl);
export const supabaseAnonKey = rawKey.trim();

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
