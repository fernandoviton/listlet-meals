-- Migration 001: add a dated `slot_date` column to listlet_meals.
--
-- Run this in the Supabase SQL editor against the existing production table.
-- It is idempotent (safe to re-run) and edits no existing data: the column is
-- GENERATED ALWAYS ... STORED, so Postgres backfills every existing row from its
-- `content` during the ALTER — no separate backfill step.
--
-- Why: a dated calendar grows ~4 slot rows/day without bound, and the app/CLI
-- read with a single un-paginated `select ... order by created_at` capped at
-- ~1000 rows ascending — so the NEWEST slots silently drop once a calendar passes
-- ~1 year. `date` lived only inside the JSON `content`, so the DB could not filter
-- on it. This real, indexed column lets reads fetch only the visible week / trends
-- range (~28 rows), sidestepping the cap for calendars.

-- Derive a slot's calendar date from its JSON content. IMMUTABLE so it can back a
-- generated column; the exception guard means a non-JSON / dateless row (the ''
-- default, library meals, anything malformed) degrades to NULL, never blocking a write.
create or replace function meals_slot_date(content text)
returns date immutable language plpgsql as $$
begin
    return (nullif(content, '')::jsonb ->> 'date')::date;
exception when others then
    return null;
end;
$$;

alter table listlet_meals
    add column if not exists slot_date date
    generated always as (meals_slot_date(content)) stored;

create index if not exists idx_listlet_meals_list_name_date
    on listlet_meals (list_name, slot_date);

-- Spot-check after running:
--   select content, slot_date from listlet_meals where list_name <> 'library' limit 20;
-- Expect slot_date to match each slot's JSON `date`; library rows show NULL.
