// SUPABASE KONFIGURASJON - ELKONTROLL ALVER
const SUPABASE_URL = 'https://rkznfraztzrkzednukoc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJrem5mcmF6dHpya3plZG51a29jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4MDMxNTMsImV4cCI6MjA4NTM3OTE1M30._rhPweVYw-xvZ09GMT8nn2tsUBT84GA0CEn3zNN9gAw';

const APP_VERSION = '3.2.0';

// Initialiser Supabase med feilhåndtering
let supabase;
try {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log(`✅ Elkontroll v${APP_VERSION} initialisert`);
} catch (e) {
    console.error('❌ Supabase kunne ikke lastes:', e);
}
