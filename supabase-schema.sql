-- Schéma cible Supabase/PostgreSQL pour la version multi-utilisateur.
create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  pseudo text not null unique,
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now()
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  logo_url text,
  active boolean not null default true
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  first_name text,
  last_name text not null,
  active boolean not null default true,
  unique(team_id, first_name, last_name)
);

create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  season text not null,
  round_number int not null,
  label text not null,
  deadline timestamptz not null,
  status text not null default 'open' check (status in ('draft','open','locked','scored','archived')),
  unique(season, round_number)
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds(id) on delete cascade,
  home_team_id uuid not null references public.teams(id),
  away_team_id uuid not null references public.teams(id),
  kickoff_at timestamptz,
  home_score integer check (home_score is null or home_score >= 0),
  away_score integer check (away_score is null or away_score >= 0),
  actual_result text check (actual_result in ('home','draw','away')),
  home_offensive_bonus boolean not null default false,
  home_defensive_bonus boolean not null default false,
  away_offensive_bonus boolean not null default false,
  away_defensive_bonus boolean not null default false,
  check (home_team_id <> away_team_id)
);

create table public.match_predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  predicted_result text not null check (predicted_result in ('home','draw','away')),
  home_offensive_bonus boolean not null default false,
  home_defensive_bonus boolean not null default false,
  away_offensive_bonus boolean not null default false,
  away_defensive_bonus boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, match_id)
);

create table public.try_predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  round_id uuid not null references public.rounds(id) on delete cascade,
  player_id uuid not null references public.players(id),
  slot smallint not null check (slot between 1 and 3),
  unique(user_id, round_id, slot),
  unique(user_id, round_id, player_id)
);

create table public.match_try_scorers (
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references public.players(id),
  tries int not null default 1 check (tries >= 1),
  primary key(match_id, player_id)
);

create table public.round_scores (
  user_id uuid not null references public.profiles(id) on delete cascade,
  round_id uuid not null references public.rounds(id) on delete cascade,
  result_points int not null default 0,
  bonus_points int not null default 0,
  scorer_points int not null default 0,
  total_points int generated always as (result_points + bonus_points + scorer_points) stored,
  calculated_at timestamptz not null default now(),
  primary key(user_id, round_id)
);

-- RLS à activer en production. Principe recommandé :
-- 1. Tout utilisateur authentifié peut lire équipes, joueurs, journées, matchs et classements.
-- 2. Un utilisateur ne peut créer/modifier que ses propres pronostics avant rounds.deadline.
-- 3. Les pronostics individuels des autres joueurs ne deviennent lisibles qu'après la deadline (optionnel mais conseillé).
-- 4. Seuls les profils role='admin' peuvent modifier calendrier, résultats et marqueurs réels.
