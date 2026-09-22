# Relatório de QA — Livro de Cantos / Liturgia da Missa

**Data:** 18/09/2026 (rodada 2)
**Site testado:** https://marcozambon1.github.io/liturgia-missa/
**Ferramenta:** navegador ao vivo (Chrome DevTools MCP)
**Contexto desta rodada:** testar as três novidades que entraram em produção no commit `67217c9`, depois da rodada 1 do mesmo dia: (1) remoção do corte fixo de 200 resultados no seletor de canto, agora com carregamento por rolagem; (2) filtro de categoria do seletor de canto virou um `<select>` de categoria específica, no lugar do checkbox "ver todas"; (3) nova aba **Repertório** (apresentações com blocos de cantos), com a tabela `repertorios` já criada no Supabase de produção.

---

## 1. Nota geral

**Nota: 8,5/10.** As três novidades funcionam de ponta a ponta: a lista de cantos no seletor não trava mais em 200, o filtro de categoria virou de fato um seletor específico, e a aba Repertório funciona por completo (criar, editar blocos, transpor, imprimir), com dados persistindo corretamente no banco. Nenhum bug grave apareceu. O ponto mais importante encontrado agora é que a rolagem horizontal na aba Imprimir em celular **mudou de comportamento, mas não sumiu**: antes empurrava a página inteira para o lado; agora fica contida dentro do quadro do canto, só que sem nenhuma barra ou dica visual de que dá para arrastar — para quem não souber, o texto simplesmente aparece cortado.

## 2. O que está funcionando bem

- **Corte de 200 resultados removido de verdade.** Testado na categoria "Diversos" (a maior, com 141 cantos) dentro do seletor "+ Adicionar canto": a lista abre com um primeiro lote e, ao rolar até o fim, carrega o resto sozinha, até os 141 aparecerem, sem duplicar e sem faltar nenhum. Testado também em "Todas as categorias" (436 cantos, contando os de teste): a rolagem continuou carregando em lotes até os 436 aparecerem — bem acima do limite antigo de 200.
- **Filtro de categoria do seletor agora é um `<select>` de verdade.** Ao clicar em "+ Adicionar canto" num momento (ex.: Entrada), o seletor já abre filtrado na categoria sugerida daquele momento (ex.: "Acolhida"), e dá para trocar livremente para qualquer categoria específica da lista (não só alternar "todas"/"sugerida" como no checkbox antigo). Testado trocando para "Diversos" e depois "Todas as categorias" e voltando — sempre correto.
- **Nova aba Repertório funciona de ponta a ponta.** Criei um repertório de teste, adicionei dois blocos com nomes próprios ("Abertura (QA)" e "Reflexao (QA)"), coloquei um canto diferente em cada bloco pelo seletor de canto do próprio bloco — que, como esperado (bloco não tem "momento" sugerido), sempre abre em "Todas as categorias". Reordenar blocos (▲/▼), excluir um bloco e remover um canto de um bloco funcionaram sem apagar nada além do pedido.
- **Transposição só dentro do bloco funciona corretamente.** Transpus um canto (nº 20) de E para G só dentro do bloco "Abertura (QA)"; voltando à Biblioteca, o canto original continuava com o tom E intacto.
- **Persistência confirmada após recarregar a página inteira**, tanto para a missa de teste (11 momentos preenchidos, cada um com um canto diferente) quanto para o repertório de teste (blocos, cantos e transposição batendo exatamente com o que foi montado).
- **A tabela `repertorios` está funcionando de verdade no Supabase de produção.** Todas as chamadas de rede para `repertorios` retornaram 200/201/204 durante a rodada inteira — nenhum "Erro na busca da coleção repertorios". A pendência de infraestrutura da rodada 1 está resolvida.
- **Aba Imprimir mostra o repertório de teste agrupado corretamente**, no mesmo menu suspenso das missas, sob um cabeçalho "Repertórios" separado de "Missas" (confirmado inspecionando o HTML: `<optgroup label="Missas">` e `<optgroup label="Repertórios">`).
- **Conteúdo impresso do repertório bate com o que foi montado**: os nomes dos blocos aparecem como título de seção (em vez de nome de momento litúrgico), e não aparece nem salmo nem aclamação — como esperado, já que repertório não é missa.
- **Sem vazamento de estado entre repertório e missa na aba Imprimir**: depois de selecionar o repertório de teste no menu suspenso, voltar a selecionar a missa de teste mostrou o conteúdo da missa certinho (nome, data, todos os 11 momentos com salmo e aclamação), sem sobra do repertório.
- **Busca continua funcionando bem** por título, número, trecho de letra com e sem acento (buscar "coração" e "coracao" trouxe exatamente os mesmos resultados), e "Nenhum canto encontrado." para termo inexistente.
- **Criar, editar e adicionar uma música de teste a uma missa por três caminhos diferentes** ("+ Adicionar canto" em Montar Missa, botão rápido "Adicionar" na Biblioteca com escolha de momento, e "Adicionar à missa atual" dentro do visualizador do canto) funcionaram sem apagar cantos já colocados, mesmo depois de recarregar a página inteira com os 11 momentos preenchidos.
- **Bloqueio de canto duplicado no mesmo momento reconfirmado**: tentar adicionar o mesmo canto duas vezes ao mesmo momento mostra "Esse canto já está nesse momento." e não duplica nem apaga nada.
- **Editar a missa de teste**: mudar a data (a liturgia do dia atualizou sozinha, de 18/09 para 25/12, trocando salmo e aclamação para os de Natal), transpor o tom só para aquela missa (sem alterar o tom original do canto — confirmado na Biblioteca), reordenar cantos e remover/adicionar um canto — tudo funcionou.
- **Segurança contra XSS reconfirmada**: título com `<script>alert(1)</script>` foi salvo e exibido como texto escapado (`&lt;script&gt;`), sem disparar alerta; letra com `<img src=x onerror=...>` teve a tag removida pela limpeza automática. Título vazio ou só espaços continua bloqueado com a mensagem "Dê um título ao canto."
- **Texto muito longo** (690 caracteres no título) foi salvo sem travar a interface.
- **Limpeza dos itens de teste**: música, missa e repertório de teste foram excluídos ao final, e o estado final bateu exatamente com o inicial — mesma contagem por categoria (Diversos voltou a 141, Meditação a 65), as mesmas 4 missas reais com os mesmos nomes e as mesmas datas exatas, e 0 repertórios (nenhum sobrou).
- **🔴 O bug de corrupção de data de missa real NÃO reapareceu nesta rodada.** As datas das 4 missas existentes no início e no fim da rodada são idênticas, incluindo a "Missa 17/09/2026" com data 2027-04-18 (esse valor específico já estava assim antes de qualquer teste desta rodada, e continua exatamente igual depois — não piorou nem foi corrigido).

