/* "Adicionar produto" na loja gerada (pedido dos donos, novembro/2026).
 *
 * A loja nova nasce com 1 produto só (trecho km-one-prod do protótipo), copiado de uma loja modelo
 * (d.src). Ao clicar em "Adicionar produto", em vez de um produto em branco, entra o próximo produto
 * da loja modelo que ainda não está na loja: com nome, descrição, preço e os mesmos arquivos (os
 * arquivos de entrega ficam ligados ao id do produto, que é mantido, como no primeiro produto).
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
    (d.prods || []).forEach(function (p) { if (p && p.id != null) tem[String(p.id)] = 1; });
    var p = modelo.prods.find(function (x) { return x && x.id != null && !tem[String(x.id)]; });
    if (!p) return null;
    return trocarNomes(JSON.parse(JSON.stringify(p)), modelo, d);
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
        d.prods.forEach(function (p) { if (p) trocarNomes(p, modelo, d); });
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
