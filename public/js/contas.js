/* Login real (Supabase Auth) ligado às telas do protótipo.
 *
 * O protótipo fazia login de mentira: qualquer usuário e senha entravam, e as contas de
 * vendedor guardavam um hash da senha num documento que todo mundo podia ler.
 * Aqui as mesmas telas passam a usar o servidor (server/routes/contas.js):
 *   - tela inicial: entrar com o nome de usuário ou o e-mail, e criar conta de cliente;
 *   - link de convite do vendedor (#convite-<token>): criar a conta, entrar e trocar a senha
 *     pelo link novo que o dono gera no painel;
 *   - página "Minha conta": nome, usuário e e-mail, e "Alterar senha";
 *   - conta de dono: mesma tela inicial; só ela vê e abre o painel do dono, que ganha a seção
 *     "Contas" (buscar, senha temporária, banir);
 *   - "Excluir conta" na página da conta, com a senha.
 * Os botões de "conta de demonstração" continuam como no protótipo (só no navegador).
 *
 * As funções do protótipo são trocadas depois que a página carrega (DOMContentLoaded),
 * porque elas são declaradas mais abaixo na página. O servidor também faz alguns ajustes
 * na página (server/lib/pagina-prototipo.js): o painel e o editor de lojas chamam
 * kmSemAcesso() quando não é o dono, e o botão do painel só aparece com KM_DONO.
 */
