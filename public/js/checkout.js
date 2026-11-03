/* Checkout de verdade (etapa 3), ligado às telas do protótipo.
 *
 * - Cliente com conta real, comprando um produto de preço fixo numa loja com vendedor de
 *   verdade (que já disse como recebe): o "comprar" do protótipo abre a tela de pagamento nova,
 *   que cria o pedido e a cobrança no servidor (POST /api/pedidos) com Pix ou boleto (cartão
 *   aparece desativado, "em breve"). Quando o pagamento é confirmado, a compra entra no site
 *   como antes (chat e entrega do protótipo), ligada ao pedido real.
 * - Contas de demonstração, lojas sem vendedor (do dono), a própria loja ou loja que ainda não
 *   disse como recebe: continua a compra de demonstração do protótipo (decisão dos donos).
 * - A tela antiga "Pagar pedido" do protótipo continua abrindo primeiro (decisão dos donos), só com
 *   Pix, Boleto e Cartão (em breve); a forma escolhida nela abre a tela nova.
 * - Pagamento simulado (até a Transfeera): a tela mostra "Simular pagamento (teste)".
 * - Conta de demonstração de cliente (pedido dos donos, só para ver como fica): a mesma tela,
 *   mas tudo no navegador — valor pela cotação que o site mostra, Pix e boleto fictícios, e
 *   nenhum pedido no servidor. Lojas sem venda de verdade, com conta real, seguem na compra antiga.
 * - Vendedor com conta real: "Minha loja" ganha o painel "Como você recebe" (Pix).
 * Usa o login de public/js/contas.js (window.kmToken).
 */
