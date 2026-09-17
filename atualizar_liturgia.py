#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script para sincronizar Salmos e Aclamações da Liturgia Diária da CNBB
diretamente no banco de dados do Supabase.

Pode ser executado manualmente ou agendado no GitHub Actions.

Uso:
    python atualizar_liturgia.py [dias_a_frente]
Exemplo:
    python atualizar_liturgia.py 30
"""

import os
import sys
import json
import re
import datetime
import urllib.request
import urllib.error

RAIZ = os.path.dirname(os.path.abspath(__file__))
CONFIG_JS = os.path.join(RAIZ, "config.js")

def obter_credenciais():
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_KEY", "") or os.environ.get("SUPABASE_ANON_KEY", "")

    if url and key:
        return url.rstrip("/"), key

    if os.path.exists(CONFIG_JS):
        with open(CONFIG_JS, "r", encoding="utf-8") as f:
            conteudo = f.read()
            m_url = re.search(r'url\s*:\s*["\']([^"\']+)["\']', conteudo)
            m_key = re.search(r'anonKey\s*:\s*["\']([^"\']+)["\']', conteudo)
            if m_url and m_key and "SEU-PROJETO" not in m_url.group(1) and len(m_key.group(1)) > 20:
                return m_url.group(1).rstrip("/"), m_key.group(1)

    print("[!] Credenciais do Supabase não encontradas.")
    sys.exit(1)

def enviar_doc(url, key, tabela, doc_id, data):
    endpoint = f"{url}/rest/v1/{tabela}"
    payload = json.dumps([{"id": doc_id, "data": data}]).encode("utf-8")
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
    }
    req = urllib.request.Request(endpoint, data=payload, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status in (200, 201)
    except Exception as e:
        print(f"Erro ao salvar {tabela}/{doc_id}: {e}")
        return False

def processar_dia(url, key, dt):
    data_iso = dt.strftime("%Y-%m-%d")
    dia_str = f"{dt.day:02d}"
    mes_str = f"{dt.month:02d}"
    ano_str = str(dt.year)

    api_url = f"https://liturgia.up.railway.app/v2/?dia={dia_str}&mes={mes_str}&ano={ano_str}"
    req = urllib.request.Request(api_url, headers={"User-Agent": "Mozilla/5.0"})

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            d = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"[-] {data_iso}: falha na API liturgia ({e})")
        return False

    liturgia_nome = d.get("liturgia", "")
    cor = d.get("cor", "")
    leituras = d.get("leituras", {})

    # Salmo
    salmos = leituras.get("salmo", [])
    if salmos:
        s = salmos[0]
        refrao = re.sub(r"^[—\-\s]+", "", s.get("refrao", "")).strip()
        raw_texto = s.get("texto", "")
        estrofes = [
            re.sub(r"^[—\-\s]+", "", l).strip()
            for l in re.split(r"\n+", raw_texto)
            if l.strip()
        ]
        if estrofes and estrofes[0] == refrao:
            estrofes.pop(0)

        salmo_doc = {
            "id": data_iso,
            "data": data_iso,
            "liturgia": liturgia_nome,
            "cor": cor,
            "referencia": s.get("referencia", "Salmo Responsorial"),
            "refrao": refrao,
            "estrofes": estrofes,
            "fonte": "liturgia.up.railway.app (liturgia diária CNBB)",
            "criadoEm": datetime.datetime.now(datetime.timezone.utc).isoformat()
        }
        enviar_doc(url, key, "salmos", data_iso, salmo_doc)

    # Aclamação
    evangelhos = leituras.get("evangelho", [])
    if evangelhos:
        ev = evangelhos[0]
        aclamacao_doc = {
            "id": data_iso,
            "data": data_iso,
            "liturgia": liturgia_nome,
            "referencia": ev.get("referencia", "Aclamação ao Evangelho"),
            "refrao": "Aleluia, Aleluia, Aleluia.",
            "estrofes": [ev.get("titulo", "Proclamação do Evangelho")],
            "fonte": "liturgia.up.railway.app (liturgia diária CNBB)",
            "criadoEm": datetime.datetime.now(datetime.timezone.utc).isoformat()
        }
        enviar_doc(url, key, "aclamacoes", data_iso, aclamacao_doc)

    print(f"[+] {data_iso}: Liturgia salva com sucesso ({liturgia_nome})")
    return True

def main():
    dias = 30
    if len(sys.argv) > 1:
        try:
            dias = int(sys.argv[1])
        except ValueError:
            pass

    url, key = obter_credenciais()
    hoje = datetime.date.today()
    print(f"=== Sincronizando Liturgia Diária ({dias} dias a partir de {hoje}) ===")

    for i in range(dias):
        dt = hoje + datetime.timedelta(days=i)
        processar_dia(url, key, dt)

    print("\n[OK] Sincronização concluída!")

if __name__ == "__main__":
    main()
