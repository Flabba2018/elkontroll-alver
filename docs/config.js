const SUPABASE_URL = 'https://rkznfraztzrkzednukoc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'; // Din anon key

const APP_VERSION = '4.0.0-PRO';

let supabaseClient = null;
try {
  if (window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true
      }
    });
  }
} catch (e) {
  console.warn('⚠️ Supabase init feila:', e);
}

window.supabaseClient = supabaseClient;
