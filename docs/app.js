// ============================================
// ELKONTROLL APP - ALVER KOMMUNE
// Med Supabase database-integrasjon
// ============================================

const STORAGE_KEY = 'elkontroll_';

// Intern referanse til Supabase-klient
// Brukar unikt namn for å unngå konflikt med window.supabase frå CDN
var _sbClient = null;

// Fallback dersom config.js ikkje lastar (GitHub Pages / caching / path)
const APP_VERSION_SAFE = (typeof APP_VERSION === 'string' && APP_VERSION.trim()) ? APP_VERSION : 'dev';

// Enkel timeout-wrapper for nettverkskall (unngå "lilla skjerm" ved heng)
function withTimeout(promise, ms, label = 'request') {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout (${label}) etter ${ms}ms`)), ms))
  ]);
}

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeClassName(value, fallback = '') {
  const cleaned = String(value || '').replace(/[^a-z0-9_-]/gi, '');
  return cleaned || fallback;
}

function ensureSupabaseReady() {
  if (window.supabase && typeof window.supabase.createClient === 'function') {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
    script.onload = () => resolve(!!window.supabase);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
}

function getSupabaseClient() {
  if (_sbClient && typeof _sbClient.from === 'function') return _sbClient;
  if (window.supabaseClient && typeof window.supabaseClient.from === 'function') {
    _sbClient = window.supabaseClient;
    return _sbClient;
  }
  if (window.supabase && typeof window.supabase.createClient === 'function' && typeof SUPABASE_URL === 'string') {
    try {
      _sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      window.supabaseClient = _sbClient;
      return _sbClient;
    } catch (e) {
      console.warn('⚠️ Supabase init feila:', e);
    }
  }
  return null;
}

function renderFatalError(err) {
  const app = document.getElementById('app');
  if (!app) return;
  const msg = escapeHTML((err && (err.stack || err.message)) ? (err.stack || err.message) : String(err));
  app.innerHTML = `
    <div class="app">
      <div class="content">
        <div class="card" style="border-color:var(--danger);">
          <h3 style="color:var(--danger);">❌ App-feil</h3>
          <p style="color:var(--text-muted);font-size:12px;line-height:1.5;">
            Dette er feilmeldinga frå nettlesaren. Kopiér og send til utvikling/IKT:
          </p>
          <pre style="white-space:pre-wrap;word-break:break-word;background:var(--bg-dark);border:1px solid var(--border);padding:10px;border-radius:10px;font-size:11px;line-height:1.4;">${msg}</pre>
          <button class="btn btn-secondary" id="retryBtn">🔄 Prøv igjen</button>
        </div>
      </div>
    </div>
  `;
  const btn = document.getElementById('retryBtn');
  if (btn) btn.onclick = () => location.reload();
}

// Fang ukjende feil og vis dei på skjerm
window.addEventListener('error', (e) => {
  // Unngå å spamme dersom renderFatalError alt er vist
  console.error('Global error:', e.error || e.message);
  renderFatalError(e.error || e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled rejection:', e.reason);
  renderFatalError(e.reason);
});

// Standard sjekkpunkt
// Sjekkpunkt frå MAL_ELKONTROLL.doc (KAP.5.4)
const defaultItems = [
  // SIDE 1 - Inntak, Fordelinger, Målinger, Jording
  { id: '1.1', cat: 'Inntak', catNum: 1, text: 'Inntakskabel er betryggende festet til underlag og er fri for skader' },
  { id: '1.2', cat: 'Inntak', catNum: 1, text: 'Er kabel beskyttet med halvrør eller likn? (ute på vegg)' },
  { id: '1.3', cat: 'Inntak', catNum: 1, text: 'Er kapslingsgrad/avdekking ivaretatt? (Usakkyndig=IP2XC/IP3X, Sakkyndig=IP2X)' },
  { id: '2.1', cat: 'Fordelinger', catNum: 2, text: 'Fordeling/sikringsskap er merket med nr./navn og nominell spenning' },
  { id: '2.2', cat: 'Fordelinger', catNum: 2, text: 'Fordeling er merket med skilt på dør dersom kun for sakkyndig/instruert personell' },
  { id: '2.3', cat: 'Fordelinger', catNum: 2, text: 'Kursfortegnelse er oppdatert' },
  { id: '2.4', cat: 'Fordelinger', catNum: 2, text: 'Alle komponenter er tilfredsstillende merket' },
  { id: '2.5', cat: 'Fordelinger', catNum: 2, text: 'Er vern riktig montert/innstilt iht. ledertverrsnitt og leverandørens spesifikasjoner' },
  { id: '2.6', cat: 'Fordelinger', catNum: 2, text: 'Er kabelgjennomføringer og branntetting OK?' },
  { id: '2.7', cat: 'Fordelinger', catNum: 2, text: 'Bruksanvisning til jordfeilbryter/varsling er montert' },
  { id: '2.8', cat: 'Fordelinger', catNum: 2, text: 'Overspenningsvern er kontrollert og OK' },
  { id: '2.9', cat: 'Fordelinger', catNum: 2, text: 'Kontrollert varmgang i tilkoblinger, utstyr og ledere' },
  { id: '2.10', cat: 'Fordelinger', catNum: 2, text: 'Aluminiumstilkoblinger er utført riktig' },
  { id: '2.11', cat: 'Fordelinger', catNum: 2, text: 'Jordfeilbrytere/jordfeilautomater testes og er sjekket riktig kurs og størrelse' },
  { id: '3.1', cat: 'Målinger', catNum: 3, text: 'Isolasjonsmåling utført (før 01.01.99: >0,23 MΩ, etter: >0,5 MΩ)' },
  { id: '3.2', cat: 'Målinger', catNum: 3, text: 'Spenningsmåling' },
  { id: '3.3', cat: 'Målinger', catNum: 3, text: 'Kontinuitetsmåling av jord og utjevningsforbindelser' },
  { id: '4.1', cat: 'Jording', catNum: 4, text: 'Hovedjord og utjevningsforbindelser er riktig utført og merket' },
  { id: '4.2', cat: 'Jording', catNum: 4, text: 'Kontroller at det er kun ein jordleder under kvar tilkobling' },
  { id: '4.3', cat: 'Jording', catNum: 4, text: 'Jordelektroder er montert og dokumentert' },
  { id: '4.4', cat: 'Jording', catNum: 4, text: 'Kontroller at det ikkje er jordet og ujordet installasjon i samme rom' },
  { id: '4.5', cat: 'Jording', catNum: 4, text: 'Er det foretatt kontinuitetsmåling, og i så fall er verdier OK?' },
  // SIDE 2 - Generelt, Varmekabel, Våtrom, Utvendig
  { id: '5.1', cat: 'Generelt', catNum: 5, text: 'Kabler er betryggende festet og mekanisk beskyttet' },
  { id: '5.2', cat: 'Generelt', catNum: 5, text: 'Kabelgjennomføringer er forskriftsmessig tettet med godkjent produkt' },
  { id: '5.3', cat: 'Generelt', catNum: 5, text: 'Alt materiell og utstyr er av godkjent kvalitet' },
  { id: '5.4', cat: 'Generelt', catNum: 5, text: 'Skjøteledninger er i forskriftsmessig stand' },
  { id: '5.5', cat: 'Generelt', catNum: 5, text: 'Utstyr som ikkje er i bruk, er i forskriftsmessig stand eller frakoblet' },
  { id: '5.6', cat: 'Generelt', catNum: 5, text: 'Belysning er kontrollert for varmgang, funksjonalitet og renhold' },
  { id: '5.7', cat: 'Generelt', catNum: 5, text: 'Ovner har tilstrekkelig/god avstand til brennbart materiale' },
  { id: '5.8', cat: 'Generelt', catNum: 5, text: 'Flyttbare varmeovner er godkjent' },
  { id: '5.9', cat: 'Generelt', catNum: 5, text: 'Sjekk VVB tilkoblinger, stikk, støpsel, kabel og koblingshus' },
  { id: '6.1', cat: 'Varmekabelanlegg', catNum: 6, text: 'Skjult varme har forankoblet jordfeilbryter 30mA' },
  { id: '6.2', cat: 'Varmekabelanlegg', catNum: 6, text: 'Forskriftsmessig montert' },
  { id: '6.3', cat: 'Varmekabelanlegg', catNum: 6, text: 'Varmeanlegget er korrekt merket og dokumentert' },
  { id: '6.4', cat: 'Varmekabelanlegg', catNum: 6, text: 'Utvendige anlegg er merket med lett synlig skilt som angir anleggets utstrekning' },
  { id: '6.5', cat: 'Varmekabelanlegg', catNum: 6, text: 'Kontroller at deler av anlegget ikkje er udekket' },
  { id: '6.6', cat: 'Varmekabelanlegg', catNum: 6, text: 'Foreta jordfeilmåling av anlegget, noter måleresultat' },
  { id: '7.1', cat: 'Våtrom', catNum: 7, text: 'Kapslingsgrad er ivaretatt' },
  { id: '7.2', cat: 'Våtrom', catNum: 7, text: 'Soneinndeling er ivaretatt' },
  { id: '7.3', cat: 'Våtrom', catNum: 7, text: '30 mA jordfeilbryter er montert, testet og merket' },
  { id: '7.4', cat: 'Våtrom', catNum: 7, text: 'Brytere har allpolig brudd' },
  { id: '7.5', cat: 'Våtrom', catNum: 7, text: 'Lavvoltutstyr er forskriftsmessig montert og dokumentert' },
  { id: '8.1', cat: 'Utvendige anlegg', catNum: 8, text: 'Brytere er forskriftsmessig montert og er allpolig' },
  { id: '8.2', cat: 'Utvendige anlegg', catNum: 8, text: 'Kabler over terreng er tilstrekkelig mekanisk beskyttet og fri for skade' },
  { id: '8.3', cat: 'Utvendige anlegg', catNum: 8, text: 'Det er montert 30mA jordfeilbryter for stikkontakter' },
  { id: '8.4', cat: 'Utvendige anlegg', catNum: 8, text: 'Kapslingsgrad og høyde over bakke er ivaretatt' },
  { id: '8.5', cat: 'Utvendige anlegg', catNum: 8, text: 'Utjevning/jordelektrode er korrekt utført' },
  { id: '8.6', cat: 'Utvendige anlegg', catNum: 8, text: 'Kabler i bakken er godkjent for dette' },
  { id: '8.7', cat: 'Utvendige anlegg', catNum: 8, text: 'Luftledninger har tilstrekkelig høgde og er av godkjent type' }
];

const categories = [
  { num: 1, name: 'Inntak', page: 1 },
  { num: 2, name: 'Fordelinger', page: 1 },
  { num: 3, name: 'Målinger', page: 1 },
  { num: 4, name: 'Jording', page: 1 },
  { num: 5, name: 'Generelt', page: 2 },
  { num: 6, name: 'Varmekabelanlegg', page: 2 },
  { num: 7, name: 'Våtrom', page: 2 },
  { num: 8, name: 'Utvendige anlegg', page: 2 }
];

const photoTypes = ['Sikringsskap', 'Kursfortegnelse', 'Oversikt', 'Avvik', 'Anna'];
const unitSuffixes = ['H0101','H0102','H0103','H0201','H0202','H0203','H0301','H0302','Leil. A','Leil. B','Leil. C','Kjellar','Loft','Garasje'];

// ============================================
// STATE
// ============================================
let state = {
  isLoggedIn: false,
  currentUser: null,
  users: [],
  view: 'login',
  items: [],
  photos: [],
  form: {
    address: '', suffix: '', workOrder: '',
    date: new Date().toISOString().split('T')[0],
    voltage: '', insulation: '', continuity: '', rcd: '',
    summary: '', errorsFixed: false, maintenance: false, sentInstaller: false,
    isExternal: false, externalFirma: '', externalContact: ''
  },
  expanded: { 1: true },
  inspections: [],
  search: '',
  viewInspection: null,
  modal: null,
  toast: null,
  isOnline: navigator.onLine,
  pendingSync: [],
  isSyncing: false,
  isLoading: true,
  // brukt for å "hoppe" til neste sjekkpunkt (IA)
  scrollToItemId: null,
  localInspections: [],
  lastSyncError: null,
  cancelSyncRequested: false
};

// ============================================
// LOCAL STORAGE
// ============================================
function saveLocal(k, d) {
  try { localStorage.setItem(STORAGE_KEY + k, JSON.stringify(d)); } catch(e) {}
}
function loadLocal(k, def) {
  try { const d = localStorage.getItem(STORAGE_KEY + k); return d ? JSON.parse(d) : def; } catch(e) { return def; }
}

function isBlank(s) { return !s || !String(s).trim(); }
function isAutoIA(s) { return String(s || '').trim().toUpperCase() === 'IA'; }
function isAutoOK(s) { return String(s || '').trim().toUpperCase() === 'OK'; }

// Auto-tekst i kommentar: IA/OK utan å overskrive brukar-tekst
function applyAutoComment(item) {
  if (!item) return;

  // IA har alltid prioritet
  if (item.ia) {
    if (isBlank(item.comment) || isAutoOK(item.comment)) item.comment = 'IA';
    return;
  }

  // Avvik: fjern auto-OK, men ikkje rør brukar-tekst
  if (item.deviation) {
    if (isAutoOK(item.comment)) item.comment = '';
    return;
  }

  // OK: berre viss punktet er avkryssa og kommentaren er tom/auto
  if (item.checked) {
    if (isBlank(item.comment) || isAutoOK(item.comment) || isAutoIA(item.comment)) item.comment = 'OK';
  } else {
    // ikkje avkryssa: rydd auto-OK/auto-IA
    if (isAutoOK(item.comment) || isAutoIA(item.comment)) item.comment = '';
  }
}

function removeLocalInspection(localId) {
  if (!localId) return;
  const locals = loadLocal('inspections_local', []);
  const next = locals.filter(i => i.localId !== localId);
  saveLocal('inspections_local', next);
  state.localInspections = next;
}

function loadLocalInspections() {
  state.localInspections = loadLocal('inspections_local', []);
}

function clearLocalData() {
  try {
    Object.keys(localStorage)
      .filter(key => key.startsWith(STORAGE_KEY))
      .forEach(key => localStorage.removeItem(key));
  } catch (e) {
    console.warn('⚠️ Kunne ikkje slette lokal data:', e);
  }
}

// ============================================
// SUPABASE FUNCTIONS
// ============================================
async function fetchUsers() {
  try {
    const client = getSupabaseClient();
    if (!state.isOnline) throw new Error('Offline');
    if (!client) throw new Error('Supabase ikkje aktiv');
    const query = client
      .from('users')
      .select('*')
      .eq('active', true)
      .order('name');
    const { data, error } = await withTimeout(query, 8000, 'fetchUsers');
    
    if (error) throw error;
    state.users = data || [];
    console.log('✅ Henta brukarar:', state.users.length);
  } catch (e) {
    console.error('❌ Feil ved henting av brukarar:', e);
    // Fallback til lokale brukarar
    state.users = loadLocal('users', [
      { id: '1', name: 'Cato', role: 'admin' },
      { id: '2', name: 'Kristian', role: 'user' },
      { id: '3', name: 'Bjørn Inge', role: 'user' }
    ]);
  }
}

async function fetchInspections() {
  try {
    const client = getSupabaseClient();
    if (!state.isOnline) throw new Error('Offline');
    if (!client) throw new Error('Supabase ikkje aktiv');
    const query = client
      .from('inspections')
      .select('*')
      .order('inspection_date', { ascending: false })
      .limit(100);
    const { data, error } = await withTimeout(query, 8000, 'fetchInspections');
    
    if (error) throw error;
    state.inspections = data || [];
    saveLocal('inspections', state.inspections);
    console.log('✅ Henta kontrollar:', state.inspections.length);
  } catch (e) {
    console.error('❌ Feil ved henting av kontrollar:', e);
    state.inspections = loadLocal('inspections', []);
  }
}

async function saveInspectionToSupabase(inspection) {
  try {
    const client = getSupabaseClient();
    if (!client) throw new Error('Supabase ikkje aktiv');
    // 1. Lagre hovud-inspeksjon
    const { data: inspData, error: inspError } = await withTimeout(
      client
        .from('inspections')
        .insert({
        address: inspection.address,
        suffix: inspection.suffix,
        full_address: inspection.fullAddress,
        user_id: (inspection.userId && inspection.userId.includes('-')) ? inspection.userId : 
                 (state.currentUser?.id && state.currentUser.id.includes('-')) ? state.currentUser.id : null,
        inspection_date: inspection.date,
        work_order: inspection.workOrder || null,
        is_external: inspection.form.isExternal,
        external_firma: inspection.form.externalFirma || null,
        external_contact: inspection.form.externalContact || null,
        voltage: inspection.form.voltage || null,
        insulation: inspection.form.insulation || null,
        continuity: inspection.form.continuity || null,
        rcd_test: inspection.form.rcd || null,
        errors_fixed: inspection.form.errorsFixed,
        maintenance_noted: inspection.form.maintenance,
        sent_installer: inspection.form.sentInstaller,
        summary: inspection.form.summary || null,
        total_items: inspection.items.length,
        checked_items: inspection.items.filter(i => i.checked).length,
        deviation_count: inspection.items.filter(i => i.deviation).length,
        corrected_count: inspection.items.filter(i => i.corrected).length,
        progress: inspection.progress
        })
        .select()
        .single(),
      12000,
      'insert inspections'
    );
    
    if (inspError) throw inspError;
    
    const inspectionId = inspData.id;
    
    // 2. Lagre sjekkpunkt
    const itemsToInsert = inspection.items.map(item => ({
      inspection_id: inspectionId,
      item_id: item.id,
      category: item.cat,
      category_num: item.catNum,
      item_text: item.text,
      checked: item.checked,
      deviation: item.deviation,
      corrected: item.corrected,
      requires_installer: item.installer,
      comment: item.comment || null
    }));
    
    const { error: itemsError } = await withTimeout(
      client.from('inspection_items').insert(itemsToInsert),
      12000,
      'insert inspection_items'
    );
    
    if (itemsError) throw itemsError;
    
    // 3. Lagre bilete (viss det finst)
    if (inspection.photos && inspection.photos.length > 0) {
      const photosToInsert = inspection.photos.map(photo => ({
        inspection_id: inspectionId,
        photo_type: photo.type.toLowerCase(),
        photo_data: photo.data,
        description: null
      }));
      
      const { error: photosError } = await withTimeout(
        client.from('inspection_photos').insert(photosToInsert),
        15000,
        'insert inspection_photos'
      );
      
      if (photosError) console.error('Bilete-feil:', photosError);
    }
    
    // 4. Lagre avvik
    const deviations = inspection.items.filter(i => i.deviation);
    if (deviations.length > 0) {
      const devsToInsert = deviations.map(dev => ({
        inspection_id: inspectionId,
        item_id: dev.id,
        item_text: dev.text,
        comment: dev.comment || null,
        corrected: dev.corrected,
        requires_installer: dev.installer
      }));
      
      const { error: devsError } = await withTimeout(
        client.from('deviations').insert(devsToInsert),
        12000,
        'insert deviations'
      );
      
      if (devsError) console.error('Avvik-feil:', devsError);
    }
    
    console.log('✅ Lagra til Supabase:', inspectionId);
    return inspectionId;
    
  } catch (e) {
    console.error('❌ Supabase lagring feila:', e);
    throw e;
  }
}

async function syncPendingData(force = false) {
  if (!state.isOnline) return;
  await ensureSupabaseReady();
  const client = getSupabaseClient();
  if (!client) {
    state.lastSyncError = 'Supabase ikkje aktiv (manglar config/CDN?)';
    showToast('❌ Kan ikkje synke: Supabase ikkje aktiv', 'warning');
    render();
    return;
  }
  if (state.isSyncing) return;
  if (!force && state.pendingSync.length === 0) return;

  state.isSyncing = true;
  state.cancelSyncRequested = false;
  state.lastSyncError = null;
  render();

  const pending = [...state.pendingSync];
  const syncedIds = [];
  const errors = [];

  try {
    for (const item of pending) {
      if (state.cancelSyncRequested) break;

      try {
        await withTimeout(
          saveInspectionToSupabase(item),
          20000,
          `sync ${item.fullAddress || item.address || item.localId}`
        );
        syncedIds.push(item.localId);
        removeLocalInspection(item.localId);
      } catch (e) {
        const msg = (e && (e.message || e.toString())) ? (e.message || e.toString()) : 'Ukjend feil';
        errors.push({ localId: item.localId, address: item.fullAddress || item.address || '', msg });
        console.error('❌ Synk feila for:', item.localId, msg);
      }
    }
  } finally {
    if (syncedIds.length > 0) {
      state.pendingSync = state.pendingSync.filter(p => !syncedIds.includes(p.localId));
      saveLocal('pendingSync', state.pendingSync);
    } else {
      saveLocal('pendingSync', state.pendingSync);
    }
    state.isSyncing = false;
    render();
  }

  if (state.cancelSyncRequested) {
    showToast('⛔ Synk stoppa', 'warning');
    return;
  }

  if (syncedIds.length > 0) {
    showToast(`✅ Synkroniserte ${syncedIds.length} kontroll(ar)`);
    await fetchInspections();
  }

  if (errors.length > 0) {
    state.lastSyncError = errors[0].msg;
    showToast(`❌ Synk feila (${errors.length}). Prøv igjen`, 'warning');
    render();
  }
}

// ============================================
// ADMIN FUNCTIONS
// ============================================
async function deleteAllInspections() {
  try {
    const client = getSupabaseClient();
    if (!client) throw new Error('Supabase ikkje aktiv');
    
    // Slett i riktig rekkefølge (foreign keys)
    showToast('🗑️ Slettar kontrollar...', 'warning');
    
    await client.from('deviations').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await client.from('inspection_photos').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await client.from('inspection_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await client.from('inspections').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    
    state.inspections = [];
    showToast('✅ Alle kontrollar sletta', 'success');
    console.log('✅ Alle kontrollar sletta frå database');
    render();
  } catch (e) {
    console.error('❌ Feil ved sletting:', e);
    showToast('❌ Kunne ikkje slette: ' + (e.message || e), 'warning');
  }
}

async function deleteInspection(inspectionId) {
  try {
    const client = getSupabaseClient();
    if (!client) throw new Error('Supabase ikkje aktiv');
    
    // Slett relaterte data først
    await client.from('deviations').delete().eq('inspection_id', inspectionId);
    await client.from('inspection_photos').delete().eq('inspection_id', inspectionId);
    await client.from('inspection_items').delete().eq('inspection_id', inspectionId);
    await client.from('inspections').delete().eq('id', inspectionId);
    
    // Oppdater lokal state
    state.inspections = state.inspections.filter(i => i.id !== inspectionId);
    state.viewInspection = null;
    state.view = 'search';
    
    showToast('✅ Kontroll sletta', 'success');
    console.log('✅ Kontroll sletta:', inspectionId);
    render();
  } catch (e) {
    console.error('❌ Feil ved sletting:', e);
    showToast('❌ Kunne ikkje slette: ' + (e.message || e), 'warning');
  }
}

async function updateUserRole(userId, newRole) {
  try {
    const client = getSupabaseClient();
    if (!client) throw new Error('Supabase ikkje aktiv');
    
    const { error } = await client
      .from('users')
      .update({ role: newRole })
      .eq('id', userId);
    
    if (error) throw error;
    
    // Oppdater lokal state
    const user = state.users.find(u => u.id === userId);
    if (user) user.role = newRole;
    
    showToast(`✅ Rolle oppdatert til ${newRole}`, 'success');
    console.log('✅ Rolle oppdatert:', userId, newRole);
    render();
  } catch (e) {
    console.error('❌ Feil ved oppdatering:', e);
    showToast('❌ Kunne ikkje oppdatere: ' + (e.message || e), 'warning');
  }
}

async function addNewUser(name, role = 'user') {
  try {
    const client = getSupabaseClient();
    if (!client) throw new Error('Supabase ikkje aktiv');
    
    const { data, error } = await client
      .from('users')
      .insert({ name, role, active: true })
      .select()
      .single();
    
    if (error) throw error;
    
    state.users.push(data);
    state.modal = null;
    
    showToast(`✅ Brukar "${name}" lagt til`, 'success');
    console.log('✅ Ny brukar:', data);
    render();
  } catch (e) {
    console.error('❌ Feil ved opprettelse:', e);
    showToast('❌ Kunne ikkje legge til: ' + (e.message || e), 'warning');
  }
}

// ============================================
// INIT
// ============================================
async function init() {
  try {
    state.isLoading = true;
    state.pendingSync = loadLocal('pendingSync', []);
    loadLocalInspections();
    render(); // vis spinner med ein gong

    // Sjekk innlogging
    const savedUser = loadLocal('currentUser', null);

    // Hent data (med timeout og offline-fallback)
    await ensureSupabaseReady();
    await fetchUsers();
    await fetchInspections();

    if (savedUser && state.users.find(u => u.id === savedUser.id)) {
      state.currentUser = savedUser;
      state.isLoggedIn = true;
      state.view = 'home';
    }

    resetForm();
    state.isLoading = false;
    render();

    // Synk pending data
    if (state.isOnline) {
      syncPendingData();
    }
  } catch (e) {
    console.error('❌ Init-feil:', e);
    state.isLoading = false;
    renderFatalError(e);
  }
}

function resetForm() {
  state.items = defaultItems.map(i => ({
    ...i,
    checked: false,
    // "IA" = ikkje aktuelt (teller som behandla, men ikkje avvik)
    ia: false,
    comment: '',
    deviation: false,
    corrected: false,
    installer: false
  }));
  state.photos = [];
  state.form = {
    address: '', suffix: '', workOrder: '',
    date: new Date().toISOString().split('T')[0],
    voltage: '', insulation: '', continuity: '', rcd: '',
    summary: '', errorsFixed: false, maintenance: false, sentInstaller: false,
    isExternal: false, externalFirma: '', externalContact: ''
  };
  state.expanded = { 1: true };
}

// ============================================
// HELPERS
// ============================================
function getFullAddress() {
  return state.form.suffix ? `${state.form.address} - ${state.form.suffix}` : state.form.address;
}
function getProgress() {
  return Math.round((state.items.filter(i => i.checked).length / state.items.length) * 100);
}
function getDeviations() {
  return state.items.filter(i => i.deviation);
}
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}
function showToast(msg, type = 'success') {
  state.toast = { msg, type };
  render();
  setTimeout(() => { state.toast = null; render(); }, 3000);
}

// Online/Offline
window.addEventListener('online', () => {
  state.isOnline = true;
  render();
  syncPendingData();
});
window.addEventListener('offline', () => {
  state.isOnline = false;
  render();
});

// ============================================
// SAVE INSPECTION
// ============================================
async function saveInspection(download = false) {
  const inspection = {
    localId: genId(),
    fullAddress: getFullAddress(),
    address: state.form.address,
    suffix: state.form.suffix,
    date: state.form.date,
    user: state.currentUser.name,
    userId: state.currentUser.id,
    workOrder: state.form.workOrder,
    items: JSON.parse(JSON.stringify(state.items)),
    photos: [...state.photos],
    form: JSON.parse(JSON.stringify(state.form)),
    deviationCount: getDeviations().length,
    progress: getProgress(),
    timestamp: new Date().toISOString()
  };

  // 1) Lagre lokalt først (alltid)
  const localInspections = loadLocal('inspections_local', []);
  localInspections.unshift(inspection);
  const trimmed = localInspections.slice(0, 50);
  saveLocal('inspections_local', trimmed);
  state.localInspections = trimmed;

  // 2) Last ned Word umiddelbart ved behov (ikkje vent på synk)
  if (download) {
    try { downloadWord(inspection); } catch (e) { console.error('Word-feil:', e); }
  }

  // 3) Legg i synk-kø og prøv synk dersom online
  const pending = loadLocal('pendingSync', []);
  pending.unshift(inspection);
  const seen = new Set();
  const deduped = pending.filter(i => (seen.has(i.localId) ? false : seen.add(i.localId)));
  state.pendingSync = deduped;
  saveLocal('pendingSync', state.pendingSync);

  if (state.isOnline) {
    syncPendingData(true).catch(e => console.error('Synk-feil:', e));
    showToast('💾 Lagra lokalt - prøver å synke', 'warning');
  } else {
    showToast('💾 Lagra lokalt (offline)', 'warning');
  }

  state.modal = null;
  resetForm();
  state.view = 'home';
  render();
}

// ============================================
// WORD GENERATION - MAL_ELKONTROLL.doc FORMAT
// KAP.5.4 Internkontroll Elektro - Alver Kommune
// ============================================
function generateWordHTML(insp) {
  const items = insp.items || [];
  const devs = items.filter(i => i.deviation);
  const form = insp.form || {};
  const fullAddr = insp.full_address || insp.fullAddress || '';
  const inspDate = insp.inspection_date || insp.date || '';
  const inspector = insp.user || state.currentUser?.name || '';
  const workOrder = insp.work_order || insp.workOrder || '';
  const unit = form.unit || insp.unit || 'Teknisk Forvaltning og Drift';
  
  // Hjelpefunksjon for avkryssingsboks
  const check = (val) => val ? '☑' : '☐';
  
  // Generer rader for side 1 (Inntak, Fordelinger, Målinger, Jording)
  const page1Cats = [1, 2, 3, 4];
  let page1Rows = '';
  page1Cats.forEach(catNum => {
    const catItems = items.filter(i => i.catNum === catNum);
    const catName = categories.find(c => c.num === catNum)?.name || '';
    if (catItems.length > 0) {
      page1Rows += `<tr style="background:#d9d9d9;"><td colspan="5" style="border:1px solid #000;padding:3px;font-weight:bold;">${catName}</td></tr>`;
      catItems.forEach(item => {
        page1Rows += `<tr>
          <td style="border:1px solid #000;padding:2px;font-size:9pt;">${item.text || item.item_text}</td>
          <td style="border:1px solid #000;text-align:center;width:30px;font-size:10pt;">${check(item.checked && !item.deviation)}</td>
          <td style="border:1px solid #000;text-align:center;width:30px;font-size:10pt;">${check(item.deviation)}</td>
          <td style="border:1px solid #000;text-align:center;width:40px;font-size:10pt;">${check(item.corrected)}</td>
          <td style="border:1px solid #000;text-align:center;width:50px;font-size:10pt;">${check(item.installer || item.requires_installer)}</td>
        </tr>`;
      });
    }
  });
  
  // Generer rader for side 2 (Generelt, Varmekabel, Våtrom, Utvendig)
  const page2Cats = [5, 6, 7, 8];
  let page2Rows = '';
  page2Cats.forEach(catNum => {
    const catItems = items.filter(i => i.catNum === catNum);
    const catName = categories.find(c => c.num === catNum)?.name || '';
    if (catItems.length > 0) {
      page2Rows += `<tr style="background:#d9d9d9;"><td colspan="5" style="border:1px solid #000;padding:3px;font-weight:bold;">${catName}</td></tr>`;
      catItems.forEach(item => {
        page2Rows += `<tr>
          <td style="border:1px solid #000;padding:2px;font-size:9pt;">${item.text || item.item_text}</td>
          <td style="border:1px solid #000;text-align:center;width:30px;font-size:10pt;">${check(item.checked && !item.deviation)}</td>
          <td style="border:1px solid #000;text-align:center;width:30px;font-size:10pt;">${check(item.deviation)}</td>
          <td style="border:1px solid #000;text-align:center;width:40px;font-size:10pt;">${check(item.corrected)}</td>
          <td style="border:1px solid #000;text-align:center;width:50px;font-size:10pt;">${check(item.installer || item.requires_installer)}</td>
        </tr>`;
      });
    }
  });
  
  // Generer avviksliste (15 rader)
  let devRows = '';
  for (let i = 1; i <= 15; i++) {
    const d = devs[i-1];
    const devText = d ? (d.text || d.item_text || '').substring(0, 60) + (d.comment ? ': ' + d.comment : '') : '';
    devRows += `<tr>
      <td style="border:1px solid #000;text-align:center;width:25px;padding:2px;">${i}</td>
      <td style="border:1px solid #000;padding:2px;font-size:9pt;">${devText}</td>
      <td style="border:1px solid #000;text-align:center;width:50px;font-size:10pt;">${d ? check(d.corrected) : '☐'}</td>
    </tr>`;
  }
  
  // Header-tabell som gjentas på alle sider
  const headerTable = `
    <table style="width:100%;border-collapse:collapse;margin-bottom:5px;">
      <tr>
        <td rowspan="2" style="border:1px solid #000;padding:5px;width:180px;vertical-align:middle;">
          <div style="font-size:9pt;font-weight:bold;">Internkontroll Elektro</div>
        </td>
        <td style="border:1px solid #000;padding:3px;font-size:9pt;font-weight:bold;">KAP.5: Gjennomføring av kontroll</td>
        <td style="border:1px solid #000;padding:3px;font-size:8pt;width:80px;">Utgitt dato<br>01.04.2011</td>
        <td style="border:1px solid #000;padding:3px;font-size:8pt;width:70px;">Revisjon 2023</td>
        <td style="border:1px solid #000;padding:3px;font-size:8pt;width:70px;">Godkjent av:</td>
      </tr>
      <tr>
        <td style="border:1px solid #000;padding:3px;font-size:9pt;">Teknisk Forvaltning og Drift</td>
        <td colspan="2" style="border:1px solid #000;padding:3px;font-size:8pt;">Adresse: ${fullAddr}</td>
        <td style="border:1px solid #000;padding:3px;font-size:8pt;">Arbeidsordre: ${workOrder}</td>
      </tr>
    </table>`;
  
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
@page { size: A4; margin: 1cm 1.5cm; }
body { font-family: Arial, sans-serif; font-size: 10pt; line-height: 1.2; }
table { border-collapse: collapse; width: 100%; }
.page-break { page-break-before: always; }
h2 { font-size: 11pt; margin: 8px 0 5px 0; }
.info-text { font-size: 8pt; color: #333; margin-bottom: 8px; font-style: italic; }
</style>
</head>
<body>

<!-- SIDE 1 -->
${headerTable}

<h2>KAP.5.4, SJEKKLISTE FOR INSTALLASJONSKONTROLL</h2>
<p class="info-text">Sjekkliste må sjåast på som ei veiledning av kontrollen, og kan vanskelig bli komplett.<br>
Det er særs viktig at ein brukar fagkunnskap og erfaring ved slik kontroll. Ein må tenkje på elsikkerhet, brann og berøringsfare.</p>

<table>
  <tr style="background:#d9d9d9;">
    <th style="border:1px solid #000;padding:3px;text-align:left;">Kontrollobjekt</th>
    <th style="border:1px solid #000;width:30px;padding:2px;font-size:8pt;">OK</th>
    <th style="border:1px solid #000;width:30px;padding:2px;font-size:8pt;">Avvik</th>
    <th style="border:1px solid #000;width:40px;padding:2px;font-size:8pt;">Utbedret</th>
    <th style="border:1px solid #000;width:50px;padding:2px;font-size:7pt;">Krever inst.</th>
  </tr>
  ${page1Rows}
</table>

<!-- SIDE 2 -->
<div class="page-break"></div>
${headerTable}

<table>
  <tr style="background:#d9d9d9;">
    <th style="border:1px solid #000;padding:3px;text-align:left;">Kontrollobjekt</th>
    <th style="border:1px solid #000;width:30px;padding:2px;font-size:8pt;">OK</th>
    <th style="border:1px solid #000;width:30px;padding:2px;font-size:8pt;">Avvik</th>
    <th style="border:1px solid #000;width:40px;padding:2px;font-size:8pt;">Utbedret</th>
    <th style="border:1px solid #000;width:50px;padding:2px;font-size:7pt;">Krever inst.</th>
  </tr>
  ${page2Rows}
</table>

<!-- KONTROLL UTFØRT AV -->
<h2 style="margin-top:15px;">Kontroll utført av:</h2>
<table>
  <tr style="background:#d9d9d9;">
    <th style="border:1px solid #000;padding:4px;width:150px;">Enhet/avdeling</th>
    <th style="border:1px solid #000;padding:4px;width:150px;">Navn</th>
    <th style="border:1px solid #000;padding:4px;width:80px;">Dato</th>
    <th style="border:1px solid #000;padding:4px;">Videre behandling</th>
  </tr>
  <tr>
    <td rowspan="4" style="border:1px solid #000;padding:4px;vertical-align:top;">${unit}</td>
    <td rowspan="4" style="border:1px solid #000;padding:4px;vertical-align:top;">${inspector}</td>
    <td rowspan="4" style="border:1px solid #000;padding:4px;vertical-align:top;">${inspDate}</td>
    <td style="border:1px solid #000;padding:3px;font-size:9pt;">${check(form.errorsFixed)} Feil og mangler er rettet</td>
  </tr>
  <tr>
    <td style="border:1px solid #000;padding:3px;font-size:9pt;">${check(form.maintenance)} Tiltak er notert i vedlikeholdsplan</td>
  </tr>
  <tr>
    <td style="border:1px solid #000;padding:3px;font-size:9pt;">${check(form.sentInstaller)} Levert til EL-installatør</td>
  </tr>
  <tr>
    <td style="border:1px solid #000;padding:3px;font-size:9pt;">☐ Kvittert for gjennomført kontroll</td>
  </tr>
</table>

<!-- SIDE 3 -->
<div class="page-break"></div>
${headerTable}

<!-- AVVIKSLISTE -->
<table style="margin-top:10px;">
  <tr style="background:#d9d9d9;">
    <th style="border:1px solid #000;padding:3px;width:25px;">Nr.</th>
    <th style="border:1px solid #000;padding:3px;">Avvik:</th>
    <th style="border:1px solid #000;padding:3px;width:50px;">Utbedret:</th>
  </tr>
  ${devRows}
</table>

<!-- MÅLERESULTAT -->
<h2 style="margin-top:15px;">Oppsummering måleresultat sluttkontroll</h2>
<table>
  <tr>
    <td style="border:1px solid #000;padding:6px;width:25%;">Spenning: <strong>${form.voltage || '________'}</strong></td>
    <td style="border:1px solid #000;padding:6px;width:25%;">Isolasjonsresistans: <strong>${form.insulation || '________'}</strong></td>
    <td style="border:1px solid #000;padding:6px;width:25%;">Kontinuitet: <strong>${form.continuity || '________'}</strong></td>
    <td style="border:1px solid #000;padding:6px;width:25%;">Test av jordfeilbryter: <strong>${form.rcd || '________'}</strong></td>
  </tr>
</table>

${form.summary ? `<p style="margin-top:10px;font-size:9pt;"><strong>Tilleggskommentar:</strong> ${form.summary}</p>` : ''}

</body>
</html>`;
}

