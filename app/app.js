'use strict';

const APP_VERSION = '1.3.0';
const PROGRESS_KEY = 'qcm777-progress';
const SESSION_KEY = 'qcm777-session';
const LETTERS = ['A', 'B', 'C', 'D'];
const PASS_RATE = 75;
const MODE_LABEL = { new: 'Série', flag: 'Flaggées', retry: 'Fausses' };

let QUESTIONS = [];
let BY_ID = {};
let progress = { v: 1, done: {}, flags: {}, history: [] };
let chosenCount = String(load('qcm777-count', '30'));
let session = null;

const app = document.getElementById('app');

// ---------- storage ----------
function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}
function save(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    toast('Sauvegarde impossible (stockage plein ou bloqué)');
  }
}
function saveProgress() { save(PROGRESS_KEY, progress); }
function saveSession() { save(SESSION_KEY, session); }

// ---------- helpers ----------
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}
const doneCount = () => QUESTIONS.filter(q => progress.done[q.id]).length;
const flaggedIds = () => QUESTIONS.filter(q => progress.flags[q.id]).map(q => q.id);
const remainingIds = () => QUESTIONS.filter(q => !progress.done[q.id]).map(q => q.id);

// ---------- series ----------
function startSeries(mode, ids) {
  if (!ids.length) return;
  session = { mode, ids, i: 0, answers: {}, sel: null, revealed: false };
  saveSession();
  renderQuiz();
}
function startNew(n) {
  n = Math.floor(Number(n));
  if (!n || n < 1) { toast('Nombre invalide'); return; }
  const rest = remainingIds();
  if (!rest.length) { toast('Banque épuisée : fais un Reset pour recommencer'); return; }
  startSeries('new', shuffle(rest).slice(0, n));
}

// ---------- screens ----------
let updateReady = false;

function renderHome() {
  if (updateReady) { location.reload(); return; }
  window.scrollTo(0, 0);
  const total = QUESTIONS.length;
  const done = doneCount();
  const rest = total - done;
  const flags = flaggedIds().length;
  const pct = total ? Math.round(done / total * 100) : 0;
  const canResume = session && session.i < session.ids.length;

  app.innerHTML = `
    <h1>QCM B777</h1>
    <div class="card">
      <div class="stats">
        <div><b>${done}</b><span>faites</span></div>
        <div><b>${rest}</b><span>restantes</span></div>
        <div><b>${total}</b><span>total</span></div>
      </div>
      <div class="bar"><div style="width:${pct}%"></div></div>
    </div>

    ${canResume ? `
    <div class="card">
      <p style="margin:0 0 10px">Série en cours : question ${session.i + 1} / ${session.ids.length}</p>
      <div class="row">
        <button class="primary grow" data-act="resume">Reprendre</button>
        <button class="grow" data-act="drop">Abandonner</button>
      </div>
    </div>` : ''}

    <div class="card">
      <h2 style="margin-top:0">Nouvelle série</h2>
      <p class="muted" style="margin-top:0">Questions tirées au hasard parmi les ${rest} jamais faites.</p>
      <p class="muted" style="margin:0 0 8px">Nombre de questions :</p>
      <div class="row counts">
        ${['30', '50', '100', 'perso'].map(n => `<button class="chip ${chosenCount === n ? 'on' : ''}" data-act="count" data-n="${n}" ${rest ? '' : 'disabled'}>${n === 'perso' ? 'Perso' : n}</button>`).join('')}
      </div>
      <div class="custom" id="customBox" ${chosenCount === 'perso' ? '' : 'hidden'}>
        <input type="number" inputmode="numeric" min="1" max="${Math.max(rest, 1)}" placeholder="Nombre (1 à ${rest})" id="customN">
      </div>
      <button class="primary" style="width:100%;margin-top:12px" data-act="start" ${rest ? '' : 'disabled'}>Commencer la série</button>
      ${rest ? '' : '<p class="muted">Banque épuisée. Fais un Reset pour recommencer.</p>'}
    </div>

    <div class="card">
      <button class="grow" style="width:100%" data-act="flagged" ${flags ? '' : 'disabled'}>🚩 Série questions flaggées (${flags})</button>
    </div>

    ${renderHistory()}

    <div class="card">
      <h2 style="margin-top:0">Progression</h2>
      <button class="danger" style="width:100%" data-act="reset">Reset</button>
    </div>
    <p class="footer">Version ${APP_VERSION} · ${total} questions</p>
  `;
}

function pctClass(p) { return p >= PASS_RATE ? 'pass' : 'fail'; }

