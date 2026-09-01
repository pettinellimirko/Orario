-- Migrazione: da "ore intere uguali ogni giorno" a periodi reali con minuti,
-- diversi per il martedì, con supporto alla compresenza.
-- Da eseguire nell'SQL Editor di Supabase sul progetto già esistente.

-- Svuotiamo la griglia già costruita (gli orari finora inseriti usavano il
-- vecchio schema a ore intere e non sono compatibili con quello nuovo).
-- Insegnanti, materie, classi e assegnazioni NON vengono toccate.
delete from slots;

alter table slots rename column hour to period_index;
alter table slots add column is_co boolean not null default false;
alter table slots add column co_offset_minutes integer;
alter table slots add column co_duration_minutes integer;
