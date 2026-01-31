const SUPABASE_URL = 'https://rkznfraztzrkzednukoc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJrem5mcmF6dHpya3plZG51a29jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4MDMxNTMsImV4cCI6MjA4NTM3OTE1M30._rhPweVYw-xvZ09GMT8nn2tsUBT84GA0CEn3zNN9gAw'; // Bruk din eksisterande anon key

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
