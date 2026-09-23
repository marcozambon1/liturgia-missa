/* ============================================================================
   auth.js — a porta de entrada do site
   ============================================================================
   O site inteiro fica atrás do login. Esta tela, sozinha, NÃO é a segurança:
   quem recusa o acesso é o banco, pelas políticas de RLS da seção 5 do
   schema.sql, que exigem usuário autenticado com perfil ativo. Sem isso, era
   só abrir o DevTools e pular a tela — ou ignorar o site e falar direto com o
   PostgREST usando a anonKey, que é pública.

   Por isso o <body> nasce com a classe "bloqueado" escrita no próprio HTML:
   se este script não rodar (erro de JS, rede caindo no meio), o site continua
   escondido em vez de aparecer destrancado. Falha fechando.

   Como alguém ganha acesso: um administrador convida o e-mail na aba
   "Usuários"; a pessoa clica em "Primeiro acesso", informa o mesmo e-mail e
   escolhe a senha. Um gatilho no banco só deixa a conta nascer se houver
   convite aberto. Nenhuma chave secreta passa pelo navegador.
   ========================================================================= */
(function(window){
  "use strict";

  var client = null;      // o cliente supabase-js, entregue pelo adapter
  var dbGuardado = null;  // o wrapper estilo Firestore, segurado até o login
  var liberado = false;

  function elemento(id){ return document.getElementById(id); }

  /* ---------------- entregar o app ---------------- */

  /* Mesmo caminho que o adapter usava antes de existir login: se o app.js já
     rodou, chama reiniciarBoot; se ainda não, deixa em window.supabaseDb e o
     boot() pega de lá sozinho. */
  function liberarApp(){
    if(liberado || !dbGuardado) return;
    liberado = true;
    document.body.classList.remove("bloqueado");
    var overlay = elemento("login-overlay");
    if(overlay) overlay.hidden = true;
    window.supabaseDb = dbGuardado;
    if(typeof window.reiniciarBoot === "function") window.reiniciarBoot(dbGuardado);
  }

  function mostrarLogin(){
    document.body.classList.add("bloqueado");
    var overlay = elemento("login-overlay");
    if(overlay) overlay.hidden = false;
    var email = elemento("login-email");
    if(email) email.focus();
  }

  /* ---------------- sessão ---------------- */

  /* Carrega o perfil da pessoa. É ele — e não o fato de ter conta — que dá
     acesso: um administrador revoga alguém apagando o perfil, e aí as
     políticas de RLS passam a recusar tudo, mesmo com a conta viva. */
  function carregarPerfil(user){
    return client.from("perfis").select("id,email,admin").eq("id", user.id).maybeSingle()
      .then(function(res){
        if(res.error || !res.data) return null;
        return { id: res.data.id, email: res.data.email, admin: !!res.data.admin };
      })
      .catch(function(){ return null; });
  }

  function aoAutenticar(session){
    if(!session || !session.user){ mostrarLogin(); return; }
    /* O Realtime usa um socket próprio, que não herda o token da chamada REST:
       sem isto, as políticas recusam a inscrição e a tela para de atualizar
       sozinha — sintoma fácil de confundir com bug de interface. */
    try{ client.realtime.setAuth(session.access_token); }catch(err){}

    carregarPerfil(session.user).then(function(perfil){
      if(!perfil){
        // Conta existe, acesso não: ou foi revogado, ou o gatilho não criou o
        // perfil. Derruba a sessão para não deixar a pessoa num limbo.
        erro("login-erro", "Sua conta não tem mais acesso ao livro de cantos. Peça a um administrador do grupo para convidar você de novo.");
        client.auth.signOut();
        mostrarLogin();
        return;
      }
      window.authUsuario = perfil;
      var quem = elemento("sessao-email");
      if(quem) quem.textContent = perfil.email;
      var sair = elemento("sessao-sair");
      if(sair) sair.hidden = false;
      if(typeof window.aoEntrar === "function") window.aoEntrar(perfil);
      liberarApp();
    });
  }

  /* ---------------- mensagens ---------------- */

  function erro(id, texto){
    var el = elemento(id);
    if(!el) return;
    el.textContent = texto;
    el.hidden = !texto;
  }

  function ocupado(botao, sim, rotulo){
    if(!botao) return;
    botao.disabled = sim;
    botao.textContent = sim ? "Aguarde…" : rotulo;
  }

  /* O Supabase devolve a mesma mensagem crua para casos bem diferentes; vale
     mais traduzir para o que a pessoa pode fazer a respeito. */
  function traduzirEntrada(msg){
    var m = String(msg || "").toLowerCase();
    if(m.indexOf("invalid login") !== -1 || m.indexOf("invalid_credentials") !== -1){
      return "E-mail ou senha não conferem. Se é a sua primeira vez aqui, use “Primeiro acesso” para escolher a senha.";
    }
    if(m.indexOf("email not confirmed") !== -1){
      return "Esta conta ainda não foi confirmada por e-mail. Avise um administrador do grupo.";
    }
    return "Não foi possível entrar agora. Tente de novo em alguns instantes.";
  }

  function traduzirCadastro(msg){
    var m = String(msg || "").toLowerCase();
    // O gatilho do banco recusa quem não foi convidado; o supabase-js embrulha
    // isso num "Database error saving new user".
    if(m.indexOf("database error") !== -1 || m.indexOf("convite") !== -1 || m.indexOf("42501") !== -1){
      return "Este e-mail não foi convidado. Peça a um administrador do grupo para convidar você — é ele quem libera o acesso.";
    }
    if(m.indexOf("already registered") !== -1 || m.indexOf("already been registered") !== -1){
      return "Este e-mail já tem senha cadastrada. Use “Entrar”; se esqueceu a senha, peça a um administrador.";
    }
    if(m.indexOf("password") !== -1){
      return "Senha muito curta. Use ao menos 6 caracteres.";
    }
    return "Não foi possível concluir o primeiro acesso agora. Tente de novo em alguns instantes.";
  }

  /* ---------------- formulários ---------------- */

  function ligarFormularios(){
    var formEntrar = elemento("login-form");
    var formPrimeiro = elemento("primeiro-form");

    function trocarPara(qual){
      erro("login-erro", "");
      erro("primeiro-erro", "");
      formEntrar.hidden = qual !== "entrar";
      formPrimeiro.hidden = qual !== "primeiro";
      elemento("login-ir-primeiro").hidden = qual === "primeiro";
      elemento("login-ir-entrar").hidden = qual === "entrar";
      var foco = elemento(qual === "entrar" ? "login-email" : "primeiro-email");
      if(foco) foco.focus();
    }

    elemento("login-ir-primeiro").addEventListener("click", function(e){
      e.preventDefault(); trocarPara("primeiro");
    });
    elemento("login-ir-entrar").addEventListener("click", function(e){
      e.preventDefault(); trocarPara("entrar");
    });

    formEntrar.addEventListener("submit", function(e){
      e.preventDefault();
      erro("login-erro", "");
      var botao = elemento("login-entrar");
      var email = (elemento("login-email").value || "").trim().toLowerCase();
      var senha = elemento("login-senha").value || "";
      if(!email || !senha){ erro("login-erro", "Preencha o e-mail e a senha."); return; }
      ocupado(botao, true, "Entrar");
      client.auth.signInWithPassword({ email: email, password: senha })
        .then(function(res){
          ocupado(botao, false, "Entrar");
          if(res.error){ erro("login-erro", traduzirEntrada(res.error.message)); return; }
          elemento("login-senha").value = "";
          // o onAuthStateChange cuida do resto
        })
        .catch(function(){
          ocupado(botao, false, "Entrar");
          erro("login-erro", "Não foi possível falar com o servidor. Confira sua conexão.");
        });
    });

    formPrimeiro.addEventListener("submit", function(e){
      e.preventDefault();
      erro("primeiro-erro", "");
      var botao = elemento("primeiro-criar");
      var email = (elemento("primeiro-email").value || "").trim().toLowerCase();
      var senha = elemento("primeiro-senha").value || "";
      var repetir = elemento("primeiro-repetir").value || "";
      if(!email || !senha){ erro("primeiro-erro", "Preencha o e-mail e escolha uma senha."); return; }
      if(senha.length < 6){ erro("primeiro-erro", "A senha precisa ter ao menos 6 caracteres."); return; }
      if(senha !== repetir){ erro("primeiro-erro", "As duas senhas não são iguais."); return; }
      ocupado(botao, true, "Criar minha senha");
      client.auth.signUp({ email: email, password: senha })
        .then(function(res){
          ocupado(botao, false, "Criar minha senha");
          if(res.error){ erro("primeiro-erro", traduzirCadastro(res.error.message)); return; }
          elemento("primeiro-senha").value = "";
          elemento("primeiro-repetir").value = "";
          if(res.data && res.data.session) return;   // já entrou; onAuthStateChange assume
          // Sem sessão: o projeto está exigindo confirmação por e-mail.
          erro("primeiro-erro", "Senha criada. Confirme o e-mail que acabamos de enviar e depois use “Entrar”.");
        })
        .catch(function(){
          ocupado(botao, false, "Criar minha senha");
          erro("primeiro-erro", "Não foi possível falar com o servidor. Confira sua conexão.");
        });
    });

    var sair = elemento("sessao-sair");
    if(sair){
      sair.addEventListener("click", function(){
        // Sair com alteração pendente em missa/repertório perderia o trabalho:
        // a guarda de pendência do app.js decide, como em qualquer outra saída.
        if(typeof window.guardarPendencia === "function"){
          window.guardarPendencia(function(){ window.authSair(); });
        } else {
          window.authSair();
        }
      });
    }
  }

  /* ---------------- entrada do adapter ---------------- */

  window.authSair = function(){
    if(!client) return;
    client.auth.signOut().then(function(){ window.location.reload(); })
                         .catch(function(){ window.location.reload(); });
  };

  /* Chamada pelo supabase-adapter.js assim que o cliente existe. O wrapper do
     banco fica guardado aqui e só chega ao app.js depois do login — assim o
     app não dispara oito onSnapshot que o RLS vai recusar. */
  window.authGate = function(clienteSupabase, dbWrapper){
    client = clienteSupabase;
    dbGuardado = dbWrapper;
    window.supabaseClient = clienteSupabase;

    function comecar(){
      ligarFormularios();
      client.auth.onAuthStateChange(function(evento, session){
        if(evento === "SIGNED_OUT"){ window.authUsuario = null; mostrarLogin(); return; }
        if(session) aoAutenticar(session);
      });
      client.auth.getSession().then(function(res){
        var session = res && res.data ? res.data.session : null;
        if(session) aoAutenticar(session); else mostrarLogin();
      }).catch(function(){ mostrarLogin(); });
    }

    if(document.readyState === "loading"){
      document.addEventListener("DOMContentLoaded", comecar);
    } else {
      comecar();
    }
  };

})(window);
