# Relatório de QA — Livro de Cantos / Liturgia da Missa

**Data:** 18/09/2026 (rodada 1)
**Site testado:** https://marcozambon1.github.io/liturgia-missa/
**Ferramenta:** navegador ao vivo (Chrome DevTools MCP)

---

## 1. Nota geral

**Nota: 8/10.** O site está sólido no que faz mais vezes — buscar, montar e imprimir uma missa — e nenhum dos bugs mais graves de rodadas anteriores (perda de cantos ao adicionar, corrupção de data de missa real) apareceu nesta rodada. O problema mais sério encontrado agora é novo: a aba **Imprimir** quebra o layout no celular quando algum canto tem uma linha de cifra comprida, forçando rolagem lateral da página inteira.

## 2. O que está funcionando bem

- **Busca** funciona corretamente por título, por número, por trecho de letra com e sem acento, e mostra "Nenhum canto encontrado" para termos inexistentes.
- **Criar e editar uma música** (título, categoria, tom, ritmo, letra com cifra) funciona de ponta a ponta, com uma prévia fiel antes de salvar.
- **Adicionar cantos à missa por três caminhos diferentes** — botão "+ Adicionar canto" dentro de Montar Missa, botão rápido "Adicionar" na Biblioteca (com escolha de momento) e "Adicionar à missa atual" dentro do visualizador de um canto — todos funcionam e **não apagam** os cantos já colocados antes, nem no mesmo momento nem em momentos diferentes. Testado preenchendo os 11 momentos com cantos distintos e conferindo depois de recarregar a página inteira: tudo permaneceu.
- **Bloqueio de canto duplicado no mesmo momento** funciona bem, com mensagem clara ("Esse canto já está nesse momento.") e sem apagar nem duplicar nada.
- **Editar a missa**: mudar a data (e a liturgia do dia atualiza sozinha, com aviso "Liturgia da CNBB carregada com sucesso!"), transpor o tom só para aquela missa (sem alterar o tom original do canto na biblioteca — confirmado olhando a Biblioteca depois), reordenar cantos com as setas e remover um canto específico — tudo funcionou certinho.
- **Impressão**: o conteúdo bateu exatamente com o que foi montado (mesmo nome, mesma data, mesma ordem, mesmo tom transposto). Mostrar/ocultar cifra e aumentar/diminuir fonte funcionam, e o alinhamento do acorde sobre a sílaba se manteve correto em 130% de fonte.
- **Responsividade**: layout do Montar Missa e da Biblioteca se adapta bem em celular (375px), tablet (768px) e computador (1440px), sem cortes visuais.
- **Segurança contra XSS**: título com `<script>alert(1)</script>` e letra com `<img src=x onerror=...>` foram tratados como texto puro (o `<img>` acabou sendo removido pela limpeza automática de "formatar no padrão do livro", o que é um efeito colateral inofensivo). Nenhum alerta disparou.
- **Validação de título vazio/só espaços**: bloqueada com mensagem clara ("Dê um título ao canto.").
- **Texto muito longo**: título com mais de 500 caracteres foi salvo sem travar a interface, e a lista mostra com reticências.
- **Limpeza dos itens de teste**: depois de excluir a música e a missa de teste, o estado final bateu com o inicial contagem por contagem (Diversos voltou de 142 para 141) e as três missas que já existiam antes do teste continuam lá, com nomes e datas idênticas.

## 3. Bugs encontrados

### 🔴 Grave

Nenhum bug grave novo. O bug já conhecido de corrupção de data de missa real **não reapareceu nesta rodada** — mas, como o próprio histórico mostra, isso não é garantia: ele já sumiu e voltou entre sessões antes. Recomendo continuar checando a cada rodada.

### 🟠 Médio

**1. Aba Imprimir causa rolagem horizontal da página inteira em celular (~375px), mesmo com fonte no tamanho padrão (100%).**
Isso é novo/mais específico do que o item já catalogado de "cifra desalinha com fonte grande" — aqui acontece mesmo sem aumentar a fonte.
- Passos para reproduzir:
  1. Montar uma missa com um canto que tenha uma linha de cifra longa (ex.: "DEUS ENVIOU", que tem uma linha de acordes com quase 90 caracteres).
  2. Abrir a aba Imprimir com essa missa selecionada.
  3. Estreitar a janela do navegador para a largura de um celular (~375px) — ou abrir no celular mesmo.
  4. Reparar que aparece uma barra de rolagem horizontal na parte de baixo da tela inteira (não só na área da letra), e o conteúdo à direita fica cortado até rolar de lado.
- Medido tecnicamente: a `div.ps-body` daquele canto tinha `scrollWidth` de 681px dentro de um contêiner de 377px de largura — a função que deveria "requebrar" a cifra para caber na tela mais estreita não está encolhendo essa linha específica.
- Em tablet (768px) e computador, o mesmo conteúdo cabe direitinho, sem rolagem.

**2. Confirmação de exclusão de missa ("Confirmar exclusão?") expira rápido demais — mais rápido do que o tempo de uma pessoa real ler e clicar de novo.**
Já era um item conhecido ("soma sozinho se não clicar rápido"), mas nesta rodada consegui medir: dois cliques no botão "Excluir" feitos com uma pequena pausa entre eles (o tempo de eu consultar a tela) já foram suficientes para o botão voltar sozinho para "Excluir" sem excluir nada — só funcionou quando os dois cliques foram praticamente instantâneos, um logo depois do outro. Isso é rápido demais para expectativa humana normal (ler "Confirmar exclusão?" e decidir).
- Passos para reproduzir:
  1. Ir em Montar Missa, escolher qualquer missa (teste, não a real).
  2. Clicar em "Excluir". O botão muda para "Confirmar exclusão?".
  3. Esperar cerca de 1-2 segundos antes de clicar de novo (o tempo normal de alguém ler e decidir).
  4. Reparar que o botão já voltou para "Excluir" sozinho, sem aviso, e nada foi excluído.

