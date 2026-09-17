/**
 * Adaptador do Supabase para o Livro de Cantos
 * 
 * Implementa a mesma interface de documento/coleção do Firestore que o app.js consome,
 * traduzindo para chamadas de API e Realtime do Supabase (@supabase/supabase-js).
 */

(function(window) {
  'use strict';

  function obterCredenciais() {
    var config = window.SUPABASE_CONFIG || {};
    var url = (config.url && config.url.trim()) || 
              (window.localStorage ? localStorage.getItem("cantos_supabase_url") : null) || 
              "https://eifxnnwerwsfjkmzmzdw.supabase.co";
    var key = (config.anonKey && config.anonKey.trim()) || 
              (window.localStorage ? localStorage.getItem("cantos_supabase_key") : null) || 
              "sb_publishable_yOeP4Wh6BCirwy2Ty3S8qw__az5l43s";

    if (url && (url.indexOf("SEU-PROJETO") !== -1 || url.indexOf("xyzcompany") !== -1)) url = "";
    if (key && key.indexOf("SUA-CHAVE") !== -1) key = "";

    return { url: url, key: key };
  }

  function initSupabaseAdapter() {
    var creds = obterCredenciais();
    var url = creds.url;
    var key = creds.key;

    if (!url || !key) {
      window.supabaseDb = null;
      renderConfigBanner();
      return;
    }

    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      console.error("SDK do Supabase não carregado.");
      window.supabaseDb = null;
      return;
    }

    try {
      var client = window.supabase.createClient(url, key);
      window.supabaseClient = client;
      var dbWrapper = createDbWrapper(client);
      window.supabaseDb = dbWrapper;
      if (typeof window.reiniciarBoot === "function") {
        window.reiniciarBoot(dbWrapper);
      }
      var modal = document.getElementById("supabase-config-modal");
      if (modal) modal.remove();
    } catch(err) {
      console.error("Erro ao inicializar Supabase:", err);
      window.supabaseDb = null;
      renderConfigBanner("Erro ao conectar ao Supabase: " + err.message);
    }
  }

  function deepMerge(target, source) {
    var out = Object.assign({}, target);
    if (!source || typeof source !== "object") return out;
    Object.keys(source).forEach(function(key) {
      if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
        out[key] = deepMerge(target && target[key] ? target[key] : {}, source[key]);
      } else {
        out[key] = source[key];
      }
    });
    return out;
  }

  function createDbWrapper(client) {
    var colCaches = {};
    var colListeners = {};

    function notify(colName) {
      var cache = colCaches[colName] || {};
      var docs = Object.keys(cache).map(function(k) {
        return {
          id: k,
          data: function() { return Object.assign({}, cache[k]); }
        };
      });
      var listeners = colListeners[colName] || [];
      listeners.forEach(function(cb) {
        try { cb({ docs: docs }); } catch(e) { console.error("Erro no listener da colecao " + colName + ":", e); }
      });
    }

    return {
      collection: function(colName) {
        if (!colCaches[colName]) colCaches[colName] = {};
        if (!colListeners[colName]) colListeners[colName] = [];

        return {
          doc: function(id) {
            var docId = String(id);
            return {
              set: function(data) {
                // Atualização otimista imediata no cache local
                colCaches[colName][docId] = Object.assign({}, data);
                notify(colName);

                return client
                  .from(colName)
                  .upsert({ id: docId, data: data, updated_at: new Date().toISOString() })
                  .then(function(res) {
                    if (res.error) throw res.error;
                    return res;
                  });
              },
              update: function(patch) {
                // Atualização otimista imediata com deepMerge
                var currentLocal = colCaches[colName][docId] || {};
                var merged = deepMerge(currentLocal, patch);
                colCaches[colName][docId] = merged;
                notify(colName);

                // Envia para o Supabase
                return client
                  .from(colName)
                  .select('data')
                  .eq('id', docId)
                  .single()
                  .then(function(res) {
                    var currentServer = (res.data && res.data.data) ? res.data.data : currentLocal;
                    var finalMerged = deepMerge(currentServer, merged);
                    colCaches[colName][docId] = finalMerged;
                    return client
                      .from(colName)
                      .update({ data: finalMerged, updated_at: new Date().toISOString() })
                      .eq('id', docId);
                  })
                  .then(function(res) {
                    if (res.error) throw res.error;
                    return res;
                  });
              },
              delete: function() {
                delete colCaches[colName][docId];
                notify(colName);

                return client
                  .from(colName)
                  .delete()
                  .eq('id', docId)
                  .then(function(res) {
                    if (res.error) throw res.error;
                    return res;
                  });
              }
            };
          },
          add: function(data) {
            var generatedId = (data && data.id) 
              ? String(data.id) 
              : ('doc_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6));
            
            colCaches[colName][generatedId] = Object.assign({}, data);
            notify(colName);

            return client
              .from(colName)
              .insert({ id: generatedId, data: data, updated_at: new Date().toISOString() })
              .then(function(res) {
                if (res.error) throw res.error;
                return { id: generatedId };
              });
          },
          onSnapshot: function(callback, errorCallback) {
            colListeners[colName].push(callback);

            // Emite imediatamente se já houver dados no cache
            if (Object.keys(colCaches[colName]).length > 0) {
              notify(colName);
            }

            // 1. Carga inicial via REST
            client
              .from(colName)
              .select('*')
              .then(function(res) {
                if (res.error) {
                  console.error("Erro na busca da coleção " + colName + ":", res.error);
                  if (errorCallback) errorCallback(res.error);
                  return;
                }
                (res.data || []).forEach(function(row) {
                  // Preserva dados locais mais recentes se houver
                  colCaches[colName][row.id] = deepMerge(row.data, colCaches[colName][row.id] || {});
                });
                notify(colName);
              })
              .catch(function(err) {
                console.error("Falha ao buscar " + colName + ":", err);
                if (errorCallback) errorCallback(err);
              });

            // 2. Inscrição em Tempo Real (Realtime)
            var channel = client
              .channel('rt_' + colName + '_' + Math.random().toString(36).substr(2, 6))
              .on('postgres_changes', { event: '*', schema: 'public', table: colName }, function(payload) {
                if (payload.eventType === 'DELETE') {
                  if (payload.old && payload.old.id) {
                    delete colCaches[colName][payload.old.id];
                    notify(colName);
                  }
                } else if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                  if (payload.new && payload.new.id) {
                    colCaches[colName][payload.new.id] = payload.new.data;
                    notify(colName);
                  }
                }
              })
              .subscribe();

            // Retorna função para cancelar inscrição
            return function() {
              var idx = colListeners[colName].indexOf(callback);
              if (idx !== -1) colListeners[colName].splice(idx, 1);
              client.removeChannel(channel);
            };
          }
        };
      }
    };
  }

  function renderConfigBanner(msgErro) {
    if (document.getElementById("supabase-config-modal")) return;

    var container = document.createElement("div");
    container.id = "supabase-config-modal";
    container.style.position = "fixed";
    container.style.inset = "0";
    container.style.backgroundColor = "rgba(0,0,0,0.65)";
    container.style.zIndex = "99999";
    container.style.display = "flex";
    container.style.alignItems = "center";
    container.style.justifyContent = "center";
    container.style.padding = "20px";
    container.style.boxSizing = "border-box";

    var card = document.createElement("div");
    card.style.backgroundColor = "var(--bg, #fff)";
    card.style.color = "var(--fg, #222)";
    card.style.maxWidth = "520px";
    card.style.width = "100%";
    card.style.padding = "28px";
    card.style.borderRadius = "12px";
    card.style.boxShadow = "0 10px 30px rgba(0,0,0,0.3)";
    card.style.fontFamily = "inherit";

    var html = '<h2 style="margin-top:0;font-size:1.4rem;color:var(--accent,#8b1e2f);">Configurar Banco de Dados (Supabase)</h2>';
    if (msgErro) {
      html += '<div style="background:#fee;color:#b00;padding:10px;border-radius:6px;margin-bottom:14px;font-size:0.9rem;">' + msgErro + '</div>';
    }
    html += '<p style="font-size:0.92rem;line-height:1.5;margin-bottom:16px;">' +
      'Para utilizar o livro com sincronização em nuvem e em tempo real, insira os dados do seu projeto Supabase abaixo (ou preencha no arquivo <code>config.js</code>):</p>' +
      '<div style="margin-bottom:12px;">' +
        '<label style="display:block;font-size:0.85rem;font-weight:600;margin-bottom:4px;">Project URL:</label>' +
        '<input id="sb-input-url" type="text" placeholder="https://xyzcompany.supabase.co" style="width:100%;padding:9px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box;">' +
      '</div>' +
      '<div style="margin-bottom:16px;">' +
        '<label style="display:block;font-size:0.85rem;font-weight:600;margin-bottom:4px;">Anon Public Key:</label>' +
        '<input id="sb-input-key" type="password" placeholder="eyJhbGciOiJIUzI1NiIsIn..." style="width:100%;padding:9px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box;">' +
      '</div>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end;margin-top:20px;">' +
        '<button id="sb-btn-offline" style="padding:10px 16px;background:none;border:1px solid #999;border-radius:6px;cursor:pointer;">Modo Demonstração (Offline)</button>' +
        '<button id="sb-btn-save" style="padding:10px 18px;background:var(--accent,#8b1e2f);color:#fff;border:none;border-radius:6px;font-weight:600;cursor:pointer;">Salvar e Conectar</button>' +
      '</div>' +
      '<p style="font-size:0.75rem;color:#777;margin-top:14px;margin-bottom:0;">Lembre-se de rodar o script <code>schema.sql</code> no SQL Editor do Supabase antes de conectar.</p>';

    card.innerHTML = html;
    container.appendChild(card);
    document.body.appendChild(container);

    document.getElementById("sb-btn-save").addEventListener("click", function() {
      var u = document.getElementById("sb-input-url").value.trim();
      var k = document.getElementById("sb-input-key").value.trim();
      if (!u || !k) {
        alert("Por favor, preencha a URL e a Anon Key.");
        return;
      }
      try {
        if (window.localStorage) {
          localStorage.setItem("cantos_supabase_url", u);
          localStorage.setItem("cantos_supabase_key", k);
        }
      } catch(e) {}
      container.remove();
      initSupabaseAdapter();
    });

    document.getElementById("sb-btn-offline").addEventListener("click", function() {
      container.remove();
      ativarModoOffline();
    });
  }

  // Fallback offline caso o usuário queira testar antes de criar o projeto no Supabase
  function ativarModoOffline() {
    var memoria = {
      songs: {},
      missas: {},
      rascunhos: {},
      salmos: {},
      aclamacoes: {},
      pedidos: {},
      config: {}
    };

    var callbacks = {};

    function triggerSnap(col) {
      if (callbacks[col]) {
        var docs = Object.keys(memoria[col] || {}).map(function(k) {
          return {
            id: k,
            data: function() { return Object.assign({}, memoria[col][k]); }
          };
        });
        callbacks[col]({ docs: docs });
      }
    }

    var offlineDb = {
      collection: function(colName) {
        if (!memoria[colName]) memoria[colName] = {};
        return {
          doc: function(id) {
            var docId = String(id);
            return {
              set: function(data) {
                memoria[colName][docId] = Object.assign({}, data);
                triggerSnap(colName);
                return Promise.resolve();
              },
              update: function(patch) {
                memoria[colName][docId] = deepMerge(memoria[colName][docId] || {}, patch);
                triggerSnap(colName);
                return Promise.resolve();
              },
              delete: function() {
                delete memoria[colName][docId];
                triggerSnap(colName);
                return Promise.resolve();
              }
            };
          },
          add: function(data) {
            var generatedId = (data && data.id) ? String(data.id) : ('doc_' + Date.now().toString(36));
            memoria[colName][generatedId] = Object.assign({}, data);
            triggerSnap(colName);
            return Promise.resolve({ id: generatedId });
          },
          onSnapshot: function(cb) {
            callbacks[colName] = cb;
            triggerSnap(colName);
            return function() { delete callbacks[colName]; };
          }
        };
      }
    };

    // Carregar dados de dados/*.json via fetch
    var colecoes = ["songs", "missas", "salmos", "aclamacoes", "config"];
    var carregamentos = colecoes.map(function(nome) {
      return fetch("dados/" + nome + ".json")
        .then(function(r) { return r.json(); })
        .then(function(lista) {
          if (Array.isArray(lista)) {
            lista.forEach(function(item) {
              if (item.id) memoria[nome][item.id] = item;
            });
          }
        })
        .catch(function(e) {
          console.warn("Não foi possível carregar dados/" + nome + ".json:", e);
        });
    });

    Promise.all(carregamentos).then(function() {
      window.supabaseDb = offlineDb;
      if (typeof window.reiniciarBoot === "function") {
        window.reiniciarBoot(offlineDb);
      }
    });
  }

  // Executa na inicialização
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSupabaseAdapter);
  } else {
    initSupabaseAdapter();
  }

})(window);
