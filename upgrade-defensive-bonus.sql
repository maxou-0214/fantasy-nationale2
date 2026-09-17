-- Fantasy Nationale 2 — migration scores + bonus défensif automatique
-- Règle : toute défaite par 7 points ou moins donne un bonus défensif.

alter table public.matches
  add column if not exists home_score integer,
  add column if not exists away_score integer;

-- Contraintes : les scores ne peuvent pas être négatifs.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'matches_home_score_nonnegative'
      and conrelid = 'public.matches'::regclass
  ) then
    alter table public.matches
      add constraint matches_home_score_nonnegative
      check (home_score is null or home_score >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'matches_away_score_nonnegative'
      and conrelid = 'public.matches'::regclass
  ) then
    alter table public.matches
      add constraint matches_away_score_nonnegative
      check (away_score is null or away_score >= 0);
  end if;
end $$;

create or replace function private.derive_match_result_and_defensive_bonus()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  margin integer;
begin
  -- Tant que les deux scores ne sont pas renseignés, aucun résultat/BD n'est calculé.
  if new.home_score is null or new.away_score is null then
    new.actual_result := null;
    new.home_defensive_bonus := false;
    new.away_defensive_bonus := false;
    return new;
  end if;

  if new.home_score > new.away_score then
    new.actual_result := 'home';
    margin := new.home_score - new.away_score;
    new.home_defensive_bonus := false;
    new.away_defensive_bonus := (margin <= 7);

  elsif new.away_score > new.home_score then
    new.actual_result := 'away';
    margin := new.away_score - new.home_score;
    new.away_defensive_bonus := false;
    new.home_defensive_bonus := (margin <= 7);

  else
    new.actual_result := 'draw';
    new.home_defensive_bonus := false;
    new.away_defensive_bonus := false;
  end if;

  return new;
end;
$$;

revoke execute on function private.derive_match_result_and_defensive_bonus() from public;
revoke execute on function private.derive_match_result_and_defensive_bonus() from anon;
grant execute on function private.derive_match_result_and_defensive_bonus() to authenticated;

drop trigger if exists derive_match_result_and_defensive_bonus
on public.matches;

create trigger derive_match_result_and_defensive_bonus
before insert or update of home_score, away_score
on public.matches
for each row
execute function private.derive_match_result_and_defensive_bonus();

-- Vérification de la structure après migration.
select
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'matches'
  and column_name in ('home_score','away_score','actual_result','home_defensive_bonus','away_defensive_bonus')
order by ordinal_position;
