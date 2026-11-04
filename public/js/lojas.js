/* Várias lojas por conta (decisão dos donos, 04/11/2026): até 10 lojas por conta de vendedor.
 *
 * O protótipo trabalha com UMA loja aberta (S.myStore) e os pedidos dela (S.sorders). Aqui a conta
 * guarda a lista das lojas e os pedidos de cada uma, e "Minha loja" ganha, no topo, o painel
 * "Suas lojas": um seletor para abrir outra loja e o botão "Criar outra loja" (que usa o próprio
 * editor de loja do protótipo, a tela "Criar nova loja").
 *
 * - Conta real: a lista vem do servidor (GET /api/loja/minhas); o servidor recusa a 11ª loja.
 * - Conta de demonstração de vendedor (pedido dos donos, só para ver como fica): tudo no navegador.
 *
 * No navegador (S, guardado pelo protótipo): S.kmLojas (ids, na ordem), S.kmLojasObj (cópia de
 * cada loja, para a demonstração) e S.kmPedidosPor (pedidos de cada loja que não está aberta).
 */
(function () {
  'use strict';

  var LIMITE = 10;
  var TXT = {
    nl: { t: 'Je winkels', n: '{n} van {m}', criar: 'Nog een winkel maken', limite: 'Je hebt het maximum van {m} winkels bereikt.', aberta: 'Winkel geopend: {n}', sel: 'Kies een winkel', banida: 'geblokkeerd' },
    en: { t: 'Your stores', n: '{n} of {m}', criar: 'Create another store', limite: 'You’ve reached the limit of {m} stores.', aberta: 'Store opened: {n}', sel: 'Choose a store', banida: 'banned' },
    es: { t: 'Tus tiendas', n: '{n} de {m}', criar: 'Crear otra tienda', limite: 'Llegaste al límite de {m} tiendas.', aberta: 'Tienda abierta: {n}', sel: 'Elige una tienda', banida: 'bloqueada' },
    pt: { t: 'Suas lojas', n: '{n} de {m}', criar: 'Criar outra loja', limite: 'Você chegou ao limite de {m} lojas.', aberta: 'Loja aberta: {n}', sel: 'Escolha uma loja', banida: 'banida' },
  };
  function t(k, vars) {
    var lg = (typeof S !== 'undefined' && S.lang) || 'nl';
    var s = (TXT[lg] || TXT.nl)[k];
    if (vars) Object.keys(vars).forEach(function (v) { s = s.replace('{' + v + '}', vars[v]); });
    return s;
  }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function copia(x) { return JSON.parse(JSON.stringify(x)); }
  function contaReal() { return typeof S !== 'undefined' && S.user && S.user.contaId; }
  function vendedor() { return typeof S !== 'undefined' && S.user && (S.user.papel === 'vendedor' || S.user.role === 'vendedor'); }

  // Lista de lojas da conta (ids), com a loja aberta sempre dentro.
  function ids() {
    var l = (S.kmLojas || []).slice();
    if (S.myStore && l.indexOf(S.myStore.id) < 0) l.push(S.myStore.id);
    return l;
  }
  function lojaPorId(id) {
    if (S.myStore && S.myStore.id === id) return S.myStore;
    return shopById(id) || (S.kmLojasObj || {})[id] || null;
  }
  // Guarda a loja aberta e os pedidos dela antes de abrir outra.
  function guardarAberta() {
    if (!S.myStore) return;
    var id = S.myStore.id;
    S.kmLojas = ids();
    S.kmLojasObj = Object.assign({}, S.kmLojasObj || {}, (function () { var o = {}; o[id] = copia(S.myStore); return o; })());
    S.kmPedidosPor = Object.assign({}, S.kmPedidosPor || {});
    S.kmPedidosPor[id] = S.sorders || [];
  }
  function abrir(id) {
    var st = lojaPorId(id);
    if (!st) return;
    st = copia(st); st.mine = true; delete st.gen;
    S.myStore = st;
    if (typeof attachMyStore === 'function') attachMyStore();
    S.sorders = (S.kmPedidosPor || {})[id] || [];
    if (S.kmPedidosPor) delete S.kmPedidosPor[id];
    S.selOrder = null; S.tab = 'loja';
  }
  function trocar(id) {
    if (!S.myStore || S.myStore.id === id) return;
    guardarAberta();
    abrir(id);
    save(); render(); scrollTo(0, 0);
    toast(t('aberta', { n: S.myStore.n }));
  }

  // ---------- conta real: a lista vem do servidor ----------
  var srv = { conta: null, carregando: false, ultimo: 0, nomes: {}, banidas: {} };
  async function sincronizar(forcar) {
    if (!contaReal() || !vendedor() || srv.carregando) return;
    var conta = S.user.contaId;
    if (!forcar && srv.conta === conta && Date.now() - srv.ultimo < 20000) return;
    srv.carregando = true;
    try {
      var tk = window.kmToken ? await window.kmToken() : null;
      var r = await fetch('/api/loja/minhas', { headers: tk ? { Authorization: 'Bearer ' + tk } : {} });
      if (!r.ok) throw new Error(r.status);
      var j = await r.json();
      if (!S.user || S.user.contaId !== conta) return;
      LIMITE = j.limite || LIMITE;
      var antes = JSON.stringify(ids()) + JSON.stringify(srv.nomes);
      srv.nomes = {}; srv.banidas = {};
      j.lojas.forEach(function (l) { srv.nomes[l.prototipoId] = l.nome; srv.banidas[l.prototipoId] = l.banida; });
      S.kmLojas = j.lojas.map(function (l) { return l.prototipoId; });
      srv.conta = conta; srv.ultimo = Date.now();
      // a loja aberta foi apagada em outro aparelho: abre outra
      if (S.myStore && S.kmLojas.length && S.kmLojas.indexOf(S.myStore.id) < 0 && !shopById(S.myStore.id)) { S.myStore = null; abrir(S.kmLojas[0]); }
      if (!S.myStore && S.kmLojas.length) abrir(S.kmLojas[0]);
      if (antes !== JSON.stringify(ids()) + JSON.stringify(srv.nomes)) { save(); if (S.view === 'minhaloja') { var y = scrollY; render(); scrollTo(0, y); } }
    } catch (e) { /* tenta de novo depois */ } finally { srv.carregando = false; }
  }

  // ---------- painel "Suas lojas" ----------
  function painelHTML() {
    var lista = ids();
    var opcoes = lista.map(function (id) {
      var st = lojaPorId(id), nome = (st && st.n) || srv.nomes[id] || ('#' + id);
      return '<option value="' + id + '"' + (S.myStore && S.myStore.id === id ? ' selected' : '') + '>' + esc(nome) + (srv.banidas[id] ? ' (' + t('banida') + ')' : '') + '</option>';
    }).join('');
    var cheio = lista.length >= LIMITE;
    return '<section class="panel" id="km-lojas" style="margin-bottom:16px"><div style="display:flex;gap:12px;justify-content:space-between;align-items:center;flex-wrap:wrap">' +
      '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;min-width:0"><b>' + t('t') + '</b><span class="muted">' + t('n', { n: lista.length, m: LIMITE }) + '</span>' +
      (lista.length > 1 ? '<label class="sr" for="km-loja-sel">' + t('sel') + '</label><select id="km-loja-sel" class="select" style="max-width:100%">' + opcoes + '</select>' : '') + '</div>' +
      '<button class="btn sm' + (cheio ? '' : ' primary') + '" data-a="kmnovaloja"' + (cheio ? ' aria-disabled="true" style="opacity:.55"' : '') + '>+ ' + t('criar') + '</button></div></section>';
  }

  document.addEventListener('change', function (e) {
    if (e.target && e.target.id === 'km-loja-sel') trocar(Number(e.target.value));
  });

  document.addEventListener('DOMContentLoaded', function () {
    // Demonstração: as lojas extras ficam só neste navegador; põe de volta no catálogo ao abrir.
    Object.keys(S.kmLojasObj || {}).forEach(function (id) {
      if (!shopById(+id) && (S.kmLojas || []).indexOf(+id) >= 0) { var c = copia(S.kmLojasObj[id]); c.gen = true; c.mine = false; SHOPS.push(c); }
    });

    // Entrar com outra conta (ou de novo na demonstração) começa sem as lojas da conta anterior.
    var semear = window.seed;
    window.seed = function () {
      var r = semear.apply(this, arguments);
      S.kmLojas = []; S.kmLojasObj = {}; S.kmPedidosPor = {}; S.kmCriando = false; S.kmApagando = null;
      srv = { conta: null, carregando: false, ultimo: 0, nomes: {}, banidas: {} };
      return r;
    };

    // "Criar outra loja": guarda a loja aberta e abre a tela "Criar nova loja" do protótipo.
    A.kmnovaloja = function () {
      if (ids().length >= LIMITE) return toast(t('limite', { m: LIMITE }));
      guardarAberta();
      S.kmCriando = true; S.draft = null; save();
      nav('criar');
    };
    // Publicou a loja nova: ela entra na lista e abre com a lista de pedidos vazia.
    ['edpublish', 'pubstore'].forEach(function (nome) {
      var original = A[nome];
      if (typeof original !== 'function') return;
      A[nome] = async function () {
        var antes = S.myStore && S.myStore.id;
        await original.apply(this, arguments);
        if (!S.myStore || S.myStore.id === antes) return;
        if (S.kmCriando || (S.kmLojas || []).length) {
          S.kmCriando = false;
          S.kmLojas = ids();
          S.kmLojasObj = Object.assign({}, S.kmLojasObj || {}); S.kmLojasObj[S.myStore.id] = copia(S.myStore);
          S.sorders = []; S.selOrder = null;
          save(); render();
          sincronizar(true);
        }
      };
    });
    // Apagar a loja aberta: sai da lista e abre a próxima (se houver).
    var apagar = A.mydel;
    A.mydel = function () { S.kmApagando = S.myStore && S.myStore.id; return apagar.apply(this, arguments); };

    var minhaLoja = window.vMyStore;
    window.vMyStore = function () {
      if (S.kmApagando != null) {
        if (!S.myStore) {
          var x = S.kmApagando;
          S.kmLojas = (S.kmLojas || []).filter(function (id) { return id !== x; });
          if (S.kmLojasObj) delete S.kmLojasObj[x];
          if (S.kmPedidosPor) delete S.kmPedidosPor[x];
          S.kmApagando = null;
          var resto = (S.kmLojas || []).filter(function (id) { return lojaPorId(id); });
          if (resto.length) abrir(resto[0]);
          save();
        } else if (S.myStore.id !== S.kmApagando) S.kmApagando = null;
      }
      if (S.kmCriando && S.view === 'minhaloja') S.kmCriando = false; // voltou sem publicar
      if (!S.myStore && (S.kmLojas || []).length) { var r = S.kmLojas.filter(function (id) { return lojaPorId(id); }); if (r.length) abrir(r[0]); }
      var h = minhaLoja.apply(this, arguments);
      if (!vendedor() || !S.myStore) return h;
      if (contaReal()) sincronizar(false);
      return h.replace('<div class="wrap">', '<div class="wrap">' + painelHTML());
    };
  });

  // Para os painéis de faturamento da demonstração (public/js/contas.js): cada loja com os pedidos dela.
  window.kmLojasDaConta = function () {
    return ids().map(function (id) {
      var st = lojaPorId(id);
      return st ? { loja: st, pedidos: S.myStore && S.myStore.id === id ? (S.sorders || []) : ((S.kmPedidosPor || {})[id] || []) } : null;
    }).filter(Boolean);
  };
})();
