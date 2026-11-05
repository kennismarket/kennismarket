/* Chat real entre cliente e vendedor (etapa 5), ligado às telas do protótipo.
 *
 * Só contas reais (S.user.contaId) e lojas com vendedor de verdade. Contas de demonstração e as
 * lojas do dono continuam com o robô do protótipo, como antes.
 *
 * - Cliente (chat da loja): as mensagens vêm do servidor (GET /api/chat/loja/<id>) e entram no
 *   chat do protótipo (S.chats), conferindo a cada poucos segundos. Mandar mensagem grava no
 *   servidor (POST), e o robô não responde mais. Os avisos do protótipo (contato por fora, golpe)
 *   continuam; o servidor marca a conversa para o suporte.
 *   As mensagens automáticas do pagamento ("Você comprou…", "Combinado! Já comecei…") são
 *   gravadas pelo servidor quando o pagamento é confirmado (pedido dos donos).
 * - Vendedor (Minha loja → Chat): cada conversa aparece na lista de pedidos. Se o cliente já
 *   comprou, a conversa fica no pedido mais recente dele; se não, aparece como "Conversa".
 * - Mensagem nova: bolinha no menu ("Meus pedidos"), aviso no topo de "Meus pedidos" e na lista
 *   do vendedor.
 * - Dono: "Conversas marcadas" e "Ver conversa" nos chamados de suporte (só conversas marcadas
 *   ou com pedido de reembolso, decisão dos donos).
 * - Entrega: o vendedor anexa arquivos feitos para aquele cliente na janela "Entregar".
 */
