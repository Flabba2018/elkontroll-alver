const SUPABASE_URL = 'https://rkznfraztzrkzednukoc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'; // Bruk din eksisterande anon key

const APP_VERSION = '4.1.0-ALVER-PRO';

let supabaseClient = null;
try {
  if (window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true
      }
    });
    console.log('✅ Supabase konfigurert');
  }
} catch (e) {
  console.warn('⚠️ Supabase init feila:', e);
}

window.supabaseClient = supabaseClient;
