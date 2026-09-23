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

-- 3. Políticas de acesso — ver a seção 5, que é quem cria as políticas de
-- verdade. Até setembro/2026 aqui havia `for all using (true)`, que liberava
-- leitura E escrita para qualquer visitante com a anonKey (que é pública, vai
-- versionada no config.js). Quem manda agora é o login: as políticas exigem
-- usuário autenticado E com perfil ativo. Este bloco só apaga o que sobrou do
-- regime antigo, para o script poder rodar de novo sem dar erro de política
-- duplicada.
do $$
declare t text;
begin
  foreach t in array array['songs','missas','rascunhos','salmos','aclamacoes','pedidos','config','repertorios']
  loop
    execute format('drop policy if exists %I on public.%I', 'Acesso público ' || t, t);
  end loop;
end $$;

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

-- ==============================================================================
-- 5. Acesso só com login (Supabase Auth)
-- ==============================================================================
-- Antes desta seção, qualquer pessoa com a anonKey — que é pública, vai
-- versionada no config.js — lia e apagava tudo direto pelo PostgREST, sem
-- precisar abrir o site. Uma tela de login no JavaScript não resolveria isso:
-- quem quisesse era só ignorar o site. Quem passa a recusar é o banco.
--
-- Como uma pessoa ganha acesso:
--   1. um administrador cadastra o e-mail dela em `convites`;
--   2. ela entra no site, clica em "Primeiro acesso" e ESCOLHE A SENHA;
--   3. o gatilho abaixo só deixa a conta nascer se houver convite aberto, e
--      cria o `perfis` dela (herdando o `admin` do convite).
-- Não existe chave secreta no navegador em nenhum momento desse caminho.

-- 5.1 Quem tem acesso, e quem é administrador
create table if not exists public.perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  admin boolean not null default false,
  criado_em timestamptz not null default now()
);

-- Apagar o perfil revoga o acesso na hora, mesmo com a conta ainda existindo
-- no auth.users — é assim que um administrador tira alguém sem precisar da
-- chave service_role.
create table if not exists public.convites (
  email text primary key,
  admin boolean not null default false,
  convidado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  usado_em timestamptz
);

-- 5.2 Funções de apoio
-- SECURITY DEFINER de propósito: elas leem `perfis` por fora do RLS. Sem isso,
-- uma política de `perfis` que consulta `perfis` entra em recursão infinita.
create or replace function public.tem_acesso() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.perfis where id = auth.uid());
$$;

create or replace function public.eh_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select p.admin from public.perfis p where p.id = auth.uid()), false);
$$;

-- 5.3 O gatilho que exige convite
-- Levantar exceção aqui desfaz o cadastro inteiro: é o que impede alguém de
-- simplesmente se cadastrar sozinho e entrar no site.
create or replace function public.ao_criar_usuario() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  convite public.convites%rowtype;
begin
  select * into convite
    from public.convites
   where email = lower(new.email)
     and usado_em is null;

  if not found then
    raise exception 'E-mail sem convite aberto: %', new.email
      using errcode = '42501';
  end if;

  insert into public.perfis (id, email, admin)
  values (new.id, lower(new.email), convite.admin)
  on conflict (id) do nothing;

  update public.convites set usado_em = now() where email = convite.email;
  return new;
end;
$$;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.ao_criar_usuario();

-- 5.4 RLS de perfis e convites
alter table public.perfis enable row level security;
alter table public.convites enable row level security;

drop policy if exists "perfis: quem entrou enxerga o grupo" on public.perfis;
create policy "perfis: quem entrou enxerga o grupo" on public.perfis
  for select to authenticated using (public.tem_acesso());

drop policy if exists "perfis: admin promove ou rebaixa" on public.perfis;
create policy "perfis: admin promove ou rebaixa" on public.perfis
  for update to authenticated using (public.eh_admin()) with check (public.eh_admin());

-- `id <> auth.uid()` impede o administrador de remover o próprio acesso e
-- deixar o grupo sem ninguém que possa convidar.
drop policy if exists "perfis: admin remove outro" on public.perfis;
create policy "perfis: admin remove outro" on public.perfis
  for delete to authenticated using (public.eh_admin() and id <> auth.uid());

drop policy if exists "convites: só admin" on public.convites;
create policy "convites: só admin" on public.convites
  for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

-- 5.5 As oito tabelas de conteúdo passam a exigir login
do $$
declare t text;
begin
  foreach t in array array['songs','missas','rascunhos','salmos','aclamacoes','pedidos','config','repertorios']
  loop
    execute format('drop policy if exists %I on public.%I', t || ': só quem entrou', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.tem_acesso()) with check (public.tem_acesso())',
      t || ': só quem entrou', t);
  end loop;
end $$;

-- 5.6 O primeiro administrador
-- ⚠️ TROQUE O E-MAIL ABAIXO PELO SEU ANTES DE RODAR ESTE SCRIPT.
-- Isto não cria a conta nem define senha — cria o convite. Depois de rodar,
-- abra o site, clique em "Primeiro acesso", informe este mesmo e-mail e
-- escolha a sua senha. A conta nasce administradora.
insert into public.convites (email, admin)
values (lower('admin@exemplo.com'), true)
on conflict (email) do update set admin = true, usado_em = null;

-- ==============================================================================
-- Voltar atrás (só se o login quebrar o acesso do grupo e você precisar do site
-- no ar agora). Isto devolve o banco ao regime aberto — qualquer visitante lê e
-- apaga tudo de novo. É emergência, não configuração.
-- ==============================================================================
-- do $$
-- declare t text;
-- begin
--   foreach t in array array['songs','missas','rascunhos','salmos','aclamacoes','pedidos','config','repertorios']
--   loop
--     execute format('drop policy if exists %I on public.%I', t || ': só quem entrou', t);
--     execute format('create policy %I on public.%I for all using (true) with check (true)',
--                    'Acesso público ' || t, t);
--   end loop;
-- end $$;
