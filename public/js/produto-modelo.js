/* "Adicionar produto" na loja gerada (pedido dos donos, novembro/2026).
 *
 * A loja nova nasce com 1 produto só (trecho km-one-prod do protótipo), copiado de uma loja modelo
 * (d.src). Ao clicar em "Adicionar produto", em vez de um produto em branco, entra o próximo produto
 * da loja modelo que ainda não está na loja: com nome, descrição, preço e os mesmos arquivos.
 *
 * Arquivos (correção de segurança, 10/11/2026): cada produto copiado do modelo ganha um id PRÓPRIO
 * e guarda de onde veio (srcp). Os arquivos do produto do modelo aparecem na loja como "herdados":
 * o "×" num arquivo herdado só o esconde nesta loja (fica na lista "h-<produto>-<idioma>" desta
 * loja, como "f:<id do arquivo>"; "Mostrar de novo" devolve). Arquivos que o vendedor envia ficam
 * só no produto dele. Antes o id era o mesmo do modelo, e mexer nos arquivos mexia em todas as lojas.
 * O nome e o dono da loja modelo que aparecerem nos textos viram o nome da loja nova. Isso vale
 * também para o primeiro produto, o que a loja já traz ao ser gerada (genStore).
 * Sem loja modelo, ou com todos os produtos dela já na loja: produto em branco, como antes.
 *
 * "🎲 Gerar nome": o nome antigo da loja que aparecer no nome e na descrição dos produtos (e na
 * descrição e no destaque da loja) vira o nome novo.
 *
 * Carregado pelo site logo depois do script do protótipo (server/lib/pagina-prototipo.js).
 */
