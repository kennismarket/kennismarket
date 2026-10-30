/* Conta de dono: entra pelo login inicial do site e libera o painel do dono.
 *
 * No protótipo, o painel abria para qualquer visitante (era só demonstração).
 * No site, só a conta de dono vê o botão do painel e consegue abri-lo.
 * O dono entra na tela de login normal, com o e-mail no campo de usuário e a senha
 * da conta do Supabase (papel "dono" na tabela perfis). O servidor liga isto ao protótipo
 * com os ajustes de server/lib/pagina-prototipo.js.
 *
 * A sessão fica neste navegador (localStorage). O token vai junto nas gravações da ponte,
 * e o servidor confere de novo nas ações de dono (convites, configuração, contas de vendedor).
 */
(function () {
  'use strict';
  var CHAVE = 'km-dono';
  var cfg = null;      // { supabaseUrl, supabasePublishableKey }
  var sessao = null;   // { access, refresh, exp, email }
  var checando = true; // enquanto confere a sessão guardada, o painel mostra "Conferindo..."

  var TXT = {
    nl: { checando: 'Bezig met controleren…', erro: 'E-mail of wachtwoord onjuist.', naoDono: 'Dit account is geen eigenaar.', falha: 'Kon niet inloggen. Probeer het opnieuw.' },
    en: { checando: 'Checking…', erro: 'Wrong email or password.', naoDono: 'This account is not an owner.', falha: 'Could not sign in. Please try again.' },
    es: { checando: 'Comprobando…', erro: 'Correo o contraseña incorrectos.', naoDono: 'Esta cuenta no es de dueño.', falha: 'No se pudo entrar. Inténtalo de nuevo.' },
    pt: { checando: 'Conferindo…', erro: 'E-mail ou senha incorretos.', naoDono: 'Esta conta não é de dono.', falha: 'Não foi possível entrar. Tente de novo.' },
  };
  function txt(k) {
    var lg = (typeof S !== 'undefined' && S.lang) || 'nl';
    return (TXT[lg] || TXT.nl)[k];
  }

  function guardar(s) {
    sessao = s;
    try { s ? localStorage.setItem(CHAVE, JSON.stringify(s)) : localStorage.removeItem(CHAVE); } catch (e) {}
  }
  function ligar(s) {
    window.KM_DONO = Boolean(s);
    window.KM_DONO_TOKEN = s ? s.access : null;
  }
  function noPainel() {
    return typeof S !== 'undefined' && (S.view === 'admin' || S.view === 'editar');
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

  // Pergunta ao servidor se o token é de um dono. Devolve o perfil, ou null se não for.
  async function perfilDono(s) {
    var r = await fetch('/api/admin/eu', { headers: { Authorization: 'Bearer ' + s.access } });
    if (r.status === 401 || r.status === 403) return null;
    if (!r.ok) throw new Error('servidor');
    return r.json();
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

  // Sair do site (botão do protótipo) também sai da conta de dono.
  window.kmSairDono = function () {
    guardar(null);
    ligar(null);
  };

  // Login inicial do site: se o campo de usuário tem um e-mail, tenta a conta de dono.
  // Devolve true quando cuidou do login (o protótipo não continua); false para o login normal.
  window.kmTalvezDono = function () {
    var campo = document.getElementById('au-user');
    var email = campo ? campo.value.trim() : '';
    if (email.indexOf('@') < 1) return false;
    var senha = document.getElementById('au-pass').value;
    var err = document.getElementById('au-err');
    var botao = document.querySelector('#authform button[type=submit]');
    err.textContent = '';
    if (botao) botao.disabled = true;
    (async function () {
      try {
        var s = await auth('password', { email: email, password: senha });
        var perfil = await perfilDono(s);
        if (!perfil) throw Object.assign(new Error('naoDono'), { naoDono: true });
        guardar(s);
        ligar(s);
        var nome = String(perfil.nome || email.split('@')[0]).trim();
        var usuario = email.split('@')[0].toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 20) || 'dono';
        seed({ name: nome.split(/\s+/)[0], full: nome, username: usuario, email: email });
        enter();
      } catch (e) {
        err.textContent = e.naoDono ? txt('naoDono') : (e.status === 400 ? txt('erro') : txt('falha'));
        if (botao) botao.disabled = false;
      }
    })();
    return true;
  };

  // Painel do dono aberto por quem não é dono (por exemplo, pelo endereço #admin): volta ao início.
  window.kmSemAcesso = function () {
    if (checando) return '<div class="wrap"><p class="muted" style="margin:60px 0;text-align:center">' + txt('checando') + '</p></div>';
    setTimeout(function () {
      if (noPainel() && !window.KM_DONO) { S.view = 'explorar'; render(); }
    }, 0);
    return '';
  };

  // Ao abrir o site: confere a sessão guardada (pode ter vencido ou deixado de ser dono).
  ligar(null);
  (async function () {
    try { sessao = JSON.parse(localStorage.getItem(CHAVE) || 'null'); } catch (e) { sessao = null; }
    try {
      var s = await sessaoValida();
      if (s && (await perfilDono(s))) ligar(s);
      else { guardar(null); ligar(null); }
    } catch (e) {
      // servidor fora do ar: não apaga a sessão, só não libera agora
      ligar(null);
    }
    checando = false;
    if (noPainel() && typeof render === 'function') render();
  })();
})();