function downloadWord(insp) {
  const html = generateWordHTML(insp);
  const fullAddr = insp.full_address || insp.fullAddress || 'ukjent';
  const inspDate = insp.inspection_date || insp.date || '';
  const name = `Elkontroll_${inspDate}_${fullAddr.replace(/[^a-zA-Z0-9æøåÆØÅ\-]/g, '_')}`;
  const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name + '.doc';
  a.click();
}

// ============================================
// GPS
// ============================================
async function getGPS() {
  if (!navigator.geolocation) {
    showToast('GPS støttast ikkje', 'error');
    return;
  }
  state.modal = 'gps';
  render();
  
  navigator.geolocation.getCurrentPosition(
    async (p) => {
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${p.coords.latitude}&lon=${p.coords.longitude}&format=json&addressdetails=1&accept-language=no`);
        const d = await r.json();
        state.form.address = `${d.address.road || ''} ${d.address.house_number || ''}`.trim();
        state.modal = null;
        showToast('📍 Adresse henta!');
      } catch(e) {
        state.modal = null;
        showToast('Feil ved adressehenting', 'error');
      }
    },
    () => { state.modal = null; showToast('GPS-feil', 'error'); },
    { enableHighAccuracy: true, timeout: 15000 }
  );
}

// ============================================
// PHOTOS
// ============================================
function handlePhoto(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (state.photos.length >= 10) {
    showToast('Maks 10 bilete', 'error');
    return;
  }
  
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const max = 1000;
      let w = img.width, h = img.height;
      if (w > h && w > max) { h *= max / w; w = max; }
      else if (h > max) { w *= max / h; h = max; }
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      state.photos.push({
        id: genId(),
        data: canvas.toDataURL('image/jpeg', 0.7),
        type: state.photoType || 'Anna',
        ts: new Date().toISOString()
      });
      state.modal = null;
      render();
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

// ============================================
// RENDER
// ============================================
function render() {
  const app = document.getElementById('app');
  
  if (state.isLoading) {
    app.innerHTML = `<div class="app"><div class="loading"><div class="spinner"></div><p>Lastar...</p></div></div>`;
    return;
  }
  
  app.innerHTML = `
    <div class="app">
      ${!state.isOnline ? '<div class="offline-banner">📵 Offline - data lagrast lokalt</div>' : ''}
      ${state.isLoggedIn ? renderHeader() : ''}
      ${state.toast ? `<div class="toast ${safeClassName(state.toast.type)}">${escapeHTML(state.toast.msg)}</div>` : ''}
      <div class="content">${renderView()}</div>
      ${state.isLoggedIn && state.view !== 'login' ? renderNav() : ''}
      ${renderModal()}
    </div>
  `;
  attachEvents();
}

function renderHeader() {
  const pendingCount = state.pendingSync.length;
  return `
    <header class="header">
      <div class="header-row">
        <div>
          <h1><span class="logo">⚡</span> Elkontroll</h1>
          ${state.view === 'control' ? `<div class="subtitle">${escapeHTML(state.currentUser?.name || '')} • ${escapeHTML(getFullAddress() || 'Ny kontroll')}</div>` : ''}
        </div>
        <div class="sync-badge ${state.isSyncing ? 'syncing' : (state.isOnline ? 'online' : 'offline')}">
          ${state.isSyncing ? '<span class="spinner"></span>' : (state.isOnline ? '🟢' : '🟡')}
          ${pendingCount > 0 ? ` (${pendingCount})` : ''}
        </div>
      </div>
    </header>
  `;
}

function renderNav() {
  return `
    <nav class="nav">
      <button class="${state.view === 'home' ? 'active' : ''}" data-view="home"><span class="icon">🏠</span>Heim</button>
      <button class="${state.view === 'control' ? 'active' : ''}" data-view="control"><span class="icon">📋</span>Kontroll</button>
      <button class="${state.view === 'search' ? 'active' : ''}" data-view="search"><span class="icon">🔍</span>Søk</button>
      <button class="${state.view === 'settings' ? 'active' : ''}" data-view="settings"><span class="icon">⚙️</span>Innstillingar</button>
    </nav>
  `;
}

function renderView() {
  switch(state.view) {
    case 'login': return renderLogin();
    case 'home': return renderHome();
    case 'control': return renderControl();
    case 'search': return renderSearch();
    case 'detail': return renderDetail();
    case 'settings': return renderSettings();
    default: return renderHome();
  }
}

function renderLogin() {
  return `
    <div class="login-container">
      <div class="login-card">
        <h2>⚡ Elkontroll</h2>
        <p style="text-align:center;color:var(--text-muted);margin-bottom:20px;font-size:12px;">
          Alver Kommune<br>Teknisk Forvaltning og Drift
        </p>
        <div class="users-grid">
          ${state.users.map(u => `
            <div class="user-card" data-user="${escapeHTML(u.id)}">
              <div class="avatar">${escapeHTML(u.name.charAt(0))}</div>
              <div class="name">${escapeHTML(u.name)}</div>
              <div class="role">${u.role === 'admin' ? '👑 Admin' : '👤 Brukar'}</div>
            </div>
          `).join('')}
        </div>
        <p style="text-align:center;color:#64748b;font-size:10px;margin-top:16px;">v${APP_VERSION_SAFE}</p>
      </div>
    </div>
  `;
}

function renderHome() {
  const recent = state.inspections.slice(0, 5);
  const totalDevs = state.inspections.reduce((sum, i) => sum + (i.deviation_count || 0), 0);
  const isViewer = state.currentUser?.role === 'viewer';
  
  // Viewer får ikkje starte nye kontrollar
  const actionButtons = isViewer ? `
    <p style="color:var(--text-muted);font-size:12px;font-style:italic;">Du har lese-tilgang. Kontakt admin for å få skrive-tilgang.</p>
  ` : `
    <button class="btn btn-primary" data-action="newControl">⚡ Start ny kontroll</button>
    <button class="btn btn-secondary" data-action="externalControl">🔧 Registrer ekstern kontroll</button>
  `;
  
  return `
    <div class="card">
      <h3>👋 Hei, ${escapeHTML(state.currentUser?.name || '')}!${isViewer ? ' <span style="color:var(--text-muted);font-size:12px;">(Lesar)</span>' : ''}</h3>
      ${actionButtons}
    </div>
    
    ${state.pendingSync.length > 0 ? `
      <div class="card" style="border-color:var(--warning);">
        <h3 style="color:var(--warning);">⏳ Ventar på synk</h3>
        <p style="color:var(--text-muted);font-size:12px;">${state.pendingSync.length} kontroll(ar) ikkje synkronisert</p>

        <div style="display:flex;flex-direction:column;gap:6px;margin-top:10px;">
          ${state.pendingSync.slice(0, 5).map(p => `
            <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;background:var(--bg-dark);border:1px solid var(--border);border-radius:10px;padding:10px;">
              <div style="min-width:0;">
                <div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHTML(p.fullAddress || p.address || 'Ukjend adresse')}</div>
                <div style="color:var(--text-muted);font-size:11px;">${escapeHTML(p.date || '')}</div>
              </div>
              <div style="display:flex;gap:6px;flex-shrink:0;">
                <button class="btn btn-small btn-secondary" data-action="viewPending" data-localid="${escapeHTML(p.localId)}">👁️</button>
                <button class="btn btn-small btn-secondary" data-action="downloadPending" data-localid="${escapeHTML(p.localId)}">📄</button>
              </div>
            </div>
          `).join('')}
        </div>

        ${state.isOnline ? `
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
            ${state.isSyncing ? '<button class="btn btn-small btn-secondary" data-action="cancelSync">⛔ Stopp synk</button>' : '<button class="btn btn-small btn-secondary" data-action="syncNow">🔄 Synk no</button>'}
          </div>
        ` : ''}

        ${state.lastSyncError ? `<div style="margin-top:10px;color:var(--danger);font-size:11px;">❌ ${state.lastSyncError}</div>` : ''}
      </div>
    ` : ''}
    
    <div class="card">
      <h3>📊 Statistikk</h3>
      <div class="stats">
        <div class="stat">
          <div class="stat-value">${state.inspections.length}</div>
          <div class="stat-label">Totalt</div>
        </div>
        <div class="stat">
          <div class="stat-value red">${state.inspections.filter(i => (i.deviation_count || 0) > 0).length}</div>
          <div class="stat-label">Med avvik</div>
        </div>
        <div class="stat">
          <div class="stat-value green">${state.inspections.filter(i => i.progress === 100).length}</div>
          <div class="stat-label">Fullført</div>
        </div>
      </div>
    </div>
    
    ${recent.length > 0 ? `
      <div class="card">
        <h3>🕐 Siste kontrollar</h3>
        ${recent.map(i => `
          <div class="history-item" data-insp="${i.id}" style="padding:10px;background:var(--bg-dark);border-radius:8px;margin-bottom:6px;">
            <div style="display:flex;justify-content:space-between;">
              <strong style="font-size:13px;">${i.full_address || i.address}</strong>
              <span style="color:#64748b;font-size:11px;">${i.inspection_date}</span>
            </div>
            <div style="display:flex;gap:6px;margin-top:4px;">
              ${(i.deviation_count || 0) > 0 ? 
                `<span class="badge badge-red">${i.deviation_count} avvik</span>` : 
                '<span class="badge badge-green">OK</span>'}
              ${i.is_external ? '<span class="badge badge-orange">Ekstern</span>' : ''}
            </div>
          </div>
        `).join('')}
      </div>
    ` : '<div class="card"><p style="color:var(--text-muted);text-align:center;">Ingen kontrollar enno</p></div>'}
  `;
}

function renderControl() {
  const progress = getProgress();
  const devs = getDeviations();
  
  return `
    <div class="card">
      <h3>📍 Adresse</h3>
      <button class="btn btn-success" data-action="gps">📍 Hent frå GPS</button>
      <label class="label">Gateadresse</label>
      <input class="input" id="address" placeholder="Adresse..." value="${state.form.address}">
      <label class="label">Eining / H-nr</label>
      <div style="display:flex;gap:6px;">
        <input class="input" id="suffix" style="flex:1;" placeholder="H0201, Leil. A..." value="${state.form.suffix}">
        <button class="btn btn-secondary btn-small" data-action="unitModal">📋</button>
      </div>
      <div style="display:flex;gap:8px;">
        <div style="flex:1;"><label class="label">Dato</label><input class="input" type="date" id="date" value="${state.form.date}"></div>
        <div style="flex:1;"><label class="label">Arbeidsordre</label><input class="input" id="workOrder" placeholder="Valfritt" value="${state.form.workOrder}"></div>
      </div>
    </div>
    
    ${state.form.isExternal ? `
      <div class="external-card">
        <h3>🔧 Ekstern elektrikar</h3>
        <label class="label">Firma</label>
        <input class="input" id="externalFirma" placeholder="Firma..." value="${state.form.externalFirma}">
        <label class="label">Kontaktperson</label>
        <input class="input" id="externalContact" placeholder="Namn..." value="${state.form.externalContact}">
      </div>
    ` : ''}
    
    <div class="card">
      <div style="display:flex;justify-content:space-between;">
        <span style="font-weight:600;">Framgang</span>
        <span style="color:var(--primary);font-weight:700;">${progress}%</span>
      </div>
      <div class="progress-bar"><div class="progress-fill ${progress === 100 ? 'complete' : ''}" style="width:${progress}%;"></div></div>
      <div class="stats">
        <div class="stat"><div class="stat-value">${state.items.filter(i => i.checked).length}</div><div class="stat-label">Sjekka</div></div>
        <div class="stat"><div class="stat-value red">${devs.length}</div><div class="stat-label">Avvik</div></div>
        <div class="stat"><div class="stat-value green">${state.items.filter(i => i.corrected).length}</div><div class="stat-label">Utbetra</div></div>
      </div>
    </div>
    
    ${categories.map(c => renderCategory(c)).join('')}
    
    ${devs.length > 0 ? `
      <div class="deviation-card">
        <h3>⚠️ Avvik (${devs.length})</h3>
        ${devs.map((d, i) => `
          <div class="deviation-item">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
              <span><span class="check-num">${d.id}</span> Avvik ${i + 1}</span>
              ${d.corrected ? '<span class="badge badge-green">✓ Utbetra</span>' : ''}
              ${d.installer ? '<span class="badge badge-orange">Krev inst.</span>' : ''}
            </div>
            <p style="font-size:12px;margin-bottom:4px;">${d.text}</p>
            ${d.comment ? `<p style="color:var(--text-muted);font-size:11px;">💬 ${d.comment}</p>` : ''}
          </div>
        `).join('')}
      </div>
    ` : ''}
    
    <div class="card">
      <h3>📷 Bilete (${state.photos.length}/10)</h3>
      <div class="photos-grid">
        ${state.photos.map(p => `
          <div class="photo-item">
            <img src="${p.data}">
            <div class="photo-delete" data-photo="${p.id}">✕</div>
          </div>
        `).join('')}
        ${state.photos.length < 10 ? '<div class="photo-add" data-action="photoModal"><span class="icon">📷</span>Legg til</div>' : ''}
      </div>
    </div>
    
    <div class="card">
      <h3>📏 Målingar</h3>
      <div class="measurements">
        <div><label class="label">Spenning</label><input class="input" id="voltage" placeholder="230V" value="${state.form.voltage}"></div>
        <div><label class="label">Isolasjon</label><input class="input" id="insulation" placeholder=">0,5MΩ" value="${state.form.insulation}"></div>
        <div><label class="label">Kontinuitet</label><input class="input" id="continuity" placeholder="OK" value="${state.form.continuity}"></div>
        <div><label class="label">Jordfeilbr.</label><input class="input" id="rcd" placeholder="OK" value="${state.form.rcd}"></div>
      </div>
    </div>
    
    <div class="card">
      <h3>✅ Vidare behandling</h3>
      <div class="action-check ${state.form.errorsFixed ? 'checked' : ''}" data-action="errorsFixed">
        <input type="checkbox" ${state.form.errorsFixed ? 'checked' : ''}><span>Feil og manglar retta</span>
      </div>
      <div class="action-check ${state.form.maintenance ? 'checked' : ''}" data-action="maintenance">
        <input type="checkbox" ${state.form.maintenance ? 'checked' : ''}><span>Notert i vedlikeholdsplan</span>
      </div>
      <div class="action-check ${state.form.sentInstaller ? 'checked' : ''}" data-action="sentInstaller">
        <input type="checkbox" ${state.form.sentInstaller ? 'checked' : ''}><span>Sendt til installatør</span>
      </div>
      <label class="label" style="margin-top:10px;">Tilleggskommentar</label>
      <textarea class="textarea" id="summary" placeholder="Oppsummering...">${state.form.summary}</textarea>
    </div>
    
    <button class="btn btn-primary" data-action="saveModal">💾 Lagre kontroll</button>
    <button class="btn btn-ghost" data-action="reset">🔄 Nullstill</button>
  `;
}

function renderCategory(cat) {
  const items = state.items.filter(i => i.catNum === cat.num);
  const exp = state.expanded[cat.num];
  const checked = items.filter(i => i.checked).length;
  const devCount = items.filter(i => i.deviation).length;
  
  return `
    <div class="category">
      <div class="category-header ${exp ? 'expanded' : ''}" data-cat="${cat.num}">
        <div style="display:flex;align-items:center;">
          <span class="category-title">${cat.num}. ${cat.name}</span>
          <span class="category-meta" style="margin-left:8px;">(${checked}/${items.length})</span>
          ${devCount > 0 ? `<span class="category-badge">${devCount}</span>` : ''}
        </div>
        <span>${exp ? '▼' : '▶'}</span>
      </div>
      ${exp ? `<div class="category-items">${items.map(renderItem).join('')}</div>` : ''}
    </div>
  `;
}

function renderItem(item) {
  return `
    <div class="check-item">
      <div class="check-row">
        <div class="check-box ${item.checked ? 'checked' : ''}" data-item="${item.id}"></div>
        <div class="check-content">
          <div class="check-text ${item.checked ? 'checked' : ''}">
            <span class="check-num">${item.id}</span>${item.text}
            ${item.ia ? '<span class="badge badge-gray" style="margin-left:6px;">IA</span>' : ''}
          </div>
          <div class="check-options">
            <div class="check-option ${item.ia ? 'na' : ''}" data-ia="${item.id}">IA</div>
            <div class="check-option ${item.deviation ? 'active' : ''}" data-dev="${item.id}">⚠️ Avvik</div>
            ${item.deviation ? `
              <div class="check-option ${item.corrected ? 'fixed' : ''}" data-fix="${item.id}">✓ Utbetra</div>
              <div class="check-option ${item.installer ? 'installer' : ''}" data-inst="${item.id}">🔧 Krev inst.</div>
            ` : ''}
          </div>
          <input class="comment-input" data-comment="${item.id}" placeholder="${item.deviation ? 'Beskriv avviket...' : 'Kommentar...'}" value="${item.comment || ''}">
        </div>
      </div>
    </div>
  `;
}

function renderSearch() {
  const q = (state.search || '').toLowerCase();

  const localList = (state.pendingSync || []).map(p => ({
    ...p,
    __local: true,
    id: p.localId,
    full_address: p.fullAddress || p.address || '',
    inspection_date: p.date || '',
    deviation_count: p.deviationCount || 0,
    is_external: p.form?.isExternal || false
  }));

  const remoteList = (state.inspections || []).map(i => ({ ...i, __local: false }));

  const combined = [...localList, ...remoteList];

  const results = q.length >= 2
    ? combined.filter(i =>
        (String(i.full_address || i.address || '')).toLowerCase().includes(q) ||
        (String(i.inspection_date || i.date || '')).includes(q)
      )
    : combined;

  return `
    <h2 style="font-size:16px;margin-bottom:12px;">🔍 Søk kontrollar</h2>
    <input class="input" id="search" placeholder="Søk adresse, dato..." value="${state.search}">

    ${results.length === 0 ? `
      <div class="card" style="text-align:center;color:#64748b;padding:40px;">
        <div style="font-size:40px;margin-bottom:10px;">🔍</div>
        <p>Ingen kontrollar funne</p>
      </div>
    ` : results.map(i => `
      <div class="card history-item" ${i.__local ? `data-local="${i.localId || i.id}"` : `data-insp="${i.id}"`}>
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
          <strong style="font-size:14px;">${i.full_address || i.address}</strong>
          <span style="color:#64748b;font-size:11px;">${i.inspection_date || i.date || ''}</span>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;">
          ${i.__local ? '<span class="badge badge-gray">Lokalt</span>' : ''}
          ${i.is_external ? '<span class="badge badge-orange">Ekstern</span>' : ''}
          ${(i.deviation_count || 0) > 0 ?
            `<span class="badge badge-red">${i.deviation_count} avvik</span>` :
            '<span class="badge badge-green">OK</span>'}
        </div>
      </div>
    `).join('')}
  `;
}

function renderDetail() {
  const i = state.viewInspection;
  if (!i) return '';

  const isLocal = !!i.__local || !!i.localId;
  const isAdmin = state.currentUser?.role === 'admin';
  const addr = i.full_address || i.fullAddress || i.address || '';
  const date = i.inspection_date || i.date || '';
  const devCount = i.deviation_count ?? i.deviationCount ?? 0;
  const checkedItems = i.checked_items ?? (i.items ? i.items.filter(x => x.checked).length : 0);
  const correctedCount = i.corrected_count ?? (i.items ? i.items.filter(x => x.corrected).length : 0);
  const workOrder = i.work_order || i.workOrder || '';
  const isExternal = i.is_external ?? i.form?.isExternal;

  // Sletteknapp kun for admin
  const deleteBtn = isAdmin && !isLocal ? `
    <button class="btn btn-small btn-ghost" data-action="deleteInspection" style="margin-top:12px;color:var(--danger);">🗑️ Slett kontroll</button>
  ` : '';

  return `
    <button class="btn btn-secondary btn-small" data-action="back" style="margin-bottom:12px;">← Tilbake</button>

    <div class="card">
      <h2 style="font-size:16px;margin-bottom:8px;">${addr}</h2>
      <div style="color:var(--text-muted);font-size:12px;line-height:1.6;">
        <div><strong>Dato:</strong> ${date}</div>
        ${isLocal ? '<div><strong>Status:</strong> Lokalt (ikkje synka)</div>' : ''}
        ${isExternal ? `<div><strong>Ekstern:</strong> ${i.external_firma || i.form?.externalFirma || ''}</div>` : ''}
        ${workOrder ? `<div><strong>Arbeidsordre:</strong> ${workOrder}</div>` : ''}
      </div>
    </div>

    <div class="stats" style="margin-bottom:10px;">
      <div class="stat"><div class="stat-value">${checkedItems || 0}</div><div class="stat-label">Sjekka</div></div>
      <div class="stat"><div class="stat-value red">${devCount || 0}</div><div class="stat-label">Avvik</div></div>
      <div class="stat"><div class="stat-value green">${correctedCount || 0}</div><div class="stat-label">Utbetra</div></div>
    </div>

    <button class="btn btn-primary" data-action="viewReport">📄 Vis rapport</button>
    <button class="btn btn-secondary" data-action="${isLocal ? 'downloadLocalReport' : 'downloadReport'}">📥 Last ned Word</button>
    ${isLocal && state.isOnline ? '<button class="btn btn-secondary" data-action="syncThisLocal" style="margin-top:8px;">🔄 Synk denne</button>' : ''}
    ${deleteBtn}
  `;
}

function renderSettings() {
  const isAdmin = state.currentUser?.role === 'admin';
  const isViewer = state.currentUser?.role === 'viewer';
  
  // Brukaradmin-liste (kun for admin)
  const userAdminHTML = isAdmin ? `
    <div class="card">
      <h3>👥 Brukaradministrasjon</h3>
      <p style="color:var(--text-muted);font-size:11px;margin-bottom:10px;">Endre roller for brukarar</p>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${state.users.map(u => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:8px;background:var(--bg-dark);border-radius:8px;">
            <span style="font-size:13px;">${u.name}</span>
            <select data-userid="${u.id}" data-action="changeRole" style="padding:4px 8px;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:12px;">
              <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>👑 Admin</option>
              <option value="user" ${u.role === 'user' ? 'selected' : ''}>👤 Brukar</option>
              <option value="viewer" ${u.role === 'viewer' ? 'selected' : ''}>👁️ Lesar</option>
            </select>
          </div>
        `).join('')}
      </div>
      <button class="btn btn-small btn-secondary" data-action="addUser" style="margin-top:12px;">➕ Legg til brukar</button>
    </div>
  ` : '';
  
  // Database-admin (kun for admin)
  const dbAdminHTML = isAdmin ? `
    <div class="card" style="border-color:var(--danger);">
      <h3>🗄️ Database-admin</h3>
      <p style="color:var(--text-muted);font-size:11px;margin-bottom:10px;">⚠️ Desse handlingane kan ikkje angrast</p>
      <button class="btn btn-small btn-ghost" data-action="deleteAllTestData" style="color:var(--danger);">🧹 Slett alle test-kontrollar</button>
    </div>
  ` : '';
  
  return `
    <h2 style="font-size:16px;margin-bottom:12px;">⚙️ Innstillingar</h2>
    
    <div class="card">
      <h3>👤 Innlogga som</h3>
      <p style="font-size:14px;">${state.currentUser?.name} 
        <span class="badge ${isAdmin ? 'badge-orange' : isViewer ? 'badge-blue' : 'badge-gray'}">
          ${isAdmin ? '👑 Admin' : isViewer ? '👁️ Lesar' : '👤 Brukar'}
        </span>
      </p>
      <button class="btn btn-secondary" data-action="logout" style="margin-top:10px;">🚪 Logg ut</button>
    </div>
    
    <div class="card">
      <h3>📊 Data</h3>
      <p style="color:var(--text-muted);font-size:12px;">
        Kontrollar i sky: ${state.inspections.length}<br>
        Ventar på synk: ${state.pendingSync.length}
      </p>
      ${state.isOnline && state.pendingSync.length > 0 ? 
        '<button class="btn btn-small btn-secondary" data-action="syncNow" style="margin-top:8px;">🔄 Synk no</button>' : ''}
      <button class="btn btn-small btn-ghost" data-action="wipeLocal" style="margin-top:8px;">🗑️ Slett lokal data</button>
    </div>
    
    ${userAdminHTML}
    ${dbAdminHTML}
    
    <div class="card">
      <h3>ℹ️ Om</h3>
      <p style="color:var(--text-muted);font-size:12px;">
        Elkontroll v${APP_VERSION_SAFE}<br>
        Alver Kommune - Teknisk Forvaltning<br>
        Database: Supabase ✅
      </p>
    </div>
  `;
}

function renderModal() {
  if (!state.modal) return '';
  
  if (state.modal === 'save') {
    return `
      <div class="modal">
        <div class="modal-content">
          <h3>💾 Lagre kontroll</h3>
          <div style="background:var(--bg-dark);border-radius:10px;padding:12px;margin-bottom:14px;">
            <div style="color:var(--text-muted);font-size:11px;">Adresse:</div>
            <div style="color:#fff;font-weight:600;">${getFullAddress() || 'Ikkje angitt'}</div>
          </div>
          <button class="btn btn-primary" data-action="saveOnly">💾 Lagre</button>
          <button class="btn btn-secondary" data-action="saveDownload">💾 Lagre + Last ned Word</button>
          <button class="btn btn-ghost" data-action="closeModal">Avbryt</button>
        </div>
      </div>
    `;
  }
  
  if (state.modal === 'unit') {
    return `
      <div class="modal">
        <div class="modal-content">
          <h3>🏢 Vel eining</h3>
          <div class="chips">
            ${unitSuffixes.map(u => `<div class="chip ${state.form.suffix === u ? 'active' : ''}" data-suffix="${u}">${u}</div>`).join('')}
          </div>
          <button class="btn btn-primary" data-action="closeModal">✓ OK</button>
        </div>
      </div>
    `;
  }
  
  if (state.modal === 'photo') {
    return `
      <div class="modal">
        <div class="modal-content">
          <h3>📷 Legg til bilete</h3>
          <label class="label">Type bilete</label>
          <div class="chips">
            ${photoTypes.map(t => `<div class="chip ${state.photoType === t ? 'active' : ''}" data-phototype="${t}">${t}</div>`).join('')}
          </div>
          <input type="file" accept="image/*" capture="environment" id="photoInput" style="display:none;">
          <button class="btn btn-primary" data-action="takePhoto">📷 Ta bilete</button>
          <button class="btn btn-ghost" data-action="closeModal">Avbryt</button>
        </div>
      </div>
    `;
  }
  
  if (state.modal === 'gps') {
    return `
      <div class="modal">
        <div class="modal-content" style="text-align:center;">
          <div class="spinner" style="margin:20px auto;"></div>
          <p>Hentar posisjon...</p>
        </div>
      </div>
    `;
  }
  
  if (state.modal === 'report') {
    return `
      <div class="modal">
        <div class="modal-content" style="max-width:95%;">
          <h3>📄 Rapport</h3>
          <div class="report-view">
            ${generateWordHTML(state.viewInspection).replace(/<\/?html>|<\/?head>|<\/?body>|<style[^>]*>.*?<\/style>|<meta[^>]*>/gs, '')}
          </div>
          <button class="btn btn-primary" data-action="closeModal" style="margin-top:10px;">Lukk</button>
        </div>
      </div>
    `;
  }
  
  if (state.modal === 'addUser') {
    return `
      <div class="modal">
        <div class="modal-content">
          <h3>➕ Legg til brukar</h3>
          <label class="label">Namn</label>
          <input type="text" id="newUserName" class="input" placeholder="Fullt namn" style="margin-bottom:12px;">
          <label class="label">Rolle</label>
          <select id="newUserRole" class="input" style="margin-bottom:12px;">
            <option value="user">👤 Brukar</option>
            <option value="viewer">👁️ Lesar</option>
            <option value="admin">👑 Admin</option>
          </select>
          <button class="btn btn-primary" data-action="confirmAddUser">➕ Legg til</button>
          <button class="btn btn-ghost" data-action="closeModal">Avbryt</button>
        </div>
      </div>
    `;
  }
  
  if (state.modal === 'confirmDelete') {
    return `
      <div class="modal">
        <div class="modal-content">
          <h3 style="color:var(--danger);">🗑️ Slett kontroll</h3>
          <p style="color:var(--text-muted);font-size:13px;margin-bottom:12px;">
            Er du sikker på at du vil slette denne kontrollen?<br>
            <strong>${state.viewInspection?.full_address || state.viewInspection?.fullAddress || ''}</strong>
          </p>
          <p style="color:var(--danger);font-size:11px;margin-bottom:12px;">⚠️ Dette kan ikkje angrast!</p>
          <button class="btn btn-small" style="background:var(--danger);" data-action="confirmDeleteInspection">🗑️ Ja, slett</button>
          <button class="btn btn-ghost" data-action="closeModal">Avbryt</button>
        </div>
      </div>
    `;
  }
  
  return '';
}

// ============================================
// EVENT LISTENERS
// ============================================
function attachEvents() {
  // Navigation
  document.querySelectorAll('[data-view]').forEach(el => {
    el.onclick = () => {
      state.view = el.dataset.view;
      if (state.view === 'search') state.viewInspection = null;
      render();
    };
  });
  
  // User selection
  document.querySelectorAll('[data-user]').forEach(el => {
    el.onclick = () => {
      state.currentUser = state.users.find(u => u.id === el.dataset.user);
      state.isLoggedIn = true;
      saveLocal('currentUser', state.currentUser);
      state.view = 'home';
      render();
    };
  });
  
  // Actions (ekskluder select-element som har eigen handler)
  document.querySelectorAll('[data-action]:not(select)').forEach(el => {
    el.onclick = async () => {
      const a = el.dataset.action;
      switch(a) {
        case 'newControl': resetForm(); state.form.isExternal = false; state.view = 'control'; break;
        case 'externalControl': resetForm(); state.form.isExternal = true; state.view = 'control'; break;
        case 'gps': getGPS(); return;
        case 'unitModal': state.modal = 'unit'; break;
        case 'photoModal': state.photoType = 'Anna'; state.modal = 'photo'; break;
        case 'saveModal': state.modal = 'save'; break;
        case 'saveOnly': await saveInspection(false); return;
        case 'saveDownload': await saveInspection(true); return;

        case 'downloadPending': {
          const id = el.dataset.localid;
          const insp = state.pendingSync.find(p => p.localId === id);
          if (insp) downloadWord(insp);
          return;
        }
        case 'viewPending': {
          const id = el.dataset.localid;
          const insp = state.pendingSync.find(p => p.localId === id);
          if (insp) {
            state.viewInspection = { ...insp, __local: true };
            state.view = 'detail';
          }
          break;
        }
        case 'cancelSync':
          state.cancelSyncRequested = true;
          showToast('⛔ Stoppar synk…', 'warning');
          break;
        case 'downloadLocalReport':
          downloadWord(state.viewInspection);
          return;
        case 'syncThisLocal': {
          const id = state.viewInspection.localId || state.viewInspection.id;
          if (id) {
            if (!state.pendingSync.find(p => p.localId === id)) {
              state.pendingSync.unshift(state.viewInspection);
              saveLocal('pendingSync', state.pendingSync);
            }
            await syncPendingData(true);
          }
          return;
        }

        case 'closeModal': state.modal = null; break;
        case 'reset': if (confirm('Nullstille?')) resetForm(); break;
        case 'back': state.view = 'search'; state.viewInspection = null; break;
        case 'logout': 
          state.isLoggedIn = false; 
          state.currentUser = null; 
          saveLocal('currentUser', null); 
          state.view = 'login'; 
          break;
        case 'syncNow': syncPendingData(); return;
        case 'takePhoto': document.getElementById('photoInput')?.click(); return;
        case 'viewReport': state.modal = 'report'; break;
        case 'downloadReport': downloadWord(state.viewInspection); return;
        case 'errorsFixed': state.form.errorsFixed = !state.form.errorsFixed; break;
        case 'maintenance': state.form.maintenance = !state.form.maintenance; break;
        case 'sentInstaller': state.form.sentInstaller = !state.form.sentInstaller; break;
        case 'wipeLocal':
          if (confirm('Slette lokal data og starte på nytt?')) {
            clearLocalData();
            state.pendingSync = [];
            state.localInspections = [];
            state.inspections = [];
            state.currentUser = null;
            state.isLoggedIn = false;
            state.viewInspection = null;
            state.view = 'login';
            resetForm();
            showToast('🗑️ Lokal data sletta', 'warning');
          }
          break;
        case 'deleteAllTestData':
          if (state.currentUser?.role !== 'admin') {
            showToast('❌ Kun admin kan slette', 'warning');
            break;
          }
          if (confirm('⚠️ ÅTVARING: Slette ALLE kontrollar frå databasen?\n\nDette kan ikkje angrast!')) {
            deleteAllInspections();
          }
          break;
        case 'addUser':
          state.modal = 'addUser';
          break;
        case 'confirmAddUser':
          const nameInput = document.getElementById('newUserName');
          const roleInput = document.getElementById('newUserRole');
          if (nameInput && nameInput.value.trim()) {
            addNewUser(nameInput.value.trim(), roleInput?.value || 'user');
          } else {
            showToast('⚠️ Skriv inn eit namn', 'warning');
          }
          return;
        case 'deleteInspection':
          if (state.currentUser?.role !== 'admin') {
            showToast('❌ Kun admin kan slette', 'warning');
            break;
          }
          state.modal = 'confirmDelete';
          break;
        case 'confirmDeleteInspection':
          if (state.viewInspection?.id) {
            deleteInspection(state.viewInspection.id);
            state.modal = null;
          }
          return;
      }
      render();
    };
  });
  
  // Role change (admin only)
  document.querySelectorAll('select[data-action="changeRole"]').forEach(el => {
    el.onchange = () => {
      const userId = el.dataset.userid;
      const newRole = el.value;
      if (state.currentUser?.role === 'admin') {
        updateUserRole(userId, newRole);
      }
    };
  });
  
  // Categories
  document.querySelectorAll('[data-cat]').forEach(el => {
    el.onclick = () => {
      const n = parseInt(el.dataset.cat);
      state.expanded[n] = !state.expanded[n];
      render();
    };
  });
  
  // Check items
  document.querySelectorAll('[data-item]').forEach(el => {
    el.onclick = () => {
      const item = state.items.find(i => i.id === el.dataset.item);
      if (item) {
        item.checked = !item.checked;

        // Dersom ein fjernar avkryssing, skal IA også fjernast
        if (!item.checked && item.ia) item.ia = false;

        applyAutoComment(item);
        render();
      }
    };
  });

  // IA (ikkje aktuelt) - marker som behandla utan avvik, og hopp til neste punkt
  document.querySelectorAll('[data-ia]').forEach(el => {
    el.onclick = (e) => {
      e.stopPropagation();
      const id = el.dataset.ia;
      const item = state.items.find(i => i.id === id);
      if (!item) return;

      item.ia = !item.ia;

      if (item.ia) {
        item.checked = true;
        // IA kan ikkje vere avvik
        item.deviation = false;
        item.corrected = false;
        item.installer = false;
        applyAutoComment(item);

        // Hoppe til neste item (2.1 -> 2.2 osv.)
        const idx = state.items.findIndex(i => i.id === item.id);
        if (idx >= 0 && idx < state.items.length - 1) {
          const next = state.items[idx + 1];
          if (next) {
            state.expanded[next.catNum] = true;
            state.scrollToItemId = next.id;
          }
        }
      } else {
        // Rydd opp kommentar dersom den berre var "IA"
        if (isAutoIA(item.comment)) item.comment = '';
        applyAutoComment(item);
      }

      render();
    };
  });
  
  // Deviations
  document.querySelectorAll('[data-dev]').forEach(el => {
    el.onclick = (e) => {
      e.stopPropagation();
      const item = state.items.find(i => i.id === el.dataset.dev);
      if (item) {
        // Avvik og IA kan ikkje kombinerast
        if (!item.deviation && item.ia) {
          item.ia = false;
          if (isAutoIA(item.comment)) item.comment = '';
        applyAutoComment(item);
        }
        item.deviation = !item.deviation;
        if (!item.deviation) { item.corrected = false; item.installer = false; }
        applyAutoComment(item);
        render();
      }
    };
  });
  
  document.querySelectorAll('[data-fix]').forEach(el => {
    el.onclick = (e) => {
      e.stopPropagation();
      const item = state.items.find(i => i.id === el.dataset.fix);
      if (item) { item.corrected = !item.corrected; render(); }
    };
  });
  
  document.querySelectorAll('[data-inst]').forEach(el => {
    el.onclick = (e) => {
      e.stopPropagation();
      const item = state.items.find(i => i.id === el.dataset.inst);
      if (item) { item.installer = !item.installer; render(); }
    };
  });
  
  // Comments
  document.querySelectorAll('[data-comment]').forEach(el => {
    el.oninput = () => {
      const item = state.items.find(i => i.id === el.dataset.comment);
      if (item) item.comment = el.value;
    };
  });
  
  // Unit selection
  document.querySelectorAll('[data-suffix]').forEach(el => {
    el.onclick = () => { state.form.suffix = el.dataset.suffix; render(); };
  });
  
  // Photo type
  document.querySelectorAll('[data-phototype]').forEach(el => {
    el.onclick = () => { state.photoType = el.dataset.phototype; render(); };
  });
  
  // Delete photo
  document.querySelectorAll('[data-photo]').forEach(el => {
    el.onclick = () => {
      state.photos = state.photos.filter(p => p.id !== el.dataset.photo);
      render();
    };
  });
  
  // Lokal inspeksjon (ikkje synk) - ligg i pendingSync
  document.querySelectorAll('[data-local]').forEach(el => {
    el.onclick = () => {
      const id = el.dataset.local;
      const insp = state.pendingSync.find(p => p.localId === id);
      if (insp) {
        state.viewInspection = { ...insp, __local: true };
        state.view = 'detail';
        render();
      }
    };
  });

  // Inspection detail
  document.querySelectorAll('[data-insp]').forEach(el => {
    el.onclick = async () => {
      const insp = state.inspections.find(i => i.id === el.dataset.insp);
      if (insp) {
        // Hent items for denne kontrollen (med timeout)
        if (_sbClient && state.isOnline) {
          try {
            const { data: items, error } = await withTimeout(
              _sbClient
                .from('inspection_items')
                .select('*')
                .eq('inspection_id', insp.id),
              12000,
              'fetch inspection_items'
            );
            if (error) throw error;
            insp.items = items || [];
          } catch(e) {
            console.error('Kunne ikkje hente items:', e);
            showToast('⚠️ Klarte ikkje hente detaljer (nett/RLS)', 'warning');
          }
        }
        state.viewInspection = { ...insp, __local: false };
        state.view = 'detail';
        render();
      }
    };
  });
  
  // Photo input
  const photoInput = document.getElementById('photoInput');
  if (photoInput) photoInput.onchange = handlePhoto;
  
  // Form inputs
  ['address', 'suffix', 'date', 'workOrder', 'voltage', 'insulation', 'continuity', 'rcd', 'summary', 'externalFirma', 'externalContact', 'search'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.oninput = () => {
        if (id === 'search') {
          state.search = el.value;
          render();
        } else {
          state.form[id] = el.value;
        }
      };
    }
  });

  // Etter render: om IA ba om "hopp" til neste element, scroll dit
  if (state.scrollToItemId) {
    const targetId = state.scrollToItemId;
    state.scrollToItemId = null;
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-item="${targetId}"]`);
      const row = el ? el.closest('.check-item') : null;
      if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }
}

// ============================================
// START APP
// ============================================
init();