function renderHistory() {
  const h = progress.history || [];
  if (!h.length) return '';
  const rows = h.slice().reverse().slice(0, 30).map(e => {
    const p = Math.round(e.good / e.n * 100);
    const d = new Date(e.date);
    const date = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' ' +
      d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return `<li><span class="muted">${date}</span><span>${MODE_LABEL[e.mode] || ''} · ${e.good}/${e.n}</span><b class="${pctClass(p)}">${p} %</b></li>`;
  }).join('');
  const all = h.filter(e => e.mode !== 'retry');
  const avg = all.length ? Math.round(all.reduce((a, e) => a + e.good / e.n, 0) / all.length * 100) : null;
  return `
    <div class="card">
      <h2 style="margin-top:0">Historique</h2>
      ${avg !== null ? `<p class="muted" style="margin-top:0">Moyenne (hors « fausses ») : <b class="${pctClass(avg)}">${avg} %</b> · objectif ${PASS_RATE} %</p>` : ''}
      <ul class="history">${rows}</ul>
      <button class="linkish" data-act="clearhist">Effacer l'historique</button>
    </div>`;
}

function renderQuiz() {
  window.scrollTo(0, 0);
  const s = session;
  const q = BY_ID[s.ids[s.i]];
  if (!q) { session = null; saveSession(); renderHome(); return; }
  const last = s.i === s.ids.length - 1;
  const title = { new: 'Série', flag: 'Flaggées', retry: 'Refaire les fausses' }[s.mode];
  const flagged = !!progress.flags[q.id];
  const ok = s.revealed && s.sel === q.reponse;

  app.innerHTML = `
    <div class="top">
      <button data-act="home" aria-label="Accueil">✕</button>
      <span class="muted">${title} · ${s.i + 1} / ${s.ids.length}</span>
      <button class="flag ${flagged ? 'on' : ''}" data-act="flag" aria-label="Flagger">🚩</button>
    </div>
    <div class="card">
      <p class="question">${esc(q.question)}</p>
      <p class="page">Page PDF ${q.page} · Question n° ${q.id}</p>
      ${q.image ? `<img class="qimg" src="${esc(q.image)}" alt="Schéma de la question">` : ''}
      <div class="choices">
        ${q.choix.map((c, k) => {
          const L = LETTERS[k];
          let cls = '';
          if (s.revealed) {
            if (L === q.reponse) cls = 'ok';
            else if (L === s.sel) cls = 'ko';
          } else if (L === s.sel) cls = 'sel';
          return `<button class="choice ${cls}" data-act="pick" data-l="${L}" ${s.revealed ? 'disabled style="opacity:1"' : ''}>
            <span class="l">${L}.</span><span>${esc(c)}</span></button>`;
        }).join('')}
      </div>
      ${s.revealed ? `<p class="feedback ${ok ? 'ok' : 'ko'}">${ok ? '✓ Correct' : `✗ Faux — bonne réponse : ${q.reponse}`}</p>` : ''}
    </div>
    <div class="actions">
      ${s.revealed
        ? `<button class="primary grow" data-act="next">${last ? 'Voir le score' : 'Question suivante →'}</button>`
        : `<button class="primary grow" data-act="validate" ${s.sel ? '' : 'disabled'}>Valider</button>`}
    </div>
  `;
}

function renderEnd() {
  window.scrollTo(0, 0);
  const s = session;
  const wrong = s.ids.filter(id => s.answers[id] !== BY_ID[id].reponse);
  const good = s.ids.length - wrong.length;
  const pct = Math.round(good / s.ids.length * 100);
  if (!s.logged) {
    progress.history = progress.history || [];
    progress.history.push({ date: new Date().toISOString(), mode: s.mode, n: s.ids.length, good });
    s.logged = true;
    saveProgress();
  }
  app.innerHTML = `
    <h1>Fin de série</h1>
    <div class="card" style="text-align:center">
      <div class="bigpct ${pctClass(pct)}">${pct} %</div>
      <p class="verdict ${pctClass(pct)}">${pct >= PASS_RATE ? '✓ Réussi' : '✗ Échoué'} <span class="muted">(seuil ${PASS_RATE} %)</span></p>
      <p class="muted" style="margin:0">${good} réussies · ${wrong.length} ratées · sur ${s.ids.length}</p>
    </div>
    <div class="row" style="margin-bottom:14px">
      ${wrong.length
        ? `<button class="primary grow" data-act="retry">Refaire les fausses (${wrong.length})</button>`
        : '<p style="width:100%;text-align:center;font-weight:700">Zéro faute 🎉</p>'}
      <button class="grow" data-act="home">Accueil</button>
    </div>
    ${wrong.length ? `
    <div class="card">
      <h2 style="margin-top:0">Erreurs</h2>
      <ul class="wrong">
        ${wrong.map(id => {
          const q = BY_ID[id];
          const k = LETTERS.indexOf(q.reponse);
          return `<li>${esc(q.question)}<br><span class="muted">Bonne réponse : ${q.reponse}. ${esc(q.choix[k])} · Page PDF ${q.page}</span></li>`;
        }).join('')}
      </ul>
    </div>` : ''}
  `;
  session.wrong = wrong;
  session.finished = true;
  saveSession();
}

