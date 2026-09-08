-- Migration : table ulule_backers
-- Stocke les contributeurs importés depuis les exports CSV Ulule (pas d'API temps réel
-- pour les créateurs — l'import est manuel, déclenché depuis le dashboard admin).
-- Miroir exact de kickstarter_backers (voir supabase-migration-kickstarter-backers.sql) :
-- même structure, même logique d'import, seule la plateforme d'origine change.
-- À exécuter manuellement dans le SQL Editor Supabase.

create table if not exists ulule_backers (
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

-- Un numéro de contributeur Ulule est stable d'un export à l'autre : ré-importer le même
-- rapport (ex. après de nouvelles contributions) met à jour la ligne existante au lieu de
-- dupliquer. Les lignes sans numéro (export non standard) restent insérées telles quelles.
create unique index if not exists ulule_backers_backer_number_key
  on ulule_backers (backer_number)
  where backer_number is not null and backer_number <> '';

create index if not exists ulule_backers_batch_idx on ulule_backers (import_batch_id);
create index if not exists ulule_backers_email_idx on ulule_backers (email);

-- RLS activée sans policy publique : seules les fonctions serverless (service_role,
-- qui contourne RLS) lisent/écrivent cette table, comme pour les autres tables sensibles.
alter table ulule_backers enable row level security;

comment on table ulule_backers is
  'Contributeurs Ulule importés manuellement (CSV export du créateur) depuis le dashboard admin — pas de sync temps réel possible, Ulule n''expose pas d''API publique de contributions pour les créateurs.';
