-- Aggiunge un numero d'ordine alle classi, così vengono mostrate
-- nell'ordine in cui sono state create (Prima, Seconda, Terza...)
-- invece che in ordine alfabetico.
alter table classes add column position serial;