// ---------- actions ----------
app.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.tagName === 'FORM') return;
  const act = el.dataset.act;
  switch (act) {
    case 'count':
      chosenCount = el.dataset.n;
      save('qcm777-count', chosenCount);
      app.querySelectorAll('[data-act=count]').forEach(b => b.classList.toggle('on', b === el));
      document.getElementById('customBox').hidden = chosenCount !== 'perso';
      if (chosenCount === 'perso') document.getElementById('customN').focus();
      break;
    case 'start':
      startNew(chosenCount === 'perso' ? document.getElementById('customN').value : chosenCount);
      break;
    case 'clearhist':
      if (confirm("Effacer l'historique des séries ?")) { progress.history = []; saveProgress(); renderHome(); }
      break;
    case 'flagged': startSeries('flag', shuffle(flaggedIds())); break;
    case 'resume': renderQuiz(); break;
    case 'drop': session = null; saveSession(); renderHome(); break;
    case 'home':
      if (session && session.finished) { session = null; saveSession(); }
      renderHome();
      break;
    case 'pick':
      if (session.revealed) return;
      session.sel = el.dataset.l;
      saveSession();
      renderQuiz();
      break;
    case 'validate': {
      if (!session.sel) return;
      const id = session.ids[session.i];
      session.answers[id] = session.sel;
      session.revealed = true;
      if (session.mode !== 'retry') { progress.done[id] = 1; saveProgress(); }
      saveSession();
      renderQuiz();
      break;
    }
    case 'next':
      session.i++;
      session.sel = null;
      session.revealed = false;
      if (session.i >= session.ids.length) renderEnd();
      else { saveSession(); renderQuiz(); }
      break;
    case 'flag': {
      const id = session.ids[session.i];
      if (progress.flags[id]) delete progress.flags[id];
      else progress.flags[id] = 1;
      saveProgress();
      el.classList.toggle('on', !!progress.flags[id]);
      toast(progress.flags[id] ? 'Question flaggée' : 'Flag retiré');
      break;
    }
    case 'retry': startSeries('retry', shuffle(session.wrong)); break;
    case 'reset':
      if (confirm('Tout remettre à zéro ?\nToutes les questions redeviennent neuves et les flags sont effacés.\n(L\'historique des séries est conservé.)')) {
        progress = { v: 1, done: {}, flags: {}, history: progress.history || [] };
        session = null;
        saveProgress();
        saveSession();
        renderHome();
        toast('Progression remise à zéro');
      }
      break;
  }
});

app.addEventListener('keydown', e => {
  if (e.target.id === 'customN' && e.key === 'Enter') startNew(e.target.value);
});


// ---------- boot ----------
async function boot() {
  const stored = load(PROGRESS_KEY, null);
  if (stored && stored.done && stored.flags) progress = stored;
  if (!Array.isArray(progress.history)) progress.history = [];
  session = load(SESSION_KEY, null);
  try {
    const res = await fetch('questions.json', { cache: 'no-cache' });
    QUESTIONS = await res.json();
  } catch (e) {
    app.innerHTML = '<p class="loading">Impossible de charger les questions. Reconnecte-toi une fois à Internet.</p>';
    return;
  }
  BY_ID = Object.fromEntries(QUESTIONS.map(q => [q.id, q]));
  if (session && (!Array.isArray(session.ids) || session.ids.some(id => !BY_ID[id]))) session = null;
  if (session && session.finished) renderEnd();
  else renderHome();
}

if ('serviceWorker' in navigator) {
  // A new version takes control -> reload once to show it (progress stays in localStorage)
  let hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // never interrupt a question: reload now on the home screen, otherwise when back to it
    if (hadController) {
      if (session && !session.finished) updateReady = true;
      else location.reload();
    }
    hadController = true;
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.update();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update();
      });
    }).catch(() => {});
  });
}

boot();
