# Cantos & Liturgia — contexto do projeto

App de página única para o grupo de cantos de uma paróquia: biblioteca de
cifras com transposição, montagem da missa por momento litúrgico, salmo e
aclamação do dia, e geração de PDF para impressão. Interface em português.

Nasceu como Artifact do Claude
(`https://claude.ai/artifact/Le9wSfWSnnWfnupzrXr2UD`) e **hoje roda sobre
Supabase**, podendo ser servido como pasta estática (GitHub Pages, Netlify,
IIS...). O caminho do Artifact continua no código como alternativa, mas o
Supabase é o principal.

## Estrutura

    index.html            marcação (5 abas: Biblioteca, Montar Missa, Repertório, Imprimir, Adicionar Música)
    styles.css            todo o visual, tema claro/escuro por variáveis CSS
    app.js                toda a lógica — ~2.900 linhas de JavaScript puro
    supabase-adapter.js   traduz a interface do Firestore que o app.js fala para o Supabase
    config.js             credenciais do Supabase (versionado, ver "Credenciais")
    config.example.js     modelo para quem for apontar para outro projeto
    schema.sql            cria as 8 tabelas, RLS e publicação Realtime
    seed.py               carga inicial: envia dados/*.json para o banco
    atualizar_liturgia.py busca salmo e aclamação da CNBB e grava no Supabase
    assets/               catedral.png (fundo em traço, usado como mask-image)
    dados/                export do banco: songs(432), salmos(99), aclamacoes(83), missas, config
    build.py              gera dist/livro-de-cantos.html, a versão de arquivo único
    dist/                 saída do build (não versionada)
    .github/workflows/    liturgia-diaria.yml — roda o atualizar_liturgia.py todo dia 1º

**Sem framework, sem bundler, sem `npm install`.** JavaScript ES5-ish,
`var`, funções nomeadas, tudo dentro de um IIFE. Bibliotecas externas:
supabase-js (CDN, na carga da página), jsPDF e pdf.js (CDN, sob demanda).
Manter esse estilo — não introduzir React, TypeScript ou etapa de build.

**A pasta solta é a fonte de verdade.** `dist/` é resultado de
`python build.py`, que reinline CSS, JS e imagens num HTML único — formato
necessário só para publicar de volta como Artifact. Para hospedagem comum,
publica-se a pasta como está. Nunca editar o `dist/`.

## Rodar e testar

    python -m http.server 8000     # e abrir http://localhost:8000

Com `config.js` preenchido, a biblioteca carrega de verdade e sincroniza em
tempo real. Sem credenciais válidas, o adapter abre um modal pedindo URL e
anon key (guardadas em `localStorage`), com um botão **Modo Demonstração
(Offline)** que carrega `dados/*.json` num banco em memória — útil para
mexer em interface sem tocar no banco do grupo.

Testes históricos rodavam o app real no Chromium com um `mock_claude.js`
servindo dados do banco; eles ficavam no scratchpad das sessões e **não
estão neste repositório**. Ao mexer em alinhamento de cifra ou em quebra de
linha, recriar uma verificação nesse espírito: conferir a **coluna de cada
acorde** em várias larguras, não inspecionar visualmente.

## O banco

Tudo persiste num banco de documentos. O `app.js` fala **a interface do
Firestore**, e só um subconjunto:

    db.collection(nome)[.doc(id)]
      .get() .set(obj) .update(obj) .delete()
    db.collection(nome).add(obj)
    db.collection(nome).onSnapshot(cb)

Quem implementa isso é o `supabase-adapter.js` (399 linhas), que traduz
para PostgREST + Realtime. Cada tabela é `id text primary key` + `data
jsonb` + `updated_at` — o documento inteiro vive no `data`. **Toda tabela
nova precisa desse mesmo formato**, ou o adapter não a enxerga.

A escolha de origem está em `boot()` (app.js, linha 2796), nesta ordem:

1. `window.supabaseDb` — posto lá pelo adapter (Supabase ou modo offline);
2. `window.claude.use("db")` — o caminho antigo, quando roda como Artifact;
3. nada: a biblioteca abre vazia com a mensagem de banco indisponível.

O adapter chama `window.reiniciarBoot(db)` quando conecta depois da carga
da página (caso do modal de credenciais e do modo offline).

## Credenciais

`config.js` **está versionado de propósito** (commit `8b6a574`) — é o que
faz o site funcionar publicado no GitHub Pages sem etapa de build. A chave
ali é a `anonKey` pública. O comentário no topo do arquivo diz que ele está
no `.gitignore`; **não está**, e o readme repete a mesma informação errada.

O `atualizar_liturgia.py` prefere as variáveis `SUPABASE_URL` /
`SUPABASE_KEY` (é assim que a Action injeta os secrets) e só cai para ler o
`config.js` quando elas faltam.

## Liturgia diária

`atualizar_liturgia.py` busca `liturgia.up.railway.app/v2/` e raspa o HTML
de `liturgia.cancaonova.com` para pegar o versículo oficial da aclamação
(a API não traz). Grava direto nas tabelas `salmos` e `aclamacoes` via
PostgREST com `Prefer: resolution=merge-duplicates`.

A Action (`liturgia-diaria.yml`) roda **no dia 1º de cada mês** e sincroniza
o mês corrente. No `workflow_dispatch` o parâmetro aceita `mes`, `2027-04`,
`2027-04-18`, `2027` (só domingos e solenidades) ou um número de dias.

Dentro do app, `buscarLiturgiaOnline()` (linha 687) busca a mesma liturgia
na hora, direto do navegador — possível agora que a página não roda mais
presa ao CSP do Artifact. A coleção `pedidos` e a fila que existiam para
contornar isso continuam no código, mas a Action é o caminho principal.

## Modelo de dados

- **`songs`** — doc_id = número com 3 dígitos (`"024"`). Campos: `numero`
  (int), `numeroStr`, `titulo`, `tom`, `ritmo`, `categoria`, `corpo`
  (array de linhas, cifra e letra intercaladas), `origem` (`"livro"` |
  `"adicionada"`), `fonteUrl`, `criadoEm`, `atualizadoEm`.
  Os 430 primeiros vieram do livro impresso do grupo. **Todos são
  editáveis**, mas canto com `origem === "livro"` (`ehDoLivro()`) pede
  confirmação antes de abrir o formulário, e `salvarCanto()` **preserva a
  `origem` na edição** — editar um canto do livro não pode transformá-lo em
  `"adicionada"`, senão ele muda de lista e perde de onde veio.
- **`missas`** — `nome`, `data`, `momentos`: objeto com uma chave por
  momento (`entrada`, `penitencial`, `gloria`, `salmo`, `aclamacao`,
  `ofertorio`, `santo`, `painosso`, `paz`, `cordeiro`, `comunhao`,
  `acaodegracas`, `final`), cada uma um array **de strings**, não objetos:
  `"024"` (tom original) ou `"024|A"` (transposta). Decodifica com
  `parseMissaEntry()`, recodifica com `encodeMissaEntry()`.
- **Edição de missa e repertório não grava sozinha.** O site é usado por
  várias pessoas ao mesmo tempo, então toda alteração nesses dois painéis vai
  para uma **cópia de trabalho local** (`state.missaEdit` /
  `state.repertorioEdit`) e só chega ao banco quando alguém clica em
  **Salvar** (`salvarMissaEdit()` / `salvarRepertorioEdit()`). Consequências
  para quem for mexer nesses painéis:
  - `renderMissaPanel()`/`renderRepertorioPanel()` desenham de
    `missaParaTela()`/`repertorioParaTela()` — a cópia local quando existe,
    senão o que veio do banco. É isso que impede o `onSnapshot` do Realtime
    de apagar da tela o que a pessoa ainda não salvou; **não voltar a desenhar
    direto de `state.missasById`**.
  - `baseAtualizadoEm` guarda o `atualizadoEm` de quando a edição começou.
    No Salvar, `mudouNoBanco()` compara com o valor atual e, se outra pessoa
    gravou nesse meio-tempo, pergunta antes de sobrescrever.
  - Sair com pendência (trocar de aba, trocar a missa no `<select>`, criar
    outra, fechar o navegador) passa por `guardarPendencia()` — que usa o
    overlay `pedirConfirmacao()` com **três saídas** (salvar / sair sem
    salvar / cancelar, via `rotuloSecundario`/`acaoSecundaria`). Fechar a aba
    do navegador é a única exceção à regra de "nunca diálogo nativo": só o
    `beforeunload` do próprio navegador consegue interceptar isso.
  - **Criar e excluir continuam gravando na hora** — são ações discretas.
  - A aba Imprimir mostra o que está **salvo**, não a cópia de trabalho.
- **`repertorios`** — para apresentações avulsas (fora de missa), separado
  de `missas`. `nome`, `criadoEm`, `atualizadoEm`, `blocos`: array de `{nome,
  cantos}`, onde `cantos` é um array **de strings** no mesmo formato de
  `momentos` (`"024"` / `"024|A"`, mesmo `parseMissaEntry`/`encodeMissaEntry`).
  Sem liturgia do dia — blocos são só nome livre + lista de cantos. A aba
  Imprimir mostra missas e repertórios juntos no mesmo `<select>` (valores
  prefixados `"missa:ID"` / `"repertorio:ID"`); `resolverAlvoImpressao()`
  (app.js) é o ponto único que decide qual dos dois vira `{titulo, data,
  secoes}` para `renderPrintPanel()`/`montarPdf()` — quem mexer em impressão
  mexe ali, não duplica a lógica para cada tipo.
  `sortedMissas()`/`sortedRepertorios()` (app.js, via `carimboOrdenacao()`)
  ordenam pelo mais recente entre `criadoEm` e `atualizadoEm`, não só pela
  criação — apesar do nome, editar um item antigo o joga para o topo dos
  três seletores (Montar Missa, Repertório e o agrupado da aba Imprimir).
- **`salmos`** e **`aclamacoes`** — doc_id = data ISO, **mesma forma**:
  `data`, `liturgia`, `cor`, `referencia`, `refrao`, `estrofes` (array),
  `fonte`. Na aclamação o `refrao` é o "Aleluia" e `estrofes` tem um item
  só. O mapa `LITURGICOS` (linha 522) liga cada momento à sua coleção, e as
  mesmas funções desenham os dois. Um terceiro texto do dia seria entrar
  nesse mapa e criar a coleção.
- **`rascunhos`** — cadastro começado e não salvo. Fica no banco de
  propósito: começar no computador e continuar no celular.
- **`pedidos`** — `tipo: "salmo"`, `data`, `status`, `tentativas`. Fila
  herdada da época do Artifact, hoje redundante com a Action.
- **`config/processamento`** — `ultimaVerificacao`, `ultimoResultado`; é o
  sinal de vida que a interface mostra.

## ⚠️ Armadilhas que já quebraram o app

**1. Clonar sempre o documento do snapshot.** No Artifact os documentos
vinham `Object.freeze`d e `var v = d.data(); v.id = d.id;` lançava
`TypeError`, matando o listener sem mensagem na tela. O adapter do Supabase
já devolve cópia, mas o padrão `Object.assign({}, d.data())` continua em
todos os listeners — manter.

**2. A posição do acorde é coluna de caractere, em fonte monoespaçada.**
Esse é o coração do projeto e o que mais custou a acertar. `.cifra` e
`.ps-body` usam `white-space:pre`; a quebra de linha é feita em JS por
`requebra()` (linha 217), que trata cifra+letra como par. Consequências:
- **Nunca "normalizar" a indentação da letra** — ela é posição real do
  acorde sobre a sílaba.
- Garantir **sempre ao menos um espaço entre acordes**. A condição correta
  é `if (out && col <= len(out))`, não `<`. Com `<`, dois acordes colam num
  token só (`"A B7"` → `"AB7"`) e a transposição passa a ler errado. Esse
  bug existiu em dois lugares e contaminou 104 cantos.
- Em `pontosDeQuebra()` (linha 162) os intervalos de acorde são
  **contíguos de propósito**: se o espaço do corte ficasse de fora, um
  acorde exatamente sobre ele sumiria (85 acordes se perderam assim).
- Mudar tamanho de fonte não desalinha — muda **quantas colunas cabem**, e
  por isso toda mudança de tamanho precisa chamar de novo a função de
  render, que recalcula a quebra.

**3. Medir largura de elemento escondido devolve 0.** `colunasDe()` (linha
312) usa `clientWidth`; com o overlay ou o card ainda em `hidden`, o
resultado é 0 e a cifra sai sem quebra nenhuma. Revelar o elemento **antes**
de medir.

**4. Toda escrita no banco precisa de `.catch`.** Use
`aoFalharEscrita(msgPadrao)` (linha 128), que traduz o código do erro.
`invalid_argument` era como o banco do Artifact recusava quem não tinha
permissão de escrita — nesse caso ela aciona `marcarSomenteLeitura()`, que
revela o `#aviso-leitura`. Sem `.catch` o botão falha mudo e o usuário não
entende nada; já aconteceu com o "Nova missa".

**5. `CATEGORIAS_LIVRO` (linha 19) define os grupos da visão "Por
momento".** Um canto com `categoria` fora dessa lista **some
silenciosamente** da biblioteca. Criar categoria no banco exige adicioná-la
ali.

**6. O `update()` do adapter é leitura-modificação-escrita, não atômico.**
Ele busca o `data` atual, faz `deepMerge` e grava o objeto inteiro de volta.
Foi assim que salvar um momento apagava os outros da missa (corrigido em
`165c8ad`). Duas pessoas editando a mesma missa ao mesmo tempo ainda podem
perder alteração — a última escrita vence. Preferir `update()` com o
caminho mais raso possível.

**7. O adapter tem credenciais embutidas como último recurso**
(`supabase-adapter.js`, linhas 15 e 18). Esvaziar o `config.js` **não**
desconecta o app: ele volta a apontar para o projeto original. Para apontar
para outro banco, trocar os dois lugares.

**8. Tabela nova só aparece em tempo real se entrar na publicação.** O
`schema.sql` faz `alter publication supabase_realtime add table ...` para
as oito (a mais recente é `repertorios`). Sem isso a tabela carrega no
`onSnapshot` inicial (via REST) e nunca mais atualiza sozinha — sintoma
fácil de confundir com bug de interface. **Atenção**: `schema.sql` é a
fonte de verdade do que a tabela deveria ser, mas rodar esse script de novo
no SQL Editor do Supabase é manual — se `repertorios` foi só adicionado ao
arquivo e ninguém rodou o script contra o projeto real, a tabela não existe
ainda no banco em produção e a aba Repertório vai falhar ao salvar
(`console.error("Erro na busca da coleção repertorios")`), mesmo com o
código correto.

**9. O seletor de canto (`#picker-list`, usado em "+ Adicionar canto" e nos
blocos de Repertório) já teve um corte fixo de 200 resultados** — não era
limite do banco (o `state.songs` já carrega os ~432 inteiros via
`onSnapshot`), era um `.slice(0, 200)` na renderização (`renderPickerList()`,
app.js). Hoje ele renderiza em fatias de `PICKER_PAGE` (80) e carrega mais
sozinho quando `#picker-list` é rolado perto do fim. **Não reintroduzir um
corte fixo aqui** — se a lista parecer incompleta, o bug provavelmente
voltou a ser um `.slice()` sem paginação, não falta de dado.

**10. O PDF não é entregue pelo `window.claude`.** `montarPdf()` sempre gerou
o arquivo certo, mas a entrega dependia só de `window.claude.use("downloads")`
— capability que **só existe dentro do iframe do Artifact**. No site publicado
isso caía num "Este visualizador não permite salvar arquivos" e o PDF nunca
chegava ao usuário. Hoje o caminho do Artifact continua sendo tentado
primeiro, e `baixarBlob()` (Blob URL + `<a download>`) entrega o arquivo em
navegador normal. Se o download voltar a falhar, o problema é a entrega, não a
geração — conferir `baixarBlob()` antes de mexer em `montarPdf()`.

**11. Publicar sem bumpar o `?v=` entrega meia atualização.** O GitHub Pages
serve tudo com `Cache-Control: max-age=600`, e `index.html`, `app.js` e
`styles.css` expiram cada um por conta. Sem versão na URL, dá para o navegador
pegar o **index novo com o app.js velho** — foi exatamente isso que fez o botão
"Salvar" aparecer e não responder (o HTML tinha o botão, o JS em cache não
tinha o handler), o lápis de editar sumir e o PDF não baixar, tudo ao mesmo
tempo, num site que estava correto no servidor. Por isso `index.html` referencia
`styles.css?v=AAAAMMDD` e os três scripts com o mesmo `?v=`. **Toda publicação
que mexa em `app.js`/`styles.css` tem que bumpar essa data**, senão o grupo
continua rodando a versão anterior. Sintoma clássico: "no seu funciona, no meu
não" — antes de caçar bug, conferir a versão que o navegador carregou.

## Segurança do banco

O `schema.sql` cria, em todas as tabelas, política `for all using (true)
with check (true)`. Com a `anonKey` pública no `config.js`, isso significa
que **qualquer visitante do site pode escrever e apagar tudo**, inclusive
os 432 cantos. É o inverso do que valia no Artifact, onde visitante lia e
não gravava (razão de existir o `#aviso-leitura`, que permanece no código).

Se o site for público de verdade, o mínimo é separar leitura anônima de
escrita autenticada — e manter `dados/` atualizado como cópia de segurança.

## Herança do ambiente do Artifact

Estas restrições valiam quando o app rodava dentro do iframe do Claude. A
maior parte caiu com a migração, mas o código ainda carrega as soluções — e
elas voltam a valer se alguém republicar via `build.py`.

- **`confirm()`, `alert()` e `prompt()` não funcionam** no iframe:
  `confirm()` devolve `false` sem mostrar nada e a ação protegida nunca
  acontece, calada. Por isso as confirmações são feitas em **dois cliques
  no próprio botão** (`armarOuAgir()`, linha 2562) ou pelo overlay
  `pedirConfirmacao()` (linha 799). `window.print()` também não funciona, e
  é por isso que o PDF é montado no app com jsPDF.
- **Só `cdnjs.cloudflare.com` era aceito para script externo.** jsPDF 2.5.1
  e pdf.js 3.11.174 vêm de lá. O supabase-js veio depois, de jsDelivr — o
  que por si só já impede o `dist/` de funcionar como Artifact sem ajuste.
- O worker do pdf.js é bloqueado (`new Worker(blob:)`); ele cai sozinho no
  modo sem worker e funciona.
- Ao republicar passando `capabilities`, **passar o conjunto completo** —
  omitir o campo carrega a declaração anterior, mas um objeto não-vazio
  substitui tudo. Eram `{db:{}, downloads:true}`.
- Contexto de por que se saiu de lá: o banco do artefato é
  organization-internal e a conta dona é pessoal, então não havia como dar
  edição a outra pessoa sem plano Team. Detalhes em
  `claude/hospedagem-e-permissoes.md` no projeto do Claude.

## Convenções

- Comentários, identificadores de domínio e textos de interface em
  **português**. Nomes como `momentos`, `refrao`, `estrofes`, `rascunhos`
  fazem parte do modelo — não traduzir.
- Nada de `localStorage` para dado compartilhado; ele guarda só
  conveniências do leitor (aba aberta, tamanho de fonte, missa atual) e as
  credenciais digitadas no modal, sempre em `try/catch`.
- Mensagens ao usuário via `toast()`; nunca diálogo nativo.
- Ao mexer no alinhamento de cifra, medir. A prova que vale é conferir
  posição de acorde em várias larguras, não olhar a tela.
