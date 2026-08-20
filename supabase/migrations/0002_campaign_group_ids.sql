-- Ad-hoc group selection for a single campaign (overrides audience when set).
alter table public.campaigns add column if not exists group_ids text[];
