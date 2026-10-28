-- Perluas batasan status kampanye agar mendukung running dan completed secara penuh
alter table public.campaigns
  drop constraint if exists campaigns_status_check;

alter table public.campaigns
  add constraint campaigns_status_check
  check (status in ('draft', 'scheduled', 'running', 'sending', 'completed', 'sent', 'cancelled', 'failed'));
