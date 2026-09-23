#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Export do Supabase para dados/*.json — o caminho inverso do seed.py.

A pasta dados/ é a cópia de segurança do banco. Ela importa mais aqui do que
num projeto comum: a política do schema.sql libera escrita para qualquer
visitante com a anonKey pública, então qualquer pessoa que abra o site pode
apagar os 432 cantos. Rodar este script de tempos em tempos (e commitar o
resultado) é o que garante que dá para recompor tudo com o seed.py.

Grava no mesmo formato que o seed.py espera: um array por tabela, cada item
sendo o documento inteiro com o "id" no fim.

Uso:
    python exportar.py
ou passando as credenciais diretamente:
    python exportar.py https://seu-projeto.supabase.co sua-chave-anon-ou-service-role
"""

import os
import sys
import json
import re
import urllib.request
import urllib.error

RAIZ = os.path.dirname(os.path.abspath(__file__))
DADOS_DIR = os.path.join(RAIZ, "dados")
CONFIG_JS = os.path.join(RAIZ, "config.js")

# Só o que vale guardar. rascunhos e pedidos ficam de fora de propósito: são
# estado transitório (cadastro pela metade, fila de liturgia já resolvida pela
# Action), não acervo que se queira restaurar.
TABELAS = [
    ("config", "config.json"),
    ("songs", "songs.json"),
    ("missas", "missas.json"),
    ("repertorios", "repertorios.json"),
    ("salmos", "salmos.json"),
    ("aclamacoes", "aclamacoes.json"),
]

PAGINA = 1000   # o PostgREST corta em 1000 por resposta; paginamos por Range


def obter_credenciais():
    if len(sys.argv) >= 3:
        return sys.argv[1].rstrip("/"), sys.argv[2]

    # Preferir as variáveis de ambiente (é assim que a Action injeta os secrets)
    url = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
    key = os.environ.get("SUPABASE_KEY", "").strip()
    if url and key:
        return url, key

    if os.path.exists(CONFIG_JS):
        with open(CONFIG_JS, "r", encoding="utf-8") as f:
            conteudo = f.read()
        m_url = re.search(r'url\s*:\s*["\']([^"\']+)["\']', conteudo)
        m_key = re.search(r'anonKey\s*:\s*["\']([^"\']+)["\']', conteudo)
        if m_url and m_key and "SEU-PROJETO" not in m_url.group(1) and len(m_key.group(1)) > 20:
            return m_url.group(1).rstrip("/"), m_key.group(1)

    print("=== Configuração do Supabase ===")
    url = input("URL do projeto Supabase (ex: https://xyz.supabase.co): ").strip().rstrip("/")
    key = input("Chave API (Anon Key ou Service Role): ").strip()
    return url, key


def buscar_tabela(url, key, tabela):
    """Devolve todas as linhas de uma tabela, paginando pelo header Range."""
    linhas = []
    inicio = 0
    while True:
        endpoint = f"{url}/rest/v1/{tabela}?select=id,data&order=id.asc"
        headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Range-Unit": "items",
            "Range": f"{inicio}-{inicio + PAGINA - 1}",
        }
        req = urllib.request.Request(endpoint, headers=headers, method="GET")
        try:
            with urllib.request.urlopen(req) as resp:
                lote = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            corpo = e.read().decode("utf-8", errors="ignore")
            print(f"\n[ERRO] HTTP {e.code} ao ler {tabela}: {corpo}")
            return None
        except Exception as e:
            print(f"\n[ERRO] Falha de conexão com {tabela}: {e}")
            return None

        linhas.extend(lote)
        if len(lote) < PAGINA:
            return linhas
        inicio += PAGINA


def documento(linha):
    """O documento inteiro vive no jsonb 'data'; o 'id' vai no fim, como o
    seed.py grava e como os arquivos já versionados estão."""
    dados = linha.get("data") or {}
    ordenado = {chave: dados[chave] for chave in sorted(dados) if chave != "id"}
    ordenado["id"] = linha.get("id")
    return ordenado


def exportar_tabela(url, key, tabela, arquivo_json):
    print(f"[*] Lendo '{tabela}'...", end="", flush=True)
    linhas = buscar_tabela(url, key, tabela)
    if linhas is None:
        print(f" [!] pulando {arquivo_json} — leitura falhou, arquivo anterior mantido.")
        return False

    itens = [documento(linha) for linha in linhas]
    caminho = os.path.join(DADOS_DIR, arquivo_json)

    # Desde que o banco passou a exigir login (schema.sql, seção 5), ler sem
    # permissão NÃO dá erro: o RLS simplesmente devolve zero linhas. Sem esta
    # guarda, rodar o export com a anonKey apagaria o backup inteiro e o commit
    # pareceria normal. Se a tabela veio vazia e o arquivo anterior tinha
    # conteúdo, isso é permissão faltando, não tabela esvaziada.
    if not itens and os.path.exists(caminho):
        try:
            with open(caminho, encoding="utf-8") as f:
                anterior = json.load(f)
        except Exception:
            anterior = []
        if anterior:
            print(f" [!] 0 registros, mas dados/{arquivo_json} tem {len(anterior)}.")
            print("     Backup anterior mantido. Quase sempre é a chave sem permissão de")
            print("     leitura: use a service_role (Settings > API no Supabase) ou exporte")
            print("     logado. Se a tabela foi esvaziada mesmo, apague o arquivo e rode de novo.")
            return False

    # Só grava depois de ler tudo: um erro no meio não pode deixar o backup
    # anterior pela metade.
    with open(caminho, "w", encoding="utf-8", newline="\n") as f:
        json.dump(itens, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f" {len(itens)} registro(s) -> dados/{arquivo_json}")
    return True


def main():
    print("\n--- Export do Livro de Cantos (Supabase -> dados/) ---")
    url, key = obter_credenciais()
    if not url or not key:
        print("[!] URL e chave são obrigatórios. Abortando.")
        sys.exit(1)

    os.makedirs(DADOS_DIR, exist_ok=True)
    falhas = [tab for tab, arq in TABELAS if not exportar_tabela(url, key, tab, arq)]

    if falhas:
        print(f"\n[!] Terminou com falha em: {', '.join(falhas)}.")
        sys.exit(1)
    print("\n[OK] Backup atualizado. Confira o diff antes de commitar.")


if __name__ == "__main__":
    main()
