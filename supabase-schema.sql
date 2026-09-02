-- Schema per l'app "Orario Scuola"
-- Da incollare ed eseguire nell'SQL Editor di Supabase (una sola volta)

create extension if not exists pgcrypto;

create table teachers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  total_hours integer not null default 0
);

create table subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null
);

create table classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#3E6B5F',
  position serial
);

create table assignments (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references teachers(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  hours integer not null default 1
);

create table slots (
  id uuid primary key default gen_random_uuid(),
  day integer not null,
  period_index integer not null,
  is_co boolean not null default false,
  co_offset_minutes integer,
  co_duration_minutes integer,
  assignment_id uuid not null references assignments(id) on delete cascade
);

-- Sicurezza: lettura pubblica (serve per la vista insegnante senza login),
-- scrittura riservata a chi ha effettuato il login (la direzione).

alter table teachers enable row level security;
alter table subjects enable row level security;
alter table classes enable row level security;
alter table assignments enable row level security;
alter table slots enable row level security;

create policy "public read teachers" on teachers for select using (true);
create policy "auth write teachers insert" on teachers for insert with check (auth.role() = 'authenticated');
create policy "auth write teachers update" on teachers for update using (auth.role() = 'authenticated');
create policy "auth write teachers delete" on teachers for delete using (auth.role() = 'authenticated');

create policy "public read subjects" on subjects for select using (true);
create policy "auth write subjects insert" on subjects for insert with check (auth.role() = 'authenticated');
create policy "auth write subjects update" on subjects for update using (auth.role() = 'authenticated');
create policy "auth write subjects delete" on subjects for delete using (auth.role() = 'authenticated');

create policy "public read classes" on classes for select using (true);
create policy "auth write classes insert" on classes for insert with check (auth.role() = 'authenticated');
create policy "auth write classes update" on classes for update using (auth.role() = 'authenticated');
create policy "auth write classes delete" on classes for delete using (auth.role() = 'authenticated');

create policy "public read assignments" on assignments for select using (true);
create policy "auth write assignments insert" on assignments for insert with check (auth.role() = 'authenticated');
create policy "auth write assignments update" on assignments for update using (auth.role() = 'authenticated');
create policy "auth write assignments delete" on assignments for delete using (auth.role() = 'authenticated');

create policy "public read slots" on slots for select using (true);
create policy "auth write slots insert" on slots for insert with check (auth.role() = 'authenticated');
create policy "auth write slots update" on slots for update using (auth.role() = 'authenticated');
create policy "auth write slots delete" on slots for delete using (auth.role() = 'authenticated');

-- Dati di esempio (facoltativo — puoi cancellarli dopo dalla dashboard Supabase
-- oppure ometterli non eseguendo questa parte)

insert into teachers (name, total_hours) values
  ('Emanuela', 22), ('Sara', 22), ('Martina', 24), ('Lia', 18),
  ('Goretta', 12), ('Chiara', 22), ('Rossella', 20);

insert into subjects (name) values
  ('Italiano'), ('Storia'), ('Matematica'), ('Scienze'), ('Musica'), ('Arte'), ('Educazione fisica');

insert into classes (name, color) values
  ('Prima', '#D9973F'), ('Seconda', '#3E6B5F'), ('Terza', '#3B6EA5'), ('Quarta', '#8B5FA8'), ('Quinta', '#B5482F');
