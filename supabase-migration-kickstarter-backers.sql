-- Migration : table kickstarter_backers
-- Stocke les backers importés depuis les exports CSV Kickstarter (pas d'API temps réel
-- pour les créateurs — l'import est manuel, déclenché depuis le dashboard admin).
-- À exécuter manuellement dans le SQL Editor Supabase.

create table if not exists kickstarter_backers (
  id uuid primary key default gen_random_uuid(),
  backer_number text,
  backer_name text,
  email text,
  reward_title text,
  pledge_amount numeric,
  currency text default 'EUR',
  status text,
  shipping_country text,
  shipping_address text,
  pledged_at timestamptz,
  raw jsonb,
  import_batch_id uuid not null,
  imported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Un backer_number Kickstarter est stable d'un export à l'autre : ré-importer le même
-- rapport (ex. après de nouveaux pledges) met à jour la ligne existante au lieu de dupliquer.
-- Les lignes sans backer_number (export non standard) restent insérées telles quelles.
create unique index if not exists kickstarter_backers_backer_number_key
  on kickstarter_backers (backer_number)
  where backer_number is not null and backer_number <> '';

create index if not exists kickstarter_backers_batch_idx on kickstarter_backers (import_batch_id);
create index if not exists kickstarter_backers_email_idx on kickstarter_backers (email);

-- RLS activée sans policy publique : seules les fonctions serverless (service_role,
-- qui contourne RLS) lisent/écrivent cette table, comme pour les autres tables sensibles.
alter table kickstarter_backers enable row level security;

comment on table kickstarter_backers is
  'Backers Kickstarter importés manuellement (CSV export du créateur) depuis le dashboard admin — pas de sync temps réel possible, Kickstarter n''expose pas d''API publique de pledges pour les créateurs.';
