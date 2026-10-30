/* Ponte entre o protótipo e o servidor do Kennismarket.
 *
 * O protótipo foi feito para rodar dentro do claude.ai e usa window.claude.use(...) para
 * guardar dados e arquivos. Este arquivo oferece a mesma coisa, mas guardando tudo no
 * Supabase pelo nosso servidor. Assim o protótipo roda no site sem mudar uma linha dele.
 *
 *   claude.use("db")        → coleções de documentos (lojas, arquivos de entrega, vendedores)
 *   claude.use("assets")    → envio de arquivos, que abrem em /_blob/<id>
 *   claude.use("downloads") → baixar arquivos
 *   claude.use("sample")    → IA do chat de suporte (null se estiver desligada)
 */
(function () {
  'use strict';
  var API = '/api/prototipo';
  var INTERVALO = 5000; // de quanto em quanto tempo procura mudanças feitas por outros visitantes

  function falha(codigo, mensagem) {
    var e = new Error(mensagem || codigo);
    e.code = codigo;
    return e;
  }

  async function json(url, opcoes) {
    // Gravações levam o login do dono, se houver (public/js/admin-dono.js): o servidor exige
    // dono para criar e apagar convites, mudar a configuração e apagar contas de vendedor.
    if (opcoes && opcoes.method && window.kmTokenDono) {
      var token = await window.kmTokenDono();
      if (token) opcoes.headers = Object.assign({}, opcoes.headers, { Authorization: 'Bearer ' + token });
    }
    var r = await fetch(url, opcoes);
    var corpo = await r.json().catch(function () { return {}; });
    if (!r.ok) throw falha(corpo.codigo || (r.status === 429 ? 'rate_limited' : 'error'), corpo.erro);
    return corpo;
  }

  // ---------- db ----------
  function criarDb() {
    var estado = {};   // coleção → { versao, docs }
    var ouvintes = {}; // coleção → lista de { aoMudar, aoFalhar }
    var buscando = {};

    function retrato(c) {
      var docs = (estado[c] ? estado[c].docs : []).map(function (d) {
        return { id: d.id, exists: true, data: function () { return JSON.parse(JSON.stringify(d.dados)); } };
      });
      return { docs: docs, size: docs.length, empty: docs.length === 0 };
    }
    function avisar(c) {
      (ouvintes[c] || []).forEach(function (o) { try { o.aoMudar(retrato(c)); } catch (e) { console.error(e); } });
    }
    function buscar(c, forcar) {
      if (buscando[c] && !forcar) return buscando[c];
      var versao = !forcar && estado[c] ? estado[c].versao : '';
      buscando[c] = json(API + '/colecoes/' + c + '?versao=' + encodeURIComponent(versao))
        .then(function (r) {
          if (r.inalterado) return;
          estado[c] = { versao: r.versao, docs: r.docs };
          avisar(c);
        })
        .catch(function (e) {
          (ouvintes[c] || []).forEach(function (o) { if (o.aoFalhar) try { o.aoFalhar(e); } catch (x) {} });
        })
        .finally(function () { buscando[c] = null; });
      return buscando[c];
    }

    setInterval(function () {
      if (document.visibilityState !== 'visible') return;
      Object.keys(ouvintes).forEach(function (c) { if (ouvintes[c].length) buscar(c); });
    }, INTERVALO);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') Object.keys(ouvintes).forEach(function (c) { buscar(c); });
    });

    function separar(caminho) {
      var partes = String(caminho).split('/');
      if (partes.length !== 2) throw falha('invalid', 'caminho inválido: ' + caminho);
      return { c: partes[0], id: partes[1] };
    }

    return {
      collection: function (c) {
        return {
          onSnapshot: function (aoMudar, aoFalhar) {
            var o = { aoMudar: aoMudar, aoFalhar: aoFalhar };
            (ouvintes[c] = ouvintes[c] || []).push(o);
            if (estado[c]) setTimeout(function () { aoMudar(retrato(c)); }, 0);
            buscar(c, true);
            return function parar() { ouvintes[c] = (ouvintes[c] || []).filter(function (x) { return x !== o; }); };
          },
        };
      },
      doc: function (caminho) {
        var p = separar(caminho);
        var url = API + '/docs/' + encodeURIComponent(p.c) + '/' + encodeURIComponent(p.id);
        return {
          set: async function (dados) {
            await json(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dados: dados }) });
            await buscar(p.c, true);
          },
          delete: async function () {
            await json(url, { method: 'DELETE' });
            await buscar(p.c, true);
          },
          get: async function () {
            await buscar(p.c, true);
            var d = (estado[p.c] ? estado[p.c].docs : []).find(function (x) { return x.id === p.id; });
            return { id: p.id, exists: Boolean(d), data: function () { return d ? JSON.parse(JSON.stringify(d.dados)) : undefined; } };
          },
        };
      },
    };
  }

  // ---------- assets ----------
  var assets = {
    upload: async function (arquivo, opcoes) {
      var tipo = (opcoes && opcoes.type) || arquivo.type || 'application/octet-stream';
      var r = await json(API + '/arquivos', { method: 'POST', headers: { 'Content-Type': tipo }, body: arquivo });
      return { id: r.id, sizeBytes: r.sizeBytes, mimeType: r.mimeType, url: '/_blob/' + r.id };
    },
    delete: async function (id) {
      await json(API + '/arquivos/' + encodeURIComponent(id), { method: 'DELETE' });
    },
  };

  // ---------- downloads ----------
  var downloads = {
    save: async function (o) {
      var url = URL.createObjectURL(o.data);
      var a = document.createElement('a');
      a.href = url;
      a.download = o.filename || 'arquivo';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    },
  };

  // ---------- sample (IA do suporte) ----------
  async function amostrar(turns, opcoes) {
    opcoes = opcoes || {};
    var r = await fetch(API + '/ia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ turns: turns }),
      signal: opcoes.signal,
    });
    if (!r.ok || !r.body) {
      var c = await r.json().catch(function () { return {}; });
      throw falha(c.codigo || (r.status === 429 ? 'rate_limited' : 'error'));
    }
    var leitor = r.body.getReader();
    var dec = new TextDecoder();
    var resto = '';
    var texto = '';
    for (;;) {
      var parte = await leitor.read();
      if (parte.done) break;
      resto += dec.decode(parte.value, { stream: true });
      var eventos = resto.split('\n\n');
      resto = eventos.pop();
      for (var i = 0; i < eventos.length; i++) {
        var linha = eventos[i].replace(/^data: /, '');
        if (!linha) continue;
        var ev = JSON.parse(linha);
        if (ev.erro) throw falha(ev.erro);
        if (typeof ev.text === 'string') {
          texto = ev.text;
          if (opcoes.onText) opcoes.onText({ text: texto });
        }
      }
    }
    return { text: texto };
  }
  var iaLigada = fetch(API + '/ia').then(function (r) { return r.json(); }).then(function (j) { return Boolean(j.disponivel); }, function () { return false; });

  var db = null;
  window.claude = {
    use: async function (nome) {
      if (nome === 'db') return db || (db = criarDb());
      if (nome === 'assets') return assets;
      if (nome === 'downloads') return downloads;
      if (nome === 'sample') return (await iaLigada) ? amostrar : null;
      return null;
    },
  };
})();
