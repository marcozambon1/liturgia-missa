-- ==============================================================================
-- Cantos & Liturgia — Schema para Supabase
-- ==============================================================================
-- Execute este script no SQL Editor do seu projeto Supabase (https://supabase.com).
-- Ele cria as tabelas necessárias, configura o Realtime e as permissões de acesso.

-- 1. Criação das tabelas
-- Armazenamos os documentos com 'id' primário e 'data' no formato JSONB para
-- manter total compatibilidade com a estrutura de documentos do aplicativo.

create table if not exists public.songs (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

create table if not exists public.missas (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

create table if not exists public.rascunhos (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

create table if not exists public.salmos (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

create table if not exists public.aclamacoes (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

create table if not exists public.pedidos (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

create table if not exists public.config (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

create table if not exists public.repertorios (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

-- 2. Habilitação de Row Level Security (RLS)
alter table public.songs enable row level security;
alter table public.missas enable row level security;
alter table public.rascunhos enable row level security;
alter table public.salmos enable row level security;
alter table public.aclamacoes enable row level security;
alter table public.pedidos enable row level security;
alter table public.config enable row level security;
alter table public.repertorios enable row level security;

-- 3. Políticas de Acesso Público (Leitura e Escrita via chave anon)
-- Permite que os membros do grupo acessem e atualizem os cantos e missas
create policy "Acesso público songs" on public.songs for all using (true) with check (true);
create policy "Acesso público missas" on public.missas for all using (true) with check (true);
create policy "Acesso público rascunhos" on public.rascunhos for all using (true) with check (true);
create policy "Acesso público salmos" on public.salmos for all using (true) with check (true);
create policy "Acesso público aclamacoes" on public.aclamacoes for all using (true) with check (true);
create policy "Acesso público pedidos" on public.pedidos for all using (true) with check (true);
create policy "Acesso público config" on public.config for all using (true) with check (true);
create policy "Acesso público repertorios" on public.repertorios for all using (true) with check (true);

-- 4. Habilitação do Realtime
-- Adiciona as tabelas à publicação realtime para sincronização instantânea
do $$
begin
  begin
    alter publication supabase_realtime add table public.songs;
  exception when duplicate_object then null; end;

  begin
    alter publication supabase_realtime add table public.missas;
  exception when duplicate_object then null; end;

  begin
    alter publication supabase_realtime add table public.rascunhos;
  exception when duplicate_object then null; end;

  begin
    alter publication supabase_realtime add table public.salmos;
  exception when duplicate_object then null; end;

  begin
    alter publication supabase_realtime add table public.aclamacoes;
  exception when duplicate_object then null; end;

  begin
    alter publication supabase_realtime add table public.pedidos;
  exception when duplicate_object then null; end;

  begin
    alter publication supabase_realtime add table public.config;
  exception when duplicate_object then null; end;

  begin
    alter publication supabase_realtime add table public.repertorios;
  exception when duplicate_object then null; end;
end;
$$;
