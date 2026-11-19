-- Chrono-Rift: per-account characters (run once in the Supabase SQL editor)
--
-- Each signed-in player can own several characters. Row Level Security makes sure a
-- player can only ever read, create, change or delete their own characters.
-- save_data holds the character's progression (inventory, quests, talents, story).

create table if not exists public.arpg_characters (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 2 and 22),
  class_id    text not null check (class_id in ('vanguard', 'ranger', 'arcanist', 'berserker')),
  level       integer not null default 1 check (level between 1 and 100),
  save_data   jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists arpg_characters_user_idx on public.arpg_characters (user_id);
create unique index if not exists arpg_characters_user_name_idx on public.arpg_characters (user_id, lower(name));

alter table public.arpg_characters enable row level security;

drop policy if exists "Players read their own characters" on public.arpg_characters;
create policy "Players read their own characters"
  on public.arpg_characters for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Players create their own characters" on public.arpg_characters;
create policy "Players create their own characters"
  on public.arpg_characters for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Players update their own characters" on public.arpg_characters;
create policy "Players update their own characters"
  on public.arpg_characters for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Players delete their own characters" on public.arpg_characters;
create policy "Players delete their own characters"
  on public.arpg_characters for delete
  to authenticated
  using (auth.uid() = user_id);

-- keep updated_at current on every change
create or replace function public.arpg_characters_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists arpg_characters_touch on public.arpg_characters;
create trigger arpg_characters_touch before update on public.arpg_characters
  for each row execute function public.arpg_characters_touch();
