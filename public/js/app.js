import { IDIOMAS, PADRAO, TEXTOS } from './i18n.js';

const CHAVE = 'km_idioma';

// Só lembra o idioma se a pessoa escolheu antes. Senão, abre em holandês.
function idiomaSalvo() {
  try {
    const v = localStorage.getItem(CHAVE);
    return IDIOMAS.includes(v) ? v : PADRAO;
  } catch {
    return PADRAO;
  }
}

function aplicarIdioma(lg) {
  const t = TEXTOS[lg];
  document.documentElement.lang = lg;
  document.querySelectorAll('[data-t]').forEach((el) => {
    el.textContent = t[el.dataset.t] ?? TEXTOS[PADRAO][el.dataset.t] ?? '';
  });
  document.getElementById('idioma').value = lg;
}

const seletor = document.getElementById('idioma');
seletor.addEventListener('change', () => {
  try { localStorage.setItem(CHAVE, seletor.value); } catch { /* navegador sem armazenamento */ }
  aplicarIdioma(seletor.value);
});

aplicarIdioma(idiomaSalvo());
