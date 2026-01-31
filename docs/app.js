const STORAGE_KEY = 'elkontroll_alver_';

let state = {
    isLoggedIn: false,
    currentUser: null,
    users: [],
    view: 'login', // login, home, control, search, settings, tilsyn
    items: [],
    inspections: [],
    pendingSync: [],
    auditQueue: [],
    isLoading: true,
    isOnline: navigator.onLine
};

// --- AUDIT TRAIL LOGIKK (Krav 3) ---
async function logAudit(action, details) {
    const entry = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        user_id: state.currentUser?.id,
        user_name: state.currentUser?.name,
        action: action,
        details: details
    };
    
    state.auditQueue.push(entry);
    saveLocal('audit_queue', state.auditQueue);
    
    if (state.isOnline) {
        try {
            await supabase.from('audit_logs').insert([entry]);
            state.auditQueue = state.auditQueue.filter(a => a.id !== entry.id);
            saveLocal('audit_queue', state.auditQueue);
        } catch (e) { console.log('Audit lagret lokalt for senere synk'); }
    }
}

// --- INITIALISERING ---
async function init() {
    state.isLoading = true;
    render();
    
    window.addEventListener('online', () => { state.isOnline = true; syncData(); render(); });
    window.addEventListener('offline', () => { state.isOnline = false; render(); });

    const savedUser = loadLocal('currentUser', null);
    state.pendingSync = loadLocal('pendingSync', []);
    state.auditQueue = loadLocal('audit_queue', []);

    if (savedUser) {
        state.currentUser = savedUser;
        state.isLoggedIn = true;
        state.view = 'home';
        await refreshData();
    }

    state.isLoading = false;
    render();
    logAudit('App Start', { version: APP_VERSION });
}

async function refreshData() {
    try {
        const { data: users } = await supabase.from('users').select('*').eq('active', true);
        const { data: insp } = await supabase.from('inspections').select('*').order('created_at', { ascending: false }).limit(50);
        state.users = users || [];
        state.inspections = insp || [];
        saveLocal('inspections', state.inspections);
    } catch (e) {
        console.warn('Bruker offline data');
        state.inspections = loadLocal('inspections', []);
    }
}

// --- RENDER FUNKSJONER ---
function render() {
    const root = document.getElementById('app');
    if (state.isLoading) {
        root.innerHTML = `<div class="app" style="justify-content:center;align-items:center;"><div class="spinner"></div></div>`;
        return;
    }

    root.innerHTML = `
        <div class="app">
            ${state.isLoggedIn ? renderHeader() : ''}
            <main class="content">
                ${renderView()}
            </main>
            ${state.isLoggedIn ? renderNav() : ''}
        </div>
    `;
}

function renderHeader() {
    return `
        <header class="header">
            <div class="header-row">
                <div>
                    <h1><span style="color:var(--primary)">⚡</span> Elkontroll</h1>
                    <small style="color:var(--text-muted)">${state.currentUser?.name || ''}</small>
                </div>
                <div class="status-pill ${state.isOnline ? 'online' : 'offline'}" 
                     style="background:${state.isOnline ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)'}; 
                            color:${state.isOnline ? '#10b981' : '#f59e0b'}; 
                            padding:4px 10px; border-radius:20px; font-size:10px; font-weight:700;">
                    ${state.isOnline ? '● ONLINE' : '○ OFFLINE'}
                </div>
            </div>
        </header>
    `;
}

function renderView() {
    if (!state.isLoggedIn) return renderLogin();
    
    switch(state.view) {
        case 'home': return renderHome();
        case 'control': return renderControl();
        case 'tilsyn': return renderTilsyn();
        default: return `<div>Visning under konstruksjon</div>`;
    }
}

function renderLogin() {
    return `
        <div class="card" style="margin-top:20vh; text-align:center;">
            <h2 style="margin-bottom:1.5rem">Logg inn</h2>
            <input type="password" id="login-pin" placeholder="Pinkode" 
                   style="width:100%; padding:1rem; border-radius:12px; border:1px solid var(--border); background:#0f172a; color:white; margin-bottom:1rem;">
            <button onclick="handleLogin()" class="primary-btn" 
                    style="width:100%; background:var(--primary); border:none; padding:1rem; border-radius:12px; color:white; font-weight:700;">
                Logg inn
            </button>
        </div>
    `;
}

function renderNav() {
    const views = [
        { id: 'home', icon: '🏠', label: 'Hjem' },
        { id: 'control', icon: '📋', label: 'Ny kontroll' },
        { id: 'search', icon: '🔍', label: 'Søk' },
        { id: 'settings', icon: '⚙️', label: 'Oppsett' }
    ];
    return `
        <nav class="nav">
            ${views.map(v => `
                <button class="nav-btn ${state.view === v.id ? 'active' : ''}" onclick="setView('${v.id}')">
                    <span style="font-size:1.5rem">${v.icon}</span>
                    <span>${v.label}</span>
                </button>
            `).join('')}
        </nav>
    `;
}

// --- HJELPERE ---
function setView(v) { state.view = v; render(); }
function saveLocal(k, d) { localStorage.setItem(STORAGE_KEY + k, JSON.stringify(d)); }
function loadLocal(k, def) { 
    const d = localStorage.getItem(STORAGE_KEY + k); 
    return d ? JSON.parse(d) : def; 
}

async function handleLogin() {
    // Demo-logikk for innlogging (erstattes med Supabase Auth)
    state.currentUser = { id: '1', name: 'Cato Alver', role: 'admin' };
    state.isLoggedIn = true;
    state.view = 'home';
    saveLocal('currentUser', state.currentUser);
    logAudit('Login Success', { user: state.currentUser.name });
    render();
}

// Start appen
init();
