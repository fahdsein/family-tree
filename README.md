# Roots & Leaves family archive

A deployable family-tree web application built around explicit people, partnership histories, and parent-child links. It supports remarriage, children associated with a particular union, shared ancestors (including pedigree collapse), living/deceased status, privacy levels, role-based editing, and an auditable change history.

The original single-file prototype remains at `roots_leaves_family_tree_web_app.html` for reference. The deployable application is served from `public/` by `server.mjs`.

## What is included

- Responsive tree, profile, story, and relationship-explorer views
- Interactive SVG relationship graph with a selectable depth of one to seven generations
- Client-side PNG and PDF graph export
- Optional HTTPS profile photo and caption on every person record
- Fourteen selectable palettes organized into the original and forest collections
- Self-hosted typography: Lora for names and editorial headings, Inter for readable UI text, and Special Elite for restrained archival labels
- Separate records for people, unions, and parent-child links
- Multiple marriages or partnerships per person, each with dates, status, location, end reason, and evidence note
- Children linked to their relevant union while retaining direct links to both parents
- Relationship calculation that can report both a marriage and a shared ancestor
- Life statuses: living, deceased, presumed deceased, or unknown
- Family/private/public visibility controls
- Complete and partial person updates; administrators may permanently delete people and relationship records and review the audit log
- Named kinship inference for parents, children, siblings, grandparents, aunts/uncles, nieces/nephews, cousins, partners, and common in-law relationships
- Shortest-path relationship graph between any two connected people
- PostgreSQL persistence in production, with a JSON-file fallback for local development
- Docker image, Compose stack, health/readiness endpoints, and NEO App deployment configuration

## Local development

Requires Node.js 22 or newer.

```powershell
Copy-Item .env.example .env
npm install
npm test
npm run validate
npm start
```

Open `http://localhost:3000`. In development, the seeded accounts are:

- Administrator: `admin@roots.local` / `admin-demo`
- Editor: `editor@roots.local` / `editor-demo`

These demo passwords are disabled when `NODE_ENV=production`.

To run the complete local stack with PostgreSQL:

```powershell
Copy-Item .env.example .env
docker compose up --build
```

## Typography recommendation

The default pairing is **Lora + Inter**. Lora gives family names, biographies, and page titles an heirloom-book character; Inter keeps controls, dates, tables, and smaller tree-card text readable across desktop and mobile. **Special Elite** is deliberately limited to generation labels so the typewriter effect remains meaningful rather than becoming visually noisy.

The font files come from open-source Fontsource packages and are served locally by the app. This avoids Google Fonts availability, tracking, and Content Security Policy issues in private family deployments. System-font fallbacks remain defined so content stays usable while fonts load or if an asset is unavailable.

## Theme recommendation

The original collection contains Heritage Parchment, Evergreen Archive, Nordic Calm, Golden Heirloom, Midnight Genealogy, Royal Plum, and Blossom & Sage. The forest collection adds Deep Whispering Pine, Mossy Grove, Fern & Cedar, Misty Redwood Canopy, Golden Sunlight Through Leaves, Emerald Archive, and Botanical Illustration.

**Emerald Archive** is the recommended primary brand theme: the jewel green communicates longevity and trust, the antique-brass secondary color supports heirloom details, and its pale background keeps dense family-tree research comfortable. **Mossy Grove** is the softer accessibility-oriented alternative for longer sessions, while **Fern & Cedar** is the warmest choice for family stories and reunions.

## Data model

- `people`: identity, gender/pronouns, alternate names, approximate or exact vital dates, life status, biography, optional photo, branch, tags, and privacy.
- `unions`: exactly two partners, union type, historical status, start/end dates, location, end reason, and evidence.
- `parentLinks`: one parent and one child, parent type (biological, adoptive, step, foster, guardian, donor, surrogate, or unknown), confidence, evidence, and optional union association.

The graph rejects self-links, duplicate parent links, and ancestry cycles. It does not assume that marriage implies parenthood, or that parenthood implies marriage.

## Production environment

Set all of the following as secrets or environment variables:

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | supplied by platform | HTTP listener; defaults to `3000` |
| `NODE_ENV` | yes | Set to `production` |
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `DATABASE_AUTO_MIGRATE` | recommended | `true` creates the document table on first boot |
| `SESSION_SECRET` | yes | Random value of at least 24 characters |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | yes | Administrator login |
| `EDITOR_EMAIL` / `EDITOR_PASSWORD` | optional | Editor login |
| `TREE_NAME` | optional | Family archive title |

Use unique high-entropy passwords. The built-in authentication is appropriate for a small private deployment; for a larger or public product, connect an external identity provider, add account recovery and MFA, and move media to private object storage with signed URLs.

## NEO App deployment

Create these components in the same NEO App environment:

1. A **NEO DB PostgreSQL** instance. Attach its connection string to the service as `DATABASE_URL`.
2. One **Web Service** from this repository and set the root directory to `demo-example/family-tree`.
3. Select **Dockerfile** deployment, expose port `3000`, and use `/health` for liveness and `/ready` for readiness.
4. Configure the production variables listed above. Generate new values for `SESSION_SECRET`, `ADMIN_PASSWORD`, and `EDITOR_PASSWORD`; never reuse `.env.example` values.
5. Deploy one instance. The database is the shared source of truth, so the service can later scale horizontally.

No worker, queue, cron job, or object-storage component is required for the current feature set. Add those only when implementing asynchronous GEDCOM imports, AI/OCR, scheduled time capsules, or photo/video uploads.

## Operational endpoints

- `GET /health` — process liveness
- `GET /ready` — persistence readiness
- `GET /api/bootstrap` — authorized, privacy-filtered application snapshot
- `POST /api/auth/login` and `POST /api/auth/logout`
- `POST /api/relationships/explain`
- `GET/POST/PATCH/DELETE /api/people`
- `POST/DELETE /api/unions`
- `POST/DELETE /api/parent-links`

## Current scope and next recommended milestones

This version is a functional family archive MVP. Before broad public use, the next priorities should be an external authentication provider with invitations/MFA, per-field privacy rules, encrypted object storage for media, GEDCOM import/export, richer relationship editing, citations as first-class records, database backups, and automated end-to-end browser tests.