(function () {
  'use strict';

  var TXT = {
    nl: { t: 'Bestelling betalen', d: 'Betaal met Pix of boleto. De verkoper begint na de betaling.', doc: 'CPF of CNPJ van de betaler', docErr: 'Vul een geldige CPF of CNPJ in.',
      pix: 'Pix', boleto: 'Boleto', cartao: 'Kaart', embreve: 'binnenkort', genPix: 'Pix aanmaken', genBoleto: 'Boleto aanmaken', protecao: 'Beschermd door support: komt de levering niet overeen met de afspraak, dan beoordeelt support het en betaalt Kennismarket je geld terug.',
      cotacao: 'Koers van {d}: 1 KN = {v}', aguardando: 'Wachten op betaling…', pago: 'Betaling ontvangen!', simular: 'Betaling simuleren (test)', cartaoEmBreve: 'Betalen met kaart komt binnenkort.', demoAviso: '<b>Demo:</b> er wordt niets afgeschreven. Op de echte site wordt de betaling automatisch bevestigd.', pixD: 'Kopieer de code en betaal in je bank-app. Deze pagina ziet de betaling vanzelf.',
      boletoD: 'Betaal de boleto bij je bank. Het kan tot 3 werkdagen duren.', abrirBoleto: 'Boleto openen', umPorVez: 'Koop voorlopig één product per keer (zonder vertaling).', falha: 'Er ging iets mis. Probeer het opnieuw.',
      recT: 'Hoe je betaald wordt', recD: 'Je deel van elke verkoop gaat direct naar deze Pix-sleutel. Zonder dit kan je winkel niet echt verkopen.', recNome: 'Volledige naam of bedrijfsnaam', recDoc: 'CPF of CNPJ', recTipo: 'Type Pix-sleutel', recChave: 'Pix-sleutel', recSalvar: 'Opslaan', recOk: 'Gegevens opgeslagen. Je winkel kan nu verkopen.', recPronto: 'Je ontvangt via Pix', recAlterar: 'Wijzigen', recErr: 'Controleer de gegevens.',
      tipos: { cpf: 'CPF', cnpj: 'CNPJ', email: 'E-mail', telefone: 'Telefoon', aleatoria: 'Willekeurige sleutel' } },
    en: { t: 'Pay for your order', d: 'Pay with Pix or boleto. The seller starts after payment.', doc: 'Payer’s CPF or CNPJ', docErr: 'Enter a valid CPF or CNPJ.',
      pix: 'Pix', boleto: 'Boleto', cartao: 'Card', embreve: 'coming soon', genPix: 'Create Pix', genBoleto: 'Create boleto', protecao: 'Protected by support: if the delivery doesn’t match what was agreed, support reviews it and Kennismarket refunds your money.',
      cotacao: 'Rate of {d}: 1 KN = {v}', aguardando: 'Waiting for payment…', pago: 'Payment received!', simular: 'Simulate payment (test)', cartaoEmBreve: 'Card payment is coming soon.', demoAviso: '<b>Demo:</b> nothing is charged. On the real site, payment is confirmed automatically.', pixD: 'Copy the code and pay in your bank app. This page notices the payment by itself.',
      boletoD: 'Pay the boleto at your bank. It can take up to 3 business days.', abrirBoleto: 'Open boleto', umPorVez: 'For now, buy one product at a time (without translation).', falha: 'Something went wrong. Please try again.',
      recT: 'How you get paid', recD: 'Your share of each sale goes straight to this Pix key. Without it, your store can’t really sell.', recNome: 'Full name or company name', recDoc: 'CPF or CNPJ', recTipo: 'Pix key type', recChave: 'Pix key', recSalvar: 'Save', recOk: 'Details saved. Your store can now sell.', recPronto: 'You get paid by Pix', recAlterar: 'Change', recErr: 'Check the details.',
      tipos: { cpf: 'CPF', cnpj: 'CNPJ', email: 'Email', telefone: 'Phone', aleatoria: 'Random key' } },
    es: { t: 'Pagar pedido', d: 'Paga con Pix o boleto. El vendedor empieza después del pago.', doc: 'CPF o CNPJ de quien paga', docErr: 'Escribe un CPF o CNPJ válido.',
      pix: 'Pix', boleto: 'Boleto', cartao: 'Tarjeta', embreve: 'pronto', genPix: 'Generar Pix', genBoleto: 'Generar boleto', protecao: 'Protegido por soporte: si la entrega no coincide con lo acordado, soporte lo analiza y Kennismarket te devuelve el dinero.',
      cotacao: 'Cotización del {d}: 1 KN = {v}', aguardando: 'Esperando el pago…', pago: '¡Pago recibido!', simular: 'Simular pago (prueba)', cartaoEmBreve: 'El pago con tarjeta llegará pronto.', demoAviso: '<b>Demo:</b> no se cobra nada. En el sitio real, el pago se confirma automáticamente.', pixD: 'Copia el código y paga en la app de tu banco. Esta página detecta el pago sola.',
      boletoD: 'Paga el boleto en tu banco. Puede tardar hasta 3 días hábiles.', abrirBoleto: 'Abrir boleto', umPorVez: 'Por ahora, compra un producto a la vez (sin traducción).', falha: 'Algo salió mal. Inténtalo de nuevo.',
      recT: 'Cómo cobras', recD: 'Tu parte de cada venta va directo a esta clave Pix. Sin esto, tu tienda no puede vender de verdad.', recNome: 'Nombre completo o razón social', recDoc: 'CPF o CNPJ', recTipo: 'Tipo de clave Pix', recChave: 'Clave Pix', recSalvar: 'Guardar', recOk: 'Datos guardados. Tu tienda ya puede vender.', recPronto: 'Cobras por Pix', recAlterar: 'Cambiar', recErr: 'Revisa los datos.',
      tipos: { cpf: 'CPF', cnpj: 'CNPJ', email: 'Correo', telefone: 'Teléfono', aleatoria: 'Clave aleatoria' } },
    pt: { t: 'Pagar pedido', d: 'Pague com Pix ou boleto. O vendedor começa depois do pagamento.', doc: 'CPF ou CNPJ de quem paga', docErr: 'Digite um CPF ou CNPJ válido.',
      pix: 'Pix', boleto: 'Boleto', cartao: 'Cartão', embreve: 'em breve', genPix: 'Gerar Pix', genBoleto: 'Gerar boleto', protecao: 'Protegido pelo suporte: se a entrega não bater com o combinado, o suporte analisa e o Kennismarket devolve o seu dinheiro.',
      cotacao: 'Cotação de {d}: 1 KN = {v}', aguardando: 'Aguardando o pagamento…', pago: 'Pagamento recebido!', simular: 'Simular pagamento (teste)', cartaoEmBreve: 'O pagamento com cartão chega em breve.', demoAviso: '<b>Demonstração:</b> nada é cobrado. No site real, o pagamento é confirmado automaticamente.', pixD: 'Copie o código e pague no app do seu banco. Esta página percebe o pagamento sozinha.',
      boletoD: 'Pague o boleto no seu banco. Pode levar até 3 dias úteis.', abrirBoleto: 'Abrir boleto', umPorVez: 'Por enquanto, compre um produto por vez (sem tradução).', falha: 'Algo deu errado. Tente de novo.',
      recT: 'Como você recebe', recD: 'A sua parte de cada venda vai direto para esta chave Pix. Sem isso, sua loja não vende de verdade.', recNome: 'Nome completo ou razão social', recDoc: 'CPF ou CNPJ', recTipo: 'Tipo de chave Pix', recChave: 'Chave Pix', recSalvar: 'Salvar', recOk: 'Dados salvos. Sua loja já pode vender.', recPronto: 'Você recebe por Pix', recAlterar: 'Alterar', recErr: 'Confira os dados.',
      tipos: { cpf: 'CPF', cnpj: 'CNPJ', email: 'E-mail', telefone: 'Celular', aleatoria: 'Chave aleatória' } },
  };
  function t(k, vars) {
    var lg = (typeof S !== 'undefined' && S.lang) || 'nl';
    var s = (TXT[lg] || TXT.nl)[k];
    if (vars) Object.keys(vars).forEach(function (v) { s = s.replace('{' + v + '}', vars[v]); });
    return s;
  }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function reais(centavos) { return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  function dataBr(d) { return /^\d{4}-\d{2}-\d{2}$/.test(String(d)) ? String(d).split('-').reverse().join('/') : String(d || ''); }
  function contaReal() { return typeof S !== 'undefined' && S.user && S.user.contaId; }

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

  // ---------- tela de pagamento ----------
  // opts: { itens (linhas do resumo), antes (HTML acima do resumo), preco, forma ('pix'|'boleto'), aoPagar(pedido, forma) }
  function abrirCheckout(opts) {
    var preco = opts.preco;
    var forma = opts.forma || ((preco.formas || []).indexOf('pix') >= 0 ? 'pix' : (preco.formas || [])[0]);
    var linha = (opts.antes || '') + '<div class="sumbox">' + opts.itens +
      '<div class="tot"><span>' + tr('total') + '</span><b>' + reais(preco.valorCentavos) + '</b></div>' +
      '<div class="sub2"><span>' + t('cotacao', { d: dataBr(preco.cotacao.data), v: reais(Math.round(preco.cotacao.brl * 100)) }) + '</span></div></div>';
    function metodos() {
      var b = function (k, ativo) {
        return '<button class="method" data-m="' + k + '" aria-pressed="' + (forma === k) + '"' + (ativo ? '' : ' disabled style="opacity:.55;cursor:not-allowed"') + '>' +
          t(k) + (ativo ? '' : ' <small class="muted" style="font-weight:500">(' + t('embreve') + ')</small>') + '</button>';
      };
      return b('pix', preco.formas.indexOf('pix') >= 0) + b('boleto', preco.formas.indexOf('boleto') >= 0) + b('cartao', preco.formas.indexOf('cartao') >= 0);
    }
    function tela1(o) {
      o.querySelector('.sheet').innerHTML = '<h2>' + t('t') + '</h2><p class="sub">' + t('d') + '</p>' + linha +
        '<div class="methods3" role="group" aria-label="' + tr('payMethod') + '">' + metodos() + '</div>' +
        // CPF/CNPJ só aparece no boleto (decisão dos donos); no Pix não é pedido
        (forma === 'boleto' ? '<div class="field"><label for="ck-doc">' + t('doc') + '</label><input id="ck-doc" inputmode="numeric" autocomplete="off" placeholder="000.000.000-00"></div>' : '') +
        '<div class="callout">' + icon('shield', 18) + '<span>' + t('protecao') + '</span></div>' +
        '<p class="err" id="ck-err"></p>' +
        '<button class="btn primary block" id="ck-go">' + (forma === 'boleto' ? t('genBoleto') : t('genPix')) + ' · ' + reais(preco.valorCentavos) + '</button>' +
        '<button class="btn block" data-a="close">' + tr('cancelB') + '</button>';
      o.querySelectorAll('.method:not([disabled])').forEach(function (b) {
        b.onclick = function () {
          var campo = o.querySelector('#ck-doc'), d = campo ? campo.value : '';
          forma = b.dataset.m; tela1(o);
          if (o.querySelector('#ck-doc')) o.querySelector('#ck-doc').value = d;
        };
      });
      o.querySelector('#ck-go').onclick = async function () {
        var campo = o.querySelector('#ck-doc'), doc = campo ? campo.value.replace(/\D/g, '') : '', err = o.querySelector('#ck-err'), btn = this;
        if (forma === 'boleto' && doc.length !== 11 && doc.length !== 14) return (err.textContent = t('docErr'));
        btn.disabled = true; err.textContent = '';
        try {
          var pedido = preco.demo
            ? { id: null, valorCentavos: preco.valorCentavos, pix: { copiaECola: '00020126KENNISMARKET-DEMO-' + Date.now().toString(36).toUpperCase() },
                boleto: { linhaDigitavel: '00190.00009 01234.567890 12345.678901 1 ' + String(preco.valorCentavos).padStart(14, '0') } }
            : await api('POST', '/api/pedidos', Object.assign({ produtoId: preco.produtoId, formaPagamento: forma, moedaExibida: 'BRL' }, forma === 'boleto' ? { cpfCnpj: doc } : {}));
          tela2(o, pedido);
        } catch (x) {
          err.textContent = x.status === 400 ? t('docErr') : (x.message && x.status < 500 ? x.message : t('falha'));
          btn.disabled = false;
        }
      };
    }
    function tela2(o, pedido) {
      var corpo = forma === 'boleto'
        ? '<p class="sub">' + t('boletoD') + '</p><div class="copyline"><input id="ck-cod" readonly value="' + esc(pedido.boleto && pedido.boleto.linhaDigitavel) + '"><button class="btn sm" id="ck-cp">' + tr('copy') + '</button></div>' +
          (pedido.boleto && pedido.boleto.link ? '<a class="btn block" href="' + esc(pedido.boleto.link) + '" target="_blank" rel="noopener">' + t('abrirBoleto') + '</a>' : '')
        : '<p class="sub">' + t('pixD') + '</p><div class="qr">' + (pedido.pix && pedido.pix.imagem ? '<img alt="QR Code Pix" width="180" height="180" src="' + esc(pedido.pix.imagem) + '">' : '') +
          '<b class="num" style="font-size:20px">' + reais(pedido.valorCentavos) + '</b>' +
          '<div class="copyline"><input id="ck-cod" readonly aria-label="Pix" value="' + esc(pedido.pix && pedido.pix.copiaECola) + '"><button class="btn sm" id="ck-cp">' + tr('copy') + '</button></div></div>';
      o.querySelector('.sheet').innerHTML = '<h2>' + (forma === 'boleto' ? t('boleto') : tr('pixT')) + '</h2>' + corpo +
        '<p class="muted" id="ck-st" style="text-align:center;margin:4px 0">' + t('aguardando') + '</p>' +
        (preco.demo ? '<div class="callout warn">' + icon('alert', 18) + '<span>' + t('demoAviso') + '</span></div>' : '') +
        (preco.simulado ? '<button class="btn safe block" id="ck-sim">' + t('simular') + '</button>' : '') +
        '<button class="btn block" data-a="close">' + tr('close') + '</button>';
      o.querySelector('#ck-cp').onclick = function () {
        try { navigator.clipboard.writeText(o.querySelector('#ck-cod').value).then(function () { toast(tr('copied')); }, function () {}); } catch (e) {}
      };
      var sim = o.querySelector('#ck-sim');
      if (sim && preco.demo) { sim.onclick = function () { concluir(pedido); }; return; }
      if (sim) sim.onclick = function () { sim.disabled = true; api('POST', '/api/teste/simular', { pedidoId: pedido.id, tipo: 'pago' }).catch(function () { sim.disabled = false; }); };
      esperar(o, pedido);
    }
    // Confere a situação do pedido até ser pago (ou a tela ser fechada).
    function esperar(o, pedido) {
      var vezes = 0;
      var conferir = async function () {
        if (!document.body.contains(o)) return;
        try {
          var p = await api('GET', '/api/pedidos/' + pedido.id);
          if (p.status === 'pago') return concluir(pedido);
          if (p.status === 'cancelado') { o.querySelector('#ck-st').textContent = t('falha'); return; }
        } catch (e) {}
        vezes++;
        setTimeout(conferir, vezes < 40 ? 3000 : 15000);
      };
      setTimeout(conferir, 2000);
    }
    function concluir(pedido) {
      closeModal();
      opts.aoPagar(pedido, forma);
    }
    modal('', tela1);
  }

  // Compra de um produto (real ou demonstração de cliente). Pago: a compra entra no site como no
  // protótipo (chat e entrega), ligada ao pedido real quando houver.
  function checkoutProduto(c, forma) {
    var p = c.loja.prods[c.prodIndex];
    abrirCheckout({
      itens: '<div><span>' + esc(L(p.name, c.loja)) + '</span><b class="cv">' + coin(15) + fmtN(c.preco.valorKn) + '</b></div>',
      preco: c.preco,
      forma: forma,
      aoPagar: function (pedido) {
        var n = c.preco.valorKn, id = newId(), loja = c.loja;
        S.orders[id] = { id: id, shopId: loja.id, reserve: n, amount: n, opt: null, pi: [c.prodIndex], tl: null, status: 'andamento', created: Date.now(), started: Date.now(), pedidoReal: pedido.id || null };
        S.tab = 'chat';
        push(loja.id, { f: 'sys', key: 'm_prodBought', p: { pi: [c.prodIndex], n: n } });
        save(); render(); schedule(S.orders[id]); sellerSays(loja.id, 'm_started', {}, 900);
        toast(t('pago'));
      },
    });
  }

  // Outras compras do protótipo que passam pela tela antiga (vários produtos, reservar KN Coins,
  // lojas sem venda de verdade, demonstração): a tela nova, toda de mentira, e depois segue o protótipo.
  function checkoutDemonstracao(c, forma) {
    var n = c.n, brl = fxRate('BRL');
    abrirCheckout({
      antes: c.fx && c.fx.lines ? c.fx.lines : '',
      itens: '<div><span>KN Coins</span><b class="cv">' + coin(15) + fmtN(n) + '</b></div>',
      preco: { demo: true, valorKn: n, valorCentavos: Math.round(n * brl * 100), cotacao: { brl: brl, data: FX_DATE }, formas: ['pix', 'boleto'], simulado: true },
      forma: forma,
      aoPagar: function (_pedido, f) {
        S.wallet.av += n;
        tx('tx_buy', { m: f === 'boleto' ? 'm_boleto' : 'm_pix', cur: 'BRL' }, n, 0);
        save(); render(); toast(tr('payOkToast'));
        if (c.after) c.after();
      },
    });
  }

  // ---------- tela antiga "Pagar pedido" (openBuy do protótipo) ----------
  // Decisão dos donos: a tela antiga continua, só com Pix, Boleto e Cartão (em breve). Clicando
  // em Pix ou Boleto (ou no botão de baixo), abre a tela nova com essa forma já escolhida.
  var pendente = null; // compra de produto preparada pelo "comprar" antes de abrir a tela antiga
  var contexto = null; // a tela antiga aberta agora
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest && e.target.closest('.overlay .sheet .methods3 .method, .overlay .sheet #buy-go');
    if (!b || !contexto) return;
    var sheet = b.closest('.sheet');
    if (!sheet || !sheet.querySelector('.curpick')) return; // só na tela antiga
    e.preventDefault();
    e.stopImmediatePropagation();
    var m = b.id === 'buy-go' ? ((sheet.querySelector('.methods3 .method[aria-pressed="true"]') || {}).dataset || {}).m || 'm_pix' : b.dataset.m;
    if (m === 'm_card') return toast(t('cartaoEmBreve'));
    var forma = m === 'm_boleto' ? 'boleto' : 'pix', c = contexto;
    contexto = null;
    closeModal();
    if (c.produto) checkoutProduto(c.produto, forma); else checkoutDemonstracao(c, forma);
  }, true);
  var estilo = document.createElement('style');
  estilo.textContent = '.sheet .methods3 .method[data-m="m_card"]{opacity:.55;cursor:not-allowed}';
  document.head.appendChild(estilo);

  // ---------- "Minha loja": como o vendedor recebe ----------
  var rec = { estado: null, editando: false, carregando: false };
  function painelRecebimento() {
    if (!rec.estado) {
      if (!rec.carregando) {
        rec.carregando = true;
        api('GET', '/api/loja/recebimento').then(function (r) { rec.estado = r; }, function () { rec.estado = { situacao: 'sem_loja' }; })
          .then(function () { rec.carregando = false; if (S.view === 'minhaloja') { var y = scrollY; render(); scrollTo(0, y); } });
      }
      return '';
    }
    if (rec.estado.situacao === 'sem_loja') return '';
    var r = rec.estado.recebedor || {}, pix = r.pix || {};
    if (rec.estado.situacao === 'pronto' && !rec.editando) {
      return '<section class="panel" id="km-rec" style="margin-bottom:16px"><div style="display:flex;gap:12px;justify-content:space-between;align-items:center;flex-wrap:wrap">' +
        '<span>' + icon('check', 16) + ' <b>' + t('recPronto') + '</b> <span class="muted">· ' + esc((t('tipos')[pix.tipo] || pix.tipo || '') + ' ' + (pix.chave || '')) + '</span></span>' +
        '<button class="btn sm" id="km-rec-alt">' + t('recAlterar') + '</button></div></section>';
    }
    var tipos = t('tipos');
    return '<section class="panel" id="km-rec" style="margin-bottom:16px"><h2>' + t('recT') + '</h2><p class="sub">' + t('recD') + '</p>' +
      '<form id="km-rec-form" novalidate style="display:grid;gap:10px">' +
      '<div class="field"><label for="rec-nome">' + t('recNome') + '</label><input id="rec-nome" value="' + esc(r.nome || '') + '"></div>' +
      '<div class="field"><label for="rec-doc">' + t('recDoc') + '</label><input id="rec-doc" inputmode="numeric" value="' + esc(r.documento || '') + '"></div>' +
      '<div class="field"><label for="rec-tipo">' + t('recTipo') + '</label><select id="rec-tipo" class="select">' +
        Object.keys(tipos).map(function (k) { return '<option value="' + k + '"' + (pix.tipo === k ? ' selected' : '') + '>' + tipos[k] + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="rec-chave">' + t('recChave') + '</label><input id="rec-chave" value="' + esc(pix.chave || '') + '"></div>' +
      '<p class="err" id="rec-err"></p><button class="btn primary" type="submit">' + t('recSalvar') + '</button></form></section>';
  }
  document.addEventListener('click', function (e) {
    if (e.target && e.target.closest && e.target.closest('#km-rec-alt')) { rec.editando = true; var y = scrollY; render(); scrollTo(0, y); }
  });
  document.addEventListener('submit', async function (e) {
    if (!e.target || e.target.id !== 'km-rec-form') return;
    e.preventDefault(); e.stopImmediatePropagation();
    var g = function (id) { return document.getElementById(id).value.trim(); };
    var err = document.getElementById('rec-err'), b = e.target.querySelector('button[type=submit]');
    b.disabled = true; err.textContent = '';
    try {
      rec.estado = await api('PUT', '/api/loja/recebimento', { nome: g('rec-nome'), cpfCnpj: g('rec-doc'), pix: { tipo: g('rec-tipo'), chave: g('rec-chave') } });
      rec.editando = false; var y = scrollY; render(); scrollTo(0, y); toast(t('recOk'));
    } catch (x) {
      err.textContent = x.status === 400 ? (x.message || t('recErr')) : t('falha');
      b.disabled = false;
    }
  }, true);

  // ---------- ligar às funções do protótipo (depois que a página carrega) ----------
  document.addEventListener('DOMContentLoaded', function () {
    window.payMethods = function () { return ['m_pix', 'm_boleto', 'm_card']; };
    var nomeForma = window.mName;
    window.mName = function (k) { return k === 'm_card' ? tr('m_card') + ' (' + t('embreve') + ')' : nomeForma.apply(this, arguments); };
    var telaAntiga = window.openBuy;
    window.openBuy = function (pre, after, fx) {
      contexto = { n: Math.max(1, Math.round(pre || 0)), after: after, fx: fx, produto: pendente };
      pendente = null;
      return telaAntiga.apply(this, arguments);
    };

    var comprar = A.buyprods;
    A.buyprods = async function () {
      var args = arguments, self = this;
      var demo = function () { return comprar.apply(self, args); };
      var s = shopById(S.shopId);
      if (!S.user || !s || activeOrder(s.id)) return demo();
      var pi = [].map.call(document.querySelectorAll('.pk:checked'), function (x) { return +x.value; });
      if (!pi.length) return demo();
      var tl = document.getElementById('tlk'), umSo = pi.length === 1 && !(tl && tl.checked);
      var preco = null;
      if (!contaReal()) {
        // conta de demonstração de cliente: a tela nova, toda de mentira (um produto, sem tradução)
        if (S.user.role !== 'cliente' || !umSo) return demo();
        var kn = s.prods[pi[0]].price, brl = fxRate('BRL');
        preco = { demo: true, valorKn: kn, valorCentavos: Math.round(kn * brl * 100), cotacao: { brl: brl, data: FX_DATE }, formas: ['pix', 'boleto'], simulado: true };
      } else {
        try { preco = await api('GET', '/api/pedidos/preco?loja=' + encodeURIComponent(s.id) + '&produto=' + encodeURIComponent(s.prods[pi[0]].id)); } catch (e) { return demo(); }
        if (!preco.pode) return demo(); // loja sem venda de verdade: compra de demonstração
        if (!umSo) return toast(t('umPorVez'));
      }
      // abre a tela antiga com o produto; a forma escolhida nela abre a tela nova
      var p = s.prods[pi[0]];
      pendente = { loja: s, prodIndex: pi[0], preco: preco };
      openBuy(preco.valorKn, null, { s: s, lines: '<div class="sumbox"><div><span>' + esc(L(p.name, s)) + '</span><b class="cv">' + coin(15) + fmtN(p.price) + '</b></div></div>' });
    };

    var minhaLoja = window.vMyStore;
    window.vMyStore = function () {
      var h = minhaLoja.apply(this, arguments);
      if (!contaReal() || S.user.papel !== 'vendedor' || !S.myStore) return h;
      return h.replace('<div class="wrap">', '<div class="wrap">' + painelRecebimento());
    };
  });
})();