### 🟡 Leve (todos já catalogados em rodadas anteriores — reconfirmados ou não reproduzidos nesta rodada)

- **Pré-visualização (ícone de olho) de um canto dentro de "Montar Missa" ignora o tom escolhido só para aquela missa.** Não retestado a fundo nesta rodada por prioridade de tempo — recomendo reconfirmar na próxima.
- **Campo "Letra com a cifra" é obrigatório mas não tem "*"** — confirmado, o rótulo continua sem o asterisco enquanto "Título" e "Momento/Categoria" têm.
- **Confirmações de exclusão inconsistentes entre música (modal) e missa (botão "Confirmar exclusão?")** — confirmado nesta rodada (ver bug médio #2 acima, que é uma extensão desse item).
- **Menu de abas corta o último item em telas de ~375px** — **não reproduzido nesta rodada**: nas telas testadas (Biblioteca, Montar Missa, Imprimir), as 4 abas couberam sem corte visível. Vale reconfirmar em resoluções ainda menores (320px) numa próxima rodada.
- **O site permite criar uma missa com nome idêntico a uma já existente, sem aviso** — não testado diretamente nesta rodada (por já haver duas missas de teste "fifa valendo" e "testezasso" pré-existentes, evitei criar mais confusão de nomes). Recomendo testar isoladamente na próxima rodada.
- **Ícone da aba do navegador (favicon) devolve 404.** Não é um bug crítico, mas é fácil de corrigir e aparece toda vez que o site carrega.

## 4. Ideias de UX (não são bugs)

- **Sobrou lixo de rodadas de teste anteriores no banco**: encontrei duas missas chamadas "Missa teste fifa valendo" e "Missa testezasso" que já existiam antes desta rodada começar — não foram criadas por mim nem foram excluídas (a regra é nunca excluir o que já existia). Sugiro ao dono do site excluir manualmente essas duas quando quiser, já que são sobras de teste identificáveis pelo nome.
- **Contador "Próximo número previsto" pode ficar levemente maior que o total real de cantos** quando um número é "consumido" e depois excluído (não é reaproveitado). Isso é esperado e não é um bug, só pode confundir quem espera que os números fechem exatamente com a contagem total.
- **Buscar por número com zero à esquerda (ex. "024") não encontra o canto "24"**, porque os números não são armazenados com zeros à esquerda apesar de aparecerem sem eles na tela. Como a tela já mostra "24" sem zero, isso é coerente — só vale documentar para quem for procurar pelo número exato do papel antigo do livro.
- **Mensagem de erro de acessibilidade no console** ("No label associated with a form field") aparece em 6 campos do formulário de Adicionar Música — não afeta o uso normal, mas dificulta o uso por leitor de tela.

## 5. Prompts prontos para copiar e colar

**Para o bug médio #1 (rolagem horizontal na aba Imprimir em celular):**
> No app.js, a função que quebra as linhas de cifra para caber na largura da tela (requebra/colunasDe, por volta da linha 162-312 do CLAUDE.md) não está sendo re-executada corretamente para o conteúdo da aba Imprimir em telas estreitas (~375px), causando rolagem horizontal da página inteira. Reproduzi isso com o canto "DEUS ENVIOU": a `div.ps-body` ficou com 681px de largura dentro de um contêiner de 377px. Corrija para que a função de requebra considere a largura real do contêiner de impressão nessa resolução, igual já funciona em tablet (768px) e desktop. Lembre-se da armadilha #3 do CLAUDE.md: medir largura de elemento escondido dá 0 — revele o elemento antes de medir.

**Para o bug médio #2 (confirmação de exclusão de missa expira rápido demais):**
> A confirmação de exclusão de missa (armarOuAgir, app.js linha ~2236) usa o padrão de "dois cliques no mesmo botão" porque confirm() não funciona no ambiente antigo do Artifact. Mas o tempo entre o primeiro clique (que muda o texto para "Confirmar exclusão?") e o botão voltar sozinho para "Excluir" está curto demais — medido em teste, um intervalo de 1 a 2 segundos entre os cliques já é suficiente para perder a confirmação, o que é mais rápido do que o tempo real de leitura de uma pessoa. Aumente esse tempo para pelo menos 4-5 segundos, ou troque para o mesmo padrão de modal usado na exclusão de música (mais claro e sem prazo apertado).

**Para o item leve (asterisco faltando em "Letra com a cifra"):**
> No formulário de Adicionar Música (index.html), o campo "LETRA COM A CIFRA" é obrigatório (o site recusa salvar sem cifra reconhecida ou aviso) mas o rótulo não tem "*" como os campos Título e Momento/Categoria têm. Adicione o "*" ao rótulo para consistência visual.

**Para o item leve (favicon 404):**
> O site não tem favicon.ico, causando um 404 no console toda vez que a página carrega. Adicione um favicon.ico simples na raiz do repositório (ou um link rel="icon" apontando para um arquivo existente em assets/) para eliminar esse erro cosmético.

**Para reconfirmar na próxima rodada (não é um prompt de correção, é um lembrete):**
> Antes de aplicar qualquer correção nova, reconfirme os itens desta lista que não foram testados a fundo nesta rodada: pré-visualização de tom na "Montar Missa", criação de missa com nome duplicado sem aviso, e o corte do menu de abas em telas ainda menores que 375px (ex. 320px). E, o mais importante: confira de novo a data exata de TODAS as missas reais (compare com o valor exato registrado nesta rodada: "Missa 17/09/2026" com data 2027-04-18) — esse bug já sumiu e voltou antes sem edição direta.
