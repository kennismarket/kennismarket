/* Pedidos de verdade depois do pagamento (etapa 4), ligados às telas do protótipo.
 *
 * Só para contas reais (S.user.contaId). Contas de demonstração e lojas do dono continuam com o
 * pedido de mentira do protótipo (decisão dos donos).
 *
 * - Cliente (Meus pedidos e o chat da loja): os pedidos reais vêm do servidor (GET /api/pedidos) e
 *   entram em S.orders como os do protótipo. O "vendedor robô" do protótipo não entrega mais
 *   sozinho os pedidos reais: quem marca a entrega é o vendedor de verdade. "Recebi, está tudo
 *   certo" confirma no servidor; "Abrir chamado" pede reembolso ao suporte (a qualquer momento
 *   depois de pago, até depois de concluído). Sem confirmação, o pedido conclui sozinho 7 dias
 *   depois da entrega (o servidor faz isso).
 * - Vendedor (Minha loja → Pedidos): os pedidos reais da loja (GET /api/loja/pedidos) entram em
 *   S.sorders; "Entregar" marca como entregue no servidor. O comprador robô não responde neles.
 * - Dono (Painel → Chamados de suporte): os pedidos de reembolso reais, com "Devolver ao comprador"
 *   (valor total ou parcial) e "Negar", e a lista de débitos dos vendedores (GET /api/admin/casos).
 * O chat real fica para a etapa 5: por enquanto, mensagens nos pedidos reais ficam só neste navegador.
 * Usa o login de public/js/contas.js (window.kmToken).
 */