## 3. Bugs encontrados

### 🔴 Grave

Nenhum bug grave novo, e o bug já catalogado de corrupção de data não reapareceu nesta rodada (ver seção 2). Mantenho a recomendação histórica de continuar checando a cada rodada, já que esse bug já sumiu e voltou antes sem edição direta.

### 🟠 Médio

**1. A rolagem horizontal na aba Imprimir em celular mudou de "página inteira" para "escondida sem aviso" — ainda corta texto, só que de um jeito mais discreto.**
A correção do commit anterior (rolagem horizontal na página toda) funcionou: a página em si não se move mais de lado. Mas o quadro que mostra cada canto (`.print-preview`) agora tem sua própria rolagem lateral (`overflow-x: auto`), e essa rolagem não tem barra visível nem qualquer indicação de que existe. Numa tela de celular (375px) com um canto de linha de cifra longa (ex. "DEUS ENVIOU"), o texto da letra e do acorde simplesmente é cortado na borda direita da tela — quem não souber que pode arrastar o dedo para o lado vai achar que o conteúdo acabou ali.
- Passos para reproduzir:
  1. Montar uma missa de teste com o canto "DEUS ENVIOU" (nº 10) em algum momento.
  2. Abrir a aba Imprimir com essa missa selecionada.
  3. Estreitar a janela para ~375px (ou abrir no celular).
  4. Reparar que as linhas de cifra/letra mais longas terminam cortadas na borda direita do cartão branco, sem barra de rolagem visível — mas arrastando o dedo/o mouse para a direita dentro do cartão, o resto do texto aparece.
- Medido tecnicamente: em 375px e fonte 75% (a menor disponível), o elemento `.ps-body` de vários cantos tinha até 436px de conteúdo dentro de um espaço de 266px — a diferença fica disponível só por rolagem lateral do cartão (`.print-preview`, `overflow-x:auto`), não por quebra de linha adaptada à tela.
- Em tablet (768px) o problema ainda existe, mas bem menor (até 53–59px de sobra); em desktop (1440px) não há sobra nenhuma.
- Isso é uma melhoria real em relação à rodada 1 (a página não quebra mais inteira), mas o problema de fundo — a cifra não encolhe o suficiente para caber na tela — continua, só que agora escondido dentro de uma caixa sem indicação visual de rolagem.

