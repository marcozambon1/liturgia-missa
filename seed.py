#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script de Carga Inicial (Seed) para o Supabase.
Envia os dados de dados/*.json diretamente para as tabelas do seu projeto Supabase.

Uso:
    python seed.py
ou passando as credenciais diretamente:
    python seed.py https://seu-projeto.supabase.co sua-chave-anon-ou-service-role
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

def obter_credenciais():
    if len(sys.argv) >= 3:
        return sys.argv[1].rstrip("/"), sys.argv[2]

    # Tenta ler de config.js
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

def enviar_lote(url, key, tabela, registros):
    endpoint = f"{url}/rest/v1/{tabela}"
    req_body = json.dumps(registros).encode("utf-8")
    
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
    }

    req = urllib.request.Request(endpoint, data=req_body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status in (200, 201)
    except urllib.error.HTTPError as e:
        corpo_erro = e.read().decode("utf-8", errors="ignore")
        print(f"\n[ERRO] HTTP {e.code} ao inserir em {tabela}: {corpo_erro}")
        return False
    except Exception as e:
        print(f"\n[ERRO] Falha de conexão com {tabela}: {e}")
        return False

def popular_tabela(url, key, tabela, arquivo_json, tamanho_lote=50):
    caminho = os.path.join(DADOS_DIR, arquivo_json)
    if not os.path.exists(caminho):
        print(f"[-] Arquivo não encontrado: {arquivo_json}")
        return

    with open(caminho, "r", encoding="utf-8") as f:
        itens = json.load(f)

    if not isinstance(itens, list):
        print(f"[-] Formato inesperado em {arquivo_json}: esperado array.")
        return

    registros = []
    for item in itens:
        doc_id = str(item.get("id", ""))
        if not doc_id:
            continue
        registros.append({
            "id": doc_id,
            "data": item
        })

    total = len(registros)
    print(f"[*] Enviando {total} registros para a tabela '{tabela}'...", end="", flush=True)

    sucesso = 0
    for i in range(0, total, tamanho_lote):
        lote = registros[i:i + tamanho_lote]
        if enviar_lote(url, key, tabela, lote):
            sucesso += len(lote)
            print(f" {sucesso}/{total}", end="", flush=True)
        else:
            print(f"\n[!] Falha no lote {i} a {i+len(lote)} da tabela {tabela}")
            break

    print(f"\n[OK] Concluído: {sucesso} de {total} registros em '{tabela}'.\n")

def main():
    print("\n--- Seed do Livro de Cantos no Supabase ---")
    url, key = obter_credenciais()
    if not url or not key:
        print("[!] URL e chave são obrigatórios. Abortando.")
        sys.exit(1)

    tabelas = [
        ("config", "config.json"),
        ("songs", "songs.json"),
        ("missas", "missas.json"),
        ("salmos", "salmos.json"),
        ("aclamacoes", "aclamacoes.json"),
    ]

    for tab, arq in tabelas:
        popular_tabela(url, key, tab, arq)

    print("\n[SUCESSO] Migracao de dados concluida com sucesso!")

if __name__ == "__main__":
    main()
