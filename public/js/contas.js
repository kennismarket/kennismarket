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
    nl: { excluirD: 'Je account wordt van Kennismarket verwijderd en je wordt uitgelogd. Dit kan niet ongedaan worden. Vul je wachtwoord in om te bevestigen.', senhaIncorreta: 'Wachtwoord onjuist.', contaDono: 'Een eigenaarsaccount kan hier niet worden verwijderd.', banida: 'Dit account is geblokkeerd. Neem contact op met support.',
      contasT: 'Accounts', contasD: 'Zoek een account op naam, gebruikersnaam of e-mail om een tijdelijk wachtwoord te maken of het account te blokkeren.', busca: 'Naam, gebruikersnaam of e-mail', buscar: 'Zoeken', min2: 'Typ minstens 2 tekens.', nenhuma: 'Geen accounts gevonden.', semEmail: 'geen e-mail',
      cliente: 'Klant', vendedor: 'Verkoper', dono: 'Eigenaar', bloqueada: 'Geblokkeerd', novaSenha: 'Nieuw wachtwoord', banir: 'Blokkeren', desbanir: 'Deblokkeren',
      senhaTemp: 'Tijdelijk wachtwoord (geef het door; de persoon wijzigt het in Mijn account):', senhaT: 'Nieuw wachtwoord maken?', senhaD: 'Het huidige wachtwoord werkt dan niet meer.', banirT: 'Dit account blokkeren?', banirD: 'De persoon wordt meteen uitgelogd en kan niet meer inloggen. Dit kan ongedaan worden.' },
    en: { excluirD: 'Your account will be deleted from Kennismarket and you will be signed out. This can’t be undone. Enter your password to confirm.', senhaIncorreta: 'Wrong password.', contaDono: 'An owner account can’t be deleted here.', banida: 'This account is suspended. Please contact support.',
      contasT: 'Accounts', contasD: 'Find an account by name, username or email to create a temporary password or ban it.', busca: 'Name, username or email', buscar: 'Search', min2: 'Type at least 2 characters.', nenhuma: 'No accounts found.', semEmail: 'no email',
      cliente: 'Customer', vendedor: 'Seller', dono: 'Owner', bloqueada: 'Banned', novaSenha: 'New password', banir: 'Ban', desbanir: 'Unban',
      senhaTemp: 'Temporary password (send it to the person; they change it in My account):', senhaT: 'Create a new password?', senhaD: 'The current password will stop working.', banirT: 'Ban this account?', banirD: 'The person is signed out right away and can’t sign in again. You can undo this.' },
    es: { excluirD: 'Tu cuenta se eliminará de Kennismarket y saldrás. No se puede deshacer. Escribe tu contraseña para confirmar.', senhaIncorreta: 'Contraseña incorrecta.', contaDono: 'Una cuenta de dueño no se puede eliminar aquí.', banida: 'Esta cuenta está suspendida. Contacta con soporte.',
      contasT: 'Cuentas', contasD: 'Busca una cuenta por nombre, usuario o correo para crear una contraseña temporal o bloquearla.', busca: 'Nombre, usuario o correo', buscar: 'Buscar', min2: 'Escribe al menos 2 caracteres.', nenhuma: 'No se encontraron cuentas.', semEmail: 'sin correo',
      cliente: 'Cliente', vendedor: 'Vendedor', dono: 'Dueño', bloqueada: 'Bloqueada', novaSenha: 'Nueva contraseña', banir: 'Bloquear', desbanir: 'Desbloquear',
      senhaTemp: 'Contraseña temporal (pásala a la persona; la cambia en Mi cuenta):', senhaT: '¿Crear una contraseña nueva?', senhaD: 'La contraseña actual dejará de funcionar.', banirT: '¿Bloquear esta cuenta?', banirD: 'La persona sale al instante y no puede volver a entrar. Se puede deshacer.' },
    pt: { excluirD: 'Sua conta será apagada do Kennismarket e você sairá. Isso não pode ser desfeito. Digite sua senha para confirmar.', senhaIncorreta: 'Senha incorreta.', contaDono: 'Conta de dono não pode ser excluída por aqui.', banida: 'Esta conta está suspensa. Fale com o suporte.',
      contasT: 'Contas', contasD: 'Encontre uma conta pelo nome, usuário ou e-mail para gerar uma senha temporária ou banir.', busca: 'Nome, usuário ou e-mail', buscar: 'Buscar', min2: 'Digite pelo menos 2 letras.', nenhuma: 'Nenhuma conta encontrada.', semEmail: 'sem e-mail',
      cliente: 'Cliente', vendedor: 'Vendedor', dono: 'Dono', bloqueada: 'Banida', novaSenha: 'Nova senha', banir: 'Banir', desbanir: 'Desbanir',
      senhaTemp: 'Senha temporária (passe para a pessoa; ela troca em Minha conta):', senhaT: 'Gerar uma senha nova?', senhaD: 'A senha atual deixa de funcionar.', banirT: 'Banir esta conta?', banirD: 'A pessoa sai na hora e não consegue mais entrar. Dá para desfazer.' },
  };
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
      '<p class="err">' + esc(contas.erro) + '</p><div class="invlist">' + linhas + '</div></section>';
  };
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
