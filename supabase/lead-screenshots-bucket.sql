-- Public bucket for the homepage screenshots the GTH agent takes when it
-- scores a lead (PageSpeed Insights final screenshot). The agent also
-- creates it at runtime if missing, so running this is optional.
insert into storage.buckets (id, name, public)
values ('lead-screenshots', 'lead-screenshots', true)
on conflict (id) do update set public = true;