(function () {
  'use strict';
  var CHAVE = 'km-sessao';
  var cfg = null;      // { supabaseUrl, supabasePublishableKey }
  var sessao = null;   // { access, refresh, exp }
  var checando = true; // enquanto confere a sessão guardada, o painel mostra "Conferindo..."

  var TXT = {
    nl: { checando: 'Bezig met controleren…', invalido: 'Gebruikersnaam of wachtwoord onjuist.', emailUso: 'Dit e-mailadres heeft al een account.', senhaErrada: 'Je huidige wachtwoord klopt niet.', falha: 'Er ging iets mis. Probeer het opnieuw.' },
    en: { checando: 'Checking…', invalido: 'Wrong username or password.', emailUso: 'This email already has an account.', senhaErrada: 'Your current password is wrong.', falha: 'Something went wrong. Please try again.' },
    es: { checando: 'Comprobando…', invalido: 'Usuario o contraseña incorrectos.', emailUso: 'Este correo ya tiene una cuenta.', senhaErrada: 'Tu contraseña actual no es correcta.', falha: 'Algo salió mal. Inténtalo de nuevo.' },
    pt: { checando: 'Conferindo…', invalido: 'Usuário ou senha incorretos.', emailUso: 'Este e-mail já tem uma conta.', senhaErrada: 'Sua senha atual está incorreta.', falha: 'Algo deu errado. Tente de novo.' },
  };
  // Excluir conta, conta banida e a seção "Contas" do painel do dono.
  var TXT2 = {
    nl: { mvT: 'Mijn verkopen', mvD: 'Je echte, betaalde verkopen en jouw deel van elke verkoop.', mvSuaParte: 'Jouw deel', mvSemLoja: 'Je hebt nog geen winkel.', vDia: 'Afgelopen dag', v7: 'Afgelopen 7 dagen', v30: 'Afgelopen 30 dagen', vPeriodo: 'Periode', vT: 'Verkopers', vD: 'Alle verkopersaccounts met hun verkopen (alleen echte, betaalde bestellingen). Klik op een verkoper voor elke verkoop.', vVend: 'Verkoper', vLoja: 'Winkel', vVendas: 'Verkopen', vTotal: 'Totaal verkocht', vSemLoja: 'nog geen winkel', vNenhum: 'Nog geen verkopers.', vAtualizar: 'Vernieuwen', vCarregando: 'Laden…', vData: 'Datum', vProduto: 'Product', vValor: 'Bedrag', vSit: 'Status', vParte: 'Deel van de verkoper', vPct: '{n}% voor de verkoper', vNenhumaVenda: 'Nog geen verkopen.', vFechar: 'Sluiten', vRe: '{n} terugbetaald (niet meegeteld)', st: { pago: 'Betaald', entregue: 'Geleverd', concluido: 'Afgerond', reembolso_solicitado: 'Terugbetaling gevraagd', reembolsado: 'Terugbetaald' },
      excluirD: 'Je account wordt van Kennismarket verwijderd en je wordt uitgelogd. Dit kan niet ongedaan worden. Vul je wachtwoord in om te bevestigen.', senhaIncorreta: 'Wachtwoord onjuist.', contaDono: 'Een eigenaarsaccount kan hier niet worden verwijderd.', banida: 'Dit account is geblokkeerd. Neem contact op met support.',
      contasT: 'Accounts', contasD: 'Zoek een account op naam, gebruikersnaam of e-mail om een tijdelijk wachtwoord te maken of het account te blokkeren.', busca: 'Naam, gebruikersnaam of e-mail', buscar: 'Zoeken', min2: 'Typ minstens 2 tekens.', nenhuma: 'Geen accounts gevonden.', semEmail: 'geen e-mail',
      cliente: 'Klant', vendedor: 'Verkoper', dono: 'Eigenaar', bloqueada: 'Geblokkeerd', novaSenha: 'Nieuw wachtwoord', banir: 'Blokkeren', desbanir: 'Deblokkeren',
      senhaTemp: 'Tijdelijk wachtwoord (geef het door; de persoon wijzigt het in Mijn account):', senhaT: 'Nieuw wachtwoord maken?', senhaD: 'Het huidige wachtwoord werkt dan niet meer.', banirT: 'Dit account blokkeren?', banirD: 'De persoon wordt meteen uitgelogd en kan niet meer inloggen. Dit kan ongedaan worden.' },
    en: { mvT: 'My sales', mvD: 'Your real, paid sales and your share of each one.', mvSuaParte: 'Your share', mvSemLoja: 'You don’t have a store yet.', vDia: 'Last day', v7: 'Last 7 days', v30: 'Last 30 days', vPeriodo: 'Period', vT: 'Sellers', vD: 'All seller accounts with their sales (only real, paid orders). Click a seller to see each sale.', vVend: 'Seller', vLoja: 'Store', vVendas: 'Sales', vTotal: 'Total sold', vSemLoja: 'no store yet', vNenhum: 'No sellers yet.', vAtualizar: 'Refresh', vCarregando: 'Loading…', vData: 'Date', vProduto: 'Product', vValor: 'Amount', vSit: 'Status', vParte: 'Seller’s share', vPct: '{n}% to the seller', vNenhumaVenda: 'No sales yet.', vFechar: 'Close', vRe: '{n} refunded (not counted)', st: { pago: 'Paid', entregue: 'Delivered', concluido: 'Completed', reembolso_solicitado: 'Refund requested', reembolsado: 'Refunded' },
      excluirD: 'Your account will be deleted from Kennismarket and you will be signed out. This can’t be undone. Enter your password to confirm.', senhaIncorreta: 'Wrong password.', contaDono: 'An owner account can’t be deleted here.', banida: 'This account is suspended. Please contact support.',
      contasT: 'Accounts', contasD: 'Find an account by name, username or email to create a temporary password or ban it.', busca: 'Name, username or email', buscar: 'Search', min2: 'Type at least 2 characters.', nenhuma: 'No accounts found.', semEmail: 'no email',
      cliente: 'Customer', vendedor: 'Seller', dono: 'Owner', bloqueada: 'Banned', novaSenha: 'New password', banir: 'Ban', desbanir: 'Unban',
      senhaTemp: 'Temporary password (send it to the person; they change it in My account):', senhaT: 'Create a new password?', senhaD: 'The current password will stop working.', banirT: 'Ban this account?', banirD: 'The person is signed out right away and can’t sign in again. You can undo this.' },
    es: { mvT: 'Mis ventas', mvD: 'Tus ventas reales y pagadas, y tu parte de cada una.', mvSuaParte: 'Tu parte', mvSemLoja: 'Aún no tienes tienda.', vDia: 'Último día', v7: 'Últimos 7 días', v30: 'Últimos 30 días', vPeriodo: 'Período', vT: 'Vendedores', vD: 'Todas las cuentas de vendedor con sus ventas (solo pedidos reales y pagados). Haz clic en un vendedor para ver cada venta.', vVend: 'Vendedor', vLoja: 'Tienda', vVendas: 'Ventas', vTotal: 'Total vendido', vSemLoja: 'aún sin tienda', vNenhum: 'Aún no hay vendedores.', vAtualizar: 'Actualizar', vCarregando: 'Cargando…', vData: 'Fecha', vProduto: 'Producto', vValor: 'Valor', vSit: 'Estado', vParte: 'Parte del vendedor', vPct: '{n}% para el vendedor', vNenhumaVenda: 'Aún no hay ventas.', vFechar: 'Cerrar', vRe: '{n} reembolsadas (no se cuentan)', st: { pago: 'Pagado', entregue: 'Entregado', concluido: 'Completado', reembolso_solicitado: 'Reembolso pedido', reembolsado: 'Reembolsado' },
      excluirD: 'Tu cuenta se eliminará de Kennismarket y saldrás. No se puede deshacer. Escribe tu contraseña para confirmar.', senhaIncorreta: 'Contraseña incorrecta.', contaDono: 'Una cuenta de dueño no se puede eliminar aquí.', banida: 'Esta cuenta está suspendida. Contacta con soporte.',
      contasT: 'Cuentas', contasD: 'Busca una cuenta por nombre, usuario o correo para crear una contraseña temporal o bloquearla.', busca: 'Nombre, usuario o correo', buscar: 'Buscar', min2: 'Escribe al menos 2 caracteres.', nenhuma: 'No se encontraron cuentas.', semEmail: 'sin correo',
      cliente: 'Cliente', vendedor: 'Vendedor', dono: 'Dueño', bloqueada: 'Bloqueada', novaSenha: 'Nueva contraseña', banir: 'Bloquear', desbanir: 'Desbloquear',
      senhaTemp: 'Contraseña temporal (pásala a la persona; la cambia en Mi cuenta):', senhaT: '¿Crear una contraseña nueva?', senhaD: 'La contraseña actual dejará de funcionar.', banirT: '¿Bloquear esta cuenta?', banirD: 'La persona sale al instante y no puede volver a entrar. Se puede deshacer.' },
    pt: { mvT: 'Minhas vendas', mvD: 'Suas vendas reais e pagas, e a sua parte de cada uma.', mvSuaParte: 'Sua parte', mvSemLoja: 'Você ainda não tem loja.', vDia: 'Último dia', v7: 'Últimos 7 dias', v30: 'Últimos 30 dias', vPeriodo: 'Período', vT: 'Vendedores', vD: 'Todas as contas de vendedor com as vendas (só pedidos reais e pagos). Clique num vendedor para ver cada venda.', vVend: 'Vendedor', vLoja: 'Loja', vVendas: 'Vendas', vTotal: 'Total vendido', vSemLoja: 'ainda sem loja', vNenhum: 'Ainda não há vendedores.', vAtualizar: 'Atualizar', vCarregando: 'Carregando…', vData: 'Data', vProduto: 'Produto', vValor: 'Valor', vSit: 'Situação', vParte: 'Parte do vendedor', vPct: '{n}% para o vendedor', vNenhumaVenda: 'Nenhuma venda ainda.', vFechar: 'Fechar', vRe: '{n} reembolsada(s) (não contam)', st: { pago: 'Pago', entregue: 'Entregue', concluido: 'Concluído', reembolso_solicitado: 'Reembolso pedido', reembolsado: 'Reembolsado' },
      excluirD: 'Sua conta será apagada do Kennismarket e você sairá. Isso não pode ser desfeito. Digite sua senha para confirmar.', senhaIncorreta: 'Senha incorreta.', contaDono: 'Conta de dono não pode ser excluída por aqui.', banida: 'Esta conta está suspensa. Fale com o suporte.',
      contasT: 'Contas', contasD: 'Encontre uma conta pelo nome, usuário ou e-mail para gerar uma senha temporária ou banir.', busca: 'Nome, usuário ou e-mail', buscar: 'Buscar', min2: 'Digite pelo menos 2 letras.', nenhuma: 'Nenhuma conta encontrada.', semEmail: 'sem e-mail',
      cliente: 'Cliente', vendedor: 'Vendedor', dono: 'Dono', bloqueada: 'Banida', novaSenha: 'Nova senha', banir: 'Banir', desbanir: 'Desbanir',
      senhaTemp: 'Senha temporária (passe para a pessoa; ela troca em Minha conta):', senhaT: 'Gerar uma senha nova?', senhaD: 'A senha atual deixa de funcionar.', banirT: 'Banir esta conta?', banirD: 'A pessoa sai na hora e não consegue mais entrar. Dá para desfazer.' },
  };
  // Faturamento (etapa 6): "Faturamento da conta" (Minha conta) e "Faturamento da loja" (Minha loja).
  var TXT6 = {
    nl: { demo: 'Demo: berekend met de gesimuleerde bestellingen in deze browser (koers van vandaag; de overboeking staat altijd als ontvangen).', fcT: 'Omzet van het account', fcD: 'Alle echte verkopen van je winkels bij elkaar, en wat je ontvangen hebt.', flT: 'Omzet van de winkel', flD: 'De echte verkopen van deze winkel en wat je ervan ontvangen hebt.',
      recebido: 'Ontvangen op je Pix-sleutel', processando: 'In verwerking bij de bank', aReceber: 'Nog te ontvangen (overboeking mislukt: support lost het op)', debitos: 'Open schulden (terugbetalingen)', saldo: 'Saldo',
      porLoja: 'Per winkel', semVendasLoja: 'Deze winkel heeft nog geen echte verkopen.', seusDebitos: 'Schulden door terugbetalingen', debitosD: 'Jouw deel van terugbetalingen die support heeft goedgekeurd. Kennismarket neemt contact op voor de betaling.',
      repasse: 'Overboeking', rep: { repassado: 'Ontvangen', processando: 'In verwerking', aguardando: 'In verwerking', falhou: 'Mislukt' }, sit: { aberto: 'Open', quitado: 'Betaald', perdoado: 'Kwijtgescholden' },
      quitar: 'Betaald', perdoar: 'Kwijtschelden', reabrir: 'Heropenen' },
    en: { demo: 'Demo: calculated from the simulated orders in this browser (today’s rate; the transfer always shows as received).', fcT: 'Account revenue', fcD: 'All real sales of your stores together, and what you have received.', flT: 'Store revenue', flD: 'This store’s real sales and what you have received from them.',
      recebido: 'Received on your Pix key', processando: 'Being processed by the bank', aReceber: 'Still to receive (transfer failed: support fixes it)', debitos: 'Open debts (refunds)', saldo: 'Balance',
      porLoja: 'By store', semVendasLoja: 'This store has no real sales yet.', seusDebitos: 'Debts from refunds', debitosD: 'Your share of refunds approved by support. Kennismarket will contact you about payment.',
      repasse: 'Transfer', rep: { repassado: 'Received', processando: 'Processing', aguardando: 'Processing', falhou: 'Failed' }, sit: { aberto: 'Open', quitado: 'Paid', perdoado: 'Forgiven' },
      quitar: 'Paid', perdoar: 'Forgive', reabrir: 'Reopen' },
    es: { demo: 'Demo: calculado con los pedidos simulados de este navegador (cotización de hoy; la transferencia siempre aparece como recibida).', fcT: 'Facturación de la cuenta', fcD: 'Todas las ventas reales de tus tiendas juntas, y lo que recibiste.', flT: 'Facturación de la tienda', flD: 'Las ventas reales de esta tienda y lo que recibiste de ellas.',
      recebido: 'Recibido en tu clave Pix', processando: 'En proceso en el banco', aReceber: 'Por recibir (falló la transferencia: soporte lo resuelve)', debitos: 'Deudas abiertas (reembolsos)', saldo: 'Saldo',
      porLoja: 'Por tienda', semVendasLoja: 'Esta tienda aún no tiene ventas reales.', seusDebitos: 'Deudas por reembolsos', debitosD: 'Tu parte de los reembolsos aprobados por soporte. Kennismarket te contactará para el pago.',
      repasse: 'Transferencia', rep: { repassado: 'Recibido', processando: 'En proceso', aguardando: 'En proceso', falhou: 'Falló' }, sit: { aberto: 'Abierta', quitado: 'Pagada', perdoado: 'Perdonada' },
      quitar: 'Pagada', perdoar: 'Perdonar', reabrir: 'Reabrir' },
    pt: { demo: 'Demonstração: calculado com os pedidos simulados deste navegador (cotação de hoje; o repasse aparece sempre como recebido).', fcT: 'Faturamento da conta', fcD: 'Todas as vendas reais das suas lojas juntas, e o que você já recebeu.', flT: 'Faturamento da loja', flD: 'As vendas reais desta loja e o que você já recebeu delas.',
      recebido: 'Recebido na sua chave Pix', processando: 'Processando no banco', aReceber: 'A receber (o repasse falhou: o suporte resolve)', debitos: 'Débitos em aberto (reembolsos)', saldo: 'Saldo',
      porLoja: 'Por loja', semVendasLoja: 'Esta loja ainda não tem vendas reais.', seusDebitos: 'Débitos de reembolsos', debitosD: 'A sua parte dos reembolsos aprovados pelo suporte. O Kennismarket entra em contato para o acerto.',
      repasse: 'Repasse', rep: { repassado: 'Recebido', processando: 'Processando', aguardando: 'Processando', falhou: 'Falhou' }, sit: { aberto: 'Em aberto', quitado: 'Quitado', perdoado: 'Perdoado' },
      quitar: 'Quitado', perdoar: 'Perdoar', reabrir: 'Reabrir' },
  };
  function txt6(k) { var lg = (typeof S !== 'undefined' && S.lang) || 'nl'; return (TXT6[lg] || TXT6.nl)[k]; }
  window.kmTxt6 = txt6; // o painel do dono (public/js/pedidos.js) usa os mesmos nomes de situação
  function txt2(k) {
    var lg = (typeof S !== 'undefined' && S.lang) || 'nl';
    return (TXT2[lg] || TXT2.nl)[k];
  }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; });
  }
  function txt(k) {
    var lg = (typeof S !== 'undefined' && S.lang) || 'nl';
    return (TXT[lg] || TXT.nl)[k];
  }
  // Mensagem para cada código de erro do servidor (as do protótipo quando existem).
  function mensagem(codigo) {
    switch (codigo) {
      case 'login_invalido': return txt('invalido');
      case 'usuario_em_uso': return tr('slTaken');
      case 'usuario_invalido': return tr('accUserH');
      case 'nome_invalido': return tr('errName');
      case 'senha_curta': return tr('errPass8');
      case 'email_em_uso': return txt('emailUso');
      case 'email_invalido': return tr('errEmail');
      case 'senha_errada': return txt('senhaErrada');
      case 'convite_invalido': case 'convite_usado': return tr('slBad');
      case 'conta_banida': return txt2('banida');
      case 'conta_dono': return txt2('contaDono');
      default: return txt('falha');
    }
  }

  // ---------- sessão ----------
  function guardar(s) {
    sessao = s;
    try {
      if (s) localStorage.setItem(CHAVE, JSON.stringify(s)); else localStorage.removeItem(CHAVE);
      localStorage.removeItem('km-dono'); // sessão da versão anterior (só do dono)
    } catch (e) {}
  }
  function deResposta(r) {
    return { access: r.access_token, refresh: r.refresh_token, exp: Date.now() + (r.expires_in || 3600) * 1000 };
  }
  async function config() {
    if (!cfg) cfg = await (await fetch('/api/config')).json();
    return cfg;
  }
  // Renova a sessão direto no Supabase (a chave "publishable" é pública por natureza).
  async function renovar(s) {
    var c = await config();
    var r = await fetch(c.supabaseUrl + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: c.supabasePublishableKey },
      body: JSON.stringify({ refresh_token: s.refresh }),
    });
    if (!r.ok) throw Object.assign(new Error('renovar'), { status: r.status });
    return deResposta(await r.json());
  }
  // Sessão válida por mais 1 minuto pelo menos; renova se precisar.
  async function sessaoValida() {
    if (!sessao) return null;
    if (sessao.exp - Date.now() > 60 * 1000) return sessao;
    try {
      guardar(await renovar(sessao));
      return sessao;
    } catch (e) {
      if (e.status >= 400 && e.status < 500) guardar(null); // sessão vencida de vez
      return null;
    }
  }
  // A ponte manda o token nas gravações; o servidor confere o que é só do dono.
  window.kmToken = async function () {
    var s = await sessaoValida();
    return s ? s.access : null;
  };

  async function api(metodo, caminho, corpo, comToken) {
    var h = { 'Content-Type': 'application/json' };
    if (comToken) {
      var t = await window.kmToken();
      if (t) h.Authorization = 'Bearer ' + t;
    }
    var r = await fetch('/api/contas' + caminho, { method: metodo, headers: h, body: corpo ? JSON.stringify(corpo) : undefined });
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok) throw Object.assign(new Error(j.erro || 'erro'), { codigo: j.codigo, status: r.status });
    return j;
  }

  function aplicarPerfil(perfil) {
    window.KM_DONO = Boolean(perfil && perfil.papel === 'dono');
  }
  function marcarConta(perfil) {
    S.user.contaId = perfil.id;
    S.user.papel = perfil.papel;
    save();
  }

  // Depois de entrar (tela inicial ou link do vendedor): abre o site com a conta.
  function abrirConta(resp) {
    guardar(deResposta(resp.sessao));
    aplicarPerfil(resp.perfil);
    var p = resp.perfil;
    if (resp.vendedor && resp.vendedor.acc) {
      SELLERS[resp.vendedor.token] = resp.vendedor.acc;
      sellEnter(resp.vendedor.token, resp.vendedor.acc);
      marcarConta(p);
      return;
    }
    var nome = String(p.nome || p.usuario || '').trim() || (p.email || '').split('@')[0];
    seed({ name: nome.split(/\s+/)[0], full: nome, username: p.usuario || (p.email || '').split('@')[0], email: p.email || '' });
    marcarConta(p);
    enter();
  }

  // Painel do dono aberto por quem não é dono (por exemplo, pelo endereço #admin): volta ao início.
  window.kmSemAcesso = function () {
    if (checando) return '<div class="wrap"><p class="muted" style="margin:60px 0;text-align:center">' + txt('checando') + '</p></div>';
    setTimeout(function () {
      if (typeof S !== 'undefined' && (S.view === 'admin' || S.view === 'editar') && !window.KM_DONO) { S.view = 'explorar'; render(); }
    }, 0);
    return '';
  };

  function sair() {
    guardar(null);
    aplicarPerfil(null);
  }

  // ---------- telas do protótipo ----------
  function ligarTelas() {
    // Tela inicial: entrar e criar conta.
    window.doAuth = function (e) {
      e.preventDefault();
      var err = document.getElementById('au-err');
      var botao = document.querySelector('#authform button[type=submit]');
      var campo = function (id) { var x = document.getElementById(id); return x ? x.value : ''; };
      var login = campo('au-user').trim();
      var senha = campo('au-pass');
      var pedido;
      err.textContent = '';
      if (authMode === 'criar') {
        var un = login.replace(/^@/, '').toLowerCase();
        var nome = campo('au-name').trim();
        var email = campo('au-email').trim();
        if (!/^[a-z0-9_.]{3,20}$/.test(un)) return (err.textContent = tr('accUserH'));
        if (nome.split(/\s+/).length < 2) return (err.textContent = tr('errName'));
        if (senha.length < 8) return (err.textContent = tr('errPass8'));
        if (email && !/^\S+@\S+\.\S+$/.test(email)) return (err.textContent = tr('errEmail'));
        if (!document.getElementById('au-terms').checked) return (err.textContent = tr('errTerms'));
        pedido = api('POST', '/cadastro', { nome: nome, usuario: un, senha: senha, email: email });
      } else {
        if (!login) return (err.textContent = tr('accUserH'));
        if (!senha) return (err.textContent = tr('errPass'));
        pedido = api('POST', '/entrar', { login: login, senha: senha });
      }
      if (botao) botao.disabled = true;
      pedido.then(abrirConta, function (x) {
        err.textContent = mensagem(x.codigo);
        if (botao) botao.disabled = false;
      });
    };

    // Link do vendedor: criar conta, entrar e trocar a senha (link novo do dono).
    window.sellSubmit = async function (f) {
      var t = f.dataset.t, modo = f.dataset.mode;
      var err = document.getElementById('sl-err'), botao = f.querySelector('button[type=submit]');
      var un = document.getElementById('sl-user').value.trim().replace(/^@/, '').toLowerCase();
      var senha = document.getElementById('sl-pass').value;
      err.textContent = '';
      if (!/^[a-z0-9_.]{3,20}$/.test(un)) return (err.textContent = tr('accUserH'));
      if (modo !== 'login') {
        if (senha.length < 8) return (err.textContent = tr('slPassH'));
        if (senha !== document.getElementById('sl-pass2').value) return (err.textContent = tr('slMismatch'));
      }
      var caminho = modo === 'new' ? '/vendedor/criar' : modo === 'reset' ? '/vendedor/redefinir' : '/vendedor/entrar';
      botao.disabled = true;
      try {
        var r = await api('POST', caminho, { token: t, usuario: un, senha: senha });
        guardar(deResposta(r.sessao));
        aplicarPerfil(r.perfil);
        SELLERS[t] = r.acc;
        sellEnter(t, r.acc);
        marcarConta(r.perfil);
      } catch (x) {
        err.textContent = mensagem(x.codigo);
        botao.disabled = false;
      }
    };

    // Sair do site também sai da conta.
    var sairDoSite = A.logout;
    A.logout = function () { sair(); return sairDoSite.apply(this, arguments); };

    // "Alterar senha": contas reais trocam no servidor; as de demonstração, como antes.
    var alterarSenha = A.accpw;
    A.accpw = function () {
      var r = alterarSenha.apply(this, arguments);
      var ok = document.getElementById('ok');
      if (!ok || !document.getElementById('pw-cur') || !(S.user && S.user.contaId)) return r;
      ok.onclick = async function () {
        var g = function (id) { return document.getElementById(id).value; };
        var c = g('pw-cur'), n = g('pw-new'), rep = g('pw-rep'), e = document.getElementById('pw-err');
        if (!c) return (e.textContent = tr('accPwErrCur'));
        if (n.length < 8 || !/[A-Za-z]/.test(n) || !/\d/.test(n)) return (e.textContent = tr('accPwRule'));
        if (n !== rep) return (e.textContent = tr('accPwErrRep'));
        if (n === c) return (e.textContent = tr('accPwErrSame'));
        ok.disabled = true;
        try {
          await api('PUT', '/senha', { atual: c, nova: n }, true);
          S.user.pwChanged = Date.now(); save(); closeModal(); render(); toast(tr('accPwOk'));
        } catch (x) {
          e.textContent = mensagem(x.codigo);
          ok.disabled = false;
        }
      };
      return r;
    };

    // "Faturamento da loja": vendedor com conta real vê, em Minha loja, o faturamento da loja aberta.
    var minhaLojaTela = window.vMyStore;
    window.vMyStore = function () {
      var h = minhaLojaTela.apply(this, arguments);
      if (!((S.user && S.user.contaId && S.user.papel === 'vendedor') || vendedorDemo()) || !S.myStore) return h;
      var ancora = '<div class="seg" role="group">';
      return h.indexOf(ancora) < 0 ? h : h.replace(ancora, faturamentoLojaHTML(S.myStore.id) + ancora);
    };

    // "Faturamento da conta": vendedor com conta real vê, no fim da página Minha conta, tudo o que a conta vendeu.
    var minhaConta = window.vAccount;
    window.vAccount = function () {
      var h = minhaConta.apply(this, arguments);
      if (!((S.user && S.user.contaId && S.user.papel === 'vendedor') || vendedorDemo())) return h;
      return h.replace(/<\/div>\s*$/, minhasVendasHTML() + '</div>');
    };

    // "Excluir conta": contas reais apagam no servidor, com a senha; as de demonstração, como antes.
    var excluirConta = A.accdel;
    A.accdel = function () {
      if (!(S.user && S.user.contaId)) return excluirConta.apply(this, arguments);
      modal('<h2>' + tr('accDelT') + '</h2><p class="sub">' + txt2('excluirD') + '</p>' +
        '<div class="field"><label for="del-pass">' + tr('password') + '</label><input id="del-pass" type="password" autocomplete="current-password"></div>' +
        '<p class="err" id="del-err"></p>' +
        '<button class="btn danger block" id="ok">' + tr('accDelB') + '</button><button class="btn block" data-a="close">' + tr('cancelB') + '</button>', function (m) {
        var ok = m.querySelector('#ok');
        ok.onclick = async function () {
          var senha = m.querySelector('#del-pass').value, e = m.querySelector('#del-err');
          if (!senha) return (e.textContent = tr('errPass'));
          ok.disabled = true;
          try {
            await api('DELETE', '/conta', { senha: senha }, true);
            sair();
            try { localStorage.removeItem(KEY); } catch (x) {}
            location.hash = '';
            location.reload();
          } catch (x) {
            e.textContent = x.codigo === 'senha_errada' ? txt2('senhaIncorreta') : mensagem(x.codigo);
            ok.disabled = false;
          }
        };
      });
    };
  }

  // ---------- painel do dono: seção "Contas" ----------
  var contas = { q: '', lista: null, erro: '', senhas: {} };
  function redesenharPainel() {
    var y = window.scrollY;
    render();
    window.scrollTo(0, y);
  }
  async function admin(metodo, caminho, corpo) {
    var t = await window.kmToken();
    var r = await fetch('/api/admin' + caminho, {
      method: metodo,
      headers: Object.assign({ 'Content-Type': 'application/json' }, t ? { Authorization: 'Bearer ' + t } : {}),
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok) throw Object.assign(new Error(j.erro || 'erro'), { status: r.status });
    return j;
  }
  // HTML da seção, colocado no fim do painel (ajuste em server/lib/pagina-prototipo.js).
  window.kmContasHTML = function () {
    var linhas = '';
    if (contas.lista && !contas.lista.length) linhas = '<p class="muted">' + txt2('nenhuma') + '</p>';
    (contas.lista || []).forEach(function (c) {
      var papel = c.banida ? '<span class="pill danger">' + txt2('bloqueada') + '</span>'
        : '<span class="pill ' + (c.papel === 'cliente' ? 'off' : 'safe') + '">' + txt2(c.papel) + '</span>';
      var acoes = c.papel === 'dono' ? '' : '<div class="acts">' +
        '<button class="btn sm" data-km-conta="senha" data-id="' + esc(c.id) + '">' + txt2('novaSenha') + '</button>' +
        (c.banida ? '<button class="btn sm" data-km-conta="desbanir" data-id="' + esc(c.id) + '">' + txt2('desbanir') + '</button>'
          : '<button class="btn sm danger" data-km-conta="banir" data-id="' + esc(c.id) + '">' + txt2('banir') + '</button>') + '</div>';
      var senha = contas.senhas[c.id] ? '<div class="invcode">' + txt2('senhaTemp') + ' <code>' + esc(contas.senhas[c.id]) + '</code></div>' : '';
      linhas += '<div class="inv"><div class="inv-t"><b>' + esc(c.nome || '—') + '</b>' + papel + '</div>' +
        '<span class="muted" style="font-size:13.5px">' + (c.usuario ? '@' + esc(c.usuario) : '—') + ' · ' + (c.email ? esc(c.email) : txt2('semEmail')) + '</span>' +
        senha + acoes + '</div>';
    });
    return '<section class="panel span2" id="km-contas"><h2>' + txt2('contasT') + '</h2><p class="sub">' + txt2('contasD') + '</p>' +
      '<form class="invform" id="km-contas-busca" novalidate><div class="field"><label for="km-contas-q">' + txt2('busca') + '</label>' +
      '<input id="km-contas-q" type="search" autocomplete="off" value="' + esc(contas.q) + '"></div>' +
      '<button class="btn primary" type="submit">' + txt2('buscar') + '</button></form>' +
      '<p class="err">' + esc(contas.erro) + '</p><div class="invlist">' + linhas + '</div>' + vendedoresHTML() + '</section>';
  };
  // ---------- vendedores: tabela com vendas e total, e cada venda numa janela ----------
  var vend = { lista: null, carregando: false, erro: '' };
  function reais(c) { return ((c || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  function dataCurta(d) { try { return new Date(d).toLocaleDateString(S.lang === 'en' ? 'en-GB' : S.lang === 'nl' ? 'nl-NL' : S.lang === 'es' ? 'es-ES' : 'pt-BR'); } catch (e) { return ''; } }
  function carregarVendedores() {
    if (vend.carregando) return;
    vend.carregando = true; vend.erro = '';
    admin('GET', '/vendedores?vendas=1').then(function (r) { vend.lista = r.vendedores; }, function () { vend.erro = txt('falha'); })
      .then(function () { vend.carregando = false; if (S.view === 'admin') redesenharPainel(); });
  }
  function vendedoresHTML() {
    if (vend.conta !== S.user.contaId) { vend = { lista: null, carregando: false, erro: '', conta: S.user.contaId }; }
    if (!vend.lista && !vend.erro) carregarVendedores();
    var corpo;
    if (vend.erro) corpo = '<p class="err">' + esc(vend.erro) + '</p>';
    else if (!vend.lista) corpo = '<p class="muted">' + txt2('vCarregando') + '</p>';
    else if (!vend.lista.length) corpo = '<p class="muted">' + txt2('vNenhum') + '</p>';
    else {
      corpo = '<div class="fxwrap" style="overflow-x:auto"><table class="fxt"><thead><tr><th>' + txt2('vVend') + '</th><th>' + txt2('vLoja') + '</th>' +
        '<th style="text-align:right">' + txt2('vVendas') + '</th><th style="text-align:right">' + txt2('vTotal') + '</th></tr></thead><tbody>' +
        vend.lista.map(function (v) {
          return '<tr data-km-vend="' + esc(v.id) + '" style="cursor:pointer" tabindex="0" role="button">' +
            '<td><b>' + esc(v.nome || v.usuario || '—') + '</b><small>' + (v.usuario ? '@' + esc(v.usuario) : '') + '</small>' + (v.banida ? '<span class="pill danger">' + txt2('bloqueada') + '</span>' : '') + '</td>' +
            '<td>' + (v.loja ? esc(v.loja.nome) : '<span class="muted">' + txt2('vSemLoja') + '</span>') + '</td>' +
            '<td style="text-align:right"><b>' + v.vendas + '</b></td>' +
            '<td style="text-align:right;white-space:nowrap"><b>' + reais(v.totalCentavos) + '</b><br><small class="muted">' + coin(12) + ' ' + fmtN(v.totalKn) + '</small></td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    return '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:22px;flex-wrap:wrap"><h3 style="margin:0">' + txt2('vT') + '</h3>' +
      '<button class="btn sm" id="km-vend-atualizar">' + txt2('vAtualizar') + '</button></div><p class="sub">' + txt2('vD') + '</p>' + corpo;
  }
  // Tabelas usadas na janela do dono e em "Minhas vendas" do vendedor.
  function resumoHTML(v, rotuloParte) {
    return '<div class="sumbox"><div><span>' + txt2('vVendas') + '</span><b>' + v.vendas + '</b></div>' +
      '<div class="tot"><span>' + txt2('vTotal') + '</span><b>' + reais(v.totalCentavos) + '</b></div>' +
      '<div class="sub2"><span>' + coin(12) + ' ' + fmtN(v.totalKn) + '</span><span>' + rotuloParte + ': ' + reais(v.vendedorCentavos) + '</span></div>' +
      (v.reembolsadas ? '<div class="sub2"><span>' + txt2('vRe').replace('{n}', v.reembolsadas) + '</span></div>' : '') + '</div>';
  }
  // vendas (sem as reembolsadas) do último dia, dos últimos 7 e dos últimos 30 dias
  function periodosHTML(lista) {
    var agora = Date.now();
    var periodo = function (dias) {
      var desde = agora - dias * 864e5, n = 0, c = 0;
      lista.forEach(function (x) { if (x.status !== 'reembolsado' && Date.parse(x.data) >= desde) { n++; c += x.valorCentavos; } });
      return '<tr><td>' + txt2(dias === 1 ? 'vDia' : dias === 7 ? 'v7' : 'v30') + '</td><td style="text-align:right"><b>' + n + '</b></td><td style="text-align:right;white-space:nowrap"><b>' + reais(c) + '</b></td></tr>';
    };
    return '<div class="fxwrap" style="overflow-x:auto;margin:12px 0"><table class="fxt"><thead><tr><th>' + txt2('vPeriodo') + '</th><th style="text-align:right">' + txt2('vVendas') + '</th><th style="text-align:right">' + txt2('vTotal') + '</th></tr></thead><tbody>' +
      periodo(1) + periodo(7) + periodo(30) + '</tbody></table></div>';
  }
  // cada venda; comParte: colunas com a parte do vendedor e o repasse (faturamento); comLoja: coluna da loja
  function vendasHTML(lista, comParte, comLoja) {
    var st = txt2('st'), rep = txt6('rep'), cols = 4 + (comParte ? 2 : 0) + (comLoja ? 1 : 0);
    var linhas = lista.map(function (x) {
      return '<tr><td>' + esc(dataCurta(x.data)) + '</td>' + (comLoja ? '<td>' + esc(x.loja || '—') + '</td>' : '') + '<td>' + esc(x.produto || '—') + '</td>' +
        '<td style="text-align:right;white-space:nowrap"><b>' + reais(x.valorCentavos) + '</b><br><small class="muted">' + coin(12) + ' ' + fmtN(x.valorKn) + '</small></td>' +
        (comParte ? '<td style="text-align:right;white-space:nowrap"><b>' + reais(x.vendedorCentavos) + '</b></td>' : '') +
        '<td><span class="pill ' + (x.status === 'reembolsado' ? 'danger' : x.status === 'reembolso_solicitado' ? 'warn' : 'safe') + '">' + esc(st[x.status] || x.status) + '</span></td>' +
        (comParte ? '<td><span class="pill ' + (x.repasse === 'repassado' ? 'safe' : x.repasse === 'falhou' ? 'danger' : 'warn') + '">' + esc(rep[x.repasse] || '—') + '</span></td>' : '') + '</tr>';
    }).join('') || '<tr><td colspan="' + cols + '" class="muted" style="display:table-cell;text-align:center;padding:16px">' + txt2('vNenhumaVenda') + '</td></tr>';
    return '<div class="fxwrap" style="overflow-x:auto"><table class="fxt"><thead><tr><th>' + txt2('vData') + '</th>' + (comLoja ? '<th>' + txt2('vLoja') + '</th>' : '') + '<th>' + txt2('vProduto') + '</th><th style="text-align:right">' + txt2('vValor') + '</th>' +
      (comParte ? '<th style="text-align:right">' + txt2('mvSuaParte') + '</th>' : '') + '<th>' + txt2('vSit') + '</th>' + (comParte ? '<th>' + txt6('repasse') + '</th>' : '') + '</tr></thead><tbody>' + linhas + '</tbody></table></div>';
  }
  // recebido, processando, a receber, débitos e saldo (faturamento e janela do vendedor no painel do dono)
  function dinheiroHTML(d) {
    var linha = function (rotulo, c, neg) { return '<div><span>' + rotulo + '</span><b' + (neg ? ' class="neg"' : '') + '>' + (neg ? '− ' : '') + reais(c) + '</b></div>'; };
    return '<div class="sumbox" style="margin-top:12px">' + linha(txt6('recebido'), d.recebidoCentavos || 0) +
      (d.processandoCentavos ? linha(txt6('processando'), d.processandoCentavos) : '') +
      (d.aReceberCentavos ? linha(txt6('aReceber'), d.aReceberCentavos) : '') +
      (d.debitoAbertoCentavos ? linha(txt6('debitos'), d.debitoAbertoCentavos, true) : '') +
      '<div class="tot"><span>' + txt6('saldo') + '</span><b>' + reais(d.saldoCentavos || 0) + '</b></div></div>';
  }
  function debitosHTML(lista) {
    if (!lista || !lista.length) return '';
    var sit = txt6('sit');
    return '<h3 style="margin:18px 0 4px">' + txt6('seusDebitos') + '</h3><p class="sub">' + txt6('debitosD') + '</p>' +
      '<div class="fxwrap" style="overflow-x:auto"><table class="fxt"><thead><tr><th>' + txt2('vData') + '</th><th>' + txt2('vProduto') + '</th><th style="text-align:right">' + txt2('vValor') + '</th><th>' + txt2('vSit') + '</th></tr></thead><tbody>' +
      lista.map(function (x) {
        return '<tr><td>' + esc(dataCurta(x.data)) + '</td><td>' + esc(x.produto || '—') + '</td><td style="text-align:right;white-space:nowrap"><b>' + reais(x.valorCentavos) + '</b></td>' +
          '<td><span class="pill ' + (x.situacao === 'aberto' ? 'warn' : 'off') + '">' + esc(sit[x.situacao] || x.situacao) + '</span></td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  // tabela "Por loja" do faturamento da conta
  function porLojaHTML(lojas) {
    return '<h3 style="margin:18px 0 8px">' + txt6('porLoja') + '</h3><div class="fxwrap" style="overflow-x:auto"><table class="fxt"><thead><tr><th>' + txt2('vLoja') + '</th>' +
      '<th style="text-align:right">' + txt2('vVendas') + '</th><th style="text-align:right">' + txt2('vTotal') + '</th><th style="text-align:right">' + txt2('mvSuaParte') + '</th><th style="text-align:right">' + txt6('saldo') + '</th></tr></thead><tbody>' +
      lojas.map(function (l) {
        return '<tr><td><b>' + esc(l.nome) + '</b><small>' + txt2('vPct').replace('{n}', l.porcentagem) + '</small></td><td style="text-align:right"><b>' + l.vendas + '</b></td>' +
          '<td style="text-align:right;white-space:nowrap"><b>' + reais(l.totalCentavos) + '</b></td><td style="text-align:right;white-space:nowrap">' + reais(l.vendedorCentavos) + '</td>' +
          '<td style="text-align:right;white-space:nowrap"><b>' + reais(l.saldoCentavos) + '</b></td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  function abrirVendedor(id) {
    var v = (vend.lista || []).filter(function (x) { return x.id === id; })[0];
    if (!v) return;
    var lista = v.lista || [];
    var lojas = v.lojas && v.lojas.length ? v.lojas : (v.loja ? [v.loja] : []);
    modal('<h2>' + esc(v.nome || v.usuario) + '</h2><p class="sub">' + (v.usuario ? '@' + esc(v.usuario) + ' · ' : '') + (lojas.length ? lojas.map(function (l) { return esc(l.nome) + ' · ' + txt2('vPct').replace('{n}', l.porcentagem); }).join(' / ') : txt2('vSemLoja')) + '</p>' +
      resumoHTML(v, txt2('vParte')) + dinheiroHTML(v) + periodosHTML(lista) + vendasHTML(lista, true, lojas.length > 1) +
      '<button class="btn block" data-a="close">' + txt2('vFechar') + '</button>');
  }

  // ---------- faturamento (etapa 6): da conta (Minha conta) e da loja (Minha loja) ----------
  // Uma chamada só (GET /api/loja/vendas) traz a conta inteira e cada loja.
  var minhas = { dados: null, carregando: false, erro: '', conta: null };
  function carregarFaturamento() {
    // trocou de conta (sair e entrar com outra): esquece os dados da conta anterior
    if (minhas.conta !== S.user.contaId) minhas = { dados: null, carregando: false, erro: '', conta: S.user.contaId };
    var pedido = minhas;
    // busca de novo quando os números têm mais de 20 segundos (mostrando os antigos enquanto isso)
    if (minhas.carregando || minhas.erro || (minhas.dados && Date.now() - minhas.ultimo < 20000)) return;
    minhas.carregando = true;
    window.kmToken().then(function (t) { return fetch('/api/loja/vendas', { headers: t ? { Authorization: 'Bearer ' + t } : {} }); })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (r) { pedido.dados = r; pedido.ultimo = Date.now(); }, function () { pedido.erro = txt('falha'); })
      .then(function () { pedido.carregando = false; if (pedido === minhas && (S.view === 'conta' || S.view === 'minhaloja')) { var y = scrollY; render(); scrollTo(0, y); } });
  }
  function painelFaturamento(id, titulo, desc, corpo) {
    return '<section class="panel" id="' + id + '" style="margin-bottom:' + (id === 'km-minhas-vendas' ? '40px' : '18px') + '"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">' +
      '<h2 style="margin:0">' + titulo + '</h2><button class="btn sm" data-km-fat-atualizar>' + txt2('vAtualizar') + '</button></div>' +
      '<p class="sub">' + desc + '</p>' + (vendedorDemo() ? '<div class="callout warn" style="margin-bottom:12px">' + icon('alert', 16) + '<span>' + txt6('demo') + '</span></div>' : '') + corpo + '</section>';
  }
  // Conta de demonstração de vendedor (pedido dos donos, só para ver como fica): os mesmos painéis,
  // com números calculados a partir dos pedidos simulados de cada loja (public/js/lojas.js).
  function vendedorDemo() { return S.user && !S.user.contaId && S.user.role === 'vendedor'; }
  function dadosDemo() {
    var brl = typeof fxRate === 'function' ? fxRate('BRL') : 6;
    var STATUS = { pago: 'pago', chat: 'pago', entregue: 'entregue', 'case': 'reembolso_solicitado', refunded: 'reembolsado' };
    var lojas = (window.kmLojasDaConta ? window.kmLojasDaConta() : (S.myStore ? [{ loja: S.myStore, pedidos: S.sorders || [] }] : []));
    var resumo = function (vendas, debitos) {
      var validas = vendas.filter(function (v) { return v.status !== 'reembolsado'; });
      var soma = function (l, k) { return l.reduce(function (t, v) { return t + (v[k] || 0); }, 0); };
      var r = { vendas: validas.length, reembolsadas: vendas.length - validas.length, totalKn: soma(validas, 'valorKn'), totalCentavos: soma(validas, 'valorCentavos'),
        vendedorCentavos: soma(validas, 'vendedorCentavos'), recebidoCentavos: soma(vendas, 'vendedorCentavos'), processandoCentavos: 0, aReceberCentavos: 0,
        debitoAbertoCentavos: soma(debitos, 'valorCentavos'), debitos: debitos, lista: vendas };
      r.saldoCentavos = r.recebidoCentavos - r.debitoAbertoCentavos;
      return r;
    };
    var todas = [], todosDebitos = [];
    var porLoja = lojas.map(function (x) {
      var st = x.loja, pct = typeof pctOf === 'function' ? pctOf(st) : 50;
      var vendas = x.pedidos.filter(function (o) { return STATUS[o.status]; }).map(function (o) {
        var c = Math.round((o.amount || 0) * brl * 100), parte = c - Math.floor(c * (100 - pct) / 100);
        var produto = '';
        try { produto = o.pi ? L(st.prods[o.pi[0]].name, st) + (o.pi.length > 1 ? ' +' + (o.pi.length - 1) : '') : L(st.tiers[o.opt][0], st); } catch (e) {}
        return { id: o.id, data: new Date(o.ts || Date.now()).toISOString(), produto: produto, loja: st.n, valorKn: o.amount || 0, valorCentavos: c,
          vendedorCentavos: parte, status: STATUS[o.status], repasse: 'repassado' };
      });
      var debitos = vendas.filter(function (v) { return v.status === 'reembolsado'; })
        .map(function (v) { return { id: 'd' + v.id, valorCentavos: v.vendedorCentavos, situacao: 'aberto', data: v.data, produto: v.produto }; });
      todas = todas.concat(vendas); todosDebitos = todosDebitos.concat(debitos);
      return Object.assign({ nome: st.n, prototipoId: st.id, porcentagem: pct }, resumo(vendas, debitos));
    });
    todas.sort(function (a, b) { return Date.parse(b.data) - Date.parse(a.data); });
    return Object.assign(resumo(todas, todosDebitos), { lojas: porLoja });
  }
  function estadoFaturamento() {
    if (vendedorDemo()) { minhas = { dados: dadosDemo(), carregando: false, erro: '', conta: null, demo: true }; return null; }
    carregarFaturamento();
    if (minhas.erro) return '<p class="err">' + esc(minhas.erro) + '</p>';
    if (!minhas.dados) return '<p class="muted">' + txt2('vCarregando') + '</p>';
    return null;
  }
  // Minha conta: tudo o que a conta vendeu, somando todas as lojas dela
  function minhasVendasHTML() {
    var corpo = estadoFaturamento();
    if (corpo == null) {
      var d = minhas.dados, lojas = d.lojas || [];
      corpo = !lojas.length ? '<p class="muted">' + txt2('mvSemLoja') + '</p>'
        : resumoHTML(d, txt2('mvSuaParte')) + dinheiroHTML(d) + periodosHTML(d.lista || []) + porLojaHTML(lojas) +
          debitosHTML(d.debitos) + '<div style="margin-top:18px">' + vendasHTML(d.lista || [], true, lojas.length > 1) + '</div>';
    }
    return painelFaturamento('km-minhas-vendas', txt6('fcT'), txt6('fcD'), corpo);
  }
  // Minha loja: só a loja aberta na tela
  function faturamentoLojaHTML(lojaId) {
    var corpo = estadoFaturamento();
    if (corpo == null) {
      var l = (minhas.dados.lojas || []).filter(function (x) { return x.prototipoId === lojaId; })[0];
      corpo = !l ? '<p class="muted">' + txt6('semVendasLoja') + '</p>'
        : '<p class="sub">' + esc(l.nome) + ' · ' + txt2('vPct').replace('{n}', l.porcentagem) + '</p>' + resumoHTML(l, txt2('mvSuaParte')) + dinheiroHTML(l) +
          periodosHTML(l.lista || []) + debitosHTML(l.debitos) + '<div style="margin-top:18px">' + vendasHTML(l.lista || [], true, false) + '</div>';
    }
    return painelFaturamento('km-fat-loja', txt6('flT'), txt6('flD'), corpo);
  }
  document.addEventListener('click', function (e) {
    if (e.target && e.target.closest && e.target.closest('[data-km-fat-atualizar]')) {
      e.preventDefault(); minhas.dados = null; minhas.erro = ''; var y = scrollY; render(); scrollTo(0, y);
    }
  });
  document.addEventListener('click', function (e) {
    if (!e.target || !e.target.closest) return;
    if (e.target.closest('#km-vend-atualizar')) { e.preventDefault(); vend.lista = null; vend.erro = ''; carregarVendedores(); return redesenharPainel(); }
    var linha = e.target.closest('tr[data-km-vend]');
    if (linha) { e.preventDefault(); abrirVendedor(linha.getAttribute('data-km-vend')); }
  });
  document.addEventListener('keydown', function (e) {
    var linha = e.target && e.target.closest && e.target.closest('tr[data-km-vend]');
    if (linha && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); abrirVendedor(linha.getAttribute('data-km-vend')); }
  });

  async function buscarContas() {
    contas.erro = '';
    if (contas.q.trim().length < 2) { contas.lista = null; contas.erro = txt2('min2'); return redesenharPainel(); }
    try {
      contas.lista = (await admin('GET', '/contas?q=' + encodeURIComponent(contas.q.trim()))).contas;
    } catch (x) {
      contas.erro = txt('falha');
    }
    redesenharPainel();
  }
  document.addEventListener('submit', function (e) {
    if (!e.target || e.target.id !== 'km-contas-busca') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    contas.q = document.getElementById('km-contas-q').value;
    buscarContas();
  }, true);
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest && e.target.closest('[data-km-conta]');
    if (!b) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    var id = b.getAttribute('data-id'), acao = b.getAttribute('data-km-conta');
    var fazer = async function () {
      try {
        if (acao === 'senha') contas.senhas[id] = (await admin('POST', '/contas/' + encodeURIComponent(id) + '/senha', {})).senha;
        else await admin('POST', '/contas/' + encodeURIComponent(id) + '/banir', { banir: acao === 'banir' });
        await buscarContas();
      } catch (x) {
        contas.erro = txt('falha');
        redesenharPainel();
      }
    };
    if (acao === 'desbanir') return fazer();
    confirmBox(txt2(acao === 'senha' ? 'senhaT' : 'banirT'), txt2(acao === 'senha' ? 'senhaD' : 'banirD'),
      txt2(acao === 'senha' ? 'novaSenha' : 'banir'), acao === 'senha' ? 'primary' : 'danger', fazer);
  }, true);

  // Ao abrir o site: confere a sessão guardada. Conta real sem sessão válida sai do site.
  async function conferir() {
    try {
      sessao = JSON.parse(localStorage.getItem(CHAVE) || localStorage.getItem('km-dono') || 'null');
    } catch (e) { sessao = null; }
    var real = Boolean(typeof S !== 'undefined' && S.user && S.user.contaId); // conta do servidor (não de demonstração)
    try {
      var s = await sessaoValida();
      if (s) {
        var eu = await api('GET', '/eu', null, true);
        aplicarPerfil(eu.perfil);
        if (S.user && !S.user.contaId) marcarConta(eu.perfil); // sessão da versão anterior
        else if (S.user && S.user.contaId !== eu.perfil.id) { sair(); A.logout(); }
      } else if (real) {
        sair();
        if (S.user) A.logout(); // conta real sem sessão: volta para a tela de login
      }
    } catch (e) {
      if (e.status === 401 || e.status === 403) { sair(); if (real && S.user) A.logout(); }
      // servidor fora do ar: não apaga a sessão, só não libera o painel agora
    }
    checando = false;
    if (typeof S !== 'undefined' && (S.view === 'admin' || S.view === 'editar') && typeof render === 'function') render();
  }

  // "Minha conta": contas reais salvam nome, usuário e e-mail no servidor.
  // Registrado já aqui (antes do protótipo), para rodar antes do salvamento só no navegador;
  // contas de demonstração seguem para o protótipo, como antes.
  document.addEventListener('submit', async function (e) {
    if (!e.target || e.target.id !== 'accform' || !(S.user && S.user.contaId)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    var g = function (id) { return document.getElementById(id).value.trim(); };
    var err = document.getElementById('ac-err'), botao = e.target.querySelector('button[type=submit]');
    var nome = g('ac-full'), un = g('ac-user').replace(/^@/, '').toLowerCase(), email = g('ac-email');
    err.textContent = '';
    if (nome.length < 2) return (err.textContent = tr('accErrName'));
    if (!/^[a-z0-9_.]{3,20}$/.test(un)) return (err.textContent = tr('accUserH'));
    if (email && !/^\S+@\S+\.\S+$/.test(email)) return (err.textContent = tr('invErr'));
    if (botao) botao.disabled = true;
    try {
      var r = await api('PUT', '/perfil', { nome: nome, usuario: un, email: email }, true);
      var u = accUser(), p = r.perfil;
      u.full = p.nome; u.name = p.nome.split(/\s+/)[0]; u.username = p.usuario; u.email = p.email;
      if (r.vendedor && r.vendedor.acc) SELLERS[r.vendedor.token] = r.vendedor.acc;
      save(); render(); toast(tr('accSaved'));
    } catch (x) {
      err.textContent = x.codigo === 'nome_invalido' ? tr('accErrName') : x.codigo === 'email_invalido' ? tr('invErr') : mensagem(x.codigo);
      if (botao) botao.disabled = false;
    }
  }, true);

  // Arquivos de entrega só para quem pagou (ENTREGAS_SO_PAGAS no servidor): o protótipo abre os
  // arquivos no visualizador dele (openViewer). Com a trava ligada, antes de abrir, o visualizador
  // pede ao servidor um link assinado (10 minutos), que só sai para quem pode abrir. Desligada, nada muda.
  var TXT3 = { nl: 'Dit bestand komt vrij na betaling.', en: 'This file is available after payment.', es: 'Este archivo se libera después del pago.', pt: 'Este arquivo é liberado depois do pagamento.' };
  function travarVisualizador() {
    var abrir = window.openViewer;
    if (typeof abrir !== 'function') return;
    window.openViewer = async function (href, nome) {
      var id = (String(href).match(/^\/_blob\/([0-9a-f]{32})$/) || [])[1];
      if (!id || !cfg || !cfg.entregasSoPagas) return abrir.apply(this, arguments);
      try {
        var t = await window.kmToken();
        var r = await fetch('/api/prototipo/arquivos/' + id + '/link', { headers: t ? { Authorization: 'Bearer ' + t } : {} });
        if (!r.ok) throw new Error('bloqueado');
        return abrir.call(this, (await r.json()).url, nome);
      } catch (x) {
        var lg = (typeof S !== 'undefined' && S.lang) || 'nl';
        if (typeof toast === 'function') toast(TXT3[lg] || TXT3.nl);
      }
    };
  }

  aplicarPerfil(null);
  config().catch(function () {}); // já busca a configuração (trava dos arquivos)
  document.addEventListener('DOMContentLoaded', function () {
    ligarTelas();
    travarVisualizador();
    conferir();
  });
})();
