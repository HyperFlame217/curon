const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const MEDIA_BUCKET = process.env.SUPABASE_MEDIA_BUCKET || 'curon-media';
const DB_BUCKET = process.env.SUPABASE_DB_BUCKET || 'curon-db';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.warn('[Supabase] SUPABASE_URL or SUPABASE_SERVICE_KEY not set — uploads will fail');
}

const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

function isConfigured() {
  return !!supabase;
}

async function upload(bucket, key, buffer, contentType) {
  if (!supabase) {
    console.warn(`[Supabase] Upload skipped for ${key} (client not initialized)`);
    return null;
  }
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(key, buffer, { contentType, upsert: true });
  if (error) throw new Error(`[Supabase] Upload failed: ${error.message}`);
  return data;
}

async function remove(bucket, keys) {
  if (!supabase) {
    console.warn(`[Supabase] Delete skipped (client not initialized)`);
    return null;
  }
  const keyList = Array.isArray(keys) ? keys : [keys];
  const { data, error } = await supabase.storage
    .from(bucket)
    .remove(keyList);
  if (error) throw new Error(`[Supabase] Delete failed: ${error.message}`);
  return data;
}

function getPublicUrl(bucket, key, options = {}) {
  if (!supabase) {
    return null; // Return null instead of throwing to allow local fallbacks
  }
  const { data } = supabase.storage
    .from(bucket)
    .getPublicUrl(key, options);
  return data.publicUrl;
}

async function list(bucket, prefix = '') {
  if (!supabase) return [];
  const { data, error } = await supabase.storage
    .from(bucket)
    .list(prefix, { limit: 1000 });
  if (error) throw new Error(`[Supabase] List failed: ${error.message}`);
  return data || [];
}

async function download(bucket, key) {
  if (!supabase) throw new Error('[Supabase] Client not initialized');
  const { data, error } = await supabase.storage
    .from(bucket)
    .download(key);
  if (error) throw new Error(`[Supabase] Download failed: ${error.message}`);
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

module.exports = {
  upload,
  remove,
  getPublicUrl,
  list,
  download,
  isConfigured,
  MEDIA_BUCKET,
  DB_BUCKET,
};