# Kora Kaagaz Invoice Generator

Private web app that builds invoices matching the Kora Kaagaz template, exports pixel-identical PDFs, and keeps a searchable history (paid/unpaid, saved clients, duplicate).

**Full guide:** open [`docs/architecture.html`](docs/architecture.html) in a browser.

## Quick start

```bash
npm install
cp .env.example .env.local   # fill in Supabase URL/key, your email, site URL
# run supabase/migrations/0001_init.sql in the Supabase SQL editor
npm run dev
npm test
```

Stack: Next.js 15 · Tailwind 4 · Supabase (Postgres, Auth, Storage) · Puppeteer PDFs · Vercel.
