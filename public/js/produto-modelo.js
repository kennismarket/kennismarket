/* "Adicionar produto" na loja gerada (pedido dos donos, novembro/2026).
 *
 * A loja nova nasce com 1 produto só (trecho km-one-prod do protótipo), copiado de uma loja modelo
 * (d.src). Ao clicar em "Adicionar produto", em vez de um produto em branco, entra o próximo produto
 * da loja modelo que ainda não está na loja: com nome, descrição, preço e os mesmos arquivos (os
 * arquivos de entrega ficam ligados ao id do produto, que é mantido, como no primeiro produto).
 * O nome e o dono da loja modelo que aparecerem nos textos viram o nome da loja nova.
 * Sem loja modelo, ou com todos os produtos dela já na loja: produto em branco, como antes.
 *
 * Carregado pelo site logo depois do script do protótipo (server/lib/pagina-prototipo.js).
 */
(function () {
  'use strict';
  if (typeof A === 'undefined' || typeof A.edpadd !== 'function') return;
  var original = A.edpadd;

  function proximoDoModelo(d) {
    if (!d || d.src == null || typeof SHOPS === 'undefined') return null;
    var modelo = SHOPS.find(function (s) { return s && s.id === d.src; });
    if (!modelo || !Array.isArray(modelo.prods)) return null;
    var tem = {};
    (d.prods || []).forEach(function (p) { if (p && p.id != null) tem[String(p.id)] = 1; });
    var p = modelo.prods.find(function (x) { return x && x.id != null && !tem[String(x.id)]; });
    if (!p) return null;
    var antigos = [modelo.n, modelo.o].filter(function (x) { return x && x.length > 2 && x !== d.n; });
    var trocar = function (v) {
      if (typeof v === 'string') return antigos.reduce(function (t, o) { return t.split(o).join(d.n || o); }, v);
      if (Array.isArray(v)) return v.map(trocar);
      return v;
    };
    var novo = JSON.parse(JSON.stringify(p));
    novo.name = trocar(novo.name);
    novo.desc = trocar(novo.desc);
    return novo;
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
