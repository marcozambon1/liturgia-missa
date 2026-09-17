(function(){
"use strict";

var MOMENTOS = [
  {id:"entrada", nome:"Entrada", cat:"Acolhida"},
  {id:"penitencial", nome:"Ato Penitencial", cat:"Ato Penitencial"},
  {id:"gloria", nome:"Glória", cat:"Glória"},
  {id:"salmo", nome:"Salmo Responsorial", cat:"Salmos"},
  {id:"aclamacao", nome:"Aclamação ao Evangelho", cat:"Aclamação"},
  {id:"ofertorio", nome:"Ofertório", cat:"Ofertório"},
  {id:"santo", nome:"Santo", cat:"Santo"},
  {id:"painosso", nome:"Pai Nosso", cat:"Pai Nosso"},
  {id:"paz", nome:"Saudação da Paz", cat:"Abraço da Paz"},
  {id:"cordeiro", nome:"Cordeiro de Deus", cat:"Cordeiro de Deus"},
  {id:"comunhao", nome:"Comunhão", cat:"Comunhão"},
  {id:"acaodegracas", nome:"Ação de Graças", cat:null},
  {id:"final", nome:"Final", cat:null}
];
var CATEGORIAS_LIVRO = ["Missa Cantada","Acolhida","Ato Penitencial","Glória","Salmos","Aclamação","Ofertório","Santo","Pai Nosso","Abraço da Paz","Cordeiro de Deus","Comunhão","Marianos","Espírito Santo","Natal","Meditação","Diversos","Mantras e Litânias"];

/* ---------------- transposição de tom ---------------- */
var TOM_OPTIONS = [
  {v:"C", l:"C"}, {v:"C#", l:"C#/Db"}, {v:"D", l:"D"}, {v:"D#", l:"D#/Eb"},
  {v:"E", l:"E"}, {v:"F", l:"F"}, {v:"F#", l:"F#/Gb"}, {v:"G", l:"G"},
  {v:"G#", l:"G#/Ab"}, {v:"A", l:"A"}, {v:"A#", l:"A#/Bb"}, {v:"B", l:"B"}
];
var SHARP_NOTES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
var FLAT_NOTES  = ["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"];
var FLAT_ROOTS = {"C#":1,"D#":1,"G#":1,"A#":1};
var NOTE_INDEX = {};
(function(){
  for(var i=0;i<12;i++){ NOTE_INDEX[SHARP_NOTES[i]]=i; NOTE_INDEX[FLAT_NOTES[i]]=i; }
})();
function rootLetter(tom){
  var m = /^([A-G])(#|b)?/.exec((tom||"").trim());
  return m ? (m[1]+(m[2]||"")) : "C";
}
function tomLabelForRoot(originalTom, targetRoot){
  var q = (originalTom||"").replace(/^[A-G](#|b)?/,"");
  return targetRoot+q;
}
function chooseScale(targetRoot){
  return FLAT_ROOTS[targetRoot] ? FLAT_NOTES : SHARP_NOTES;
}
function transposeToken(tok, semitones, scale){
  return tok.split("/").map(function(part){
    // o "(" inicial cobre acordes alternativos escritos como "(C)" ou "(Cm)"
    var m = /^(\()?([A-G])(#|b)?(.*)$/.exec(part);
    if(!m) return part;
    var abre = m[1] || "";
    var note = m[2]+(m[3]||"");
    var suffix = m[4];
    var idx = NOTE_INDEX[note];
    if(idx===undefined) return part;
    var newIdx = ((idx+semitones)%12+12)%12;
    return abre+scale[newIdx]+suffix;
  }).join("/");
}
function transposeLine(line, semitones, scale){
  if(!semitones || !isChordLine(line)) return line;
  return line.replace(/\S+/g, function(tok){ return transposeToken(tok, semitones, scale); });
}
function buildTomSelect(selectedRoot, extraClass, extraAttrs){
  return '<select class="tom-select'+(extraClass?(' '+extraClass):'')+'" '+(extraAttrs||"")+'>' + TOM_OPTIONS.map(function(o){
    return '<option value="'+o.v+'"'+(o.v===selectedRoot?' selected':'')+'>'+esc(o.l)+'</option>';
  }).join("") + '</select>';
}
function parseMissaEntry(raw){
  var parts = String(raw).split("|");
  return {numeroStr: parts[0], tom: parts[1] || null};
}
function encodeMissaEntry(numeroStr, targetRoot, originalRoot){
  if(!targetRoot || targetRoot === originalRoot) return numeroStr;
  return numeroStr + "|" + targetRoot;
}

var state = {
  songs: [],          // array of song docs {id, numero, numeroStr, titulo, tom, ritmo, categoria, corpo, origem}
  songsById: {},
  missas: [],
  missasById: {},
  pedidos: [],
  rascunhos: [],      // cadastros começados e ainda não salvos no livro
  salmos: {},           // salmo do dia por data (YYYY-MM-DD)
  aclamacoes: {},       // aclamação ao evangelho por data (mesma forma do salmo)
  config: {},           // heartbeat da tarefa agendada que processa a fila
  currentTab: "biblioteca",
  libView: "momento",
  libSearch: "",
  openCats: {},      // categorias expandidas na visão "Por momento"
  currentMissaId: null,
  detailSong: null,
  detailTom: null,
  previewMomento: null,   // momento que a prévia do seletor vai preencher
  pickerCtx: null,     // {missaId, momentoId}
  dbReady: false
};

var db = null;

function norm(s){
  return (s||"").toString().normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase();
}
function esc(s){
  return (s==null?"":String(s)).replace(/[&<>"']/g, function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
  });
}
function toast(msg){
  var t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(function(){ t.classList.remove("show"); }, 2200);
}
var somenteLeitura = false;
function marcarSomenteLeitura(){
  if(somenteLeitura) return;
  somenteLeitura = true;
  var b = document.getElementById("aviso-leitura");
  if(b) b.hidden = false;
}
/* Devolve um .catch() que explica a falha em vez de deixar o botao mudo.
   invalid_argument e como o banco recusa quem nao tem permissao de escrita. */
function aoFalharEscrita(msgPadrao){
  return function(e){
    var code = e && e.code;
    if(code === "invalid_argument"){
      marcarSomenteLeitura();
      toast("Sem permissao para salvar: voce esta em modo leitura.");
      return;
    }
    if(code === "quota_exceeded"){ toast("O livro atingiu o limite de itens."); return; }
    if(code === "unavailable" || code === "resource_exhausted"){
      toast("Conexao instavel. Tente de novo em instantes."); return;
    }
    toast(msgPadrao);
  };
}
function todayISO(){
  var d = new Date();
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
}

/* ---------------- rendering: cifra body ---------------- */
function isChordLine(line){
  var t = line.trim();
  if(!t) return false;
  var body = t.replace(/^(intro\.?|introdu[çc][ãa]o)\s*:?\s*/i, "");
  if(!body) return false;
  var stripped = body.replace(/[A-G](#|b)?(m7|maj7|m|maj|dim|aug|sus2|sus4|sus)?\d*(\+|\/[A-G](#|b)?\d*)?/gi, "").replace(/[\s\-–/:.,()0-9]/g,"");
  return stripped.length === 0 && /[A-G]/.test(body);
}
/* ----- quebra de linha preservando o alinhamento cifra/letra -----
   No livro, cada acorde fica sobre uma sílaba exata. Deixar o navegador
   quebrar a linha (pre-wrap) desfaz isso, porque a cifra e a letra quebram em
   pontos diferentes. Aqui a cifra e a letra são quebradas JUNTAS: a letra é
   cortada em espaços e cada acorde vai para o pedaço onde sua coluna caiu. */
function pontosDeQuebra(texto, cols){
  /* Devolve [iniAcordes, fim, iniTexto] por pedaço.
     Os intervalos de ACORDE são contíguos de propósito: se o espaço do corte
     ficasse de fora, um acorde exatamente sobre ele não entraria em pedaço
     nenhum e sumiria da cifra. O espaço só é pulado na hora de exibir a letra
     (iniTexto), para a continuação não começar deslocada. */
  var segs = [], ini = 0, primeiro = true;
  while(ini < texto.length){
    var iniTexto = ini;
    // só a CONTINUAÇÃO pula o espaço do corte; a indentação original da letra
    // (refrões vêm recuados no livro) é posição real e precisa ser mantida
    if(!primeiro){
      while(iniTexto < texto.length && texto.charAt(iniTexto) === " ") iniTexto++;
    }
    primeiro = false;
    if(texto.length - iniTexto <= cols){ segs.push([ini, texto.length, iniTexto]); break; }
    var fim = iniTexto + cols;
    var corte = texto.lastIndexOf(" ", fim);
    if(corte <= iniTexto) corte = fim;          // palavra maior que a largura
    segs.push([ini, corte, iniTexto]);
    ini = corte;
  }
  if(!segs.length) segs.push([0, texto.length, 0]);
  return segs;
}
function acordesDe(cifra){
  var out = [], re = /\S+/g, m;
  while((m = re.exec(cifra)) !== null) out.push([m.index, m[0]]);
  return out;
}
function quebraPar(cifra, letra, cols){
  var acordes = acordesDe(cifra);
  var segs = pontosDeQuebra(letra, cols);
  var res = [];
  for(var k=0; k<segs.length; k++){
    var ini = segs[k][0], fim = segs[k][1], iniTexto = segs[k][2];
    var ultimo = (k === segs.length-1);
    var linha = "";
    for(var j=0; j<acordes.length; j++){
      var col = acordes[j][0], txt = acordes[j][1];
      // acordes depois do fim da letra ficam no último pedaço
      if(!((col >= ini && col < fim) || (ultimo && col >= fim))) continue;
      var c = col - iniTexto;                   // alinhar com a letra exibida
      if(c < 0) c = 0;                          // acorde em cima do espaço do corte
      // <= e não <: em c == linha.length os dois acordes sairiam colados ("F#mBm")
      if(c <= linha.length && linha.length > 0) c = linha.length + 1;
      linha += new Array(c - linha.length + 1).join(" ") + txt;
    }
    res.push([linha, letra.slice(iniTexto, fim)]);
  }
  return res;
}
function quebraTexto(texto, cols){
  return pontosDeQuebra(texto, cols).map(function(s){ return texto.slice(s[2], s[1]); });
}
function requebra(linhas, cols){
  var out = [];
  for(var i=0; i<linhas.length; i++){
    var l = linhas[i];
    if(!l.trim()){ out.push(l); continue; }
    var cifra = isChordLine(l);
    var prox = linhas[i+1];
    var temLetra = cifra && prox !== undefined && prox.trim() && !isChordLine(prox);
    if(temLetra){
      quebraPar(l, prox, cols).forEach(function(par){
        if(par[0].trim()) out.push(par[0]);
        out.push(par[1]);
      });
      i++;                                     // a letra já foi consumida
    } else {
      quebraTexto(l, cols).forEach(function(seg){ out.push(seg); });
    }
  }
  return out;
}
/* ----- tamanho da fonte da cifra -----
   Como a cifra é monoespaçada e a posição do acorde é uma COLUNA DE CARACTERE,
   mudar o corpo da letra não desalinha nada por si só: o que muda é quantas
   colunas cabem na largura. Por isso toda mudança de tamanho recalcula a quebra
   (renderSongDetailCorpo / renderPrintPanel), e o alinhamento se mantém. */
var ESCALAS_FONTE = [0.75, 0.85, 1, 1.15, 1.3, 1.5];
var BASE_DETALHE = 0.82, BASE_IMPRESSAO = 0.78;   // rem
var PADRAO_FONTE = 2;                             // índice de escala 1
var fonteIdx = {detalhe: PADRAO_FONTE, impressao: PADRAO_FONTE};

function carregarFontes(){
  try{
    var d = parseInt(localStorage.getItem("cantos_fonte_detalhe"), 10);
    var i = parseInt(localStorage.getItem("cantos_fonte_impressao"), 10);
    if(d >= 0 && d < ESCALAS_FONTE.length) fonteIdx.detalhe = d;
    if(i >= 0 && i < ESCALAS_FONTE.length) fonteIdx.impressao = i;
  }catch(err){}
}
function salvarFonte(qual){
  try{ localStorage.setItem("cantos_fonte_"+qual, String(fonteIdx[qual])); }catch(err){}
}
function tamanhoFonte(qual){
  var base = qual === "impressao" ? BASE_IMPRESSAO : BASE_DETALHE;
  return (base * ESCALAS_FONTE[fonteIdx[qual]]).toFixed(3) + "rem";
}
function pintarControleFonte(qual){
  var el = document.getElementById(qual === "impressao" ? "fonte-impressao" : "fonte-detalhe");
  if(!el) return;
  el.querySelector(".pct").textContent = Math.round(ESCALAS_FONTE[fonteIdx[qual]] * 100) + "%";
  el.querySelector('[data-fonte="-"]').disabled = (fonteIdx[qual] === 0);
  el.querySelector('[data-fonte="+"]').disabled = (fonteIdx[qual] === ESCALAS_FONTE.length - 1);
}
function aplicarFonte(qual){
  if(qual === "impressao"){
    document.documentElement.style.setProperty("--fonte-impressao", tamanhoFonte("impressao"));
  } else {
    document.getElementById("sd-corpo").style.fontSize = tamanhoFonte("detalhe");
    var previa = document.getElementById("add-preview");
    if(previa) previa.style.fontSize = tamanhoFonte("detalhe");
  }
  pintarControleFonte(qual);
}
function mudarFonte(qual, passo){
  var novo = fonteIdx[qual] + passo;
  if(novo < 0 || novo >= ESCALAS_FONTE.length) return;
  fonteIdx[qual] = novo;
  salvarFonte(qual);
  aplicarFonte(qual);
  // recalcula a quebra para o novo tamanho — é isso que preserva o alinhamento
  if(qual === "impressao"){ renderPrintPanel(); }
  else {
    renderSongDetailCorpo();
    if(state.currentTab === "adicionar") renderPrevia();
  }
}
function ligarControleFonte(qual){
  var el = document.getElementById(qual === "impressao" ? "fonte-impressao" : "fonte-detalhe");
  if(!el) return;
  el.addEventListener("click", function(e){
    var b = e.target.closest("[data-fonte]");
    if(!b || b.disabled) return;
    mudarFonte(qual, b.getAttribute("data-fonte") === "+" ? 1 : -1);
  });
}

function larguraChar(fontSize, fontFamily){
  var m = document.createElement("span");
  m.textContent = new Array(101).join("0");
  m.style.cssText = "position:absolute;visibility:hidden;white-space:pre;font-size:" +
                    fontSize + ";font-family:" + fontFamily;
  document.body.appendChild(m);
  var w = m.getBoundingClientRect().width / 100;
  document.body.removeChild(m);
  return w;
}
function colunasDe(el){
  if(!el) return 0;
  var largura = el.clientWidth - 4;
  if(largura <= 0) return 0;
  var cs = getComputedStyle(el);
  var w = larguraChar(cs.fontSize, cs.fontFamily);
  return w > 0 ? Math.max(24, Math.floor(largura / w)) : 0;
}
/* Largura útil de uma folha A4 com as margens de 12mm declaradas em @page. */
var LARGURA_IMPRESSAO_PX = 703;
function colunasImpressao(){
  var fonte = getComputedStyle(document.documentElement).getPropertyValue("--font-mono");
  var w = larguraChar(tamanhoFonte("impressao"), fonte);
  return w > 0 ? Math.max(24, Math.floor(LARGURA_IMPRESSAO_PX / w)) : 90;
}

function corpoParaLinhas(corpo, semitones, scale, cols){
  var linhas = (corpo||[]).map(function(line){
    return (semitones && scale) ? transposeLine(line, semitones, scale) : line;
  });
  if(cols && cols > 20) linhas = requebra(linhas, cols);
  return linhas;
}
function renderCorpo(corpo, semitones, scale, cols){
  var linhas = corpoParaLinhas(corpo, semitones, scale, cols);
  var emRefrao = false;
  return linhas.map(function(l){
    if(RE_REFRAO.test(l)){ emRefrao = true; return '<span class="l-refrao">Refrão</span>'; }
    if(!l.trim()){ emRefrao = false; return ""; }
    var classes = isChordLine(l) ? "l-chord" : "";
    if(emRefrao) classes += (classes ? " " : "") + "l-ref";
    var e = esc(l);
    return classes ? '<span class="'+classes+'">'+e+'</span>' : e;
  }).join("\n");
}

/* ---------------- busca (título, número, categoria e letra) ---------------- */
/* O índice é montado uma vez, quando os cantos chegam do banco, para que
   digitar na busca não precise normalizar 423 letras a cada tecla. Só as
   linhas de letra entram no índice — linhas de cifra ficam de fora, senão
   buscar "Em" casaria com quase tudo. */
function indexarCanto(v){
  v._linhas = (v.corpo||[]).filter(function(l){ return l.trim() && !isChordLine(l); });
  v._linhasNorm = v._linhas.map(norm);
  v._base = norm((v.numeroStr||"")+" "+(v.titulo||"")+" "+(v.categoria||""));
  return v;
}
function trechoDeBusca(s, q){
  var linhas = s._linhasNorm || [];
  for(var i=0;i<linhas.length;i++){
    if(linhas[i].indexOf(q) !== -1) return s._linhas[i];
  }
  return null;
}
function combinaBusca(s, q){
  return (s._base||"").indexOf(q) !== -1 || trechoDeBusca(s, q) !== null;
}
/* Recorta a linha em volta do trecho encontrado e destaca o termo. O destaque
   só é aplicado quando normalizar não mudou o comprimento da linha (caso normal
   em português), para nunca marcar o pedaço errado. */
function trechoHtml(linha, q){
  var n = norm(linha);
  var i = n.indexOf(q);
  if(i === -1) return esc(linha.trim());
  var ini = Math.max(0, i - 28);
  var fim = Math.min(linha.length, i + q.length + 46);
  var pedaco = linha.slice(ini, fim);
  var prefixo = ini > 0 ? "…" : "";
  var sufixo = fim < linha.length ? "…" : "";
  if(n.length !== linha.length) return prefixo + esc(pedaco.trim()) + sufixo;
  var rel = i - ini;
  return prefixo +
    esc(pedaco.slice(0, rel)) +
    '<mark>' + esc(pedaco.slice(rel, rel + q.length)) + '</mark>' +
    esc(pedaco.slice(rel + q.length)) +
    sufixo;
}
function trechoSpan(s, q){
  if(!q || (s._base||"").indexOf(q) !== -1) return "";   // já casou pelo título/número
  var linha = trechoDeBusca(s, q);
  return linha ? '<span class="trecho">'+trechoHtml(linha, q)+'</span>' : "";
}

/* ---------------- data access helpers ---------------- */
function songLabel(s){
  return "Nº "+s.numeroStr+" — "+s.titulo;
}
function getSong(numero){ return state.songsById[numero]; }

function sortedByNumero(list){
  return list.slice().sort(function(a,b){ return a.numero - b.numero; });
}

/* ---------------- BIBLIOTECA ---------------- */
function renderBiblioteca(){
  var el = document.getElementById("lib-list");
  if(!state.dbReady){ el.innerHTML = '<div class="loading">Carregando cantos…</div>'; return; }
  var q = norm(state.libSearch);
  var filtered = state.songs.filter(function(s){
    if(!q) return true;
    return combinaBusca(s, q);
  });
  if(filtered.length === 0){
    el.innerHTML = '<div class="empty">Nenhum canto encontrado.</div>';
    return;
  }
  var html = "";
  if(state.libView === "ordem"){
    var list = sortedByNumero(filtered);
    html += '<div class="song-list">' + list.map(function(s){ return rowHtml(s, q); }).join("") + '</div>';
  } else {
    var byCat = {};
    filtered.forEach(function(s){
      (byCat[s.categoria] = byCat[s.categoria]||[]).push(s);
    });
    CATEGORIAS_LIVRO.forEach(function(cat){
      var items = byCat[cat];
      if(!items || !items.length) return;
      items = sortedByNumero(items);
      // com busca ativa os grupos com resultado abrem sozinhos; sem busca, começam recolhidos
      var open = q ? true : !!state.openCats[cat];
      html += '<button type="button" class="group-title group-toggle" data-cat="'+esc(cat)+'" aria-expanded="'+(open?"true":"false")+'">' +
        '<span class="gt-left"><span class="chev" aria-hidden="true">▶</span>'+esc(cat)+'</span>' +
        '<span class="count">'+items.length+' cantos</span>' +
      '</button>';
      html += '<div class="song-list"'+(open?"":" hidden")+'>' + items.map(function(s){ return rowHtml(s, q); }).join("") + '</div>';
    });
  }
  el.innerHTML = html;
}
function rowHtml(s, q){
  return '<div class="song-row" data-numero="'+s.numero+'">' +
    '<span class="badge-num">'+esc(s.numeroStr)+'</span>' +
    '<span class="song-main"><span class="titulo">'+esc(s.titulo)+'</span>'+trechoSpan(s, q)+'</span>' +
    (state.libView==="ordem" ? '<span class="cat-tag">'+esc(s.categoria)+'</span>' : '') +
    '<span class="chip chip-tom">'+esc(s.tom)+'</span>' +
    '<button class="add-btn" data-add="'+s.numero+'" title="Adicionar à missa atual" aria-label="Adicionar">+</button>' +
    botaoLixo(s.numero, s.titulo) +
  '</div>';
}

document.getElementById("lib-list").addEventListener("click", function(e){
  var toggle = e.target.closest(".group-toggle");
  if(toggle){
    var abrir = toggle.getAttribute("aria-expanded") !== "true";
    state.openCats[toggle.getAttribute("data-cat")] = abrir;
    toggle.setAttribute("aria-expanded", abrir ? "true" : "false");
    var lista = toggle.nextElementSibling;
    if(lista && lista.classList.contains("song-list")) lista.hidden = !abrir;
    return;
  }
  var addBtn = e.target.closest("[data-add]");
  if(addBtn){
    e.stopPropagation();
    quickAddToMissa(Number(addBtn.getAttribute("data-add")));
    return;
  }
  var lixo = e.target.closest("[data-excluir]");
  if(lixo){
    e.stopPropagation();
    excluirCanto(lixo.getAttribute("data-excluir"));
    return;
  }
  var row = e.target.closest(".song-row");
  if(row){ openSongDetail(Number(row.getAttribute("data-numero"))); }
});
document.getElementById("lib-search").addEventListener("input", function(e){
  state.libSearch = e.target.value; renderBiblioteca();
});
document.getElementById("lib-view-seg").addEventListener("click", function(e){
  var b = e.target.closest("button[data-view]");
  if(!b) return;
  state.libView = b.getAttribute("data-view");
  document.querySelectorAll("#lib-view-seg button").forEach(function(x){ x.classList.toggle("active", x===b); });
  renderBiblioteca();
});

/* ---------------- LITURGIA DO DIA (salmo e aclamação) ----------------
   A página publicada não pode buscar na internet (o navegador bloqueia
   requisições externas de um artefato), então os dois textos são carregados no
   banco pelo Claude — um doc por data (YYYY-MM-DD) nas coleções `salmos` e
   `aclamacoes`. Os dois têm a MESMA forma ({referencia, liturgia, refrao,
   estrofes[], fonte}), então a mesma função desenha os dois; na aclamação o
   refrão é o "Aleluia" e `estrofes` tem o versículo. */
var LITURGICOS = {
  salmo:     {col:"salmos",     rotulo:"Salmo do dia",           artigo:"o salmo"},
  aclamacao: {col:"aclamacoes", rotulo:"Aclamação ao Evangelho", artigo:"a aclamação"}
};
function itemLiturgico(m, tipo){
  if(!m || !m.data) return null;
  var mapa = tipo === "aclamacao" ? state.aclamacoes : state.salmos;
  return mapa[m.data] || null;
}
function salmoDaMissa(m){ return itemLiturgico(m, "salmo"); }
function cardLiturgicoHtml(it, cfg){
  return '<div class="salmo-card">' +
    '<div class="sc-head">' +
      '<span class="sc-ref">'+esc(it.referencia||cfg.rotulo)+'</span>' +
      (it.liturgia ? '<span class="sc-dia">'+esc(it.liturgia)+'</span>' : "") +
    '</div>' +
    (it.refrao ? '<div class="sc-refrao">'+esc(it.refrao)+'</div>' : "") +
    (it.estrofes||[]).map(function(e){
      return '<div class="sc-estrofe">'+esc(e)+'</div>';
    }).join("") +
    (it.fonte ? '<div class="sc-fonte">Fonte: '+esc(it.fonte)+'</div>' : "") +
  '</div>';
}
function salmoCardHtml(sl){ return cardLiturgicoHtml(sl, LITURGICOS.salmo); }
function pedidoDaData(data){
  var achados = state.pedidos.filter(function(p){ return p.tipo === "salmo" && p.data === data; });
  // um pendente manda mais que um erro antigo da mesma data
  return achados.filter(function(p){ return p.status === "pendente"; })[0] || achados[0] || null;
}
function salmoPendente(data){
  var p = pedidoDaData(data);
  return !!p && p.status === "pendente";
}
/* Um pedido só cobre os dois textos: o Claude busca salmo e aclamação da data. */
function blocoLiturgicoHtml(m, tipo){
  var cfg = LITURGICOS[tipo];
  if(!m || !m.data){
    return '<div class="salmo-vazio">Escolha a data da missa para trazer '+cfg.artigo+' do dia.</div>';
  }
  var it = itemLiturgico(m, tipo);
  if(it) return cardLiturgicoHtml(it, cfg);
  var ped = pedidoDaData(m.data);
  if(ped && ped.status === "pendente"){
    return '<div class="salmo-vazio">Liturgia de '+esc(dataBR(m.data))+' na fila — o Claude busca na próxima verificação, amanhã de manhã.</div>';
  }
  // pedido fechado (com erro, ou concluído só com parte dos textos) e este
  // texto continua faltando: a fonte não tinha. Dizer isso, com ação.
  if(ped && ped.status !== "pendente"){
    return '<div class="salmo-vazio">' +
      '<span>A fonte não devolveu '+cfg.artigo+' de '+esc(dataBR(m.data))+'. Isso costuma ser falha do site que publica a liturgia.</span>' +
      '<button class="btn btn-sm pedir-liturgia-btn" data-data="'+esc(m.data)+'">Tentar de novo</button>' +
    '</div>';
  }
  return '<div class="salmo-vazio">' +
    '<span>Nada carregado para '+esc(dataBR(m.data))+'.</span>' +
    '<button class="btn btn-sm pedir-liturgia-btn"'+(tipo==="salmo" ? ' id="pedir-salmo-btn"' : '')+' data-data="'+esc(m.data)+'">Pedir a liturgia deste dia</button>' +
  '</div>';
}
function blocoSalmoHtml(m){ return blocoLiturgicoHtml(m, "salmo"); }
function dataBR(iso){
  if(!iso) return "";
  var p = String(iso).split("-");
  return p.length === 3 ? p[2]+"/"+p[1]+"/"+p[0] : iso;
}
function pedirSalmo(data){
  if(!data || !db) return;
  var existente = pedidoDaData(data);
  if(existente){
    // não cria pedido novo: recoloca o que falhou na fila, contando a tentativa
    db.collection("pedidos").doc(existente.id).update({
      status: "pendente", erro: "", tentativas: (existente.tentativas || 1) + 1,
      atualizadoEm: new Date().toISOString()
    }).then(function(){ toast("Vou tentar de novo na próxima verificação."); })
      .catch(aoFalharEscrita("Não foi possível registrar o pedido."));
    return;
  }
  db.collection("pedidos").add({
    tipo: "salmo", data: data, status: "pendente", tentativas: 1,
    criadoEm: new Date().toISOString()
  }).then(function(){ toast("Pedido feito — o Claude busca salmo e aclamação na próxima verificação."); })
    .catch(aoFalharEscrita("Não foi possível registrar o pedido."));
}

/* ---------------- CONFIRMAÇÃO ----------------
   `confirm()` não funciona no iframe do artefato (devolve false calado), então
   toda pergunta de "tem certeza?" passa por este overlay. */
var confirmAcao = null;
function pedirConfirmacao(op){
  document.getElementById("cf-titulo").textContent = op.titulo || "Tem certeza?";
  document.getElementById("cf-msg").innerHTML = op.mensagem || "";
  document.getElementById("cf-avisos").innerHTML = (op.avisos || []).map(function(a){
    return '<div class="aviso aviso-atencao">' + a + '</div>';
  }).join("");
  document.getElementById("cf-ok").textContent = op.rotulo || "Excluir";
  confirmAcao = op.acao || null;
  document.getElementById("confirm-overlay").classList.add("open");
  setTimeout(function(){ document.getElementById("cf-cancelar").focus(); }, 30);
}
function fecharConfirmacao(){
  document.getElementById("confirm-overlay").classList.remove("open");
  confirmAcao = null;
}
document.getElementById("cf-cancelar").addEventListener("click", fecharConfirmacao);
document.getElementById("cf-x").addEventListener("click", fecharConfirmacao);
document.getElementById("confirm-overlay").addEventListener("click", function(e){
  if(e.target === this) fecharConfirmacao();
});
document.getElementById("cf-ok").addEventListener("click", function(){
  var acao = confirmAcao;
  fecharConfirmacao();
  if(acao) acao();
});
document.addEventListener("keydown", function(e){
  if(e.key === "Escape" && document.getElementById("confirm-overlay").classList.contains("open")){
    fecharConfirmacao();
  }
});
/* Em quais missas montadas este canto está sendo usado */
function missasComOCanto(s){
  return state.missas.filter(function(m){
    var mm = m.momentos || {};
    return MOMENTOS.some(function(mo){
      return (mm[mo.id] || []).some(function(raw){
        // compara por NÚMERO: o livro grava "01" e há entradas antigas como "001"
        return Number(parseMissaEntry(raw).numeroStr) === s.numero;
      });
    });
  });
}
function excluirCanto(numero){
  var s = getSong(Number(numero));
  if(!s || !db) return;
  var usos = missasComOCanto(s);
  var avisos = [];
  if(usos.length){
    avisos.push("Está em <strong>" + usos.length + (usos.length === 1 ? " missa montada" : " missas montadas") +
      "</strong> (" + usos.slice(0,3).map(function(m){ return esc(m.nome || "sem nome"); }).join(", ") +
      (usos.length > 3 ? " e outras" : "") + "). Lá ele vira “canto removido”.");
  }
  if(ehDoLivro(s)){
    avisos.push("Este canto <strong>veio do livro</strong>. Para trazê-lo de volta seria preciso reimportar o livro.");
  }
  pedirConfirmacao({
    titulo: "Excluir canto?",
    mensagem: "<strong>Nº " + esc(s.numeroStr) + " — " + esc(s.titulo) + "</strong><br>" +
              "Esta ação não pode ser desfeita.",
    avisos: avisos,
    rotulo: "Excluir canto",
    acao: function(){
      db.collection("songs").doc(s.id).delete().then(function(){
        if(edicao && edicao.numero === s.numero) limparForm();
        toast("Canto " + s.numeroStr + " excluído.");
      }).catch(aoFalharEscrita("Não foi possível excluir o canto."));
    }
  });
}

/* ---------------- SONG DETAIL OVERLAY ---------------- */
var SVG_OLHO = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" ' +
  'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M1.5 12S5 5.5 12 5.5 22.5 12 22.5 12 19 18.5 12 18.5 1.5 12 1.5 12Z"/>' +
  '<circle cx="12" cy="12" r="3.2"/></svg>';
var SVG_LIXO = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" ' +
  'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M3.5 6.5h17M9 6.5V4h6v2.5M6.5 6.5l1 13.5h9l1-13.5"/>' +
  '<path d="M10.2 10.5v6M13.8 10.5v6"/></svg>';
function botaoLixo(numero, titulo){
  return '<button class="lixo-btn" data-excluir="'+numero+'" title="Excluir '+esc(titulo)+'" ' +
         'aria-label="Excluir '+esc(titulo)+'">'+SVG_LIXO+'</button>';
}
function botaoOlho(numero, titulo){
  return '<button class="olho-btn" data-ver="'+numero+'" title="'+esc(titulo)+'" ' +
         'aria-label="'+esc(titulo)+'">'+SVG_OLHO+'</button>';
}
/* opcoes:
     {escolherPara: momentoId} — prévia aberta pelo seletor de cantos: o rodapé
       vira "Escolher para <momento>" e há um "Voltar à lista";
     {somenteLeitura:true}     — só visualizar, sem rodapé de ação;
     ausente                   — comportamento normal da Biblioteca. */
function openSongDetail(numero, opcoes){
  var s = getSong(numero);
  if(!s) return;
  opcoes = opcoes || {};
  state.previewMomento = opcoes.escolherPara || null;
  configurarRodapeDetalhe(opcoes);
  state.detailSong = s;
  var origRoot = rootLetter(s.tom);
  state.detailTom = origRoot;
  document.getElementById("sd-titulo").textContent = s.titulo;
  document.getElementById("sd-numero").textContent = "Nº "+s.numeroStr;
  document.getElementById("sd-categoria").textContent = s.categoria;
  document.getElementById("sd-tom").textContent = "Tom original: "+(s.tom||"—");
  document.getElementById("sd-ritmo").textContent = s.ritmo||"—";
  document.getElementById("sd-editar").hidden = ehDoLivro(s);
  document.getElementById("sd-tom-select").innerHTML = TOM_OPTIONS.map(function(o){
    return '<option value="'+o.v+'"'+(o.v===origRoot?' selected':'')+'>'+esc(o.l)+'</option>';
  }).join("");
  var sel = document.getElementById("sd-momento-select");
  sel.innerHTML = MOMENTOS.map(function(m){ return '<option value="'+m.id+'">'+esc(m.nome)+'</option>'; }).join("");
  // abrir ANTES de renderizar: com o overlay escondido a largura medida é 0
  // e a cifra não teria como ser quebrada na medida certa
  document.getElementById("song-overlay").classList.add("open");
  renderSongDetailCorpo();
}
function configurarRodapeDetalhe(opcoes){
  var sel = document.getElementById("sd-momento-select");
  var add = document.getElementById("sd-add-btn");
  var voltar = document.getElementById("sd-voltar");
  var rodape = add.parentElement;
  if(opcoes.escolherPara){
    var mo = MOMENTOS.filter(function(m){ return m.id === opcoes.escolherPara; })[0];
    sel.hidden = true;
    voltar.hidden = false;
    add.hidden = false;
    add.textContent = "Escolher para " + (mo ? mo.nome : "este momento");
    rodape.hidden = false;
  } else if(opcoes.somenteLeitura){
    rodape.hidden = true;
  } else {
    rodape.hidden = false;
    sel.hidden = false;
    voltar.hidden = true;
    add.hidden = false;
    add.textContent = "Adicionar à missa atual";
  }
}
function fecharDetalhe(){
  document.getElementById("song-overlay").classList.remove("open", "acima");
  state.previewMomento = null;
}
/* prévia aberta de dentro do seletor de cantos: o seletor continua aberto atrás */
function abrirPreviaDoPicker(numero, momentoId){
  openSongDetail(numero, {escolherPara: momentoId});
  document.getElementById("song-overlay").classList.add("acima");
}
function renderSongDetailCorpo(){
  var s = state.detailSong;
  if(!s) return;
  var origRoot = rootLetter(s.tom);
  var targetRoot = state.detailTom || origRoot;
  var offset = NOTE_INDEX[targetRoot] - NOTE_INDEX[origRoot];
  var scale = chooseScale(targetRoot);
  var el = document.getElementById("sd-corpo");
  el.innerHTML = renderCorpo(s.corpo||[], offset, scale, colunasDe(el));
}
/* a largura disponível muda ao girar o celular ou redimensionar a janela */
var reflowTimer = null;
window.addEventListener("resize", function(){
  clearTimeout(reflowTimer);
  reflowTimer = setTimeout(function(){
    if(document.getElementById("song-overlay").classList.contains("open")) renderSongDetailCorpo();
    if(state.currentTab === "imprimir") renderPrintPanel();
    if(state.currentTab === "adicionar") renderPrevia();
  }, 150);
});
document.getElementById("sd-tom-select").addEventListener("change", function(e){
  state.detailTom = e.target.value;
  renderSongDetailCorpo();
});
document.getElementById("sd-close").addEventListener("click", fecharDetalhe);
document.getElementById("sd-voltar").addEventListener("click", fecharDetalhe);
document.getElementById("song-overlay").addEventListener("click", function(e){
  if(e.target.id === "song-overlay") fecharDetalhe();
});
document.getElementById("sd-add-btn").addEventListener("click", function(){
  if(!state.detailSong) return;
  if(state.previewMomento){
    // escolhido de dentro do seletor: some com a prévia e com a lista
    var momento = state.previewMomento;
    addSongToMoment(state.currentMissaId, momento, state.detailSong.numero, state.detailTom);
    fecharDetalhe();
    document.getElementById("picker-overlay").classList.remove("open");
    return;
  }
  var momentoId = document.getElementById("sd-momento-select").value;
  addSongToMoment(state.currentMissaId, momentoId, state.detailSong.numero, state.detailTom);
});

function quickAddToMissa(numero){
  var s = getSong(numero);
  if(!s) return;
  state.pickerCtx = {mode:"choose-momento-for-song", numero:numero};
  openMomentoChooser(numero);
}
function openMomentoChooser(numero){
  var s = getSong(numero);
  document.getElementById("picker-title").textContent = "Adicionar “"+s.titulo+"” a qual momento?";
  document.getElementById("picker-search").style.display = "none";
  document.getElementById("picker-all-cats").parentElement.style.display = "none";
  var list = document.getElementById("picker-list");
  list.innerHTML = MOMENTOS.map(function(m){
    return '<div class="picker-row" data-momento="'+m.id+'"><span class="titulo">'+esc(m.nome)+'</span></div>';
  }).join("");
  list.onclick = function(e){
    var row = e.target.closest(".picker-row");
    if(!row) return;
    addSongToMoment(state.currentMissaId, row.getAttribute("data-momento"), numero);
    document.getElementById("picker-overlay").classList.remove("open");
  };
  document.getElementById("picker-overlay").classList.add("open");
}
document.getElementById("picker-close").addEventListener("click", function(){
  document.getElementById("picker-overlay").classList.remove("open");
});
document.getElementById("picker-overlay").addEventListener("click", function(e){
  if(e.target.id === "picker-overlay") e.currentTarget.classList.remove("open");
});

/* ---------------- MISSAS ---------------- */
function currentMissa(){ return state.missasById[state.currentMissaId]; }

function renderMissaSelect(){
  var selects = [document.getElementById("missa-select"), document.getElementById("print-missa-select")];
  var opts = sortedMissas().map(function(m){
    return '<option value="'+m.id+'">'+esc(m.nome||"(sem nome)")+(m.data? " — "+m.data:"")+'</option>';
  }).join("");
  selects.forEach(function(sel){
    var prev = sel.value;
    sel.innerHTML = opts || '<option value="">Nenhuma missa</option>';
    if(state.missasById[prev]) sel.value = prev; else if(state.currentMissaId) sel.value = state.currentMissaId;
  });
}
function sortedMissas(){
  return state.missas.slice().sort(function(a,b){
    return (b.criadoEm||"").localeCompare(a.criadoEm||"");
  });
}
function renderMissaPanel(){
  var m = currentMissa();
  desarmarExcluir();          // nunca deixar "Confirmar?" armado para outra missa
  renderMissaSelect();
  if(!m){
    document.getElementById("missa-momentos").innerHTML = '<div class="empty">Nenhuma missa selecionada. Crie uma nova missa para começar.</div>';
    document.getElementById("missa-nome").value = "";
    document.getElementById("missa-data").value = "";
    return;
  }
  document.getElementById("missa-select").value = m.id;
  document.getElementById("missa-nome").value = m.nome||"";
  document.getElementById("missa-data").value = m.data||"";
  var momentos = m.momentos||{};
  var html = MOMENTOS.map(function(mo){
    var entries = momentos[mo.id]||[];
    var itemsHtml = entries.map(function(raw, idx){
      var parsed = parseMissaEntry(raw);
      var numStr = parsed.numeroStr;
      var s = getSong(Number(numStr));
      var titulo = s ? s.titulo : "(canto removido nº "+numStr+")";
      var origRoot = s ? rootLetter(s.tom) : null;
      var effRoot = parsed.tom || origRoot;
      var tomSelectHtml = s ? buildTomSelect(effRoot, "ms-tom-select", 'data-momento="'+mo.id+'" data-idx="'+idx+'"') : "";
      return '<div class="missa-song" data-momento="'+mo.id+'" data-idx="'+idx+'">' +
        '<span class="badge-num">'+esc(numStr)+'</span>' +
        '<span class="titulo">'+esc(titulo)+'</span>' +
        tomSelectHtml +
        (s ? botaoOlho(s.numero, "Visualizar este canto") : "") +
        '<div class="ord-btns">' +
          '<button data-act="up" title="Subir">▲</button>' +
          '<button data-act="down" title="Descer">▼</button>' +
        '</div>' +
        '<button class="btn-ghost" data-act="remove" title="Remover" aria-label="Remover">✕</button>' +
      '</div>';
    }).join("");
    return '<div class="momento-block">' +
      '<div class="momento-head"><h3>'+esc(mo.nome)+'</h3>'+(mo.cat? '<span class="sugestao">sugestão: '+esc(mo.cat)+'</span>':'')+'</div>' +
      (LITURGICOS[mo.id] ? blocoLiturgicoHtml(m, mo.id) : "") +
      itemsHtml +
      '<button class="add-momento-btn" data-momento="'+mo.id+'">+ Adicionar canto</button>' +
    '</div>';
  }).join("");
  document.getElementById("missa-momentos").innerHTML = html;
}

document.getElementById("missa-momentos").addEventListener("click", function(e){
  var addBtn = e.target.closest(".add-momento-btn");
  if(addBtn){ openSongPicker(addBtn.getAttribute("data-momento")); return; }
  var pedir = e.target.closest(".pedir-liturgia-btn");
  if(pedir){ pedirSalmo(pedir.getAttribute("data-data")); return; }
  var olho = e.target.closest("[data-ver]");
  if(olho){ openSongDetail(Number(olho.getAttribute("data-ver")), {somenteLeitura:true}); return; }
  var actBtn = e.target.closest("[data-act]");
  if(actBtn){
    var row = actBtn.closest(".missa-song");
    var momentoId = row.getAttribute("data-momento");
    var idx = Number(row.getAttribute("data-idx"));
    var act = actBtn.getAttribute("data-act");
    if(act === "remove") removeFromMoment(momentoId, idx);
    else if(act === "up") moveInMoment(momentoId, idx, -1);
    else if(act === "down") moveInMoment(momentoId, idx, 1);
  }
});
document.getElementById("missa-momentos").addEventListener("change", function(e){
  var sel = e.target.closest(".ms-tom-select");
  if(!sel) return;
  setSongTomInMoment(sel.getAttribute("data-momento"), Number(sel.getAttribute("data-idx")), sel.value);
});

function openSongPicker(momentoId){
  var mo = MOMENTOS.filter(function(x){ return x.id===momentoId; })[0];
  state.pickerCtx = {mode:"add-to-momento", momentoId: momentoId, onlyCat: mo.cat};
  document.getElementById("picker-title").textContent = "Adicionar canto — "+mo.nome;
  document.getElementById("picker-search").style.display = "";
  document.getElementById("picker-search").value = "";
  var allCatsToggle = document.getElementById("picker-all-cats");
  allCatsToggle.parentElement.style.display = mo.cat ? "" : "none";
  allCatsToggle.checked = !mo.cat;
  renderPickerList();
  document.getElementById("picker-overlay").classList.add("open");
  document.getElementById("picker-search").focus();
}
function renderPickerList(){
  var ctx = state.pickerCtx;
  if(!ctx || ctx.mode !== "add-to-momento") return;
  var q = norm(document.getElementById("picker-search").value);
  var allCats = document.getElementById("picker-all-cats").checked;
  var list = state.songs.filter(function(s){
    if(!allCats && ctx.onlyCat && s.categoria !== ctx.onlyCat) return false;
    if(!q) return true;
    return combinaBusca(s, q);
  });
  list = sortedByNumero(list).slice(0, 200);
  var el = document.getElementById("picker-list");
  if(!list.length){ el.innerHTML = '<div class="empty">Nada encontrado.</div>'; return; }
  el.innerHTML = list.map(function(s){
    return '<div class="picker-row" data-numero="'+s.numero+'">' +
      '<span class="badge-num">'+esc(s.numeroStr)+'</span>' +
      '<span class="picker-main"><span class="titulo">'+esc(s.titulo)+'</span>'+trechoSpan(s, q)+'</span>' +
      '<span class="chip chip-tom">'+esc(s.tom)+'</span>' +
      botaoOlho(s.numero, "Visualizar este canto") +
    '</div>';
  }).join("");
  el.onclick = function(e){
    var olho = e.target.closest("[data-ver]");
    if(olho){
      e.stopPropagation();
      abrirPreviaDoPicker(Number(olho.getAttribute("data-ver")), ctx.momentoId);
      return;
    }
    var row = e.target.closest(".picker-row");
    if(!row) return;
    addSongToMoment(state.currentMissaId, ctx.momentoId, Number(row.getAttribute("data-numero")));
    document.getElementById("picker-overlay").classList.remove("open");
  };
}
document.getElementById("picker-search").addEventListener("input", renderPickerList);
document.getElementById("picker-all-cats").addEventListener("change", renderPickerList);

function ensureMissaObjExists(m){
  var momentos = {};
  MOMENTOS.forEach(function(mo){ momentos[mo.id] = (m.momentos && m.momentos[mo.id]) || []; });
  return momentos;
}

function addSongToMoment(missaId, momentoId, numero, tomTarget){
  if(!missaId){ toast("Crie ou selecione uma missa primeiro."); return; }
  var m = state.missasById[missaId];
  if(!m) return;
  var song = getSong(numero);
  var numStr = String(song ? song.numeroStr : numero);
  var origRoot = song ? rootLetter(song.tom) : null;
  var alreadyIn = (m.momentos && m.momentos[momentoId] || []).some(function(raw){
    return parseMissaEntry(raw).numeroStr === numStr;
  });
  if(alreadyIn){ toast("Esse canto já está nesse momento."); return; }
  var momentos = ensureMissaObjExists(m);
  var entry = encodeMissaEntry(numStr, tomTarget, origRoot);
  momentos[momentoId] = momentos[momentoId].concat([entry]);
  var patch = {}; patch[momentoId] = momentos[momentoId];
  db.collection("missas").doc(missaId).update({momentos: patch, atualizadoEm: new Date().toISOString()})
    .then(function(){ toast("Adicionado!"); })
    .catch(aoFalharEscrita("Não foi possível salvar."));
}
function setSongTomInMoment(momentoId, idx, newRoot){
  var m = currentMissa(); if(!m) return;
  var momentos = ensureMissaObjExists(m);
  var arr = momentos[momentoId].slice();
  if(idx<0 || idx>=arr.length) return;
  var parsed = parseMissaEntry(arr[idx]);
  var song = getSong(Number(parsed.numeroStr));
  var origRoot = song ? rootLetter(song.tom) : newRoot;
  arr[idx] = encodeMissaEntry(parsed.numeroStr, newRoot, origRoot);
  var patch = {}; patch[momentoId] = arr;
  db.collection("missas").doc(m.id).update({momentos: patch, atualizadoEm: new Date().toISOString()})
    .catch(aoFalharEscrita("Não foi possível salvar a alteração."));
}
function removeFromMoment(momentoId, idx){
  var m = currentMissa(); if(!m) return;
  var momentos = ensureMissaObjExists(m);
  var arr = momentos[momentoId].slice();
  arr.splice(idx,1);
  var patch = {}; patch[momentoId] = arr;
  db.collection("missas").doc(m.id).update({momentos: patch, atualizadoEm: new Date().toISOString()})
    .catch(aoFalharEscrita("Não foi possível salvar a alteração."));
}
function moveInMoment(momentoId, idx, dir){
  var m = currentMissa(); if(!m) return;
  var momentos = ensureMissaObjExists(m);
  var arr = momentos[momentoId].slice();
  var j = idx+dir;
  if(j<0 || j>=arr.length) return;
  var tmp = arr[idx]; arr[idx]=arr[j]; arr[j]=tmp;
  var patch = {}; patch[momentoId] = arr;
  db.collection("missas").doc(m.id).update({momentos: patch, atualizadoEm: new Date().toISOString()})
    .catch(aoFalharEscrita("Não foi possível salvar a alteração."));
}

document.getElementById("missa-select").addEventListener("change", function(e){
  state.currentMissaId = e.target.value;
  try{ localStorage.setItem("cantos_missa_atual", state.currentMissaId); }catch(err){}
  renderMissaPanel();
  renderPrintPanel();
});
document.getElementById("missa-new-btn").addEventListener("click", function(){
  var nome = "Missa " + new Date().toLocaleDateString("pt-BR");
  db.collection("missas").add({
    nome: nome, data: todayISO(), momentos: {}, criadoEm: new Date().toISOString(), atualizadoEm: new Date().toISOString()
  }).then(function(ref){
    state.currentMissaId = ref.id;
    try{ localStorage.setItem("cantos_missa_atual", ref.id); }catch(err){}
    toast("Nova missa criada.");
  }).catch(aoFalharEscrita("Não foi possível criar a missa."));
});
/* O confirm() do navegador é bloqueado dentro do artefato: ele volta "não" sem
   mostrar nada, e a exclusão nunca acontecia. A confirmação passa a ser no próprio
   botão — o segundo clique é que exclui, e ele se desarma sozinho em 5s. */
var excluirArmado = false, excluirTimer = null;
function desarmarExcluir(){
  excluirArmado = false;
  clearTimeout(excluirTimer);
  var b = document.getElementById("missa-delete-btn");
  if(b){ b.textContent = "Excluir"; b.classList.remove("armado"); }
}
document.getElementById("missa-delete-btn").addEventListener("click", function(){
  var m = currentMissa();
  if(!m){ toast("Nenhuma missa selecionada."); return; }
  if(!excluirArmado){
    excluirArmado = true;
    this.textContent = "Confirmar exclusão?";
    this.classList.add("armado");
    clearTimeout(excluirTimer);
    excluirTimer = setTimeout(desarmarExcluir, 5000);
    return;
  }
  desarmarExcluir();
  db.collection("missas").doc(m.id).delete()
    .then(function(){ toast("Missa excluída."); })
    .catch(aoFalharEscrita("Não foi possível excluir a missa."));
});
var nomeTimer=null;
document.getElementById("missa-nome").addEventListener("input", function(e){
  var m = currentMissa(); if(!m) return;
  clearTimeout(nomeTimer);
  var val = e.target.value;
  nomeTimer = setTimeout(function(){
    db.collection("missas").doc(m.id).update({nome: val, atualizadoEm: new Date().toISOString()})
      .catch(aoFalharEscrita("Não foi possível salvar o nome."));
  }, 500);
});
document.getElementById("missa-data").addEventListener("change", function(e){
  var m = currentMissa(); if(!m) return;
  db.collection("missas").doc(m.id).update({data: e.target.value, atualizadoEm: new Date().toISOString()})
    .catch(aoFalharEscrita("Não foi possível salvar a data."));
});
document.getElementById("print-missa-select").addEventListener("change", function(e){
  state.currentMissaId = e.target.value;
  try{ localStorage.setItem("cantos_missa_atual", state.currentMissaId); }catch(err){}
  renderMissaPanel();
  renderPrintPanel();
});

/* ---------------- IMPRIMIR ---------------- */
function printLiturgiaHtml(it, cfg){
  return '<div class="print-salmo">' +
    '<div class="ps-ref">'+esc(it.referencia||cfg.rotulo)+(it.liturgia ? '  ·  '+esc(it.liturgia) : "")+'</div>' +
    (it.refrao ? '<div class="ps-refrao">R. '+esc(it.refrao)+'</div>' : "") +
    (it.estrofes||[]).map(function(e){ return '<div class="ps-estrofe">'+esc(e)+'</div>'; }).join("") +
  '</div>';
}
function printSalmoHtml(sl){ return printLiturgiaHtml(sl, LITURGICOS.salmo); }
function renderPrintPanel(){
  var m = currentMissa();
  var el = document.getElementById("print-preview");
  if(!m){ el.innerHTML = '<div class="empty">Selecione ou crie uma missa na aba "Montar Missa".</div>'; return; }
  var showCifra = document.getElementById("print-cifra").checked;
  var colsImpr = colunasImpressao();
  var momentos = m.momentos||{};
  var blocks = MOMENTOS.map(function(mo){
    var entries = momentos[mo.id]||[];
    var it = LITURGICOS[mo.id] ? itemLiturgico(m, mo.id) : null;
    var salmoHtml = it ? printLiturgiaHtml(it, LITURGICOS[mo.id]) : "";
    if(!entries.length && !salmoHtml) return "";
    var songsHtml = entries.map(function(raw){
      var parsed = parseMissaEntry(raw);
      var s = getSong(Number(parsed.numeroStr));
      if(!s) return "";
      var origRoot = rootLetter(s.tom);
      var targetRoot = parsed.tom || origRoot;
      var offset = NOTE_INDEX[targetRoot] - NOTE_INDEX[origRoot];
      var scale = chooseScale(targetRoot);
      var tomLabel = parsed.tom ? tomLabelForRoot(s.tom, targetRoot)+" (original "+esc(s.tom)+")" : (s.tom||"—");
      var lines = showCifra ? (s.corpo||[]) : (s.corpo||[]).filter(function(l){ return !isChordLine(l); });
      var body = renderCorpo(lines, offset, scale, colsImpr);
      return '<div class="print-song">' +
        '<div class="ps-title">Nº '+esc(s.numeroStr)+' — '+esc(s.titulo)+'</div>' +
        '<div class="ps-meta">Tom: '+tomLabel+'  ·  Ritmo: '+esc(s.ritmo||"—")+'</div>' +
        '<div class="ps-body">'+body+'</div>' +
      '</div>';
    }).join("");
    return '<div class="print-momento"><h4>'+esc(mo.nome)+'</h4>'+salmoHtml+songsHtml+'</div>';
  }).join("");
  if(!blocks.trim()){
    el.innerHTML = '<div class="p-title">'+esc(m.nome||"Missa")+'</div><div class="p-date">'+esc(m.data||"")+'</div><div class="empty">Nenhum canto selecionado ainda.</div>';
    return;
  }
  el.innerHTML = '<div class="p-title">'+esc(m.nome||"Missa")+'</div><div class="p-date">'+esc(m.data||"")+'</div>' + blocks;
}
document.getElementById("print-cifra").addEventListener("change", renderPrintPanel);
/* ---------------- PDF ----------------
   `window.print()` NÃO funciona aqui: o artefato roda num iframe em sandbox,
   que bloqueia os diálogos do navegador — o mesmo motivo que derrubou o
   confirm() da exclusão. O clique não fazia nada e não aparecia erro nenhum.
   Então o PDF é montado aqui mesmo (jsPDF) e entregue pela capability
   `downloads`, que mostra ao leitor a confirmação de salvar.

   A cifra é monoespaçada e a posição do acorde é COLUNA DE CARACTERE, então o
   corpo sai em Courier e o tamanho da fonte é calculado para caber exatamente
   as mesmas colunas da prévia (`colunasImpressao()`): assim o que foi conferido
   na tela é o que sai no papel, inclusive o A−/A+.
   Courier do jsPDF escreve acentos corretamente (WinAnsi) — conferido. */
var PDF_URL = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
var pdfLib = null;
function carregarJsPDF(){
  if(pdfLib) return Promise.resolve(pdfLib);
  return new Promise(function(resolve, reject){
    var s = document.createElement("script");
    s.src = PDF_URL;
    s.onload = function(){
      pdfLib = (window.jspdf && window.jspdf.jsPDF) || null;
      pdfLib ? resolve(pdfLib) : reject(new Error("jsPDF não carregou"));
    };
    s.onerror = function(){ reject(new Error("não foi possível baixar o gerador de PDF")); };
    document.head.appendChild(s);
  });
}
var MM_POR_PT = 0.3528;          // 1pt em mm
var LARG_CHAR_COURIER = 0.6;     // largura do caractere do Courier, em fração do corpo
function nomeArquivo(m){
  var base = (m.nome || "missa") + (m.data ? " " + m.data : "");
  base = base.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
             .replace(/[^a-zA-Z0-9 _-]/g, "").trim().replace(/\s+/g, "-").toLowerCase();
  return (base || "missa") + ".pdf";
}
function montarPdf(){
  var m = currentMissa();
  if(!m) return null;
  var showCifra = document.getElementById("print-cifra").checked;
  var cols = colunasImpressao();
  var MARGEM = 12, LARGURA = 210 - MARGEM * 2, ALTURA = 297;
  var corpoPt = Math.max(6, Math.min(13, LARGURA / (cols * LARG_CHAR_COURIER * MM_POR_PT)));
  var linhaMm = corpoPt * MM_POR_PT * 1.32;
  var doc = new pdfLib({unit: "mm", format: "a4"});
  var y = MARGEM;

  function cabe(altura){
    if(y + altura > ALTURA - MARGEM){ doc.addPage(); y = MARGEM; return false; }
    return true;
  }
  function escrever(txt, opcoes){
    var o = opcoes || {};
    var tamanho = o.tamanho || corpoPt;
    var alturaLinha = o.altura || (tamanho * MM_POR_PT * 1.32);
    cabe(alturaLinha);
    doc.setFont(o.mono ? "courier" : "helvetica", o.negrito ? "bold" : "normal");
    doc.setFontSize(tamanho);
    doc.setTextColor(o.cinza ? 110 : 20);
    y += alturaLinha;
    doc.text(txt, MARGEM, y);
  }
  function respiro(mm){ y = Math.min(y + mm, ALTURA - MARGEM); }

  escrever(m.nome || "Missa", {tamanho: 15, negrito: true});
  if(m.data) escrever(dataBR(m.data), {tamanho: 9.5, cinza: true});
  respiro(3);

  var momentos = m.momentos || {};
  var escreveuAlgo = false;
  MOMENTOS.forEach(function(mo){
    var entries = momentos[mo.id] || [];
    var it = LITURGICOS[mo.id] ? itemLiturgico(m, mo.id) : null;
    if(!entries.length && !it) return;
    escreveuAlgo = true;
    cabe(linhaMm * 4);                       // não deixar cabeçalho órfão no pé da página
    respiro(2);
    escrever(mo.nome.toUpperCase(), {tamanho: 10.5, negrito: true});
    doc.setDrawColor(200);
    doc.line(MARGEM, y + 1, 210 - MARGEM, y + 1);
    respiro(2.5);

    if(it){
      escrever((it.referencia || LITURGICOS[mo.id].rotulo) + (it.liturgia ? "  ·  " + it.liturgia : ""),
               {tamanho: corpoPt, mono: true, negrito: true});
      if(it.refrao){
        doc.splitTextToSize("R. " + it.refrao, LARGURA).forEach(function(l){
          escrever(l, {tamanho: corpoPt * 1.05, negrito: true});
        });
      }
      respiro(1.5);
      (it.estrofes || []).forEach(function(e){
        doc.splitTextToSize(e, LARGURA).forEach(function(l){ escrever(l, {tamanho: corpoPt * 1.05}); });
        respiro(1.5);
      });
      respiro(1);
    }

    entries.forEach(function(raw){
      var parsed = parseMissaEntry(raw);
      var s = getSong(Number(parsed.numeroStr));
      if(!s) return;
      var origRoot = rootLetter(s.tom);
      var alvo = parsed.tom || origRoot;
      var offset = NOTE_INDEX[alvo] - NOTE_INDEX[origRoot];
      var escala = chooseScale(alvo);
      var linhas = showCifra ? (s.corpo || []) : (s.corpo || []).filter(function(l){ return !isChordLine(l); });
      linhas = corpoParaLinhas(linhas, offset, escala, cols);
      cabe(linhaMm * 5);                     // título de canto nunca sozinho no fim da folha
      respiro(2);
      escrever("Nº " + s.numeroStr + " — " + s.titulo, {tamanho: corpoPt * 1.15, negrito: true});
      var tomLabel = parsed.tom ? tomLabelForRoot(s.tom, alvo) + " (original " + s.tom + ")" : (s.tom || "—");
      escrever("Tom: " + tomLabel + "  ·  Ritmo: " + (s.ritmo || "—"), {tamanho: corpoPt * 0.92, cinza: true});
      respiro(1);
      var emRefrao = false;
      linhas.forEach(function(l){
        if(RE_REFRAO.test(l)){
          emRefrao = true;
          escrever("REFRÃO", {tamanho: corpoPt * 0.92, negrito: true});
          return;
        }
        if(!l.trim()){ emRefrao = false; respiro(linhaMm * 0.6); return; }
        cabe(linhaMm);
        // Courier normal e negrito têm o MESMO avanço: o destaque do refrão
        // não desloca acorde nenhum
        doc.setFont("courier", emRefrao ? "bold" : "normal");
        doc.setFontSize(corpoPt);
        doc.setTextColor(isChordLine(l) ? 123 : 20, isChordLine(l) ? 50 : 20, isChordLine(l) ? 67 : 20);
        y += linhaMm;
        doc.text(l, MARGEM, y);
      });
      respiro(2);
    });
  });
  return escreveuAlgo ? doc : null;
}
document.getElementById("print-btn").addEventListener("click", function(){
  var btn = this;
  var m = currentMissa();
  if(!m){ toast("Selecione uma missa primeiro."); return; }
  btn.disabled = true;
  var rotulo = btn.textContent;
  btn.textContent = "Gerando…";
  function terminar(){ btn.disabled = false; btn.textContent = rotulo; }
  carregarJsPDF().then(function(){
    var doc = montarPdf();
    if(!doc){ toast("Escolha ao menos um canto antes de gerar o PDF."); terminar(); return; }
    var blob = doc.output("blob");
    var nome = nomeArquivo(m);
    var useDownloads = (window.claude && window.claude.use)
      ? window.claude.use("downloads") : Promise.resolve(null);
    return useDownloads.then(function(dl){
      if(!dl){
        toast("Este visualizador não permite salvar arquivos.");
        terminar();
        return;
      }
      return dl.save({filename: nome, data: blob}).then(function(){
        toast("PDF salvo: " + nome);
        terminar();
      }).catch(function(err){
        var code = err && err.code;
        toast(code === "declined" ? "Salvamento cancelado." : "Não foi possível salvar o PDF.");
        terminar();
      });
    });
  }).catch(function(err){
    toast("Não foi possível gerar o PDF: " + (err && err.message ? err.message : "erro"));
    terminar();
  });
});

/* ---------------- ADICIONAR MÚSICA ----------------
   O app não busca letra na internet: quem traz o texto é o grupo (caderno,
   folha do ensaio, digitação). O texto colado é limpo, conferido e gravado
   direto em `songs` — sem fila e sem depender do Claude. A coleção `pedidos`
   continua existindo só para o salmo do dia, que é o que realmente depende de
   buscar na web.

   O texto é tratado como MONOESPAÇADO do começo ao fim: a posição do acorde é
   a coluna do caractere. Por isso o textarea usa a mesma fonte da prévia e não
   quebra linha — o que se digita é o que se vê. */
function nextNumero(){
  var max = 0;
  state.songs.forEach(function(s){ if(s.numero>max) max=s.numero; });
  return max+1;
}
function pad3(n){ return String(n).padStart(3,"0"); }

var edicao = null;         // canto sendo editado {id, numero, numeroStr, criadoEm}
var rascunhoAtivo = null;  // rascunho que originou o que está no formulário

function el(id){ return document.getElementById(id); }

function renderAdicionar(){
  preencherSelectsAdicionar();
  atualizarTopoAdicionar();
  renderPrevia();
  renderRascunhos();
  renderAdicionados();
  renderPedidos();
}
function preencherSelectsAdicionar(){
  var cat = el("add-categoria");
  if(!cat.options.length){
    cat.innerHTML = CATEGORIAS_LIVRO.map(function(c){
      return '<option value="'+esc(c)+'">'+esc(c)+'</option>'; }).join("");
  }
  var tom = el("add-tom");
  if(!tom.options.length){
    tom.innerHTML = '<option value="">— não sei —</option>' + TOM_OPTIONS.map(function(o){
      return '<option value="'+o.v+'">'+esc(o.l)+'</option>'; }).join("");
  }
}
function atualizarTopoAdicionar(){
  var box = el("add-modo-num");
  if(edicao){
    box.innerHTML = 'Editando o canto <span class="n">'+esc(edicao.numeroStr)+'</span>';
    el("add-salvar-btn").textContent = "Salvar alterações";
  } else {
    box.innerHTML = 'Próximo número previsto: <span class="n" id="next-num-val">' +
                    (state.dbReady ? nextNumero() : "—") + '</span>';
    el("add-salvar-btn").textContent = "Salvar no livro";
  }
  el("add-cancelar-edicao").hidden = !edicao;
}

/* ----- padrão do livro -----
   O texto que chega de um site de cifras vem com sobras: pedaços de HTML
   ('">' antes do acorde), marcadores entre colchetes, tablatura e a mesma
   linha de letra repetida. O livro não tem nada disso: cifra em cima, letra
   embaixo, "Intro:" numa linha de cifra, uma linha em branco entre blocos.
   `padronizar()` faz essa conversão — é determinística e roda no próprio
   app, sem depender de ninguém.
   O que NÃO se mexe: a indentação, porque ela é posição real do acorde sobre
   a sílaba; mudá-la desalinharia a cifra. */
var RE_TAB = /^\s*[EADGBe]\s*\|[-\d|xhpbsr\/\\~()\s]*$/;
/* Cabeçalho de site/PDF: nada disso existe no livro. */
var RE_META = /^\s*(tom|tonalidade|capotraste|capo|afina[çc][ãa]o|afinacao|ritmo|compasso|bpm|dificuldade|int[ée]rprete|artista|composi[çc][ãa]o|composicao|letra e m[úu]sica|autor|[áa]lbum|ano)\s*:/i;
var RE_SITE = /(cifraclub|cifra club|www\.|https?:\/\/|\.com\b|todos os direitos|impresso em)/i;
var RE_REFRAO = /^\s*\(?\s*(refr[ãa]o|refrao|estribilho|coro)\s*\d*\s*\)?\s*:?\s*$/i;
/* Tablatura vem em bloco de 6 linhas de traços e números com "|". */
function ehTablatura(linha){
  if(linha.indexOf("|") < 0) return false;
  var s = linha.replace(/\s+/g, "");
  if(s.length < 6) return false;
  var bons = (s.match(/[-|\d xhpbsr\/\\~()]/g) || []).length;
  var tracos = (s.match(/-/g) || []).length;
  return bons / s.length >= 0.75 && tracos >= 3;
}
var RE_MARCADOR = /^\s*\[([^\]]*)\]\s*(.*)$/;
function temArtefato(linha){
  return /<[^>]*>|&nbsp;|&amp;|"\s*\/?>/.test(linha);
}
function limparArtefatos(linha){
  return linha
    .replace(/<[^>]*>/g, "")        // tag inteira que veio junto
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/"\s*\/?>/g, "  ");    // resto de atributo: 2 chars por 2 espaços, mantém a coluna
}
/* Garante ao menos um espaço entre acordes — "A B7" colado vira "AB7" e a
   transposição passa a ler um acorde só. Mesma regra do importador do livro.
   Também separa o que já veio colado: "CD" -> "C D", cada parte guardando a
   coluna em que estava. */
function partesDoToken(tok){
  var partes = [], atual = tok.charAt(0);
  for(var i = 1; i < tok.length; i++){
    var c = tok.charAt(i), ant = tok.charAt(i-1);
    if(c >= "A" && c <= "G" && ant !== "/" && ant !== "("){
      partes.push(atual);
      atual = c;
    } else {
      atual += c;
    }
  }
  partes.push(atual);
  return partes;
}
function normalizarCifra(linha){
  var toks = [], re = /\S+/g, m;
  while((m = re.exec(linha))){
    var col = m.index;
    partesDoToken(m[0]).forEach(function(parte){
      toks.push([col, parte]);
      col += parte.length;
    });
  }
  var out = "";
  toks.forEach(function(tk){
    var col = tk[0];
    if(out && col <= out.length) col = out.length + 1;
    out += new Array(col - out.length + 1).join(" ") + tk[1];
  });
  return out;
}
function fundirCifras(a, b){
  var toks = [], re, m;
  [a, b].forEach(function(linha){
    re = /\S+/g;
    while((m = re.exec(linha))) toks.push([m.index, m[0]]);
  });
  toks.sort(function(x, y){ return x[0] - y[0]; });
  var out = "";
  toks.forEach(function(tk){
    var col = tk[0];
    if(out && col <= out.length) col = out.length + 1;
    out += new Array(col - out.length + 1).join(" ") + tk[1];
  });
  return out;
}
/* Só funde quando a coluna do acorde órfão é confiável. Quando o site perdeu a
   posição, o fragmento vem encostado na margem (coluna 0-2) sobre uma cifra que
   já começa ali — fundir nesse caso inventaria um lugar para o acorde. */
var duplicatasSuspeitas = 0;
function colunaConfiavel(base, orfa){
  var mBase = base.match(/\S/), mOrfa = orfa.match(/\S/);
  var colBase = mBase ? base.indexOf(mBase[0]) : 0;
  var colOrfa = mOrfa ? orfa.indexOf(mOrfa[0]) : 0;
  return !(colOrfa <= 2 && colBase <= 2);
}
/* O paste de site traz a MESMA linha de letra duas vezes, cada cópia com parte
   dos acordes. Juntar as duas é seguro, mas SÓ quando a segunda veio de uma
   linha com resíduo de HTML (`marcas`): sem essa checagem, uma estrofe que o
   livro repete de propósito — cada cópia com sua própria cifra — seria
   fundida numa só, perdendo uma repetição. Foi o que o teste pegou. */
function fundirDuplicatas(linhas, marcas){
  var out = linhas.slice(), mk = marcas.slice(), mudou = true, voltas = 0;
  duplicatasSuspeitas = 0;
  while(mudou && voltas++ < 8){
    mudou = false;
    // (a) cifra A / letra L / cifra B (de artefato) / letra L  ->  cifra A+B / letra L
    for(var i = 0; i + 3 < out.length; i++){
      if(isChordLine(out[i]) && out[i+1].trim() && !isChordLine(out[i+1]) &&
         isChordLine(out[i+2]) && out[i+3] === out[i+1] && mk[i+2]){
        if(!colunaConfiavel(out[i], out[i+2])){ duplicatasSuspeitas++; continue; }
        out.splice(i, 4, fundirCifras(out[i], out[i+2]), out[i+1]);
        mk.splice(i, 4, true, mk[i+1]);
        mudou = true;
      }
    }
    // (b) letra L (sem cifra em cima) / cifra de artefato / letra L  ->  cifra / letra L
    for(var j = 0; j + 2 < out.length; j++){
      if(out[j].trim() && !isChordLine(out[j]) &&
         (j === 0 || !isChordLine(out[j-1])) &&
         isChordLine(out[j+1]) && out[j+2] === out[j] && mk[j+1]){
        out.splice(j, 1);
        mk.splice(j, 1);
        mudou = true;
      }
    }
  }
  return out;
}
function padronizar(linhas){
  var out = [], marcas = [];
  var tituloAtual = (function(){
    var campo = document.getElementById("add-titulo");
    return campo ? norm(campo.value.trim()) : "";
  })();
  function ultima(){ return out.length ? out[out.length-1] : null; }
  function brancoSeprecisar(){ if(out.length && ultima()){ out.push(""); marcas.push(false); } }
  for(var i = 0; i < linhas.length; i++){
    var bruta = linhas[i];
    var doSite = temArtefato(bruta);
    var l = limparArtefatos(bruta).replace(/\s+$/, "");
    if(ehTablatura(l) || (l.indexOf("|") >= 0 && RE_TAB.test(l))) continue;   // tablatura não entra no livro
    if(RE_META.test(l) || RE_SITE.test(l)) continue;         // cabeçalho de site/PDF
    if(tituloAtual && norm(l.trim()) === tituloAtual) continue;   // título repetido a cada página
    if(RE_REFRAO.test(l)){                                   // marcador de refrão, em qualquer forma
      if(out.length && ultima()) { out.push(""); marcas.push(false); }
      out.push("Refrão:");
      marcas.push(false);
      continue;
    }
    var m = l.match(RE_MARCADOR);
    if(m){
      var dentro = m[1].trim(), resto = m[2].trim();
      if(/^intro/i.test(dentro)){
        if(!resto) continue;
        l = "Intro: " + resto;                                // como o livro escreve
      } else if(RE_REFRAO.test(dentro) || RE_REFRAO.test("(" + dentro + ")")){
        if(out.length && ultima()){ out.push(""); marcas.push(false); }
        out.push("Refrão:");
        marcas.push(false);
        if(resto){ out.push(resto); marcas.push(doSite); }
        continue;
      } else if(resto){
        l = resto;                                            // marcador colado no conteúdo
      } else {
        brancoSeprecisar();                                   // o livro separa por linha em branco
        continue;
      }
    }
    if(!l.trim()){ brancoSeprecisar(); continue; }
    if(/^[\s()\[\]{}"'.,;:|>-]+$/.test(l)) continue;          // fragmento de pontuação solto
    if(isChordLine(l)) l = normalizarCifra(l);
    if(!isChordLine(l) && ultima() === l) continue;           // letra repetida em seguida
    out.push(l);
    marcas.push(doSite);
  }
  while(out.length && !out[out.length-1]){ out.pop(); marcas.pop(); }
  while(out.length && !out[0]){ out.shift(); marcas.shift(); }
  return fundirDuplicatas(out, marcas);
}

/* ----- do texto colado para o `corpo` do banco ----- */
var INVISIVEIS_RE = /[​‌‍﻿­]/g;
function expandirTabs(linha){
  var out = "";
  for(var i=0;i<linha.length;i++){
    var c = linha.charAt(i);
    if(c === "\t"){ do { out += " "; } while(out.length % 8 !== 0); }
    else out += c;
  }
  return out;
}
function textoCru(txt){
  return String(txt||"").replace(INVISIVEIS_RE,"").replace(/\r\n?/g,"\n").split("\n")
    .filter(function(l){ return l.trim(); });
}
function textoParaCorpo(txt){
  var linhas = String(txt||"").replace(INVISIVEIS_RE,"").replace(/\r\n?/g,"\n").split("\n")
    .map(expandirTabs)
    .map(function(l){ return l.replace(/\s+$/,""); });
  while(linhas.length && !linhas[0].trim()) linhas.shift();
  while(linhas.length && !linhas[linhas.length-1].trim()) linhas.pop();
  var out = [];
  linhas.forEach(function(l){
    if(!l.trim() && out.length && !out[out.length-1]) return;   // no máximo uma linha vazia seguida
    out.push(l.trim() ? l : "");
  });
  return usarPadraoLivro() ? padronizar(out) : out;
}
function usarPadraoLivro(){
  var cx = document.getElementById("add-padrao");
  return !cx || cx.checked;
}
/* Dois acordes colados ("AB7") quebram a transposição: o app transpõe o
   primeiro e trata o resto como sufixo. "/" e "(" são separadores legítimos
   (G/B, C(9)), então só letra A–G logo depois de outra coisa é suspeita. */
function pareceColado(tok){
  for(var i=1;i<tok.length;i++){
    var c = tok.charAt(i), ant = tok.charAt(i-1);
    if(c >= "A" && c <= "G" && ant !== "/" && ant !== "(") return true;
  }
  return false;
}
function diagnosticar(corpo){
  var d = {cifras:0, letras:0, colados:[], sobra:0};
  corpo.forEach(function(l, i){
    if(isChordLine(l)){
      d.cifras++;
      l.trim().split(/\s+/).forEach(function(tok){
        if(pareceColado(tok) && d.colados.indexOf(tok) < 0) d.colados.push(tok);
      });
      var prox = corpo[i+1] || "";
      if(prox.trim() && !isChordLine(prox)){
        var diff = l.length - prox.length;
        if(diff > d.sobra) d.sobra = diff;
      }
    } else if(l.trim()) d.letras++;
  });
  return d;
}
function avisoHtml(tipo, texto){
  return '<div class="aviso aviso-'+tipo+'">'+texto+'</div>';
}
function renderAvisos(d, corpo){
  var alvo = el("add-avisos");
  if(!corpo.length){ alvo.innerHTML = ""; return; }
  var h = "";
  if(!d.cifras){
    h += avisoHtml("atencao", "<strong>Nenhuma linha de cifra reconhecida.</strong> Dá para salvar mesmo assim — fica só a letra — mas confira se os acordes vieram junto.");
  }
  if(d.colados.length){
    h += avisoHtml("atencao", "<strong>Acordes possivelmente colados:</strong> " +
      esc(d.colados.slice(0,6).join(", ")) + (d.colados.length>6 ? " e outros" : "") +
      ". Separe com pelo menos um espaço, senão a transposição de tom trata os dois como um acorde só.");
  }
  if(d.sobra > 12){
    h += avisoHtml("atencao", "<strong>A cifra passa "+d.sobra+" colunas além do fim da letra</strong> em alguma linha. Isso costuma acontecer com texto copiado de editor de fonte proporcional (Word). Confira na prévia se o acorde caiu na sílaba certa.");
  }
  if(!h && d.cifras){
    h += avisoHtml("ok", "<strong>"+d.cifras+" linhas de cifra</strong> e "+d.letras+" de letra. Confira a prévia e pode salvar.");
  }
  if(usarPadraoLivro() && duplicatasSuspeitas){
    h += avisoHtml("atencao", "<strong>" + duplicatasSuspeitas +
      (duplicatasSuspeitas === 1 ? " trecho veio" : " trechos vieram") +
      " com a letra repetida e o acorde sem posição</strong> — o site perdeu a coluna, então deixei como está em vez de chutar onde o acorde entra. Na prévia dá para ver onde: apague a linha repetida e mova o acorde para a sílaba certa.");
  }
  if(usarPadraoLivro()){
    var cru = textoCru(el("add-texto").value);
    var tirou = cru.length - corpo.length;
    if(tirou > 0){
      h += avisoHtml("ok", "<strong>Formatado no padrão do livro:</strong> " + tirou +
        (tirou === 1 ? " linha foi ajustada" : " linhas foram ajustadas") +
        " (sobras de site, marcadores entre colchetes, tablatura e repetições).");
    }
  }
  alvo.innerHTML = h;
}
function renderPrevia(){
  var corpo = textoParaCorpo(el("add-texto").value);
  var card = el("add-previa-card");
  if(!corpo.length){
    card.hidden = true;
    el("add-avisos").innerHTML = "";
    return;
  }
  card.hidden = false;                       // antes de medir: escondido, clientWidth é 0
  var pre = el("add-preview");
  pre.style.fontSize = tamanhoFonte("detalhe");
  pre.innerHTML = renderCorpo(corpo, 0, null, colunasDe(pre));
  var d = diagnosticar(corpo);
  el("add-previa-meta").textContent =
    "Nº " + (edicao ? edicao.numeroStr : (state.dbReady ? nextNumero() : "—")) +
    " · " + d.cifras + " linhas de cifra · " + d.letras + " de letra";
  renderAvisos(d, corpo);
}
el("add-padrao").addEventListener("change", function(){ renderPrevia(); });
var previaTimer = null;
el("add-texto").addEventListener("input", function(){
  clearTimeout(previaTimer);
  previaTimer = setTimeout(renderPrevia, 250);
});
["add-titulo","add-ritmo"].forEach(function(id){
  el(id).addEventListener("input", function(){
    clearTimeout(previaTimer);
    previaTimer = setTimeout(renderPrevia, 250);
  });
});

/* ----- importar de PDF -----
   O PDF guarda a posição x/y de cada trecho no papel. É exatamente a
   informação que faltava quando o texto vem colado de um site: a coluna do
   acorde sobre a sílaba. Aqui a conta é a mesma usada para importar o livro:
   coluna = (x do trecho − margem esquerda) / largura do caractere da LETRA.
   Usar a largura da letra (e não a do acorde) é o pulo do gato — no livro a
   cifra está em 7pt e a letra em 11pt, e é a letra que define a coluna. */
var PDFJS_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
var PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
var pdfjsLib = null;
function carregarPdfJs(){
  if(pdfjsLib) return Promise.resolve(pdfjsLib);
  return new Promise(function(resolve, reject){
    var s = document.createElement("script");
    s.src = PDFJS_URL;
    s.onload = function(){
      pdfjsLib = window.pdfjsLib || null;
      if(!pdfjsLib){ reject(new Error("pdf.js não carregou")); return; }
      try{ pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; }catch(err){}
      resolve(pdfjsLib);
    };
    s.onerror = function(){ reject(new Error("não foi possível baixar o leitor de PDF")); };
    document.head.appendChild(s);
  });
}
function mediana(v){
  if(!v.length) return 0;
  var s = v.slice().sort(function(a,b){ return a-b; });
  return s[Math.floor(s.length/2)];
}
var TOL_LINHA = 2.2;   // diferença de baseline que ainda conta como a mesma linha
function itensDoTexto(tc){
  return tc.items.filter(function(it){ return it.str && it.str.trim(); }).map(function(it){
    return {x: it.transform[4], y: it.transform[5], w: it.width || 0,
            alt: Math.abs(it.transform[3]) || it.height || 10, txt: it.str};
  });
}
function agruparLinhas(itens){
  itens.sort(function(a,b){ return (b.y - a.y) || (a.x - b.x); });   // no PDF o y cresce para cima
  var linhas = [];
  itens.forEach(function(it){
    var ult = linhas[linhas.length-1];
    if(ult && Math.abs(ult.y - it.y) <= TOL_LINHA) ult.itens.push(it);
    else linhas.push({y: it.y, itens: [it]});
  });
  linhas.forEach(function(l){ l.itens.sort(function(a,b){ return a.x - b.x; }); });
  return linhas;
}
/* Posição aproximada de cada caractere: o pdf.js entrega trechos, não letras,
   então dentro de cada trecho a posição é interpolada pela largura dele. Erra
   um pouco no meio de uma palavra e acerta no começo — que é justamente onde o
   acorde cai. */
function charsDaLinha(linha){
  var chars = [];
  linha.itens.forEach(function(it){
    var n = it.txt.length;
    if(!n) return;
    var w = it.w > 0 ? it.w : n * 5;
    for(var i = 0; i < n; i++){
      chars.push({x: it.x + w * i / n, x1: it.x + w * (i + 1) / n, c: it.txt.charAt(i)});
    }
  });
  return chars;
}
/* Qual caractere da letra está embaixo deste x — a mesma conta que alinhou os
   2161 pares de cifra do livro. */
function colunaPorLetra(x, chars){
  for(var i = 0; i < chars.length; i++){
    if(x < chars[i].x1 - 0.35) return i;
  }
  if(chars.length){
    var larg = (chars[chars.length-1].x1 - chars[0].x) / chars.length;
    var extra = larg > 0 ? Math.round((x - chars[chars.length-1].x1) / larg) : 0;
    return chars.length + Math.max(0, extra);
  }
  return 0;
}
function tokensDaLinha(linha){
  var toks = [];
  linha.itens.forEach(function(it){
    var n = it.txt.length;
    if(!n) return;
    var w = it.w > 0 ? it.w : n * 5;
    var re = /\S+/g, m;
    while((m = re.exec(it.txt))){
      toks.push({x: it.x + w * m.index / n, txt: m[0]});
    }
  });
  return toks;
}
function montarLinha(pares){
  var out = "";
  pares.forEach(function(par){
    var col = Math.max(0, par[0]);
    if(out.length && col <= out.length) col = out.length + 1;
    out += new Array(col - out.length + 1).join(" ") + par[1];
  });
  return out.replace(/\s+$/, "");
}
function paginaParaLinhas(tc){
  var itens = itensDoTexto(tc);
  if(!itens.length) return [];
  var linhas = agruparLinhas(itens);
  var margem = Math.min.apply(null, itens.map(function(i){ return i.x; }));

  // texto cru de cada linha, só para separar cifra de letra
  linhas.forEach(function(l){
    l.bruto = l.itens.map(function(i){ return i.txt; }).join(" ").replace(/\s+/g, " ").trim();
    l.ehCifra = isChordLine(l.bruto);
  });
  /* Largura do caractere da LETRA: soma das larguras dividida pela soma dos
     caracteres, só nas linhas de letra longas. Média ponderada em vez de
     mediana de médias — foi o que corrigiu um erro de ~12% na coluna. */
  var somaW = 0, somaN = 0;
  linhas.forEach(function(l){
    if(l.ehCifra) return;
    l.itens.forEach(function(it){
      if(it.txt.trim().length > 3 && it.w > 0){ somaW += it.w; somaN += it.txt.length; }
    });
  });
  var largChar = somaN ? somaW / somaN : 5;

  /* Onde termina a estrofe. Dentro dela os saltos já variam (cifra->letra é
     curto, letra->cifra é maior), então um múltiplo fixo da mediana quebra a
     estrofe a cada par. Em vez disso: ordena os saltos e procura o maior PULO
     entre um salto e o seguinte — é ali que "linha da estrofe" vira "parágrafo".
     Sem pulo claro (razão < 1.3), o PDF não tem separação e nenhuma é inventada. */
  var alturas = [];
  for(var i = 1; i < linhas.length; i++) alturas.push(linhas[i-1].y - linhas[i].y);
  var ordenadas = alturas.slice().sort(function(a,b){ return a-b; });
  var limiteParagrafo = Infinity;
  if(ordenadas.length > 2){
    var meio = Math.floor(ordenadas.length / 2), melhor = 1.3, corte = -1;
    for(var k = meio; k < ordenadas.length - 1; k++){
      if(ordenadas[k] <= 0) continue;
      var razao = ordenadas[k+1] / ordenadas[k];
      if(razao > melhor){ melhor = razao; corte = k; }
    }
    if(corte >= 0) limiteParagrafo = (ordenadas[corte] + ordenadas[corte+1]) / 2;
  }

  var saida = [];
  linhas.forEach(function(linha, idx){
    if(idx > 0 && (linhas[idx-1].y - linha.y) > limiteParagrafo) saida.push("");
    var toks = tokensDaLinha(linha);
    if(!toks.length) return;
    var proxima = linhas[idx+1];
    var pares;
    if(linha.ehCifra && proxima && !proxima.ehCifra && proxima.itens.length){
      // acorde pela coluna do caractere da letra de baixo
      var chars = charsDaLinha(proxima);
      var colInicio = Math.max(0, Math.round((proxima.itens[0].x - margem) / largChar));
      pares = toks.map(function(tk){
        return [colInicio + colunaPorLetra(tk.x, chars), tk.txt];
      });
    } else if(linha.ehCifra){
      pares = toks.map(function(tk){
        return [Math.round((tk.x - margem) / largChar), tk.txt];
      });
    } else {
      /* Linha de letra: posiciona o TRECHO inteiro, não palavra por palavra.
         Palavra por palavra, um título em corpo maior sairia esparramado —
         a largura de caractere é a da letra, não a dele. */
      pares = linha.itens.map(function(it){
        return [Math.round((it.x - margem) / largChar), it.txt.replace(/\s+$/, "")];
      });
    }
    var texto = montarLinha(pares);
    if(/^\s*\d{1,3}\s*$/.test(texto)) return;          // número de página
    saida.push(texto);
  });
  return saida;
}
function lerPdf(buffer){
  return pdfjsLib.getDocument({data: buffer}).promise.then(function(pdf){
    var linhas = [], seq = Promise.resolve();
    for(var n = 1; n <= pdf.numPages; n++){
      (function(num){
        seq = seq.then(function(){ return pdf.getPage(num); })
                 .then(function(pag){ return pag.getTextContent(); })
                 .then(function(tc){
                   if(linhas.length) linhas.push("");
                   linhas = linhas.concat(paginaParaLinhas(tc));
                 });
      })(n);
    }
    return seq.then(function(){ return linhas; });
  });
}
/* O bloco de cabeçalho do PDF (nome do grupo, autor, site) não tem padrão
   nenhum para reconhecer linha a linha. O que ele tem é POSIÇÃO: vem antes da
   primeira linha de cifra. Então o corte é aí — limitado às 8 primeiras linhas
   e a linhas curtas, para não comer uma estrofe que comece sem acorde. */
function tirarCabecalhoDoPdf(linhas){
  var corte = 0, limite = Math.min(linhas.length, 8);
  for(var i = 0; i < limite; i++){
    var l = linhas[i];
    if(!l.trim()){ corte = i + 1; continue; }
    var semColchetes = l.replace(/\[[^\]]*\]/g, " ");
    if(isChordLine(l) || isChordLine(semColchetes) || RE_MARCADOR.test(l)) break;  // a cifra começou
    if(l.trim().length <= 45){ corte = i + 1; continue; }                          // linha curta: cabeçalho
    break;                                                                         // parece letra de verdade
  }
  return linhas.slice(corte);
}
/* Tom e ritmo, quando o PDF traz, viram campo em vez de linha do corpo. */
function aproveitarCabecalho(linhas){
  var resto = [], achou = {};
  linhas.forEach(function(l){
    var mTom = l.match(/^\s*tom\s*:\s*([A-G][#b]?m?)\s*$/i);
    var mRitmo = l.match(/^\s*ritmo\s*:\s*(.+?)\s*$/i);
    if(mTom && !achou.tom){ achou.tom = mTom[1]; return; }
    if(mRitmo && !achou.ritmo){ achou.ritmo = mRitmo[1]; return; }
    resto.push(l);
  });
  return {linhas: resto, tom: achou.tom, ritmo: achou.ritmo};
}
function statusPdf(txt){ el("add-pdf-status").textContent = txt; }
var textoAntesDoPdf = null;
el("add-pdf").addEventListener("change", function(e){
  var arquivo = e.target.files && e.target.files[0];
  e.target.value = "";                       // permite escolher o mesmo arquivo de novo
  if(!arquivo) return;
  statusPdf("Lendo " + arquivo.name + "…");
  carregarPdfJs()
    .then(function(){ return arquivo.arrayBuffer(); })
    .then(function(buf){ return lerPdf(buf); })
    .then(function(linhas) {
      var comTexto = linhas.filter(function(l){ return l.trim(); });
      if(!comTexto.length){
        statusPdf("Este PDF não tem texto — parece ser uma digitalização (imagem da página). Nesse caso é preciso digitar ou colar.");
        return;
      }
      // colhe tom/ritmo do cabeçalho ANTES de cortá-lo fora
      var cab = aproveitarCabecalho(linhas);
      cab.linhas = tirarCabecalhoDoPdf(cab.linhas);
      if(cab.tom && !el("add-tom").value) el("add-tom").value = rootLetter(cab.tom) || "";
      if(cab.ritmo && !el("add-ritmo").value) el("add-ritmo").value = cab.ritmo;
      if(!el("add-titulo").value){
        var provavel = comTexto[0].trim();
        if(provavel.length <= 60) el("add-titulo").value = provavel.toUpperCase();
      }
      textoAntesDoPdf = el("add-texto").value;
      el("add-texto").value = cab.linhas.join("\n");
      renderPrevia();
      statusPdf(arquivo.name + " — " + comTexto.length + " linhas lidas. Confira a prévia abaixo.");
      toast("PDF carregado. Confira a prévia antes de salvar.");
    })
    .catch(function(err){
      statusPdf("Não deu para ler este PDF: " + (err && err.message ? err.message : "erro") +
                ". Dá para digitar ou colar o texto no campo abaixo.");
    });
});

/* ----- formulário ----- */
function dadosDoForm(){
  return {
    titulo: el("add-titulo").value.trim(),
    categoria: el("add-categoria").value,
    tom: el("add-tom").value,
    ritmo: el("add-ritmo").value.trim(),
    fonteUrl: el("add-link").value.trim(),
    texto: el("add-texto").value
  };
}
function preencherForm(d){
  el("add-titulo").value = d.titulo || "";
  el("add-categoria").value = d.categoria || CATEGORIAS_LIVRO[0];
  el("add-tom").value = d.tom || "";
  el("add-ritmo").value = d.ritmo || "";
  el("add-link").value = d.fonteUrl || "";
  el("add-texto").value = d.texto || "";
}
function limparForm(){
  edicao = null;
  rascunhoAtivo = null;
  textoAntesDoPdf = null;
  statusPdf("Nenhum arquivo escolhido.");
  preencherForm({});
  el("add-categoria").selectedIndex = 0;
  renderAdicionar();
}
function salvarCanto(){
  if(!db){ toast("Banco de dados indisponível."); return; }
  var f = dadosDoForm();
  var corpo = textoParaCorpo(f.texto);
  if(!f.titulo){ toast("Dê um título ao canto."); el("add-titulo").focus(); return; }
  if(!corpo.length){ toast("Escreva ou cole a letra com a cifra."); el("add-texto").focus(); return; }
  var numero = edicao ? edicao.numero : nextNumero();
  var numeroStr = edicao ? edicao.numeroStr : String(numero);
  var agora = new Date().toISOString();
  var doc = {
    numero: numero, numeroStr: numeroStr, titulo: f.titulo, categoria: f.categoria,
    tom: f.tom, ritmo: f.ritmo, corpo: corpo, origem: "adicionada",
    fonteUrl: f.fonteUrl, criadoEm: (edicao && edicao.criadoEm) || agora, atualizadoEm: agora
  };
  var docId = edicao ? edicao.id : pad3(numero);
  var eraEdicao = !!edicao;
  var rasc = rascunhoAtivo;
  db.collection("songs").doc(docId).set(doc).then(function(){
    if(rasc) db.collection("rascunhos").doc(rasc).delete().catch(function(){});
    limparForm();
    toast(eraEdicao ? "Canto "+numeroStr+" atualizado." : "Canto "+numeroStr+" salvo no livro.");
  }).catch(aoFalharEscrita("Não foi possível salvar o canto."));
}
function salvarRascunho(){
  if(!db){ toast("Banco de dados indisponível."); return; }
  var f = dadosDoForm();
  if(!f.titulo && !f.texto.trim()){ toast("Não há nada para guardar ainda."); return; }
  var agora = new Date().toISOString();
  var dados = {titulo:f.titulo, categoria:f.categoria, tom:f.tom, ritmo:f.ritmo,
               fonteUrl:f.fonteUrl, texto:f.texto, atualizadoEm:agora};
  var promessa;
  if(rascunhoAtivo){
    var r = state.rascunhos.filter(function(x){ return x.id === rascunhoAtivo; })[0] || {};
    dados.criadoEm = r.criadoEm || agora;
    promessa = db.collection("rascunhos").doc(rascunhoAtivo).set(dados);
  } else {
    dados.criadoEm = agora;
    promessa = db.collection("rascunhos").add(dados).then(function(ref){
      if(ref && ref.id) rascunhoAtivo = ref.id;
    });
  }
  promessa.then(function(){ toast("Rascunho guardado."); })
          .catch(aoFalharEscrita("Não foi possível guardar o rascunho."));
}
el("add-salvar-btn").addEventListener("click", salvarCanto);
el("add-rascunho-btn").addEventListener("click", salvarRascunho);
el("add-limpar-btn").addEventListener("click", function(){
  limparForm();
  toast("Formulário limpo.");
});
el("add-cancelar-edicao").addEventListener("click", function(){
  limparForm();
  toast("Edição cancelada.");
});

/* Confirmação em dois cliques — diálogo nativo não funciona neste iframe. */
function armarOuAgir(btn, textoConfirma, acao){
  if(btn.getAttribute("data-armado") === "1"){
    clearTimeout(btn._t);
    acao();
    return;
  }
  var orig = btn.textContent;
  btn.setAttribute("data-armado", "1");
  btn.textContent = textoConfirma;
  btn.classList.add("armado");
  btn._t = setTimeout(function(){
    btn.removeAttribute("data-armado");
    btn.textContent = orig;
    btn.classList.remove("armado");
  }, 5000);
}

/* ----- rascunhos ----- */
function renderRascunhos(){
  var lista = state.rascunhos.slice().sort(function(a,b){
    return (b.atualizadoEm||"").localeCompare(a.atualizadoEm||"");
  });
  el("rascunhos-conta").textContent = lista.length ? " (" + lista.length + ")" : "";
  var alvo = el("rascunhos-list");
  if(!lista.length){
    alvo.innerHTML = '<p class="hint">Nenhum rascunho guardado. Use "Guardar rascunho" para parar no meio e continuar depois — de qualquer aparelho.</p>';
    return;
  }
  alvo.innerHTML = lista.map(function(r){
    var temTexto = (r.texto||"").trim();
    var sub = [r.categoria, r.tom ? "tom "+r.tom : "", temTexto ? "" : "só os dados, falta a letra"]
      .filter(Boolean).join(" · ");
    return '<div class="item-row">' +
      '<div class="info"><strong>'+esc(r.titulo || "(sem título)")+'</strong>' +
        '<span class="sub">'+esc(sub)+'</span></div>' +
      '<button class="btn btn-ghost btn-sm" data-rasc-abrir="'+esc(r.id)+'">Continuar</button>' +
      '<button class="btn btn-ghost btn-sm" data-rasc-excluir="'+esc(r.id)+'">Excluir</button>' +
    '</div>';
  }).join("");
}
function abrirRascunho(id){
  var r = state.rascunhos.filter(function(x){ return x.id === id; })[0];
  if(!r) return;
  edicao = null;
  rascunhoAtivo = id;
  preencherForm(r);
  renderAdicionar();
  el("add-texto").focus();
  window.scrollTo({top:0, behavior:"smooth"});
  toast("Rascunho carregado.");
}
el("rascunhos-list").addEventListener("click", function(e){
  var abrir = e.target.closest("[data-rasc-abrir]");
  if(abrir){ abrirRascunho(abrir.getAttribute("data-rasc-abrir")); return; }
  var excluir = e.target.closest("[data-rasc-excluir]");
  if(excluir){
    var id = excluir.getAttribute("data-rasc-excluir");
    armarOuAgir(excluir, "Confirmar?", function(){
      if(rascunhoAtivo === id) rascunhoAtivo = null;
      db.collection("rascunhos").doc(id).delete()
        .catch(aoFalharEscrita("Não foi possível excluir o rascunho."));
    });
  }
});

/* ----- cantos adicionados pelo grupo (os do livro não são editáveis) ----- */
function ehDoLivro(s){ return !s || s.origem === "livro"; }
function renderAdicionados(){
  var lista = state.songs.filter(function(s){ return !ehDoLivro(s); })
    .sort(function(a,b){ return b.numero - a.numero; });
  el("adicionados-conta").textContent = lista.length ? " (" + lista.length + ")" : "";
  var alvo = el("adicionados-list");
  if(!lista.length){
    alvo.innerHTML = '<p class="hint">Nada ainda. O que vocês cadastrarem aqui aparece nesta lista e pode ser corrigido depois — os 430 cantos do livro ficam protegidos.</p>';
    return;
  }
  alvo.innerHTML = lista.map(function(s){
    return '<div class="item-row">' +
      '<span class="badge-num">'+esc(s.numeroStr)+'</span>' +
      '<div class="info"><strong>'+esc(s.titulo)+'</strong>' +
        '<span class="sub">'+esc([s.categoria, s.tom ? "tom "+s.tom : "", s.ritmo].filter(Boolean).join(" · "))+'</span></div>' +
      botaoOlho(s.numero, "Visualizar este canto") +
      '<button class="btn btn-ghost btn-sm" data-editar="'+s.numero+'">Editar</button>' +
      '<button class="btn btn-ghost btn-sm" data-excluir-canto="'+s.numero+'">Excluir</button>' +
    '</div>';
  }).join("");
}
function editarCanto(numero){
  var s = getSong(Number(numero));
  if(!s) return;
  if(ehDoLivro(s)){ toast("Os cantos do livro não são editáveis por aqui."); return; }
  edicao = {id: s.id, numero: s.numero, numeroStr: s.numeroStr, criadoEm: s.criadoEm};
  rascunhoAtivo = null;
  preencherForm({titulo:s.titulo, categoria:s.categoria, tom:rootLetter(s.tom)||s.tom,
                 ritmo:s.ritmo, fonteUrl:s.fonteUrl, texto:(s.corpo||[]).join("\n")});
  renderAdicionar();
  window.scrollTo({top:0, behavior:"smooth"});
}
el("adicionados-list").addEventListener("click", function(e){
  var ver = e.target.closest("[data-ver]");
  if(ver){ openSongDetail(Number(ver.getAttribute("data-ver")), {somenteLeitura:true}); return; }
  var ed = e.target.closest("[data-editar]");
  if(ed){ editarCanto(ed.getAttribute("data-editar")); return; }
  var ex = e.target.closest("[data-excluir-canto]");
  if(ex){ excluirCanto(ex.getAttribute("data-excluir-canto")); return; }
});

/* ---------------- FILA DO CLAUDE (só salmos) ----------------
   A tarefa agendada roda de manhã, atende os pedidos de salmo e grava o
   resultado em config/processamento — é esse carimbo que a caixa mostra. */
function quandoBR(iso){
  if(!iso) return "";
  var d = new Date(iso);
  if(isNaN(d)) return "";
  var dia = String(d.getDate()).padStart(2,"0") + "/" + String(d.getMonth()+1).padStart(2,"0");
  var hora = String(d.getHours()).padStart(2,"0") + ":" + String(d.getMinutes()).padStart(2,"0");
  return dia + " às " + hora;
}
function pedidosDeSalmo(){
  return state.pedidos.filter(function(p){ return p.tipo === "salmo"; });
}
function renderProcBox(){
  var alvo = el("proc-box");
  if(!alvo) return;
  var c = state.config.processamento || {};
  var pendentes = pedidosDeSalmo().filter(function(p){ return p.status === "pendente"; }).length;
  var comErro = pedidosDeSalmo().filter(function(p){ return p.status === "erro"; }).length;
  var linha1 = pendentes
    ? "<strong>" + pendentes + (pendentes === 1 ? " data aguardando" : " datas aguardando") +
      "</strong> — o Claude busca na próxima verificação, amanhã de manhã."
    : "<strong>Nada na fila.</strong> O Claude confere todo dia de manhã e, uma vez por mês, carrega os três meses seguintes.";
  if(comErro){
    linha1 += '<br><span class="quando">' + comErro +
      (comErro === 1 ? " data que a fonte recusou" : " datas que a fonte recusou") +
      " — o Claude tenta de novo sozinho nas próximas verificações.</span>";
  }
  var linha2 = c.ultimaVerificacao
    ? '<br><span class="quando">Última verificação: ' + esc(quandoBR(c.ultimaVerificacao)) +
      (c.ultimoResultado ? " — " + esc(c.ultimoResultado) : "") + "</span>"
    : '<br><span class="quando">Ainda não houve nenhuma verificação.</span>';
  alvo.innerHTML = linha1 + linha2;
}
function renderPedidos(){
  renderProcBox();
  var alvo = el("pedidos-list");
  var lista = pedidosDeSalmo().sort(function(a,b){
    return (b.criadoEm||"").localeCompare(a.criadoEm||"");
  });
  if(!lista.length){
    alvo.innerHTML = '<p class="hint">Nenhum pedido. O botão "Pedir a liturgia deste dia" aparece na aba Montar Missa quando a data escolhida ainda não tem salmo e aclamação carregados — normalmente já estão, porque a carga vai três meses à frente.</p>';
    return;
  }
  alvo.innerHTML = lista.map(function(p){
    var temSalmo = !!state.salmos[p.data], temAclamacao = !!state.aclamacoes[p.data];
    var statusLabel, acoes = "";
    if(p.status === "pendente"){
      statusLabel = "Na fila — o Claude atende na próxima verificação";
      acoes = '<button class="btn btn-ghost btn-sm" data-cancel="'+esc(p.id)+'">Cancelar</button>';
    } else if(p.status === "concluido"){
      statusLabel = p.observacao ? "Carregado em parte — " + p.observacao : "Carregado";
      acoes = (p.observacao ? '<button class="btn btn-ghost btn-sm" data-retentar="'+esc(p.data)+'">Tentar de novo</button>' : "") +
              '<button class="btn btn-ghost btn-sm" data-dispensar="'+esc(p.id)+'">Tirar da lista</button>';
    } else {
      statusLabel = "A fonte não devolveu os textos desta data" +
        (p.tentativas > 1 ? " (" + p.tentativas + " tentativas)" : "") +
        (temSalmo && !temAclamacao ? " — o salmo já está carregado; falta a aclamação." :
         (!temSalmo && temAclamacao ? " — a aclamação já está carregada; falta o salmo." : ""));
      acoes = '<button class="btn btn-ghost btn-sm" data-retentar="'+esc(p.data)+'">Tentar de novo</button>' +
              '<button class="btn btn-ghost btn-sm" data-dispensar="'+esc(p.id)+'">Tirar da lista</button>';
    }
    return '<div class="pedido-row">' +
      '<span class="status-dot status-'+esc(p.status||"pendente")+'"></span>' +
      '<div class="info"><strong>Liturgia de '+esc(dataBR(p.data))+'</strong>' +
        '<span class="link">salmo e aclamação ao evangelho</span>' +
        '<span class="small muted">'+esc(statusLabel)+'</span></div>' +
      acoes +
    '</div>';
  }).join("");
}
el("pedidos-list").addEventListener("click", function(e){
  var cancelar = e.target.closest("[data-cancel]");
  if(cancelar){ db.collection("pedidos").doc(cancelar.getAttribute("data-cancel")).delete(); return; }
  var dispensar = e.target.closest("[data-dispensar]");
  if(dispensar){ db.collection("pedidos").doc(dispensar.getAttribute("data-dispensar")).delete(); return; }
  var retentar = e.target.closest("[data-retentar]");
  if(retentar){ pedirSalmo(retentar.getAttribute("data-retentar")); return; }
});

/* ---------------- TABS ---------------- */
function irParaAba(tab){
  state.currentTab = tab;
  document.querySelectorAll(".tab-btn").forEach(function(x){
    x.classList.toggle("active", x.getAttribute("data-tab") === tab);
  });
  document.querySelectorAll(".panel").forEach(function(p){ p.classList.remove("active"); });
  document.getElementById("panel-"+tab).classList.add("active");
  if(tab==="missa") renderMissaPanel();
  if(tab==="imprimir") renderPrintPanel();
  if(tab==="adicionar") renderAdicionar();
}
document.getElementById("tabs").addEventListener("click", function(e){
  var b = e.target.closest(".tab-btn");
  if(!b) return;
  irParaAba(b.getAttribute("data-tab"));
});
document.getElementById("sd-editar").addEventListener("click", function(){
  var s = state.detailSong;
  if(!s) return;
  fecharDetalhe();
  irParaAba("adicionar");
  editarCanto(s.numero);
});

/* ---------------- BOOT ---------------- */
function pickInitialMissa(){
  if(state.currentMissaId && state.missasById[state.currentMissaId]) return;
  var saved = null;
  try{ saved = localStorage.getItem("cantos_missa_atual"); }catch(e){}
  if(saved && state.missasById[saved]){ state.currentMissaId = saved; return; }
  var sorted = sortedMissas();
  if(sorted.length){ state.currentMissaId = sorted[0].id; return; }
  state.currentMissaId = null;
}

function boot(){
  carregarFontes();
  aplicarFonte("detalhe");
  aplicarFonte("impressao");
  ligarControleFonte("detalhe");
  ligarControleFonte("impressao");
  function conectarBanco(dbNs){
    if(!dbNs){
      document.getElementById("lib-list").innerHTML = '<div class="empty">Não foi possível conectar ao banco de dados. Configure suas credenciais do Supabase em <code>config.js</code>.</div>';
      return;
    }
    db = dbNs;
    db.collection("songs").onSnapshot(function(snap){
      var songs = snap.docs.map(function(d){ var v=Object.assign({},d.data()); v.id=d.id; return indexarCanto(v); });
      state.songs = songs;
      state.songsById = {};
      songs.forEach(function(s){ state.songsById[s.numero] = s; });
      state.dbReady = true;
      if(state.currentTab==="biblioteca") renderBiblioteca();
      if(state.currentTab==="missa") renderMissaPanel();
      if(state.currentTab==="imprimir") renderPrintPanel();
      if(state.currentTab==="adicionar") renderAdicionar();
    }, function(err){
      document.getElementById("lib-list").innerHTML = '<div class="empty">Erro ao carregar cantos.</div>';
    });
    db.collection("missas").onSnapshot(function(snap){
      var missas = snap.docs.map(function(d){ var v=Object.assign({},d.data()); v.id=d.id; return v; });
      state.missas = missas;
      state.missasById = {};
      missas.forEach(function(m){ state.missasById[m.id]=m; });
      pickInitialMissa();
      if(state.currentTab==="missa") renderMissaPanel();
      if(state.currentTab==="imprimir") renderPrintPanel();
    });
    db.collection("config").onSnapshot(function(snap){
      state.config = {};
      snap.docs.forEach(function(d){ state.config[d.id] = Object.assign({}, d.data()); });
      if(state.currentTab==="adicionar") renderProcBox();
    });
    db.collection("salmos").onSnapshot(function(snap){
      state.salmos = {};
      snap.docs.forEach(function(d){ state.salmos[d.id] = Object.assign({}, d.data()); });
      if(state.currentTab==="missa") renderMissaPanel();
      if(state.currentTab==="imprimir") renderPrintPanel();
    });
    db.collection("aclamacoes").onSnapshot(function(snap){
      state.aclamacoes = {};
      snap.docs.forEach(function(d){ state.aclamacoes[d.id] = Object.assign({}, d.data()); });
      if(state.currentTab==="missa") renderMissaPanel();
      if(state.currentTab==="imprimir") renderPrintPanel();
    });
    db.collection("rascunhos").onSnapshot(function(snap){
      state.rascunhos = snap.docs.map(function(d){ var v=Object.assign({},d.data()); v.id=d.id; return v; });
      if(state.currentTab==="adicionar"){ renderRascunhos(); }
    });
    db.collection("pedidos").onSnapshot(function(snap){
      var pedidos = snap.docs.map(function(d){ var v=Object.assign({},d.data()); v.id=d.id; return v; });
      state.pedidos = pedidos;
      if(state.currentTab==="adicionar") renderPedidos();
      if(state.currentTab==="missa") renderMissaPanel();
    });
  }

  window.reiniciarBoot = function(customDb){
    conectarBanco(customDb);
  };

  var useDb;
  if(typeof window!=="undefined" && window.supabaseDb){
    useDb = Promise.resolve(window.supabaseDb);
  } else if(typeof window!=="undefined" && window.claude && typeof window.claude.use==="function"){
    useDb = window.claude.use("db");
  } else {
    useDb = Promise.resolve(null);
  }

  useDb.then(conectarBanco).catch(function(){
    document.getElementById("lib-list").innerHTML = '<div class="empty">Recurso de banco de dados indisponível nesta visualização.</div>';
  });
  renderBiblioteca();
}

if(document.readyState === "loading"){
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
})();
