-- Schéma pre appku Lovky. Spusti raz v Supabase SQL editore.
-- Bezpečnosť: RLS zapnuté na všetkých tabuľkách, prístup má len prihlásený
-- používateľ (registrácia je vypnutá => existujú len 2 povolené účty).

create table if not exists public.settings (
  id int primary key default 1,
  people jsonb not null default '{"S":"Samuel","M":"Marcelka"}',
  default_ratio_s numeric not null default 0.65,
  constraint settings_single_row check (id = 1)
);

create table if not exists public.categories (
  id text primary key,
  name text not null,
  color text not null,
  sort int not null default 0
);

create table if not exists public.merchants (
  name text primary key,
  category text not null
);

create table if not exists public.expenses (
  id text primary key,
  month text not null,
  person text not null check (person in ('S', 'M')),
  merchant text not null default '',
  amount numeric not null,
  category text not null,
  note text
);
create index if not exists expenses_month_idx on public.expenses (month);

create table if not exists public.settlements (
  month text primary key,
  ratio_s numeric not null,
  settled_at text
);

-- východzí riadok nastavení
insert into public.settings (id) values (1) on conflict (id) do nothing;

-- Row Level Security
alter table public.settings enable row level security;
alter table public.categories enable row level security;
alter table public.merchants enable row level security;
alter table public.expenses enable row level security;
alter table public.settlements enable row level security;

do $$
declare t text;
begin
  foreach t in array array['settings', 'categories', 'merchants', 'expenses', 'settlements']
  loop
    execute format('drop policy if exists auth_all on public.%I', t);
    execute format(
      'create policy auth_all on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
