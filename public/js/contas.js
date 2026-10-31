/* Login real (Supabase Auth) ligado às telas do protótipo.
 *
 * O protótipo fazia login de mentira: qualquer usuário e senha entravam, e as contas de
 * vendedor guardavam um hash da senha num documento que todo mundo podia ler.
 * Aqui as mesmas telas passam a usar o servidor (server/routes/contas.js):
 *   - tela inicial: entrar com o nome de usuário ou o e-mail, e criar conta de cliente;
 *   - link de convite do vendedor (#convite-<token>): criar a conta, entrar e trocar a senha
 *     pelo link novo que o dono gera no painel;
 *   - "Alterar senha" na página da conta;
 *   - conta de dono: mesma tela inicial; só ela vê e abre o painel do dono.
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
  }

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

  aplicarPerfil(null);
  document.addEventListener('DOMContentLoaded', function () {
    ligarTelas();
    conferir();
  });
})();
