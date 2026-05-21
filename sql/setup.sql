-- Listlet shared database setup
-- Run this in Supabase SQL Editor

drop table if exists listlet_meals cascade;

create table listlet_meals (
    id uuid default gen_random_uuid() primary key,
    list_name text not null,
    content text not null default '',
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);
create index idx_listlet_meals_list_name on listlet_meals(list_name);

-- Auto-update updated_at on changes
create or replace function update_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists listlet_meals_updated_at on listlet_meals;
create trigger listlet_meals_updated_at
    before update on listlet_meals
    for each row
    execute function update_updated_at();

-- Row Level Security
alter table listlet_meals enable row level security;

create policy "Authenticated users can read all items"
    on listlet_meals for select
    to authenticated
    using (true);

create policy "Authenticated users can insert items"
    on listlet_meals for insert
    to authenticated
    with check (true);

create policy "Authenticated users can update items"
    on listlet_meals for update
    to authenticated
    using (true);

create policy "Authenticated users can delete items"
    on listlet_meals for delete
    to authenticated
    using (true);

-- Enable Realtime
alter publication supabase_realtime add table listlet_meals;