**2. Confirmação de exclusão de missa/repertório ainda expira rápido demais para o ritmo de clique humano — reconfirmado nesta rodada.**
Testado programaticamente: dois cliques separados por uma fração de segundo (o tempo de disparar duas chamadas de ferramenta, bem mais rápido que uma pessoa lendo a tela) já foram suficientes para o botão voltar sozinho de "Confirmar exclusão?" para "Excluir" sem excluir nada. Só funcionou quando os dois cliques foram disparados de forma totalmente sequencial e imediata, sem qualquer pausa perceptível. Esse comportamento existe tanto para excluir missa quanto para excluir repertório (mesmo botão/padrão).
- Passos para reproduzir:
  1. Ir em Montar Missa (ou Repertório), escolher qualquer item de teste.
  2. Clicar em "Excluir". O botão muda para "Confirmar exclusão?".
  3. Esperar um instante (menos de um segundo já é suficiente) antes de clicar de novo.
  4. Reparar que o botão já voltou para "Excluir" sozinho, sem aviso, e nada foi excluído.

### 🟡 Leve

- **Repertório aceita nome em branco (só espaços) sem nenhum aviso** — diferente da validação que já existe para título de música ("Dê um título ao canto."). Testado digitando só espaços no campo "Nome da apresentação" e saindo do campo: o nome ficou salvo como "   " sem qualquer mensagem. (Novo achado desta rodada.)
- **Campo "Letra com a cifra" continua obrigatório mas sem "*"** no rótulo, diferente de "Título" e "Momento/Categoria" — reconfirmado.
- **Confirmações de exclusão inconsistentes entre música (modal "Excluir canto?" com botão claro) e missa/repertório (botão que muda de texto e expira sozinho)** — reconfirmado; ver também o bug médio #2 acima.
- **Menu de abas ainda corta o último item ("Adicionar Música" aparece como "Adiciona...") em telas de ~375px, sem indicação de que dá para rolar** — reconfirmado nesta rodada (a barra de abas tem rolagem própria funcional, mas sem sinal visual disso).
- **O site ainda permite criar/renomear uma missa com nome idêntico a uma já existente, sem aviso** — testado diretamente nesta rodada: renomeei a missa de teste para "Missa testezasso" (nome de uma missa real já existente) e o site aceitou sem nenhum aviso, ficando duas missas com o mesmo nome (só distinguíveis pela data). Revertido imediatamente para não deixar duplicidade.
- **Favicon do site continua devolvendo 404** — reconfirmado (`/favicon.ico` → 404).
- **Pré-visualização (ícone de olho) de um canto dentro de "Montar Missa" ignora o tom transposto só daquela missa** — não foi possível reconfirmar com segurança nesta rodada: ao testar isso preciso mudar o tom de um canto dentro de uma missa, e por engano cheguei a fazer esse teste rapidinho numa missa REAL ("Missa 20/09/26") antes de perceber — revertido imediatamamente e confirmado por recarga de página que o tom original (G) voltou intacto, sem dano permanente. Recomendo que a próxima rodada refaça esse teste específico só dentro de uma missa de teste, do início ao fim.

## 4. Ideias de UX (não são bugs)

- **A rolagem lateral escondida do item 🟠 #1 merece pelo menos uma barra de rolagem visível ou uma sombra/gradiente na borda direita**, avisando "tem mais conteúdo pra esse lado" — mesmo que a solução completa (cifra encolher de verdade) demore mais para implementar.
- **O seletor de categoria do "+ Adicionar canto" é uma melhoria real de usabilidade** frente ao checkbox antigo — vale considerar lembrar a última categoria escolhida por sessão, já que hoje ele sempre volta para a sugestão do momento ao reabrir.
- **Blocos de repertório sem nome ficam com "Nome do bloco" como placeholder vazio** — como blocos não têm nome padrão obrigatório (diferente de música, que bloqueia título vazio), pode valer dar um nome padrão tipo "Bloco 1" sempre que criado (o app já faz isso ao clicar em "+ Adicionar bloco", então é só reforçar essa mesma regra na validação, coerente com o achado do item 🟡 acima sobre nome em branco).
- **Uma missa nova apareceu no banco entre a rodada 1 e esta rodada 2** ("Missa 20/09/26", data 2026-09-20) que não constava no relatório da rodada 1 — provavelmente criada por alguém testando o deploy do commit `67217c9` (ou pelo próprio dono do site) e não é um item de teste identificável por nome. Não mexi nela, só registro para o dono do site decidir se quer mantê-la ou apagá-la.

