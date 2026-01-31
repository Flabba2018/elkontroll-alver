
# Elkontroll - Alver Kommune

Internkontroll-app for elektriske installasjonar i kommunale leilegheiter.

## Funksjonar

- ⚡ Digital sjekkliste for elkontroll
- 📷 Bilete-dokumentasjon (maks 10 per kontroll)
- 📍 GPS-adressehenting
- 🔄 Offline-støtte med automatisk synkronisering
- 📄 Word-eksport (original MAL-format)
- 🔍 Søk og tilsyn-modus
- 👥 Fleirbrukar med admin-rolle
- 🔧 Støtte for ekstern elektrikar

## Teknologi

- HTML/CSS/JavaScript (vanilla)
- Supabase (database + auth)
- PWA-støtte for offline

## Oppsett

1. Klon repoet
2. Opne `docs/index.html` i nettlesar (for lokal test)
3. Eller køyr `npm run dev` for lokal server (server `docs/`)

> GitHub Pages bør peike på `docs/` som "source".

## Brukarar

Brukarlista blir henta frå Supabase-tabellen `users` (eller frå lokal fallback ved offline).

## Database

Supabase-prosjekt: Elkontroll
Tabellar: users, apartments, inspections, inspection_items, inspection_photos, deviations

> Merk: `config.js` bruker Supabase anon-nøkkel i klienten. Sørg for at RLS er aktivert på alle tabellar.

## Personvern og lokal lagring

Appen lagrar inspeksjonar, bilete og brukardata lokalt i nettlesaren for offline-støtte.
Sørg for at einingar er låst og at data blir rydda ved behov.
