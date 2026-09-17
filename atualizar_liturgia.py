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

def raspar_versiculo_aclamacao(data_iso):
    """
    Tenta raspar o versículo bíblico da Aclamação ao Evangelho diretamente
    das páginas de liturgia (Canção Nova / Liturgia Diária).
    """
    urls_tentativas = [
        "https://liturgia.cancaonova.com/pb/",
        f"https://api-liturgia-diaria.vercel.app/?date={data_iso}"
    ]

    # 1. Tenta API secundária se tiver gospel.head
    try:
        req = urllib.request.Request(f"https://api-liturgia-diaria.vercel.app/?date={data_iso}", headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            d = json.loads(resp.read().decode("utf-8"))
            g = d.get("today", {}).get("readings", {}).get("gospel", {})
            head = g.get("head")
            if head:
                head = re.sub(r"^[—\-\s]+", "", head).strip()
                return head
    except Exception:
        pass

    # 2. Tenta raspagem HTML da página da Canção Nova
    try:
        req = urllib.request.Request("https://liturgia.cancaonova.com/pb/", headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=6) as resp:
            html_raw = resp.read().decode("utf-8", errors="ignore")
            # Procura por "Aleluia" seguido de parágrafo com o versículo
            m = re.search(r'Aleluia[^\n<]*</p>\s*<p[^>]*>(.*?)</p>', html_raw, re.I | re.S)
            if m:
                import html as html_lib
                texto = re.sub(r"<[^>]+>", "", m.group(1))
                texto = html_lib.unescape(texto)
                texto = re.sub(r"^[—\-\s]+", "", texto).strip()
                if texto and not texto.lower().startswith("proclamação"):
                    return texto
    except Exception:
        pass

    return None

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

    # Aclamação ao Evangelho (com versículo raspado do HTML se disponível)
    evangelhos = leituras.get("evangelho", [])
    if evangelhos:
        ev = evangelhos[0]
        versiculo_raspado = raspar_versiculo_aclamacao(data_iso)
        estrofes = [versiculo_raspado] if versiculo_raspado else []

        aclamacao_doc = {
            "id": data_iso,
            "data": data_iso,
            "liturgia": liturgia_nome,
            "referencia": ev.get("referencia", "Aclamação ao Evangelho"),
            "refrao": "Aleluia, Aleluia, Aleluia.",
            "estrofes": estrofes,
            "fonte": "Liturgia Diária CNBB",
            "criadoEm": datetime.datetime.now(datetime.timezone.utc).isoformat()
        }
        enviar_doc(url, key, "aclamacoes", data_iso, aclamacao_doc)

    print(f"[+] {data_iso}: Liturgia salva com sucesso ({liturgia_nome})")
    return True

def main():
    url, key = obter_credenciais()
    arg = sys.argv[1] if len(sys.argv) > 1 else "30"

    # Caso 1: Data específica no formato YYYY-MM-DD
    if re.match(r"^\d{4}-\d{2}-\d{2}$", arg):
        ano, mes, dia = map(int, arg.split("-"))
        dt = datetime.date(ano, mes, dia)
        print(f"=== Sincronizando data específica: {dt} ===")
        processar_dia(url, key, dt)
        print("\n[OK] Sincronização concluída!")
        return

    # Caso 2: Ano específico (ex.: 2027) -> sincroniza domingos e festas principais do ano
    if re.match(r"^\d{4}$", arg) and int(arg) > 2000:
        ano = int(arg)
        print(f"=== Sincronizando domingos e celebrações de {ano} ===")
        dt = datetime.date(ano, 1, 1)
        fim = datetime.date(ano, 12, 31)
        while dt <= fim:
            # Sincroniza domingos (weekday == 6) e grandes solenidades fixas
            if dt.weekday() == 6 or (dt.month == 12 and dt.day in (24, 25, 31)) or (dt.month == 1 and dt.day == 1) or (dt.month == 5 and dt.day == 31):
                processar_dia(url, key, dt)
            dt += datetime.timedelta(days=1)
        print(f"\n[OK] Sincronização de domingos e festas de {ano} concluída!")
        return

    # Caso 3: Quantidade de dias contínuos a partir de hoje
    try:
        dias = int(arg)
    except ValueError:
        dias = 30

    hoje = datetime.date.today()
    print(f"=== Sincronizando Liturgia Diária ({dias} dias a partir de {hoje}) ===")
    for i in range(dias):
        dt = hoje + datetime.timedelta(days=i)
        processar_dia(url, key, dt)

    print("\n[OK] Sincronização concluída!")

if __name__ == "__main__":
    main()
