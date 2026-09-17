# Cantos & Liturgia — Livro de Cantos

Aplicativo de página única para o repertório de cantos da missa: biblioteca
com cifras e transposição de tom, montagem da missa por momento litúrgico,
salmo responsorial e aclamação ao Evangelho do dia, e geração de PDF para
impressão.

Hoje roda como Artifact no Claude. Este repositório é o código-fonte,
organizado para poder ser hospedado em servidor comum.

## Estrutura

    index.html      marcação da página (as 4 abas e os diálogos)
    styles.css      todo o visual, incluindo tema claro/escuro
    app.js          toda a lógica (~2.300 linhas, JavaScript puro, sem framework)
    assets/         imagens (o traço da catedral usado como fundo)
    dados/          export do conteúdo atual do banco (ver abaixo)
    build.py        gera dist/livro-de-cantos.html, a versão de arquivo único
    dist/           saída do build.py (fora do versionamento)

Sem dependências de build, sem `npm install`. A única biblioteca externa é a
jsPDF, carregada sob demanda por CDN só quando se gera um PDF.

## Rodar localmente

    cd cantos-liturgia
    python -m http.server 8000

E abrir <http://localhost:8000>. Abrir o `index.html` direto pelo disco
(`file://`) também mostra a página, mas alguns navegadores bloqueiam parte
dos recursos — o servidor local evita esse tipo de surpresa.

A página vai carregar e mostrar o aviso de banco indisponível. Isso é
esperado: veja a seção seguinte.

## Banco de Dados com Supabase

O aplicativo conta com suporte integrado ao **Supabase** (PostgreSQL com sincronização em tempo real via Realtime), funcionando perfeitamente no plano gratuito (**Free Tier**):

### Como configurar o Supabase:

1. **Crie um projeto gratuito** em [supabase.com](https://supabase.com).
2. **Execute o Schema SQL**:
   - No painel do Supabase, abra o menu **SQL Editor**.
   - Abra o arquivo `schema.sql` deste repositório, copie o conteúdo, cole no editor e clique em **Run**.
   - Isso criará as tabelas necessárias (`songs`, `missas`, `rascunhos`, `salmos`, `aclamacoes`, `pedidos`, `config`), habilitará as políticas de segurança (RLS) e a publicação Realtime.
3. **Faça a carga inicial dos dados (Seed)**:
   - Execute o script Python para enviar os 432 cantos e salmos da pasta `dados/` diretamente para o seu banco:
     ```bash
     python seed.py
     ```
   - O script solicitará a **Project URL** e a **Anon Key** (ou você pode passá-las como argumentos: `python seed.py <URL> <KEY>`).
4. **Configure o Frontend**:
   - Preencha suas credenciais em `config.js` (ou insira na tela de boas-vindas do próprio navegador ao abrir o app):
     ```javascript
     window.SUPABASE_CONFIG = {
       url: "https://seu-projeto.supabase.co",
       anonKey: "sua-chave-anon-publica"
     };
     ```

Pronto! O aplicativo funcionará com sincronização instantânea em tempo real entre todos os membros do grupo.

### Modo Demonstração (Offline)
Caso queira testar a interface imediatamente sem configurar o Supabase, ao abrir o aplicativo basta clicar em **"Modo Demonstração (Offline)"** no aviso inicial. Ele carregará todos os cantos e salmos da pasta `dados/` diretamente na memória do navegador.

## dados/

Export do conteúdo do banco no momento em que este repositório foi gerado
(17/09/2026). Cada arquivo é um array de documentos, com o `id` de cada um:

    songs.json        432 cantos (título, categoria, tom, ritmo, cifra)
    missas.json       1 missa montada
    salmos.json       99 salmos responsoriais, de 16/09/2026 a 01/01/2027
    aclamacoes.json   81 aclamações ao Evangelho
    config.json       controle da rotina que busca salmo e aclamação

Serve para dois fins: é a cópia de segurança do repertório e é a carga
inicial de qualquer banco novo que venha a substituir o do Claude.

Os salmos e as aclamações vêm da API de liturgia diária
(`api-liturgia-diaria.vercel.app`, com `liturgia.up.railway.app` como
reserva), preenchidos por uma tarefa agendada. Os cantos foram cadastrados
pelo grupo, dentro do próprio app.

## Voltar para o Artifact

Alterou o código e quer atualizar a versão publicada no Claude:

    python build.py

O arquivo `dist/livro-de-cantos.html` sai autocontido — CSS, JavaScript e
imagens embutidos — que é o formato exigido lá. A pasta solta continua
sendo a fonte de verdade; `dist/` é só o resultado.

## Licença e conteúdo

O código é seu. As letras e cifras cadastradas pertencem a seus autores e
editoras — publicar o repertório abertamente na internet é uma decisão
diferente de hospedar a ferramenta, e vale verificar antes de tornar o site
público.