(function () {
  'use strict';

  var TXT = {
    nl: {
      km_entregue: 'De verkoper heeft de bestelling als geleverd gemarkeerd. Bekijk de bestanden: klopt alles, bevestig dan. Zonder reactie wordt de bestelling na {d} dagen automatisch afgerond.',
      km_auto: 'Bestelling automatisch afgerond ({d} dagen na de levering).',
      km_reemb: 'Kennismarket-support: terugbetaling goedgekeurd. {v} gaat terug naar je, in geld, via dezelfde betaalmethode.',
      km_negado: 'Kennismarket-support: we hebben je verzoek bekeken en de terugbetaling is niet goedgekeurd. Vragen? Neem contact op met support.',
      km_pedido: 'Terugbetaling aangevraagd. Het Kennismarket-team beoordeelt het binnen 5 werkdagen.',
      km_soPago: 'Bestelling betaald: {n} KN. Jouw deel ({v}) is al naar je Pix-sleutel gegaan.',
      km_soCaso: 'De koper heeft een terugbetaling aangevraagd. Het Kennismarket-team beoordeelt het.',
      km_soNegado: 'Support heeft de terugbetaling afgewezen.',
      km_soReemb: 'Support heeft {v} aan de koper terugbetaald. Jouw evenredige deel ({w}) staat genoteerd als schuld bij Kennismarket.',
      km_soConcl: 'De koper heeft de bestelling afgerond.',
      problema: 'Klopt er iets niet met de bestelling?', pedirReemb: 'Terugbetaling aanvragen',
      ajusteChat: 'Je verzoek staat in de chat. De echte chat met de verkoper komt binnenkort.',
      falha: 'Er ging iets mis. Probeer het opnieuw.',
      reaisT: 'Echte bestellingen (in reais)', carregando: 'Laden…', nenhum: 'Geen open terugbetalingsverzoeken.',
      decididos: 'Laatst beslist', debitosT: 'Schulden van verkopers', debitosD: 'Het deel van de verkoper in goedgekeurde terugbetalingen. Alleen een notitie: de inning gebeurt buiten de site.', semDebitos: 'Geen schulden.',
      valorT: 'Hoeveel terugbetalen?', valorD: 'Het geld gaat terug naar de koper uit de kas van Kennismarket. De verkoper krijgt zijn evenredige deel als schuld genoteerd (alleen een notitie).',
      valorL: 'Bedrag in reais (max. {v})', valorErr: 'Vul een bedrag in tussen R$ 0,01 en {v}.', debitoPrev: 'Schuld van de verkoper: {v}', devolver: '{v} terugbetalen',
      negarT: 'Terugbetaling afwijzen?', negarD: 'De bestelling gaat terug naar de vorige status ({s}).', pago: 'Betaald', parcial: 'gedeeltelijk',
      sit: { aberto: 'Open', quitado: 'Betaald', perdoado: 'Kwijtgescholden' }, st: { pago: 'betaald', entregue: 'geleverd', concluido: 'afgerond' },
      cliente: 'Koper',
    },
    en: {
      km_entregue: 'The seller marked the order as delivered. Check the files: if everything is right, confirm. With no answer, the order completes by itself after {d} days.',
      km_auto: 'Order completed automatically ({d} days after delivery).',
      km_reemb: 'Kennismarket support: refund approved. {v} goes back to you, in money, by the same payment method.',
      km_negado: 'Kennismarket support: we reviewed your request and the refund was not approved. Questions? Contact support.',
      km_pedido: 'Refund requested. The Kennismarket team will review it within 5 business days.',
      km_soPago: 'Order paid: {n} KN. Your share ({v}) has already gone to your Pix key.',
      km_soCaso: 'The buyer requested a refund. The Kennismarket team will review it.',
      km_soNegado: 'Support denied the refund.',
      km_soReemb: 'Support refunded {v} to the buyer. Your proportional share ({w}) is recorded as a debt to Kennismarket.',
      km_soConcl: 'The buyer completed the order.',
      problema: 'Something wrong with the order?', pedirReemb: 'Request a refund',
      ajusteChat: 'Your request is in the chat. The real chat with the seller is coming soon.',
      falha: 'Something went wrong. Please try again.',
      reaisT: 'Real orders (in reais)', carregando: 'Loading…', nenhum: 'No open refund requests.',
      decididos: 'Recently decided', debitosT: 'Seller debts', debitosD: 'The seller’s share of approved refunds. Just a record: collection happens outside the site.', semDebitos: 'No debts.',
      valorT: 'How much to refund?', valorD: 'The money goes back to the buyer from Kennismarket’s funds. The seller’s proportional share is recorded as a debt (just a record).',
      valorL: 'Amount in reais (max. {v})', valorErr: 'Enter an amount between R$ 0.01 and {v}.', debitoPrev: 'Seller’s debt: {v}', devolver: 'Refund {v}',
      negarT: 'Deny the refund?', negarD: 'The order goes back to its previous status ({s}).', pago: 'Paid', parcial: 'partial',
      sit: { aberto: 'Open', quitado: 'Paid', perdoado: 'Forgiven' }, st: { pago: 'paid', entregue: 'delivered', concluido: 'completed' },
      cliente: 'Buyer',
    },
    es: {
      km_entregue: 'El vendedor marcó el pedido como entregado. Revisa los archivos: si todo está bien, confirma. Sin respuesta, el pedido se completa solo después de {d} días.',
      km_auto: 'Pedido completado automáticamente ({d} días después de la entrega).',
      km_reemb: 'Soporte Kennismarket: reembolso aprobado. {v} vuelve a ti, en dinero, por el mismo medio de pago.',
      km_negado: 'Soporte Kennismarket: revisamos tu solicitud y el reembolso no fue aprobado. ¿Dudas? Escribe a soporte.',
      km_pedido: 'Reembolso solicitado. El equipo de Kennismarket lo revisará en hasta 5 días hábiles.',
      km_soPago: 'Pedido pagado: {n} KN. Tu parte ({v}) ya fue a tu clave Pix.',
      km_soCaso: 'El comprador pidió un reembolso. El equipo de Kennismarket lo revisará.',
      km_soNegado: 'Soporte rechazó el reembolso.',
      km_soReemb: 'Soporte devolvió {v} al comprador. Tu parte proporcional ({w}) queda anotada como deuda con Kennismarket.',
      km_soConcl: 'El comprador completó el pedido.',
      problema: '¿Algo mal con el pedido?', pedirReemb: 'Pedir reembolso',
      ajusteChat: 'Tu pedido está en el chat. El chat real con el vendedor llegará pronto.',
      falha: 'Algo salió mal. Inténtalo de nuevo.',
      reaisT: 'Pedidos reales (en reales)', carregando: 'Cargando…', nenhum: 'No hay solicitudes de reembolso abiertas.',
      decididos: 'Decididos recientemente', debitosT: 'Deudas de vendedores', debitosD: 'La parte del vendedor en los reembolsos aprobados. Solo un registro: el cobro se hace fuera del sitio.', semDebitos: 'Sin deudas.',
      valorT: '¿Cuánto devolver?', valorD: 'El dinero vuelve al comprador desde la caja de Kennismarket. La parte proporcional del vendedor queda anotada como deuda (solo un registro).',
      valorL: 'Monto en reales (máx. {v})', valorErr: 'Escribe un monto entre R$ 0,01 y {v}.', debitoPrev: 'Deuda del vendedor: {v}', devolver: 'Devolver {v}',
      negarT: '¿Rechazar el reembolso?', negarD: 'El pedido vuelve a la situación anterior ({s}).', pago: 'Pagado', parcial: 'parcial',
      sit: { aberto: 'Abierta', quitado: 'Pagada', perdoado: 'Perdonada' }, st: { pago: 'pagado', entregue: 'entregado', concluido: 'completado' },
      cliente: 'Comprador',
    },
    pt: {
      km_entregue: 'O vendedor marcou o pedido como entregue. Confira os arquivos: se estiver tudo certo, confirme. Sem resposta, o pedido é concluído sozinho depois de {d} dias.',
      km_auto: 'Pedido concluído automaticamente ({d} dias depois da entrega).',
      km_reemb: 'Suporte Kennismarket: devolução aprovada. {v} volta para você, em dinheiro, pela mesma forma de pagamento.',
      km_negado: 'Suporte Kennismarket: analisamos o seu pedido e a devolução não foi aprovada. Dúvidas? Fale com o suporte.',
      km_pedido: 'Reembolso solicitado. A equipe Kennismarket analisa em até 5 dias úteis.',
      km_soPago: 'Pedido pago: {n} KN. A sua parte ({v}) já foi para a sua chave Pix.',
      km_soCaso: 'O comprador pediu reembolso. A equipe Kennismarket vai analisar.',
      km_soNegado: 'O suporte negou a devolução.',
      km_soReemb: 'O suporte devolveu {v} ao comprador. A sua parte proporcional ({w}) fica anotada como débito com o Kennismarket.',
      km_soConcl: 'O comprador concluiu o pedido.',
      problema: 'Algo errado com o pedido?', pedirReemb: 'Solicitar reembolso',
      ajusteChat: 'O seu pedido está no chat. O chat de verdade com o vendedor chega em breve.',
      falha: 'Algo deu errado. Tente de novo.',
      reaisT: 'Pedidos reais (em reais)', carregando: 'Carregando…', nenhum: 'Nenhum pedido de reembolso em aberto.',
      decididos: 'Decididos recentemente', debitosT: 'Débitos dos vendedores', debitosD: 'A parte do vendedor nos reembolsos aprovados. É só um registro: a cobrança é feita por fora.', semDebitos: 'Nenhum débito.',
      valorT: 'Quanto devolver?', valorD: 'O dinheiro volta ao comprador saindo do caixa do Kennismarket. A parte proporcional do vendedor fica anotada como débito (só um registro).',
      valorL: 'Valor em reais (máx. {v})', valorErr: 'Digite um valor entre R$ 0,01 e {v}.', debitoPrev: 'Débito do vendedor: {v}', devolver: 'Devolver {v}',
      negarT: 'Negar o reembolso?', negarD: 'O pedido volta para a situação anterior ({s}).', pago: 'Pago', parcial: 'parcial',
      sit: { aberto: 'Em aberto', quitado: 'Quitado', perdoado: 'Perdoado' }, st: { pago: 'pago', entregue: 'entregue', concluido: 'concluído' },
      cliente: 'Comprador',
    },
  };
  var DIAS = 7; // confirmação automática (o servidor manda o número certo no painel do dono)

  function lg() { return (typeof S !== 'undefined' && S.lang) || 'nl'; }
  function t(k, vars) {
    var s = (TXT[lg()] || TXT.nl)[k];
    if (typeof s === 'string' && vars) Object.keys(vars).forEach(function (v) { s = s.replace('{' + v + '}', vars[v]); });
    return s;
  }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function reais(c) { return ((c || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  function contaReal() { return typeof S !== 'undefined' && S.user && S.user.contaId; }
  function redesenhar() { var y = scrollY; render(); scrollTo(0, y); }
  // Débito do vendedor num reembolso (mesma conta do servidor: server/lib/dinheiro.js).
  function debito(valor, devolvido, parteVendedor) {
    return devolvido >= valor ? parteVendedor : Math.round(devolvido * parteVendedor / valor);
  }

  async function api(metodo, caminho, corpo) {
    var tk = window.kmToken ? await window.kmToken() : null;
    var r = await fetch(caminho, {
      method: metodo,
      headers: Object.assign({ 'Content-Type': 'application/json' }, tk ? { Authorization: 'Bearer ' + tk } : {}),
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok) throw Object.assign(new Error(j.erro || 'erro'), { status: r.status });
    return j;
  }

  // Id curto do pedido, como os do protótipo (#A1B2C).
  function idCurto(id) { return 'R' + String(id).replace(/-/g, '').slice(0, 5).toUpperCase(); }
  function indiceDoProduto(loja, prototipoId) {
    if (!loja || !loja.prods) return -1;
    for (var i = 0; i < loja.prods.length; i++) if (String(loja.prods[i].id) === String(prototipoId)) return i;
    return -1;
  }

  // ======================= cliente =======================
  var DO_SERVIDOR = { pago: 'andamento', entregue: 'entregue', concluido: 'concluido', reembolso_solicitado: 'disputa', reembolsado: 'reembolsado' };
  var cli = { conta: null, carregando: false, ultimo: 0 };

  function sys(sid, key, p, k) { push(sid, { f: 'sys', k: k || '', key: key, p: p || {} }); }
  function temEntrega(sid, oid) { return chat(sid).some(function (m) { return m.k === 'delivery' && m.oid === oid; }); }

  // Põe o pedido do servidor no S.orders (cria, se ainda não estiver neste navegador) e conta
  // no chat o que mudou. Devolve true se mudou algo.
  function aplicarPedidoCliente(p) {
    var o = null;
    Object.keys(S.orders).forEach(function (k) { if (S.orders[k].pedidoReal === p.id) o = S.orders[k]; });
    var s = shopById(p.loja.prototipoId);
    if (!s) return false;
    var novo = DO_SERVIDOR[p.status], criado = false;
    if (!novo) return false;
    if (!o) {
      criado = true;
      var pi = indiceDoProduto(s, p.produto.prototipoId);
      if (pi < 0) return false;
      var quando = Date.parse(p.pagoEm || p.criadoEm) || Date.now();
      o = { id: idCurto(p.id), shopId: s.id, reserve: p.valorKn, amount: p.valorKn, opt: null, pi: [pi], tl: null, status: 'andamento', created: quando, started: quando, pedidoReal: p.id, paidOut: true };
      S.orders[o.id] = o;
      sys(s.id, 'm_prodBought', { pi: [pi], n: p.valorKn });
    }
    var antes = o.status, mudou = criado;
    if (p.entregueEm && !temEntrega(s.id, o.id)) {
      o.delivered = Date.parse(p.entregueEm);
      sys(s.id, 'km_entregue', { d: DIAS }, 'good');
      push(s.id, { f: 'them', k: 'delivery', oid: o.id, v: 1 });
      mudou = true;
    }
    if (antes === novo) return mudou;
    if (novo === 'reembolsado') {
      var v = p.reembolso && p.reembolso.valorCentavos != null ? p.reembolso.valorCentavos : p.valorCentavos;
      sys(s.id, 'km_reemb', { v: reais(v) }, 'good');
    } else if (antes === 'disputa') {
      sys(s.id, 'km_negado', {}, 'alert');
    } else if (novo === 'disputa') {
      sys(s.id, 'km_pedido', {}, 'alert');
    } else if (novo === 'concluido' && antes === 'entregue') {
      sys(s.id, 'km_auto', { d: DIAS }, 'done');
    }
    if (novo === 'concluido') {
      o.confirmed = Date.parse(p.concluidoEm) || Date.now();
      if (!chat(s.id).some(function (m) { return m.k === 'rate' && m.oid === o.id; })) push(s.id, { f: 'sys', k: 'rate', oid: o.id });
    }
    o.status = novo;
    return true;
  }

  async function sincronizarCliente(forcar) {
    if (!contaReal() || cli.carregando) return;
    var conta = S.user.contaId;
    if (!forcar && cli.conta === conta && Date.now() - cli.ultimo < 20000) return;
    cli.carregando = true;
    try {
      var r = await api('GET', '/api/pedidos');
      if (!S.user || S.user.contaId !== conta) return;
      var mudou = false;
      r.pedidos.slice().reverse().forEach(function (p) { mudou = aplicarPedidoCliente(p) || mudou; });
      cli.conta = conta; cli.ultimo = Date.now();
      if (mudou) { save(); if (S.view === 'pedidos' || S.view === 'loja') redesenhar(); else refreshChrome(); }
    } catch (e) { /* sem rede: tenta de novo depois */ } finally { cli.carregando = false; }
  }

  // Pedido real do cliente nesta loja que ainda aceita pedido de reembolso (pago, entregue ou concluído).
  function pedidoParaReembolso(sid) {
    var achado = null;
    Object.keys(S.orders).forEach(function (k) {
      var o = S.orders[k];
      if (o.pedidoReal && o.shopId === sid && ['andamento', 'entregue', 'concluido'].indexOf(o.status) >= 0 && (!achado || o.created > achado.created)) achado = o;
    });
    return achado;
  }

  function abrirReembolso(o) {
    var s = shopById(o.shopId);
    modal('<h2>' + tr('dispT') + '</h2><p class="sub">' + tr('dispD', { n: fmtN(o.amount) }) + '</p>' +
      '<div class="field"><label for="dp-r">' + tr('dispR') + '</label><select id="dp-r">' + ['dr1', 'dr2', 'dr3', 'dr4'].map(function (k) { return '<option value="' + k + '">' + tr(k) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="dp-t">' + tr('dispTx') + '</label><textarea id="dp-t" placeholder="' + tr('dispPh') + '"></textarea></div><p class="err" id="dp-err"></p>' +
      '<button class="btn danger block" id="ok">' + tr('dispB') + '</button><button class="btn block" data-a="close">' + tr('back2') + '</button>', function (m) {
      m.querySelector('#ok').onclick = async function () {
        var v = m.querySelector('#dp-t').value.trim(), err = m.querySelector('#dp-err'), b = this;
        if (v.length < 10) { err.textContent = tr('dispErr'); return; }
        var r = m.querySelector('#dp-r').value;
        b.disabled = true; err.textContent = '';
        try {
          // o motivo vai em português para os donos lerem
          await api('POST', '/api/pedidos/' + o.pedidoReal + '/reembolso', { motivo: ((T.pt && T.pt[r]) || tr(r)) + ' — ' + v });
        } catch (x) {
          err.textContent = t('falha');
          b.disabled = false;
          if (x.status === 409) sincronizarCliente(true);
          return;
        }
        closeModal();
        o.status = 'disputa'; o.dispute = { r: r, t: v };
        push(s.id, { f: 'sys', k: 'alert', key: 'm_caseOpen', p: { r: r } });
        save(); render();
      };
    });
  }

  // ======================= vendedor =======================
  var DO_SERVIDOR_V = { pago: 'pago', entregue: 'entregue', concluido: 'entregue', reembolso_solicitado: 'case', reembolsado: 'refunded' };
  var vend = { conta: null, carregando: false, ultimo: 0 };

  function aplicarPedidoVendedor(p) {
    var s = S.myStore;
    var o = S.sorders.filter(function (x) { return x.real === p.id; })[0];
    var novo = DO_SERVIDOR_V[p.status], criado = false;
    if (!novo) return false;
    if (!o) {
      var pi = indiceDoProduto(s, p.produto.prototipoId);
      if (pi < 0) return false;
      o = { id: idCurto(p.id), real: p.id, buyer: p.cliente || t('cliente'), opt: null, pi: [pi], amount: p.valorKn, ts: Date.parse(p.pagoEm || p.criadoEm) || Date.now(), status: 'pago', msgs: [] };
      o.msgs.push({ f: 'sys', key: 'km_soPago', p: { n: p.valorKn, v: reais(p.vendedorCentavos) }, ts: o.ts });
      if (p.entregueEm) { o.delivered = Date.parse(p.entregueEm); o.status = 'entregue'; } // entregue antes (em outro aparelho)
      S.sorders.push(o);
      S.sorders.sort(function (a, b) { return b.ts - a.ts; });
      criado = true;
    }
    var antes = o.status, mudou = criado;
    if (p.status === 'concluido' && !o.concluido) { o.concluido = true; soPush(o, { f: 'sys', k: 'good', key: 'km_soConcl' }); mudou = true; }
    if (antes === novo) return mudou;
    if (novo === 'case') soPush(o, { f: 'sys', k: 'alert', key: 'km_soCaso' });
    else if (novo === 'refunded') {
      var dev = p.reembolso && p.reembolso.valorCentavos != null ? p.reembolso.valorCentavos : p.valorCentavos;
      soPush(o, { f: 'sys', k: 'alert', key: 'km_soReemb', p: { v: reais(dev), w: reais(debito(p.valorCentavos, dev, p.vendedorCentavos)) } });
    } else if (antes === 'case') soPush(o, { f: 'sys', k: 'good', key: 'km_soNegado' });
    o.status = novo;
    return true;
  }

  async function sincronizarVendedor(forcar) {
    if (!contaReal() || S.user.papel !== 'vendedor' || !S.myStore || vend.carregando) return;
    var conta = S.user.contaId;
    if (!forcar && vend.conta === conta && Date.now() - vend.ultimo < 20000) return;
    vend.carregando = true;
    try {
      var r = await api('GET', '/api/loja/pedidos');
      if (!S.user || S.user.contaId !== conta || !S.myStore) return;
      if (!r.loja || r.loja.prototipoId !== S.myStore.id) return;
      var mudou = false;
      r.pedidos.forEach(function (p) { mudou = aplicarPedidoVendedor(p) || mudou; });
      vend.conta = conta; vend.ultimo = Date.now();
      if (mudou) { save(); if (S.view === 'minhaloja') redesenhar(); }
    } catch (e) { /* tenta de novo depois */ } finally { vend.carregando = false; }
  }

  // ======================= dono: chamados de suporte =======================
  var casos = { dados: null, carregando: false, erro: '', ultimo: 0, conta: null };
  function carregarCasos(forcar) {
    if (!window.KM_DONO || casos.carregando) return;
    if (casos.conta !== S.user.contaId) casos = { dados: null, carregando: false, erro: '', ultimo: 0, conta: S.user.contaId };
    if (!forcar && casos.dados && Date.now() - casos.ultimo < 30000) return;
    casos.carregando = true;
    var pedido = casos;
    api('GET', '/api/admin/casos').then(function (r) { pedido.dados = r; pedido.erro = ''; if (r.diasConfirmacao) DIAS = r.diasConfirmacao; }, function () { pedido.erro = t('falha'); })
      .then(function () { pedido.carregando = false; pedido.ultimo = Date.now(); if (pedido === casos && S.view === 'admin') redesenhar(); });
  }
  function linhaCaso(c) {
    var p = c.pedido || { loja: {}, produto: '', cliente: '' };
    var titulo = tr('caseOrder', { id: idCurto(p.id || c.id), s: esc(p.loja.nome || '') });
    var detalhe = [p.produto, p.cliente].filter(Boolean).map(esc).join(' · ') + (c.motivo ? ' · “' + esc(c.motivo) + '”' : '');
    var direita;
    if (c.status === 'em_analise') {
      direita = '<div class="acts"><button class="btn sm danger" data-a="kmcasono" data-id="' + esc(c.id) + '">' + tr('caseDeny') + '</button>' +
        '<button class="btn sm safe" data-a="kmcasosim" data-id="' + esc(c.id) + '">' + tr('caseRefund') + '</button></div>';
    } else {
      var aprovado = c.status === 'aprovado';
      var parcial = aprovado && c.valorCentavos != null && p.valorCentavos && c.valorCentavos < p.valorCentavos;
      direita = '<span class="pill ' + (aprovado ? 'warn' : 'off') + '">' + (aprovado ? tr('caseRefunded') + (parcial ? ' · ' + reais(c.valorCentavos) + ' (' + t('parcial') + ')' : '') : tr('caseDenied')) + '</span>';
    }
    return '<div class="case"><div><b>' + titulo + '</b><span class="muted">' + detalhe + '</span></div>' +
      '<div class="case-r"><b class="cv">' + reais(p.valorCentavos) + '</b>' + direita + '</div></div>';
  }
  function casosReaisHTML() {
    carregarCasos(false);
    var d = casos.dados;
    var corpo;
    if (!d) corpo = '<p class="muted">' + (casos.erro || t('carregando')) + '</p>';
    else {
      corpo = (d.abertos.length ? d.abertos.map(linhaCaso).join('') : '<p class="muted">' + t('nenhum') + '</p>') +
        (d.decididos.length ? '<div style="margin-top:14px"><span class="label">' + t('decididos') + '</span>' + d.decididos.slice(0, 6).map(linhaCaso).join('') + '</div>' : '') +
        '<div style="margin-top:18px"><h3 style="margin:0 0 4px">' + t('debitosT') + '</h3><p class="sub">' + t('debitosD') + '</p>' +
        (d.debitos.length ? d.debitos.map(function (x) {
          var p = x.pedido || { loja: {} };
          return '<div class="case"><div><b>' + esc(p.loja.nome || '') + '</b><span class="muted">' + tr('caseOrder', { id: idCurto(p.id || x.id), s: esc(p.produto || '') }) + '</span></div>' +
            '<div class="case-r"><b class="cv neg">' + reais(x.valorCentavos) + '</b><span class="pill ' + (x.situacao === 'aberto' ? 'warn' : 'off') + '">' + esc(t('sit')[x.situacao] || x.situacao) + '</span></div></div>';
        }).join('') : '<p class="muted">' + t('semDebitos') + '</p>') + '</div>';
    }
    return '<div id="km-casos" style="margin:6px 0 18px"><span class="label">' + t('reaisT') + '</span>' + corpo + '</div>';
  }
  function casoPorId(id) {
    var d = casos.dados;
    return d ? d.abertos.filter(function (c) { return c.id === id; })[0] : null;
  }
  function decidir(c, corpo, botao) {
    return api('POST', '/api/admin/reembolsos/' + c.id, corpo).then(function (r) {
      toast(corpo.aprovar ? tr('caseRefunded') : tr('caseDenied'));
      if (r && r.aviso) setTimeout(function () { alert(r.aviso); }, 50);
      carregarCasos(true);
    }, function (x) {
      if (botao) botao.disabled = false;
      toast(x.message && x.status < 500 ? x.message : t('falha'));
      carregarCasos(true);
      throw x;
    });
  }
  function abrirDevolucao(c) {
    var p = c.pedido;
    modal('<h2>' + t('valorT') + '</h2><p class="sub">' + t('valorD') + '</p>' +
      '<div class="sumbox"><div><span>' + esc(p.produto) + '</span><b>' + reais(p.valorCentavos) + '</b></div><div><span>' + esc(p.loja.nome) + '</span><span>' + p.porcentagemVendedor + '%</span></div></div>' +
      '<div class="field"><label for="km-val">' + t('valorL', { v: reais(p.valorCentavos) }) + '</label><input id="km-val" inputmode="decimal" value="' + (p.valorCentavos / 100).toFixed(2).replace('.', ',') + '"></div>' +
      '<p class="muted" id="km-deb"></p><p class="err" id="km-err"></p>' +
      '<button class="btn safe block" id="ok"></button><button class="btn block" data-a="close">' + tr('back2') + '</button>', function (m) {
      var campo = m.querySelector('#km-val'), ok = m.querySelector('#ok');
      var ler = function () {
        var n = Number(String(campo.value).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
        return Number.isFinite(n) ? Math.round(n * 100) : NaN;
      };
      var atualizar = function () {
        var v = ler(), valido = v > 0 && v <= p.valorCentavos;
        m.querySelector('#km-deb').textContent = valido ? t('debitoPrev', { v: reais(debito(p.valorCentavos, v, p.vendedorCentavos)) }) : '';
        ok.textContent = t('devolver', { v: valido ? reais(v) : '…' });
        ok.disabled = !valido;
      };
      campo.oninput = atualizar; atualizar();
      ok.onclick = function () {
        var v = ler();
        if (!(v > 0 && v <= p.valorCentavos)) { m.querySelector('#km-err').textContent = t('valorErr', { v: reais(p.valorCentavos) }); return; }
        ok.disabled = true;
        decidir(c, v === p.valorCentavos ? { aprovar: true } : { aprovar: true, valorCentavos: v }, ok).then(closeModal, function (x) {
          m.querySelector('#km-err').textContent = x.message && x.status < 500 ? x.message : t('falha');
        });
      };
    });
  }

  // ======================= ligar às funções do protótipo =======================
  document.addEventListener('DOMContentLoaded', function () {
    // textos novos do chat (mudam junto com o idioma)
    Object.keys(TXT).forEach(function (l) {
      if (!T[l]) return;
      ['km_entregue', 'km_auto', 'km_reemb', 'km_negado', 'km_pedido', 'km_soPago', 'km_soCaso', 'km_soNegado', 'km_soReemb', 'km_soConcl'].forEach(function (k) { T[l][k] = TXT[l][k]; });
    });

    // O robô do protótipo não mexe nos pedidos reais (nem entrega, nem responde como comprador).
    var agendar = window.schedule;
    window.schedule = function (o) { if (o && o.pedidoReal) return; return agendar.apply(this, arguments); };
    var compradorResponde = window.sellerReply;
    window.sellerReply = function (o) { if (o && o.real) return; return compradorResponde.apply(this, arguments); };

    // Cliente: "Recebi, está tudo certo" confirma no servidor antes.
    var confirmar = A.confirmrec;
    A.confirmrec = async function () {
      var s = shopById(S.shopId), o = s && activeOrder(s.id), args = arguments, self = this;
      if (!o || !o.pedidoReal) return confirmar.apply(self, args);
      if (o.status !== 'entregue') return;
      try { await api('POST', '/api/pedidos/' + o.pedidoReal + '/recebido'); } catch (x) { toast(t('falha')); sincronizarCliente(true); return; }
      return confirmar.apply(self, args);
    };
    // Cliente: "Abrir chamado" num pedido real pede reembolso ao suporte (servidor).
    var chamado = A.dispute;
    A.dispute = function () {
      var s = shopById(S.shopId), o = s && activeOrder(s.id);
      if (!o || !o.pedidoReal) return chamado.apply(this, arguments);
      abrirReembolso(o);
    };
    A.kmreemb = function (el) { var o = S.orders[el.dataset.oid]; if (o && o.pedidoReal) abrirReembolso(o); };
    // Cliente: "Pedir ajuste" num pedido real vai só para o chat (o vendedor de verdade responde na etapa 5).
    var ajuste = A.adjust;
    A.adjust = function () {
      var s = shopById(S.shopId), o = s && activeOrder(s.id);
      if (!o || !o.pedidoReal) return ajuste.apply(this, arguments);
      modal('<h2>' + tr('adjT') + '</h2><p class="sub">' + tr('adjD') + '</p><div class="field"><label for="adj">' + tr('adjL') + '</label><textarea id="adj" placeholder="' + tr('adjPh') + '"></textarea></div><p class="err" id="adj-err"></p><button class="btn primary block" id="ok">' + tr('adjB') + '</button><button class="btn block" data-a="close">' + tr('back2') + '</button>', function (m) {
        m.querySelector('#ok').onclick = function () {
          var v = m.querySelector('#adj').value.trim();
          if (v.length < 5) { m.querySelector('#adj-err').textContent = tr('adjErr'); return; }
          closeModal(); push(s.id, { f: 'me', t: tr('m_adjustMe', { t: v }) }); toast(t('ajusteChat'));
        };
      });
    };

    // Chat da loja: pedido real pago ou concluído ganha o link "Solicitar reembolso" (a qualquer momento depois de pago).
    var atendimento = window.atendHTML;
    window.atendHTML = function (s) {
      var h = atendimento.apply(this, arguments);
      if (!contaReal() || !s) return h;
      sincronizarCliente(false);
      var o = pedidoParaReembolso(s.id);
      if (!o || o.status === 'entregue') return h; // entregue: o cartão da entrega já tem "Abrir chamado"
      var linha = '<div class="dc-more" style="margin:0 0 10px"><span>' + t('problema') + '</span><button class="link" data-a="kmreemb" data-oid="' + esc(o.id) + '">' + t('pedirReemb') + '</button></div>';
      return h.replace('<div class="msgs" id="msgs"', linha + '<div class="msgs" id="msgs"');
    };
    var meusPedidos = window.vOrders;
    window.vOrders = function () { if (contaReal()) sincronizarCliente(false); return meusPedidos.apply(this, arguments); };

    // Vendedor: "Entregar" num pedido real marca como entregue no servidor (sem mexer no dinheiro: o split já foi na hora do pagamento).
    var entregar = window.doDeliver;
    window.doDeliver = async function (o, items) {
      if (!o || !o.real) return entregar.apply(this, arguments);
      try { await api('POST', '/api/pedidos/' + o.real + '/entregue'); } catch (x) { toast(t('falha')); sincronizarVendedor(true); return; }
      o.items = items; o.status = 'entregue'; o.delivered = Date.now();
      soPush(o, { f: 'me', k: 'sdeliv', items: items });
      save(); render(); toast(tr('spDeliveredToast'));
    };
    var minhaLoja = window.vMyStore;
    window.vMyStore = function () { if (contaReal()) sincronizarVendedor(false); return minhaLoja.apply(this, arguments); };

    // Dono: os chamados reais entram na seção "Chamados de suporte" do painel.
    if (typeof window.vAdminDono === 'function') {
      var painel = window.vAdminDono;
      window.vAdminDono = function () {
        var h = painel.apply(this, arguments);
        if (!window.KM_DONO || !contaReal()) return h;
        var ancora = '<h2>' + tr('casesT') + '</h2><p class="sub">' + tr('casesD') + '</p>';
        var i = h.indexOf(ancora);
        if (i < 0) return h;
        var fim = i + ancora.length;
        var resto = h.slice(fim);
        var vazio = '<p class="muted">' + tr('casesNone') + '</p>';
        // o bloco dos pedidos reais já diz quando não há nada; o aviso das compras de demonstração sai
        if (resto.trim().indexOf(vazio) === 0) resto = resto.replace(vazio, '');
        return h.slice(0, fim) + casosReaisHTML() + resto;
      };
    }
    A.kmcasosim = function (el) { var c = casoPorId(el.dataset.id); if (c) abrirDevolucao(c); };
    A.kmcasono = function (el) {
      var c = casoPorId(el.dataset.id);
      if (!c) return;
      confirmBox(t('negarT'), esc(t('negarD', { s: t('st')[c.statusAnterior] || c.statusAnterior })), tr('caseDeny'), 'danger', function () { decidir(c, { aprovar: false }).catch(function () {}); });
    };

    // Confere de tempos em tempos enquanto a pessoa está nas telas de pedidos.
    setInterval(function () {
      if (!contaReal() || document.hidden) return;
      if (S.view === 'pedidos' || S.view === 'loja') sincronizarCliente(true);
      if (S.view === 'minhaloja') sincronizarVendedor(true);
      if (S.view === 'admin' && window.KM_DONO) carregarCasos(true);
    }, 30000);
  });
})();
