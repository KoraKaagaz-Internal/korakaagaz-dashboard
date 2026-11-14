-- An invoice made outside the app (PDF or photo) can be attached to a payment logged on a project.
-- Files go in the admin-only "invoices" bucket under payments/<payment id>/ (policies from 0016).
alter table public.payments add column if not exists file_path text;
alter table public.payments add column if not exists file_name text not null default '';