(function () {
  'use strict';

  var TXT = {
    nl: { conversa: 'Gesprek', conversaCom: 'Gesprek vóór de aankoop', guarda: 'Deze klant heeft nog niets gekocht. Beantwoord vragen hier; de betaling gaat altijd via Kennismarket.',
      novaDe: 'Nieuw bericht van {n}', novas: 'Nieuwe berichten', naoEnviada: 'Bericht niet verzonden. Probeer het opnieuw.', semConversa: 'De klant heeft nog geen gesprek geopend.',
      verConversa: 'Gesprek bekijken', marcadasT: 'Gemarkeerde gesprekken', marcadasD: 'Gesprekken met contact buiten Kennismarket (telefoon, e-mail, buiten de site betalen) of het woord "oplichting". Alleen deze en gesprekken met een terugbetalingsverzoek kun je lezen.',
      nenhumaMarcada: 'Geen gemarkeerde gesprekken.', desmarcar: 'Markering weghalen', motivo: { contato_fora: 'contact buiten de site', golpe: 'oplichting', suporte: 'door support' },
      de: { cliente: 'Klant', vendedor: 'Verkoper', sistema: 'Automatisch' }, auto: '(automatisch)', fechar: 'Sluiten', semPermissao: 'Support leest alleen gemarkeerde gesprekken of gesprekken met een terugbetalingsverzoek.',
      anexarT: 'Bestanden voor deze klant', anexarD: 'Voeg het werk toe dat je voor deze klant hebt gemaakt (pdf, afbeelding, spreadsheet, video; max. 10 bestanden van 20 MB). Alleen deze klant, jij en support kunnen ze openen.',
      anexoTipo: 'Dit bestandstype wordt niet geaccepteerd: {n}', anexoTam: 'Bestand te groot (max. 20 MB): {n}', anexoMax: 'Maximaal 10 bestanden.', enviando: 'Bestanden uploaden…', anexos: 'Bestanden geleverd: {v}' },
    en: { conversa: 'Conversation', conversaCom: 'Conversation before purchase', guarda: 'This customer hasn’t bought anything yet. Answer questions here; payment always goes through Kennismarket.',
      novaDe: 'New message from {n}', novas: 'New messages', naoEnviada: 'Message not sent. Please try again.', semConversa: 'The customer hasn’t opened a conversation yet.',
      verConversa: 'View conversation', marcadasT: 'Flagged conversations', marcadasD: 'Conversations with contact outside Kennismarket (phone, email, paying outside the site) or the word "scam". You can only read these and conversations with a refund request.',
      nenhumaMarcada: 'No flagged conversations.', desmarcar: 'Remove flag', motivo: { contato_fora: 'contact outside the site', golpe: 'scam', suporte: 'by support' },
      de: { cliente: 'Customer', vendedor: 'Seller', sistema: 'Automatic' }, auto: '(automatic)', fechar: 'Close', semPermissao: 'Support only reads flagged conversations or those with a refund request.',
      anexarT: 'Files for this customer', anexarD: 'Attach the work you made for this customer (PDF, image, spreadsheet, video; up to 10 files of 20 MB). Only this customer, you and support can open them.',
      anexoTipo: 'This file type isn’t accepted: {n}', anexoTam: 'File too large (max. 20 MB): {n}', anexoMax: 'Up to 10 files.', enviando: 'Uploading files…', anexos: 'Files delivered: {v}' },
    es: { conversa: 'Conversación', conversaCom: 'Conversación antes de la compra', guarda: 'Este cliente todavía no compró nada. Responde las dudas aquí; el pago siempre pasa por Kennismarket.',
      novaDe: 'Nuevo mensaje de {n}', novas: 'Mensajes nuevos', naoEnviada: 'Mensaje no enviado. Inténtalo de nuevo.', semConversa: 'El cliente todavía no abrió una conversación.',
      verConversa: 'Ver conversación', marcadasT: 'Conversaciones marcadas', marcadasD: 'Conversaciones con contacto fuera de Kennismarket (teléfono, correo, pagar por fuera) o la palabra "estafa". Solo puedes leer estas y las que tienen pedido de reembolso.',
      nenhumaMarcada: 'No hay conversaciones marcadas.', desmarcar: 'Quitar marca', motivo: { contato_fora: 'contacto por fuera', golpe: 'estafa', suporte: 'por soporte' },
      de: { cliente: 'Cliente', vendedor: 'Vendedor', sistema: 'Automático' }, auto: '(automático)', fechar: 'Cerrar', semPermissao: 'Soporte solo lee conversaciones marcadas o con pedido de reembolso.',
      anexarT: 'Archivos para este cliente', anexarD: 'Adjunta el trabajo que hiciste para este cliente (PDF, imagen, hoja de cálculo, video; hasta 10 archivos de 20 MB). Solo este cliente, tú y soporte pueden abrirlos.',
      anexoTipo: 'Este tipo de archivo no se acepta: {n}', anexoTam: 'Archivo demasiado grande (máx. 20 MB): {n}', anexoMax: 'Hasta 10 archivos.', enviando: 'Subiendo archivos…', anexos: 'Archivos entregados: {v}' },
    pt: { conversa: 'Conversa', conversaCom: 'Conversa antes da compra', guarda: 'Este cliente ainda não comprou nada. Tire as dúvidas aqui; o pagamento sempre passa pelo Kennismarket.',
      novaDe: 'Mensagem nova de {n}', novas: 'Mensagens novas', naoEnviada: 'Mensagem não enviada. Tente de novo.', semConversa: 'O cliente ainda não abriu uma conversa.',
      verConversa: 'Ver conversa', marcadasT: 'Conversas marcadas', marcadasD: 'Conversas com contato fora do Kennismarket (telefone, e-mail, pagar por fora) ou a palavra "golpe". Vocês só leem estas e as que têm pedido de reembolso.',
      nenhumaMarcada: 'Nenhuma conversa marcada.', desmarcar: 'Tirar a marcação', motivo: { contato_fora: 'contato por fora', golpe: 'golpe', suporte: 'pelo suporte' },
      de: { cliente: 'Cliente', vendedor: 'Vendedor', sistema: 'Automática' }, auto: '(automática)', fechar: 'Fechar', semPermissao: 'O suporte só lê conversas marcadas ou com pedido de reembolso.',
      anexarT: 'Arquivos para este cliente', anexarD: 'Anexe o trabalho que você fez para este cliente (PDF, imagem, planilha, vídeo; até 10 arquivos de 20 MB). Só este cliente, você e o suporte abrem.',
      anexoTipo: 'Este tipo de arquivo não é aceito: {n}', anexoTam: 'Arquivo grande demais (máx. 20 MB): {n}', anexoMax: 'No máximo 10 arquivos.', enviando: 'Enviando os arquivos…', anexos: 'Arquivos entregues: {v}' },
  };
  function lg() { return (typeof S !== 'undefined' && S.lang) || 'nl'; }
  function t(k, vars) {
    var s = (TXT[lg()] || TXT.nl)[k];
    if (typeof s === 'string' && vars) Object.keys(vars).forEach(function (v) { s = s.replace('{' + v + '}', vars[v]); });
    return s;
  }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function contaReal() { return typeof S !== 'undefined' && S.user && S.user.contaId; }
  function idCurto(id) { return 'C' + String(id).replace(/-/g, '').slice(0, 5).toUpperCase(); }
  function quando(em) { return Date.parse(em) || Date.now(); }
  async function api(metodo, caminho, corpo) {
    var tk = window.kmToken ? await window.kmToken() : null;
    var r = await fetch(caminho, { method: metodo, headers: Object.assign({ 'Content-Type': 'application/json' }, tk ? { Authorization: 'Bearer ' + tk } : {}), body: corpo ? JSON.stringify(corpo) : undefined });
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok) throw Object.assign(new Error(j.erro || 'erro'), { status: r.status });
    return j;
  }
  // Mesmos tipos de arquivo que o servidor aceita (server/routes/prototipo.js, TIPOS).
  var TIPOS = ['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'video/mp4', 'video/webm', 'text/plain', 'text/csv', 'text/markdown', 'application/json'];
  var PLANILHA = { xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };

  // ======================= cliente: chat da loja =======================
  var lojas = {}; // { [pid]: { real, ultimo, carregando, quando } }
  function estado(pid) { return lojas[pid] || (lojas[pid] = { real: null, ultimo: 0, carregando: false, quando: 0 }); }
  function realNaLoja(pid) { return contaReal() && estado(pid).real === true; }

  // Mensagem do servidor → mensagem do chat do protótipo (lado do cliente).
  function paraCliente(m, s) {
    var base = { ts: quando(m.em), srv: m.id };
    if (m.chave === 'm_prodBought') {
      var pi = -1;
      (s.prods || []).forEach(function (p, i) { if (m.params && String(p.id) === String(m.params.produto)) pi = i; });
      return pi < 0 ? null : Object.assign(base, { f: 'sys', key: 'm_prodBought', p: { pi: [pi], n: m.params.n } });
    }
    if (m.chave) return Object.assign(base, { f: m.de === 'cliente' ? 'me' : m.de === 'vendedor' ? 'them' : 'sys', key: m.chave, p: {} });
    return Object.assign(base, { f: m.de === 'cliente' ? 'me' : 'them', t: m.texto });
  }
  function juntar(lista, novas, converter, pegar) {
    var mudou = false;
    novas.forEach(function (m) {
      if (lista.some(function (x) { return x.srv === m.id; })) return;
      var x = converter(m);
      if (!x) return;
      // a mensagem que eu mesmo mandei (ainda sem confirmação): só marca como confirmada
      var pend = x.t && lista.filter(function (y) { return y.pend && y.t === x.t && y.f === x.f; })[0];
      if (pend) { pend.pend = false; pend.srv = m.id; return; }
      pegar(x); mudou = true;
    });
    return mudou;
  }
  async function sincronizarLoja(pid, forcar) {
    if (!contaReal()) return;
    var e = estado(pid);
    if (e.carregando || e.real === false || (!forcar && Date.now() - e.quando < 3000)) return;
    e.carregando = true;
    try {
      var r = await api('GET', '/api/chat/loja/' + pid + (e.ultimo ? '?depois=' + e.ultimo : ''));
      e.quando = Date.now();
      if (!r.real) { e.real = false; return; }
      var primeira = e.real !== true;
      e.real = true;
      var s = shopById(pid);
      if (!s) return;
      var msgs = r.mensagens || [];
      msgs.forEach(function (m) { if (m.id > e.ultimo) e.ultimo = m.id; });
      var mudou = juntar(chat(pid), msgs, function (m) { return paraCliente(m, s); }, function (x) { chat(pid).push(x); });
      if (mudou || primeira) { save(); if (S.view === 'loja' && S.shopId === pid) refreshAtend(pid); }
      if (mudou) atualizarAvisos(true);
    } catch (x) { /* tenta de novo depois */ } finally { e.carregando = false; }
  }

  async function enviarCliente(s, texto) {
    var o = activeOrder(s.id);
    var msg = { f: 'me', t: texto, pend: true };
    push(s.id, msg);
    if (typeof OFF !== 'undefined' && OFF.test(texto)) push(s.id, { f: 'sys', k: 'alert', key: 'm_offAlert' });
    if (typeof SCAM !== 'undefined' && SCAM.test(texto)) {
      if (typeof scamFlag === 'function') scamFlag(s, o, texto);
      setTimeout(function () { push(s.id, { f: 'sys', k: 'alert', key: 'm_scam', scam: 1 }); }, 1200);
    }
    try {
      var r = await api('POST', '/api/chat/loja/' + s.id + '/mensagens', { texto: texto });
      msg.pend = false; msg.srv = r.mensagem.id;
      var e = estado(s.id); if (r.mensagem.id > e.ultimo) e.ultimo = r.mensagem.id;
      save();
    } catch (x) {
      msg.pend = false; msg.erro = true; save();
      toast(t('naoEnviada'));
    }
  }

  // ======================= aviso de mensagem nova =======================
  var avisos = { cliente: [], vendedor: [], quando: 0, carregando: false, conta: null };
  async function atualizarAvisos(forcar) {
    if (!contaReal() || avisos.carregando) return;
    if (avisos.conta !== S.user.contaId) avisos = { cliente: [], vendedor: [], quando: 0, carregando: false, conta: S.user.contaId };
    if (!forcar && Date.now() - avisos.quando < 15000) return;
    avisos.carregando = true;
    try {
      var antes = JSON.stringify([avisos.cliente, avisos.vendedor]);
      var c = await api('GET', '/api/chat/conversas');
      avisos.cliente = c.conversas.filter(function (x) { return x.nova; });
      if (S.user.papel === 'vendedor') {
        var v = await api('GET', '/api/chat/conversas?papel=vendedor');
        avisos.vendedor = v.conversas;
        if (S.myStore) aplicarConversasVendedor(v.conversas.filter(function (x) { return x.loja.prototipoId === S.myStore.id; }));
      }
      avisos.quando = Date.now();
      if (antes !== JSON.stringify([avisos.cliente, avisos.vendedor])) {
        if (S.view === 'pedidos' || S.view === 'minhaloja') { var y = scrollY; render(); scrollTo(0, y); } else refreshChrome();
      }
    } catch (x) { /* tenta de novo depois */ } finally { avisos.carregando = false; }
  }
  function temNova() {
    return avisos.cliente.length > 0 || avisos.vendedor.some(function (x) { return x.nova; });
  }
  // Põe a bolinha no botão "Meus pedidos" (menu de cima e de baixo), se ainda não tiver.
  function comBolinha(h) {
    if (!contaReal() || !temNova()) return h;
    return h.replace(/(<button[^>]*data-v="pedidos"[^>]*>)([\s\S]*?)(<\/button>)/, function (tudo, a, meio, z) {
      return meio.indexOf('dotn') >= 0 ? tudo : a + meio + '<i class="dotn" aria-label="' + esc(t('novas')) + '"></i>' + z;
    });
  }

  // ======================= vendedor: Minha loja → Chat =======================
  // Conversa → item da lista: o pedido real mais recente do cliente, ou um item "Conversa".
  function itemDaConversa(c) {
    var pedidos = S.sorders.filter(function (o) { return o.real && o.clienteId === c.clienteId; }).sort(function (a, b) { return b.ts - a.ts; });
    var conversa = S.sorders.filter(function (o) { return o.status === 'conversa' && o.conv === c.id; })[0];
    if (pedidos.length) {
      var alvo = pedidos[0];
      if (conversa) { // o cliente comprou: a conversa passa para o pedido
        (conversa.msgs || []).forEach(function (m) { if (!(alvo.msgs || []).some(function (x) { return x.srv && x.srv === m.srv; })) soMsgs(alvo).push(m); });
        soMsgs(alvo).sort(function (a, b) { return a.ts - b.ts; });
        alvo.kmUltimo = Math.max(alvo.kmUltimo || 0, conversa.kmUltimo || 0);
        S.sorders = S.sorders.filter(function (o) { return o !== conversa; });
        if (S.selOrder === conversa.id) S.selOrder = alvo.id;
      }
      alvo.conv = c.id;
      return alvo;
    }
    if (!conversa) {
      conversa = { id: idCurto(c.id), conv: c.id, clienteId: c.clienteId, buyer: c.cliente || '?', opt: null, pi: null, amount: 0, ts: quando(c.ultimaEm), status: 'conversa', msgs: [] };
      S.sorders.unshift(conversa);
    }
    return conversa;
  }
  function aplicarConversasVendedor(conversas) {
    conversas.forEach(function (c) {
      var o = itemDaConversa(c);
      o.kmNova = c.nova && !(S.view === 'minhaloja' && S.selOrder === o.id);
      if (o.status === 'conversa') o.ts = quando(c.ultimaEm);
    });
    save();
    // só abre (e marca como lida) a conversa que está na tela
    var sel = S.sorders.filter(function (o) { return o.id === S.selOrder; })[0];
    if (sel && sel.conv && S.view === 'minhaloja') sincronizarItem(sel);
  }
  function paraVendedor(m) {
    var base = { ts: quando(m.em), srv: m.id };
    if (m.chave === 'm_prodBought') return null; // o vendedor já vê "Pedido pago"
    if (m.chave) return Object.assign(base, { f: m.de === 'vendedor' ? 'me' : 'them', key: m.chave, p: {} });
    return Object.assign(base, { f: m.de === 'vendedor' ? 'me' : 'them', t: m.texto });
  }
  var itens = {};
  async function sincronizarItem(o) {
    if (!o || !o.conv) return;
    var e = itens[o.conv] || (itens[o.conv] = { carregando: false });
    if (e.carregando) return;
    e.carregando = true;
    try {
      var r = await api('GET', '/api/chat/conversas/' + o.conv + '/mensagens' + (o.kmUltimo ? '?depois=' + o.kmUltimo : ''));
      (r.mensagens || []).forEach(function (m) { if (m.id > (o.kmUltimo || 0)) o.kmUltimo = m.id; });
      o.kmNova = false;
      if (juntar(soMsgs(o), r.mensagens || [], paraVendedor, function (x) { soMsgs(o).push(x); })) { save(); if (S.view === 'minhaloja' && S.selOrder === o.id) refreshSAtend(); }
    } catch (x) { /* tenta de novo depois */ } finally { e.carregando = false; }
  }
  async function enviarVendedor(o) {
    var m = soMsgs(o).filter(function (x) { return x.f === 'me' && x.t && !x.srv && !x.pend && !x.erro; }).pop();
    if (!m) return;
    if (!o.conv) { m.erro = true; save(); return toast(t('semConversa')); }
    m.pend = true;
    try {
      var r = await api('POST', '/api/chat/conversas/' + o.conv + '/mensagens', { texto: m.t });
      m.pend = false; m.srv = r.mensagem.id; if (r.mensagem.id > (o.kmUltimo || 0)) o.kmUltimo = r.mensagem.id; save();
    } catch (x) { m.pend = false; m.erro = true; save(); toast(t('naoEnviada')); }
  }
  function itemReal(o) { return contaReal() && o && (o.conv || o.real); }

  // Tela do item "Conversa" (sem pedido): o mesmo layout do atendimento do protótipo, sem as etapas do pedido.
  function atendConversa(o) {
    var s = S.myStore, primeiro = (o.buyer || '?').split(' ')[0];
    return '<div class="ahead"><div class="av sm" style="background:#526579">' + esc((o.buyer || '?')[0]) + '</div><div style="min-width:0;flex:1"><b>' + esc(o.buyer) + '</b><span>' + esc(t('conversaCom')) + '</span></div>' +
      '<span class="pill">' + esc(t('conversa')) + '</span>' + (typeof chatBigBtn === 'function' ? chatBigBtn() : '') + '</div>' +
      '<div class="guard"><div class="row">' + icon('chat', 18) + '<span>' + esc(t('guarda')) + '</span></div></div>' +
      '<div class="msgs" id="msgs" aria-live="polite">' + soMsgs(o).map(function (m) { return soMsgHTML(m, o, s); }).join('') + '</div>' +
      '<div class="typing" id="typing"></div>' +
      '<form class="composer" id="scf"><label class="sr" for="sci">' + tr('msgL') + '</label><input id="sci" autocomplete="off" placeholder="' + esc(tr('writeTo', { f: primeiro })) + '"><button type="submit" aria-label="' + tr('send') + '">' + icon('send', 20) + '</button></form>' +
      '<div class="secure-line">' + icon('lock', 13) + ' ' + tr('secureLine') + '</div>';
  }

  // ======================= dono: conversas =======================
  var marcadas = { lista: null, carregando: false, quando: 0 };
  function carregarMarcadas(forcar) {
    if (!window.KM_DONO || marcadas.carregando || (!forcar && marcadas.lista && Date.now() - marcadas.quando < 30000)) return;
    marcadas.carregando = true;
    api('GET', '/api/admin/conversas').then(function (r) { marcadas.lista = r.conversas; }, function () { marcadas.lista = marcadas.lista || []; })
      .then(function () { marcadas.carregando = false; marcadas.quando = Date.now(); if (S.view === 'admin') { var y = scrollY; render(); scrollTo(0, y); } });
  }
  function marcadasHTML() {
    carregarMarcadas(false);
    var l = marcadas.lista;
    var corpo = !l ? '<p class="muted">…</p>' : !l.length ? '<p class="muted">' + t('nenhumaMarcada') + '</p>' : l.map(function (c) {
      return '<div class="case"><div><b>' + esc(c.loja.nome) + ' · ' + esc(c.cliente) + '</b><span class="muted">' + esc(t('motivo')[c.marcada.motivo] || c.marcada.motivo) + ' · ' + (c.previa ? '“' + esc(c.previa) + '”' : esc(t('auto'))) + '</span></div>' +
        '<div class="case-r"><div class="acts"><button class="btn sm" data-a="kmdesmarcar" data-id="' + esc(c.id) + '">' + t('desmarcar') + '</button>' +
        '<button class="btn sm primary" data-a="kmverconversa" data-id="' + esc(c.id) + '">' + t('verConversa') + '</button></div></div></div>';
    }).join('');
    return '<div id="km-marcadas" style="margin:6px 0 18px"><span class="label">' + t('marcadasT') + '</span><p class="sub" style="margin:4px 0 8px">' + t('marcadasD') + '</p>' + corpo + '</div>';
  }
  async function verConversa(id) {
    try {
      var r = await api('GET', '/api/admin/conversas/' + id + '/mensagens');
      var de = t('de');
      var linhas = r.mensagens.map(function (m) {
        var txt = m.chave ? tr(m.chave, m.params && m.params.n != null ? { n: fmtN(m.params.n), o: m.params.titulo || '' } : {}) + ' ' + t('auto') : m.texto;
        return '<div class="msg ' + (m.de === 'vendedor' ? 'me' : 'them') + '" style="max-width:100%"><small class="muted" style="display:block;font-weight:600">' + esc(de[m.de] || m.de) + '</small>' + esc(txt) +
          '<time>' + esc(new Date(m.em).toLocaleString(lg() === 'pt' ? 'pt-BR' : lg())) + '</time></div>';
      }).join('');
      modal('<h2>' + esc(r.conversa.loja.nome) + ' · ' + esc(r.conversa.cliente) + '</h2>' +
        '<div class="msgs" style="max-height:60vh;overflow:auto;padding:4px 0">' + linhas + '</div>' +
        '<button class="btn block" data-a="close">' + t('fechar') + '</button>');
    } catch (x) { toast(x.status === 403 ? t('semPermissao') : (x.message || 'erro')); }
  }

  // ======================= anexos na entrega =======================
  var anexos = []; // arquivos escolhidos na janela "Entregar" aberta agora
  function tipoDoArquivo(f) {
    var ext = (f.name.split('.').pop() || '').toLowerCase();
    return f.type || PLANILHA[ext] || '';
  }
  window.kmEnviarAnexos = async function () {
    var lista = anexos.slice(); anexos = [];
    if (!lista.length) return [];
    toast(t('enviando'));
    var tk = window.kmToken ? await window.kmToken() : null;
    var feitos = [];
    for (var i = 0; i < lista.length; i++) {
      var f = lista[i];
      var r = await fetch('/api/prototipo/arquivos', { method: 'POST', headers: Object.assign({ 'Content-Type': tipoDoArquivo(f) }, tk ? { Authorization: 'Bearer ' + tk } : {}), body: f });
      var j = await r.json().catch(function () { return {}; });
      if (!r.ok) throw Object.assign(new Error(j.erro || 'erro'), { status: r.status });
      feitos.push({ id: j.id, nome: f.name });
    }
    return feitos;
  };
  window.kmTxtChat = t;
  window.kmSincronizarLoja = function (pid) { estado(pid).real = null; estado(pid).quando = 0; sincronizarLoja(pid, true); };

  // ======================= ligar às funções do protótipo =======================
  document.addEventListener('DOMContentLoaded', function () {
    Object.keys(TXT).forEach(function (l) { if (T[l]) T[l].km_anexos = TXT[l].anexos; });
    if (typeof SST !== 'undefined') SST.conversa = ['', 'km_conversa'];
    Object.keys(TXT).forEach(function (l) { if (T[l]) T[l].km_conversa = TXT[l].conversa; });

    // Cliente: mandar mensagem numa loja com vendedor de verdade grava no servidor (sem robô).
    var enviar = window.sendMsg;
    window.sendMsg = function (texto) {
      var s = shopById(S.shopId);
      if (!s || !realNaLoja(s.id)) return enviar.apply(this, arguments);
      enviarCliente(s, texto);
    };
    var atendimento = window.atendHTML;
    window.atendHTML = function (s) {
      if (s && contaReal()) sincronizarLoja(s.id, false);
      return atendimento.apply(this, arguments);
    };
    // mensagem que não foi: aparece com o aviso
    var textoMsg = window.msgText;
    window.msgText = function (m) {
      var r = textoMsg.apply(this, arguments);
      return m && m.erro ? r + ' ⚠ ' + t('naoEnviada') : r;
    };

    // Menu: bolinha de mensagem nova.
    var cima = window.topbar, baixo = window.tabbar;
    window.topbar = function () { atualizarAvisos(false); return comBolinha(cima.apply(this, arguments)); };
    window.tabbar = function () { return comBolinha(baixo.apply(this, arguments)); };
    // Meus pedidos: aviso das conversas com mensagem nova (abre o chat da loja).
    var meusPedidos = window.vOrders;
    window.vOrders = function () {
      var h = meusPedidos.apply(this, arguments);
      if (!contaReal() || !avisos.cliente.length) return h;
      var bloco = '<div class="callout" style="margin:0 0 14px;display:grid;gap:6px">' + avisos.cliente.map(function (c) {
        return '<button class="link" style="text-align:left" data-a="openorder" data-id="' + esc(c.loja.prototipoId) + '">' + icon('chat', 15) + ' ' + esc(t('novaDe', { n: c.loja.nome })) + (c.previa ? ': “' + esc(c.previa) + '”' : '') + '</button>';
      }).join('') + '</div>';
      return h.replace('<div class="ogrp">', bloco + '<div class="ogrp">').replace(/(<\/section>)/, '$1' + (h.indexOf('<div class="ogrp">') < 0 ? bloco : ''));
    };

    // Vendedor: lista, atendimento e detalhes entendem o item "Conversa"; responder grava no servidor.
    var listaPedidos = window.soListHTML;
    window.soListHTML = function () {
      if (!contaReal() || !S.sorders.some(function (o) { return o.status === 'conversa' || o.kmNova; })) return listaPedidos.apply(this, arguments);
      return S.sorders.map(function (o) {
        var titulo = o.status === 'conversa' ? t('conversaCom') : soTitle(o);
        return '<button class="order ' + (S.selOrder === o.id ? 'sel' : '') + '" data-a="selorder" data-id="' + esc(o.id) + '"><div class="av sm" style="background:#526579">' + esc((o.buyer || '?')[0]) + '</div>' +
          '<div class="t"><b>' + esc(titulo) + '</b><span>' + esc(o.buyer) + (o.status === 'conversa' ? '' : ' · ' + tr('order') + ' ' + esc(o.id)) + '</span></div>' +
          '<div class="r"><span class="pill ' + SST[o.status][0] + '">' + tr(SST[o.status][1]) + (o.kmNova ? ' <i class="dotn" aria-label="' + esc(t('novas')) + '"></i>' : '') + '</span>' +
          (o.status === 'conversa' ? '' : '<b class="cv">' + coin(16) + fmtN(o.amount) + '</b>') + '</div></button>';
      }).join('');
    };
    var atendVendedor = window.sellerAtend;
    window.sellerAtend = function (o) {
      if (o && o.status === 'conversa') return atendConversa(o);
      return atendVendedor.apply(this, arguments);
    };
    var detalhes = window.soDetailHTML;
    window.soDetailHTML = function () {
      var o = S.sorders.filter(function (x) { return x.id === S.selOrder; })[0];
      if (o && o.status === 'conversa') {
        return '<h2>' + esc(t('conversaCom')) + '</h2><div class="facts" style="grid-template-columns:1fr"><div>' + icon('user', 18) + '<span>' + tr('spBuyer') + ': <b>' + esc(o.buyer) + '</b></span></div>' +
          '<div>' + icon('clock', 18) + '<span>' + fmtD(o.ts) + ' · ' + fmtT(o.ts) + '</span></div></div>';
      }
      return detalhes.apply(this, arguments);
    };
    var responder = window.sellerReply;
    window.sellerReply = function (o) {
      if (itemReal(o)) return enviarVendedor(o);
      return responder.apply(this, arguments);
    };
    var selecionar = A.selorder;
    A.selorder = function (el) {
      var r = selecionar.apply(this, arguments);
      var o = S.sorders.filter(function (x) { return x.id === el.dataset.id; })[0];
      if (itemReal(o)) { o.kmNova = false; sincronizarItem(o); var l = document.getElementById('solist'); if (l) l.innerHTML = soListHTML(); }
      return r;
    };
    var minhaLoja = window.vMyStore;
    window.vMyStore = function () {
      if (contaReal() && S.user.papel === 'vendedor') atualizarAvisos(false);
      var h = minhaLoja.apply(this, arguments);
      // bolinha na aba "Chat" quando há conversa com mensagem nova
      if (contaReal() && S.sorders.some(function (o) { return o.kmNova; })) {
        h = h.replace(/(<button data-a="tab" data-t="chat"[^>]*>)([^<]*)(<\/button>)/, function (tudo, a, meio, z) { return a + meio + '<i class="dotn"></i>' + z; });
      }
      return h;
    };

    // Vendedor: "Entregar" num pedido real ganha "Arquivos para este cliente".
    var entregarJanela = A.deliverdlg;
    A.deliverdlg = function () {
      anexos = [];
      var r = entregarJanela.apply(this, arguments);
      var o = S.sorders.filter(function (x) { return x.id === S.selOrder; })[0];
      var sheet = document.querySelector('.overlay .sheet');
      if (!contaReal() || !o || !o.real || !sheet) return r;
      var bloco = document.createElement('div');
      bloco.className = 'field';
      bloco.innerHTML = '<label for="km-anexo">' + esc(t('anexarT')) + '</label><input id="km-anexo" type="file" multiple><small class="muted">' + esc(t('anexarD')) + '</small><div id="km-anexo-lista" class="so-items"></div>';
      var nota = sheet.querySelector('.note');
      sheet.insertBefore(bloco, nota || sheet.querySelector('#ok'));
      bloco.querySelector('#km-anexo').onchange = function () {
        var err = sheet.querySelector('#dl-err');
        anexos = [];
        var problema = '';
        [].forEach.call(this.files, function (f) {
          if (anexos.length >= 10) { problema = t('anexoMax'); return; }
          if (TIPOS.indexOf(tipoDoArquivo(f)) < 0) { problema = t('anexoTipo', { n: f.name }); return; }
          if (f.size > 20 * 1024 * 1024) { problema = t('anexoTam', { n: f.name }); return; }
          anexos.push(f);
        });
        if (err) err.textContent = problema;
        bloco.querySelector('#km-anexo-lista').innerHTML = anexos.map(function (f) { return '<span class="check">' + icon('file', 15) + ' ' + esc(f.name) + '</span>'; }).join('');
      };
      return r;
    };

    // Dono: conversas marcadas (acima dos chamados reais) e "Ver conversa".
    if (typeof window.vAdminDono === 'function') {
      var painel = window.vAdminDono;
      window.vAdminDono = function () {
        var h = painel.apply(this, arguments);
        if (!window.KM_DONO || !contaReal()) return h;
        var i = h.indexOf('<div id="km-casos"');
        return i < 0 ? h : h.slice(0, i) + marcadasHTML() + h.slice(i);
      };
    }
    A.kmverconversa = function (el) { verConversa(el.dataset.id); };
    A.kmdesmarcar = function (el) {
      el.disabled = true;
      api('POST', '/api/admin/conversas/' + el.dataset.id + '/marcar', { marcada: false }).then(function () { carregarMarcadas(true); }, function () { el.disabled = false; });
    };

    // Confere de tempos em tempos: o chat aberto a cada 4 segundos; o resto a cada 20.
    setInterval(function () {
      if (!contaReal() || document.hidden) return;
      if (S.view === 'loja' && S.shopId != null && estado(S.shopId).real) sincronizarLoja(S.shopId, true);
      if (S.view === 'minhaloja') {
        var sel = S.sorders.filter(function (o) { return o.id === S.selOrder; })[0];
        if (itemReal(sel)) sincronizarItem(sel);
      }
    }, 4000);
    setInterval(function () { if (contaReal() && !document.hidden) atualizarAvisos(true); }, 20000);
  });
})();