(function () {
  'use strict';
  if (typeof A === 'undefined' || typeof A.edpadd !== 'function') return;
  var original = A.edpadd;

  function lojaModelo(d) {
    if (!d || d.src == null || typeof SHOPS === 'undefined') return null;
    return SHOPS.find(function (s) { return s && s.id === d.src; }) || null;
  }

  // Troca, no nome e na descrição do produto, o nome e o dono da loja modelo pelo nome da loja nova.
  function trocarNomes(p, modelo, d) {
    var antigos = [modelo.n, modelo.o].filter(function (x) { return x && x.length > 2 && x !== d.n; });
    var trocar = function (v) {
      if (typeof v === 'string') return antigos.reduce(function (t, o) { return t.split(o).join(d.n || o); }, v);
      if (Array.isArray(v)) return v.map(trocar);
      return v;
    };
    p.name = trocar(p.name);
    p.desc = trocar(p.desc);
    return p;
  }

  function proximoDoModelo(d) {
    var modelo = lojaModelo(d);
    if (!modelo || !Array.isArray(modelo.prods)) return null;
    var tem = {};
    (d.prods || []).forEach(function (p) {
      if (p && p.id != null) tem[String(p.id)] = 1;
      if (p && p.srcp != null) tem[String(p.srcp)] = 1;
    });
    var p = modelo.prods.find(function (x) { return x && x.id != null && !tem[String(x.id)]; });
    if (!p) return null;
    return idProprio(trocarNomes(JSON.parse(JSON.stringify(p)), modelo, d));
  }

  // Produto copiado do modelo: id próprio, e srcp = id do produto do modelo (arquivos herdados).
  function idProprio(p) {
    if (p && p.id != null && p.srcp == null) { p.srcp = String(p.id); p.id = newPid(); }
    return p;
  }

  // ---------- arquivos herdados ----------
  var ocultos = function (p, lg) {
    var d = FILES[hidKey(p, lg)];
    return d && Array.isArray(d.hidden) ? d.hidden.filter(function (x) { return typeof x === 'string'; }) : [];
  };
  if (typeof prodFiles === 'function') {
    var arquivosDoProduto = prodFiles;
    prodFiles = function (p, lg) {
      var proprios = arquivosDoProduto(p, lg);
      if (!p || p.srcp == null || String(p.srcp) === String(p.id)) return proprios;
      var esc = ocultos(p, lg);
      var herdados = arquivosDoProduto({ id: p.srcp, name: p.name }, lg)
        .filter(function (x) { return esc.indexOf('f:' + x.id) < 0; })
        .map(function (x) { return Object.assign({}, x, { herdado: true }); });
      return herdados.concat(proprios);
    };
  }
  // O produto (da loja aberta) que herda este arquivo, para o "×" só esconder nesta loja.
  function produtoQueHerda(f) {
    var lojas = [];
    try { lojas.push(edStore()); } catch (e) {}
    try { lojas.push(shopById(S.shopId)); } catch (e) {}
    if (S.myStore) lojas.push(S.myStore);
    for (var i = 0; i < lojas.length; i++) {
      var ps = (lojas[i] && lojas[i].prods) || [];
      for (var j = 0; j < ps.length; j++) {
        var p = ps[j];
        if (p && p.srcp != null && 'p' + p.srcp === f.pkey && pkey(p) !== f.pkey) return p;
      }
    }
    return null;
  }
  if (typeof A.fremove === 'function') {
    var removerArquivo = A.fremove;
    A.fremove = function (el) {
      var k = el && el.dataset && el.dataset.k;
      var f = k && FILES[k];
      var p = f && produtoQueHerda(f);
      if (!p) return removerArquivo.apply(this, arguments);
      if (!FDB) return toast(tr('fNoDb'));
      var atual = FILES[hidKey(p, f.lg)];
      var lista = (atual && Array.isArray(atual.hidden) ? atual.hidden : []).filter(function (x) { return x !== 'f:' + k; });
      lista.push('f:' + k);
      FDB.doc('delivfiles/' + hidKey(p, f.lg)).set({ hidden: lista, ts: Date.now() })
        .then(function () { toast(tr('fRemoved')); }, function () { toast(tr('fErr')); });
    };
  }

  // Troca um nome por outro em textos (string ou lista de traduções).
  function trocarTexto(v, de, para) {
    if (typeof v === 'string') return v.split(de).join(para);
    if (Array.isArray(v)) return v.map(function (x) { return trocarTexto(x, de, para); });
    return v;
  }

  // "🎲 Gerar nome": leva o nome novo para os textos dos produtos e da loja.
  if (typeof A.edname === 'function') {
    var gerarNome = A.edname;
    A.edname = function () {
      var d = edStore();
      var antes = d && d.n;
      var r = gerarNome.apply(this, arguments);
      var depois = d && d.n;
      if (!antes || antes.length <= 2 || !depois || antes === depois) return r;
      var mudou = false;
      var trocar = function (o, campo) {
        if (!o || o[campo] == null) return;
        var novo = trocarTexto(o[campo], antes, depois);
        if (JSON.stringify(novo) !== JSON.stringify(o[campo])) { o[campo] = novo; mudou = true; }
      };
      (d.prods || []).forEach(function (p) { trocar(p, 'name'); trocar(p, 'desc'); });
      trocar(d, 'desc');
      trocar(d, 'h');
      if (!mudou) return r;
      edSync(d);
      save();
      var y = window.scrollY;
      render();
      window.scrollTo(0, y);
      return r;
    };
  }

  // Loja gerada: o primeiro produto (e qualquer outro que vier junto) também troca os nomes.
  if (typeof genStore === 'function') {
    var gerar = genStore;
    genStore = function () {
      var d = gerar.apply(this, arguments);
      var modelo = lojaModelo(d);
      if (modelo && Array.isArray(d.prods)) {
        d.prods.forEach(function (p) { if (p) idProprio(trocarNomes(p, modelo, d)); });
        edSync(d);
      }
      return d;
    };
  }

  A.edpadd = function () {
    var d = edStore();
    var p = proximoDoModelo(d);
    if (!p) return original.apply(this, arguments);
    if (!Array.isArray(d.prods)) d.prods = [];
    d.prods.push(p);
    edSync(d);
    save();
    var y = window.scrollY;
    render();
    window.scrollTo(0, y);
  };
})();
