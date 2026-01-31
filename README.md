# elkontroll-alver[README.md](https://github.com/user-attachments/files/24975000/README.md)
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

- Cato (admin)
- Kristian
- Bjørn Inge

## Database

Supabase-prosjekt: Elkontroll
Tabellar: users, apartments, inspections, inspection_items, inspection_photos, deviations
