/* Login do dono para a página de administração.
 *
 * No protótipo, a administração abria para qualquer visitante (era só demonstração).
 * No site, ela só abre com a conta de dono (Supabase Auth, papel "dono" na tabela perfis).
 * O servidor troca o começo de vAdmin() e vEditStore() por uma checagem que chama
 * kmLoginDono() quando o visitante não é dono (server/lib/pagina-prototipo.js).
 *
 * A sessão fica neste navegador (localStorage). O token vai junto nas gravações da ponte,
 * e o servidor confere de novo nas ações de dono (convites, configuração, contas de vendedor).
 */
(function () {
  'use strict';
  var CHAVE = 'km-dono';
  var cfg = null;      // { supabaseUrl, supabasePublishableKey }
  var sessao = null;   // { access, refresh, exp, email }
  var checando = true; // enquanto confere a sessão guardada, a tela mostra "Conferindo..."

  var TXT = {
    nl: { t: 'Inloggen als eigenaar', d: 'Deze pagina is alleen voor de eigenaren van Kennismarket.', email: 'E-mail', senha: 'Wachtwoord', entrar: 'Inloggen', checando: 'Bezig met controleren…', erro: 'E-mail of wachtwoord onjuist.', naoDono: 'Dit account is geen eigenaar.', falha: 'Kon niet inloggen. Probeer het opnieuw.', sair: 'Uitloggen als eigenaar' },
    en: { t: 'Owner sign-in', d: 'This page is only for Kennismarket owners.', email: 'Email', senha: 'Password', entrar: 'Sign in', checando: 'Checking…', erro: 'Wrong email or password.', naoDono: 'This account is not an owner.', falha: 'Could not sign in. Please try again.', sair: 'Sign out as owner' },
    es: { t: 'Acceso de dueño', d: 'Esta página es solo para los dueños de Kennismarket.', email: 'Correo', senha: 'Contraseña', entrar: 'Entrar', checando: 'Comprobando…', erro: 'Correo o contraseña incorrectos.', naoDono: 'Esta cuenta no es de dueño.', falha: 'No se pudo entrar. Inténtalo de nuevo.', sair: 'Salir de la cuenta de dueño' },
    pt: { t: 'Entrar como dono', d: 'Esta página é só para os donos do Kennismarket.', email: 'E-mail', senha: 'Senha', entrar: 'Entrar', checando: 'Conferindo…', erro: 'E-mail ou senha incorretos.', naoDono: 'Esta conta não é de dono.', falha: 'Não foi possível entrar. Tente de novo.', sair: 'Sair da conta de dono' },
  };
  function txt(k) {
    var lg = (typeof S !== 'undefined' && S.lang) || 'nl';
    return (TXT[lg] || TXT.nl)[k];
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; });
  }

  function guardar(s) {
    sessao = s;
    try { s ? localStorage.setItem(CHAVE, JSON.stringify(s)) : localStorage.removeItem(CHAVE); } catch (e) {}
  }
  function ligar(s) {
    window.KM_DONO = Boolean(s);
    window.KM_DONO_TOKEN = s ? s.access : null;
  }
  function redesenhar() {
    if (typeof render === 'function' && typeof S !== 'undefined' && (S.view === 'admin' || S.view === 'editar')) render();
  }

  async function config() {
    if (!cfg) cfg = await (await fetch('/api/config')).json();
    return cfg;
  }

  // Login e renovação pelo Supabase Auth (a chave "publishable" é pública por natureza).
  async function auth(tipo, corpo) {
    var c = await config();
    var r = await fetch(c.supabaseUrl + '/auth/v1/token?grant_type=' + tipo, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: c.supabasePublishableKey },
      body: JSON.stringify(corpo),
    });
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok) throw Object.assign(new Error('auth'), { status: r.status });
    return { access: j.access_token, refresh: j.refresh_token, exp: Date.now() + (j.expires_in || 3600) * 1000, email: j.user && j.user.email };
  }

  // Pergunta ao servidor se o token é de um dono.
  async function ehDono(s) {
    var r = await fetch('/api/admin/eu', { headers: { Authorization: 'Bearer ' + s.access } });
    if (r.status === 401 || r.status === 403) return false;
    if (!r.ok) throw new Error('servidor');
    return true;
  }

  // Sessão válida por mais 1 minuto pelo menos; renova se precisar.
  async function sessaoValida() {
    if (!sessao) return null;
    if (sessao.exp - Date.now() > 60 * 1000) return sessao;
    try {
      var nova = await auth('refresh_token', { refresh_token: sessao.refresh });
      nova.email = nova.email || sessao.email;
      guardar(nova);
      ligar(nova);
      return nova;
    } catch (e) {
      guardar(null);
      ligar(null);
      return null;
    }
  }

  // A ponte chama isto antes de cada gravação, para mandar um token que não venceu.
  window.kmTokenDono = async function () {
    var s = await sessaoValida();
    return s ? s.access : null;
  };

  async function entrar(email, senha) {
    var s = await auth('password', { email: email, password: senha });
    if (!(await ehDono(s))) {
      var e = new Error('naoDono');
      e.naoDono = true;
      throw e;
    }
    guardar(s);
    ligar(s);
  }

  window.kmSairDono = function () {
    guardar(null);
    ligar(null);
    redesenhar();
  };

  // Tela mostrada no lugar da administração. Usa as mesmas classes do protótipo.
  window.kmLoginDono = function () {
    if (checando) return '<div class="wrap"><p class="muted" style="margin:60px 0;text-align:center">' + txt('checando') + '</p></div>';
    return '<div class="wrap"><div style="max-width:420px;margin:40px auto">' +
      '<div class="page-head"><div><span class="label">Kennismarket</span><h1 style="margin-top:6px">' + txt('t') + '</h1><p>' + txt('d') + '</p></div></div>' +
      '<section class="panel"><form id="km-dono-form" novalidate>' +
      '<div class="field"><label for="km-dono-email">' + txt('email') + '</label><input id="km-dono-email" type="email" autocomplete="username" required></div>' +
      '<div class="field"><label for="km-dono-senha">' + txt('senha') + '</label><input id="km-dono-senha" type="password" autocomplete="current-password" required></div>' +
      '<p class="err" id="km-dono-err"></p>' +
      '<button class="btn primary block" type="submit">' + txt('entrar') + '</button>' +
      '</form></section></div></div>';
  };

  // Link discreto para sair, no fim da administração.
  window.kmSairDonoHTML = function () {
    var email = sessao && sessao.email ? esc(sessao.email) + ' · ' : '';
    return '<p class="muted" style="font-size:12px;text-align:center;margin:24px 0 0">' + email +
      '<a href="#" id="km-dono-sair" style="color:inherit">' + txt('sair') + '</a></p>';
  };

  document.addEventListener('submit', async function (ev) {
    if (!ev.target || ev.target.id !== 'km-dono-form') return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    var err = document.getElementById('km-dono-err');
    var botao = ev.target.querySelector('button[type=submit]');
    var email = document.getElementById('km-dono-email').value.trim();
    var senha = document.getElementById('km-dono-senha').value;
    if (!email || !senha) { err.textContent = txt('erro'); return; }
    err.textContent = '';
    botao.disabled = true;
    try {
      await entrar(email, senha);
      redesenhar();
    } catch (e) {
      err.textContent = e.naoDono ? txt('naoDono') : (e.status === 400 ? txt('erro') : txt('falha'));
      botao.disabled = false;
    }
  }, true);

  document.addEventListener('click', function (ev) {
    if (ev.target && ev.target.id === 'km-dono-sair') {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      window.kmSairDono();
    }
  }, true);

  // Ao abrir o site: confere a sessão guardada (pode ter vencido ou deixado de ser dono).
  ligar(null);
  (async function () {
    try { sessao = JSON.parse(localStorage.getItem(CHAVE) || 'null'); } catch (e) { sessao = null; }
    try {
      var s = await sessaoValida();
      if (s && (await ehDono(s))) ligar(s);
      else { guardar(null); ligar(null); }
    } catch (e) {
      // servidor fora do ar: não apaga a sessão, só não libera agora
      ligar(null);
    }
    checando = false;
    redesenhar();
  })();
})();