## 5. Prompts prontos para copiar e colar

**Para o bug médio #1 (rolagem horizontal escondida na aba Imprimir em celular):**
> Na aba Imprimir, o CSS de `.print-preview` usa `overflow-x: auto` para conter o transbordamento da cifra em telas estreitas, mas isso deixa o conteúdo cortado sem nenhuma indicação visual de que dá para rolar o cartão pro lado (sem barra de rolagem visível, sem seta, sem sombra na borda). Reproduzi isso com o canto "DEUS ENVIOU" nº 10: em 375px de largura e fonte 75%, a `.ps-body` chega a ter 436px de conteúdo dentro de um espaço de 266px. Adicione um indicador visual de rolagem lateral nesse contêiner (uma sombra/gradiente na borda direita quando há conteúdo escondido, por exemplo, ou uma barra de rolagem sempre visível em telas de toque) para que o usuário saiba que pode arrastar. Se possível, revisitar por que a função de requebra de cifra (CLAUDE.md, `requebra()`/`colunasDe()`) não está encolhendo essas linhas o suficiente para caber sem rolagem nenhuma nessa largura.

**Para o bug médio #2 (confirmação de exclusão de missa/repertório expira rápido demais):**
> As confirmações de exclusão de missa (`armarOuAgir`, app.js) e de repertório (mesmo padrão, função de excluir repertório) usam "dois cliques no mesmo botão" porque `confirm()` não funciona no ambiente antigo do Artifact. Só que o tempo entre o primeiro clique (que muda o texto para "Confirmar exclusão?") e o botão voltar sozinho para "Excluir" está curto demais — em teste automatizado, uma pausa de menos de um segundo entre os cliques já foi suficiente para perder a confirmação. Aumente esse tempo para pelo menos 4-5 segundos, ou troque pelo mesmo padrão de modal já usado para excluir música (mais claro e sem prazo apertado). Aplique a mesma correção nos dois lugares (missa e repertório).

**Para o item leve (repertório aceita nome em branco sem aviso):**
> No painel da aba Repertório, o campo "Nome da apresentação" aceita salvar um valor só com espaços em branco sem nenhuma validação ou aviso — diferente do campo Título de música, que bloqueia com a mensagem "Dê um título ao canto." Adicione a mesma validação (bloquear nome vazio/só espaços com uma mensagem clara) ao renomear um repertório e, se fizer sentido, também ao nome de um bloco dentro dele.

**Para o item leve (nome de missa duplicado sem aviso):**
> O site permite salvar uma missa com o nome idêntico ao de outra missa já existente, sem qualquer aviso — confirmado renomeando uma missa de teste para o nome de uma missa real já existente ("Missa testezasso"), que foi aceito sem alerta. Adicione uma verificação simples ao salvar o nome da missa: se já existir outra missa com esse nome exato, mostrar um toast de aviso (ex.: "Já existe uma missa com esse nome — usar mesmo assim?"), sem bloquear a ação (só avisar).

**Para o item leve (asterisco faltando em "Letra com a cifra") — reconfirmado da rodada 1:**
> No formulário de Adicionar Música (index.html), o campo "LETRA COM A CIFRA" é obrigatório (o site recusa salvar sem cifra reconhecida ou aviso) mas o rótulo não tem "*" como os campos Título e Momento/Categoria têm. Adicione o "*" ao rótulo para consistência visual.

**Para o item leve (favicon 404) — reconfirmado da rodada 1:**
> O site não tem favicon.ico, causando um 404 no console toda vez que a página carrega. Adicione um favicon.ico simples na raiz do repositório (ou um link rel="icon" apontando para um arquivo existente em assets/) para eliminar esse erro cosmético.

**Lembrete para a próxima rodada (não é um prompt de correção):**
> Reconfirmar com segurança, usando só uma missa de teste do início ao fim: se a pré-visualização (ícone de olho) de um canto dentro de "Montar Missa" ainda ignora o tom transposto só para aquela missa. Nesta rodada 2 o teste foi interrompido cedo por engano numa missa real (revertido e verificado sem dano) antes de chegar nessa checagem específica. E, como sempre: confira de novo a data exata de TODAS as 4 missas reais (nomes e valores registrados nesta rodada: "Missa 20/09/26"=2026-09-20, "Missa 17/09/2026"=2027-04-18, "Missa teste fifa valendo"=2027-01-17, "Missa testezasso"=2026-12-31) — o bug de corrupção de data já sumiu e voltou antes sem edição direta.
