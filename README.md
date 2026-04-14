<!-- Copyright (C) 2026 embsign AB -->
<!-- SPDX-License-Identifier: AGPL-3.0-only -->

# BRF Bokningsportal (webben)

Multi-tenant bokningssystem för **bostadsrättsföreningar (BRF)** och **fastighetsägare**: varje kund (tenant) har egen data, och användare når sin förening via unika åtkomstlänkar. Den här katalogen innehåller **webbapplikationen** (frontend + API på Cloudflare Pages med D1). **Android-kioskappen** ingår inte här och tillhandahålls inte som AGPL-källkod i detta repo.

Teknik: **Cloudflare Pages** (statiska tillgångar + Vite-bygge), **Pages Functions** (TypeScript som anropar delad logik i `backend/`), **Cloudflare D1** (SQLite).

## Gratisversion

Denna tjänst tillhandahålls gratis av [embsign AB](https://embsign.se) på [bokningsportal.app](https://bokningsportal.app).

## Licens

Projektet i detta repo licensieras under **GNU Affero General Public License v3.0** (AGPL-3.0). Se filen `LICENSE`. Lägg gärna till tydlig **upphovsrätts- och licensinformation i källfilerna** enligt rekommendationen i slutet av AGPL-texten. Om du kör en modifierad version som användare når över nätverket ska du enligt licensen erbjuda motsvarande källkod till användarna.

Copyright (C) 2026 embsign AB.

## Bygga lokalt

Kräver **Node.js 22** (rekommenderas samma major som i CI).

```sh
cd backend && npm ci
cd ../frontend && npm ci && npm run build
```

`npm run build` i frontend skapar `frontend/dist/` (Vite) och kopierar in `functions/` dit (se `frontend/package.json`).

## Köra lokalt (API + byggd frontend)

Från repots rot, med Wrangler (installeras via `backend`):

```sh
cd backend && npm run dev
```

Öppna `http://localhost:8787`. Vid första körning mot **lokal D1** kan migrering behövas manuellt (känt D1/PRAGMA-beteende i vissa miljöer):

```sh
cd backend
npm run db:local
```

Alternativt kör SQL-filerna mot din lokala D1-instans med `wrangler d1 execute …` och `--file` mot `db/migrations/001_initial_schema.sql`, `002_tenant_last_changed.sql` och `db/seed.sql` (se `backend/package.json` skript `db:local`).

## Deploy till produktion (översikt)

1. Skapa ett **Cloudflare D1**-databas och kör **migreringar** (samma SQL som i `db/migrations/`) samt ev. `db/seed.sql` om du vill ha demodata.
2. Uppdatera `database_id` för D1-bindingen i `wrangler.toml` (eller använd Wranglers sätt att override:a per miljö) så att den pekar på din databas.
3. Bygg frontend enligt avsnittet **Bygga lokalt**.
4. Deploya med Wrangler Pages, t.ex. från repots rot (Wrangler läser `wrangler.toml`):

   ```sh
   npx wrangler pages deploy --project-name <ditt-pages-projekt>
   ```

   Du behöver inloggning mot Cloudflare (`wrangler login` eller API-token i CI) och rätt **account id**. Lägg aldrig in hemligheter i git.

## Repo-struktur

| Sökväg        | Innehåll |
|---------------|----------|
| `frontend/`   | Vite-app, statiska resurser, Pages Functions under `functions/` |
| `backend/`    | TypeScript för API/worker (importeras av Pages Functions) |
| `db/`         | SQL-migreringar och seed |
| `wrangler.toml` | Pages build output (`frontend/dist`) och D1-binding |
