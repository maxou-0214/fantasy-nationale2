const config = window.FANTASY_CONFIG || {};
const { createClient } = window.supabase || {};

if (!createClient || !config.SUPABASE_URL || !config.SUPABASE_PUBLISHABLE_KEY) {
  document.getElementById('app').innerHTML = '<div class="auth-page"><div class="auth-card"><h1>Configuration incomplète</h1><p>Impossible d\'initialiser Supabase.</p></div></div>';
  throw new Error('Supabase configuration missing');
}

const db = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

const ui = {
  view: localStorage.getItem('fantasy-n2-view') || 'home',
  authMode: 'login',
  authMessage: '',
  authError: '',
  busy: false,
  selectedRoundId: localStorage.getItem('fantasy-n2-round') || null
};

const state = {
  session: null,
  profile: null,
  profiles: [],
  teams: [],
  players: [],
  rounds: [],
  matches: [],
  matchPredictions: [],
  tryPredictions: [],
  actualScorers: [],
  roundScores: []
};

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}
function fmtDate(value) {
  if (!value) return '—';
  try { return new Intl.DateTimeFormat('fr-FR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)); }
  catch { return value; }
}
function formDate(value) {
  if (!value) return '';
  const d = new Date(value);
  const pad = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function team(id) { return state.teams.find(x => x.id === id); }
function player(id) { return state.players.find(x => x.id === id); }
function roundById(id) { return state.rounds.find(x => x.id === id); }
function currentRound() { return roundById(ui.selectedRoundId); }
function roundMatches(roundId = ui.selectedRoundId) { return state.matches.filter(m => m.round_id === roundId); }
function isAdmin() { return state.profile?.role === 'admin'; }
function isRoundLocked(round = currentRound()) {
  if (!round) return true;
  return round.status !== 'open' || new Date() >= new Date(round.deadline);
}
function isRoundRevealed(round = currentRound()) {
  if (!round) return false;
  return new Date() >= new Date(round.deadline) || ['locked','scored','archived'].includes(round.status);
}
function resultText(result, m) {
  if (result === 'home') return team(m.home_team_id)?.name || 'Domicile';
  if (result === 'away') return team(m.away_team_id)?.name || 'Extérieur';
  if (result === 'draw') return 'Nul';
  return '—';
}
function playerName(p) {
  return [p?.first_name, p?.last_name].filter(Boolean).join(' ') || 'Joueur';
}
function setView(view) {
  ui.view = view;
  localStorage.setItem('fantasy-n2-view', view);
  render();
}
function setRound(roundId) {
  ui.selectedRoundId = roundId || null;
  if (roundId) localStorage.setItem('fantasy-n2-round', roundId); else localStorage.removeItem('fantasy-n2-round');
  loadRoundData().catch(showError);
}
function showError(error) {
  console.error(error);
  alert(error?.message || String(error));
}
async function queryOrThrow(promise) {
  const { data, error } = await promise;
  if (error) throw error;
  return data;
}

async function init() {
  const { data } = await db.auth.getSession();
  state.session = data.session;
  db.auth.onAuthStateChange((_event, session) => {
    const changed = state.session?.user?.id !== session?.user?.id;
    state.session = session;
    if (changed) bootstrap().catch(showError);
  });
  await bootstrap();
}

async function bootstrap() {
  if (!state.session?.user) {
    state.profile = null;
    render();
    return;
  }
  ui.busy = true;
  render();
  try {
    const uid = state.session.user.id;
    const profileRows = await queryOrThrow(db.from('profiles').select('id,pseudo,role,created_at').eq('id', uid).limit(1));
    state.profile = profileRows?.[0] || null;
    await loadCoreData();
    await loadRoundData(false);
  } finally {
    ui.busy = false;
    render();
  }
}

async function loadCoreData() {
  const [profiles, teams, players, rounds, matches, scores] = await Promise.all([
    queryOrThrow(db.from('profiles').select('id,pseudo,role,created_at').order('pseudo')),
    queryOrThrow(db.from('teams').select('*').order('name')),
    queryOrThrow(db.from('players').select('*').order('last_name').order('first_name')),
    queryOrThrow(db.from('rounds').select('*').order('season',{ascending:false}).order('round_number',{ascending:false})),
    queryOrThrow(db.from('matches').select('*').order('kickoff_at',{ascending:true})),
    queryOrThrow(db.from('round_scores').select('*'))
  ]);
  state.profiles = profiles || [];
  state.teams = teams || [];
  state.players = players || [];
  state.rounds = rounds || [];
  state.matches = matches || [];
  state.roundScores = scores || [];

  if (!ui.selectedRoundId || !roundById(ui.selectedRoundId)) {
    const preferred = state.rounds.find(r => r.status === 'open') || state.rounds[0];
    ui.selectedRoundId = preferred?.id || null;
    if (ui.selectedRoundId) localStorage.setItem('fantasy-n2-round', ui.selectedRoundId);
  }
}

async function loadRoundData(doRender = true) {
  if (!state.session?.user || !ui.selectedRoundId) {
    state.matchPredictions = [];
    state.tryPredictions = [];
    state.actualScorers = [];
    if (doRender) render();
    return;
  }
  ui.busy = true;
  if (doRender) render();
  try {
    const ids = roundMatches().map(m => m.id);
    const predQuery = ids.length ? db.from('match_predictions').select('*').in('match_id', ids) : Promise.resolve({data:[],error:null});
    const scorerQuery = ids.length ? db.from('match_try_scorers').select('*').in('match_id', ids) : Promise.resolve({data:[],error:null});
    const [mp, tp, scorers, scores] = await Promise.all([
      queryOrThrow(predQuery),
      queryOrThrow(db.from('try_predictions').select('*').eq('round_id', ui.selectedRoundId)),
      queryOrThrow(scorerQuery),
      queryOrThrow(db.from('round_scores').select('*'))
    ]);
    state.matchPredictions = mp || [];
    state.tryPredictions = tp || [];
    state.actualScorers = scorers || [];
    state.roundScores = scores || [];
  } finally {
    ui.busy = false;
    if (doRender) render();
  }
}

async function login(event) {
  event.preventDefault();
  ui.authError = ''; ui.authMessage = '';
  const fd = new FormData(event.currentTarget);
  ui.busy = true; render();
  const { error } = await db.auth.signInWithPassword({
    email: String(fd.get('email') || '').trim(),
    password: String(fd.get('password') || '')
  });
  ui.busy = false;
  if (error) { ui.authError = 'Connexion impossible : ' + error.message; render(); return; }
}

async function signup(event) {
  event.preventDefault();
  ui.authError = ''; ui.authMessage = '';
  const fd = new FormData(event.currentTarget);
  const pseudo = String(fd.get('pseudo') || '').trim();
  const email = String(fd.get('email') || '').trim();
  const password = String(fd.get('password') || '');
  const password2 = String(fd.get('password2') || '');
  if (pseudo.length < 2) { ui.authError = 'Choisis un pseudo d’au moins 2 caractères.'; render(); return; }
  if (password.length < 6) { ui.authError = 'Utilise un mot de passe d’au moins 6 caractères.'; render(); return; }
  if (password !== password2) { ui.authError = 'Les deux mots de passe ne correspondent pas.'; render(); return; }
  ui.busy = true; render();
  const redirectTo = window.location.origin + window.location.pathname;
  const { data, error } = await db.auth.signUp({
    email, password,
    options: { data: { pseudo }, emailRedirectTo: redirectTo }
  });
  ui.busy = false;
  if (error) { ui.authError = 'Inscription impossible : ' + error.message; render(); return; }
  if (!data.session) {
    ui.authMessage = 'Compte créé. Ouvre l’e-mail envoyé par Supabase pour confirmer ton adresse, puis connecte-toi.';
    ui.authMode = 'login';
  } else {
    ui.authMessage = 'Compte créé et connecté.';
  }
  render();
}

async function logout() {
  await db.auth.signOut();
  state.session = null;
  state.profile = null;
  render();
}

function authView() {
  const signupMode = ui.authMode === 'signup';
  return `<div class="auth-page"><div class="auth-card">
    <div class="auth-logo">🏉</div>
    <h1>Fantasy Nationale 2</h1>
    <p class="muted">${signupMode ? 'Crée ton compte pour participer aux pronostics.' : 'Connecte-toi pour accéder à tes pronostics.'}</p>
    ${ui.authError ? `<div class="error-box">${esc(ui.authError)}</div>` : ''}
    ${ui.authMessage ? `<div class="success-box">${esc(ui.authMessage)}</div>` : ''}
    <form onsubmit="${signupMode ? 'signup(event)' : 'login(event)'}">
      ${signupMode ? `<div class="field"><label>Pseudo</label><input class="input" name="pseudo" autocomplete="nickname" required maxlength="40"></div>` : ''}
      <div class="field"><label>Email</label><input class="input" name="email" type="email" autocomplete="email" required></div>
      <div class="field"><label>Mot de passe</label><input class="input" name="password" type="password" autocomplete="${signupMode ? 'new-password' : 'current-password'}" required></div>
      ${signupMode ? `<div class="field"><label>Confirme le mot de passe</label><input class="input" name="password2" type="password" autocomplete="new-password" required></div>` : ''}
      <div class="auth-actions"><button class="btn" type="submit" ${ui.busy?'disabled':''}>${ui.busy?'Chargement…':(signupMode?'Créer mon compte':'Se connecter')}</button></div>
    </form>
    <div class="auth-switch">${signupMode ? 'Déjà inscrit ?' : 'Pas encore de compte ?'} <button class="link-btn" onclick="switchAuth('${signupMode?'login':'signup'}')">${signupMode?'Se connecter':'Créer un compte'}</button></div>
  </div></div>`;
}

function nav() {
  const items = [['home','Accueil'],['predictions','Pronostics'],['leaderboard','Classement'],['history','Historique']];
  if (isAdmin()) items.push(['admin','Admin']);
  return items.map(([key,label]) => `<button class="${ui.view===key?'active':''}" onclick="setView('${key}')">${label}</button>`).join('');
}
function roundSelector() {
  if (!state.rounds.length) return '';
  return `<select class="round-select" onchange="setRound(this.value)">${state.rounds.map(r => `<option value="${r.id}" ${r.id===ui.selectedRoundId?'selected':''}>${esc(r.label)} — ${esc(r.season)}</option>`).join('')}</select>`;
}
function shell(content) {
  return `<div class="shell"><header class="topbar">
    <div class="brand"><div class="brand-badge">🏉</div><div>Fantasy Nationale 2</div></div>
    <nav class="nav">${nav()}</nav>
    <div class="topbar-actions">${roundSelector()}<div class="user-meta"><div><div class="user-name">${esc(state.profile?.pseudo || state.session?.user?.email || '')}</div><div class="user-role">${isAdmin()?'<span class="badge-admin">ADMIN</span>':'Joueur'}</div></div><div class="avatar">${esc((state.profile?.pseudo || '?').slice(0,1).toUpperCase())}</div></div><button class="btn secondary small" onclick="logout()">Déconnexion</button></div>
  </header><main class="main">${ui.busy?'<div class="notice">Synchronisation avec Supabase…</div>':''}${content}</main><footer class="footer">Fantasy Nationale 2 • données synchronisées avec Supabase</footer></div>`;
}

function noRound() {
  return `<div class="card"><div class="empty-state"><h2>Aucune journée disponible</h2><p>${isAdmin()?'Va dans Admin pour créer la première journée.':'L’administrateur n’a pas encore créé de journée.'}</p></div></div>`;
}

function myMatchPrediction(matchId) {
  return state.matchPredictions.find(p => p.user_id === state.session.user.id && p.match_id === matchId);
}
function myTryPredictions(roundId = ui.selectedRoundId) {
  return state.tryPredictions.filter(p => p.user_id === state.session.user.id && p.round_id === roundId).sort((a,b)=>a.slot-b.slot);
}
function ticketStatus() {
  const matches = roundMatches();
  const filled = matches.filter(m => !!myMatchPrediction(m.id)?.predicted_result).length;
  const scorers = myTryPredictions().length;
  return { filled, scorers, complete: matches.length > 0 && filled === matches.length && scorers === 3 };
}

function homeView() {
  const r = currentRound(); if (!r) return noRound();
  const t = ticketStatus();
  const mine = state.roundScores.find(s => s.user_id === state.session.user.id && s.round_id === r.id);
  const total = state.roundScores.filter(s => s.user_id === state.session.user.id).reduce((a,s)=>a+(s.total_points||0),0);
  return `<section class="hero"><div class="hero-card"><div class="kicker">${esc(r.season)} • Journée ${r.round_number}</div><h1>${esc(r.label)}</h1><p>Fais tes pronostics avant le ${esc(fmtDate(r.deadline))}. Résultat correct : +2 • bonus trouvé : +3 • marqueur trouvé : +5.</p><div style="margin-top:18px"><button class="btn" onclick="setView('predictions')">Faire mes pronostics</button></div></div><div class="hero-card hero-stat" style="background:#fff;color:var(--text)"><div class="kicker">Mon total</div><div class="big">${total} pts</div><div class="muted">${mine ? `${mine.total_points} pts sur cette journée` : 'Pas encore de score calculé pour cette journée'}</div></div></section>
  <section class="grid"><div class="card col-4"><h3>Mon ticket</h3><div class="big" style="font-size:30px">${t.filled}/${roundMatches().length}</div><p class="muted">résultats renseignés</p></div><div class="card col-4"><h3>Marqueurs</h3><div class="big" style="font-size:30px">${t.scorers}/3</div><p class="muted">joueurs sélectionnés</p></div><div class="card col-4"><h3>Statut</h3><div class="big" style="font-size:23px">${isRoundLocked(r)?'🔒 Verrouillé':'🟢 Ouvert'}</div><p class="muted">${t.complete?'Ticket complet':'Ticket incomplet'}</p></div></section>`;
}

function predictionButtons(m,pred,locked) {
  return `<div class="result-row">
    <button ${locked?'disabled':''} class="choice ${pred?.predicted_result==='home'?'selected':''}" onclick="saveResult('${m.id}','home')">Victoire ${esc(team(m.home_team_id)?.name)}</button>
    <button ${locked?'disabled':''} class="choice ${pred?.predicted_result==='draw'?'selected':''}" onclick="saveResult('${m.id}','draw')">Match nul</button>
    <button ${locked?'disabled':''} class="choice ${pred?.predicted_result==='away'?'selected':''}" onclick="saveResult('${m.id}','away')">Victoire ${esc(team(m.away_team_id)?.name)}</button>
  </div>`;
}
function bonusBox(m,pred,locked) {
  const items = [
    ['home_offensive_bonus',`BO ${team(m.home_team_id)?.name}`],
    ['home_defensive_bonus',`BD ${team(m.home_team_id)?.name}`],
    ['away_offensive_bonus',`BO ${team(m.away_team_id)?.name}`],
    ['away_defensive_bonus',`BD ${team(m.away_team_id)?.name}`]
  ];
  return `<div class="bonus-grid">${items.map(([field,label]) => `<label class="check"><input type="checkbox" ${locked?'disabled':''} ${pred?.[field]?'checked':''} onchange="saveBonus('${m.id}','${field}',this.checked)"><span>${esc(label)}</span></label>`).join('')}</div>`;
}
function predictionsView() {
  const r = currentRound(); if (!r) return noRound();
  const matches = roundMatches();
  const locked = isRoundLocked(r);
  const t = ticketStatus();
  const matchCards = matches.map(m => { const pred = myMatchPrediction(m.id); return `<div class="card" style="margin-bottom:14px"><div class="match"><div><div class="team">${esc(team(m.home_team_id)?.name)}</div><div class="muted">Domicile</div></div><div class="vs">VS</div><div><div class="team away">${esc(team(m.away_team_id)?.name)}</div><div class="muted" style="text-align:right">Extérieur</div></div></div>${predictionButtons(m,pred,locked)}<h3 style="margin:16px 0 8px">Bonus</h3>${bonusBox(m,pred,locked)}</div>`; }).join('');
  const teamIds = new Set(matches.flatMap(m => [m.home_team_id,m.away_team_id]));
  const picks = myTryPredictions();
  const pickIds = new Set(picks.map(x=>x.player_id));
  const available = state.players.filter(p => p.active && teamIds.has(p.team_id));
  return `<div class="section-title"><div><h2>Mes pronostics</h2><div class="muted">${esc(r.label)} • limite ${esc(fmtDate(r.deadline))}</div></div><span class="pill ${locked?'locked':'open'}">${locked?'🔒 Verrouillé':'● Ouvert'}</span></div>
  ${locked?'<div class="notice">La journée est verrouillée. Supabase bloque aussi les modifications côté base de données.</div>':''}
  ${matches.length?matchCards:'<div class="card"><p>Aucun match programmé sur cette journée.</p></div>'}
  <div class="section-title"><div><h2>Mes 3 marqueurs d’essai</h2><div class="muted">${picks.length}/3 sélectionnés</div></div></div>
  <div class="scorer-list">${available.map(p => `<button ${locked?'disabled':''} class="scorer ${pickIds.has(p.id)?'selected':''}" onclick="toggleTryPick('${p.id}')"><strong>${esc(playerName(p))}</strong><span>${esc(team(p.team_id)?.name)}</span></button>`).join('')}</div>
  <div class="card" style="margin-top:16px">${t.complete?'<div class="notice success"><strong>✓ Ticket complet.</strong> Tout est synchronisé dans Supabase.</div>':`<div class="notice"><strong>Ticket incomplet.</strong> ${t.filled}/${matches.length} résultats et ${t.scorers}/3 marqueurs.</div>`}</div>`;
}

async function saveResult(matchId, value) {
  if (isRoundLocked()) return;
  const old = myMatchPrediction(matchId);
  const row = {
    user_id: state.session.user.id, match_id: matchId, predicted_result: value,
    home_offensive_bonus: old?.home_offensive_bonus || false,
    home_defensive_bonus: old?.home_defensive_bonus || false,
    away_offensive_bonus: old?.away_offensive_bonus || false,
    away_defensive_bonus: old?.away_defensive_bonus || false,
    updated_at: new Date().toISOString()
  };
  await queryOrThrow(db.from('match_predictions').upsert(row,{onConflict:'user_id,match_id'}));
  await loadRoundData();
}
async function saveBonus(matchId, field, checked) {
  if (isRoundLocked()) return;
  const old = myMatchPrediction(matchId);
  if (!old?.predicted_result) {
    alert('Choisis d’abord le résultat du match.'); render(); return;
  }
  const row = { ...old, [field]: checked, updated_at:new Date().toISOString() };
  delete row.id; delete row.created_at;
  await queryOrThrow(db.from('match_predictions').upsert(row,{onConflict:'user_id,match_id'}));
  await loadRoundData();
}
async function toggleTryPick(playerId) {
  if (isRoundLocked()) return;
  const picks = myTryPredictions();
  const existing = picks.find(x => x.player_id === playerId);
  if (existing) {
    await queryOrThrow(db.from('try_predictions').delete().eq('id', existing.id));
  } else {
    if (picks.length >= 3) { alert('Tu peux sélectionner exactement 3 marqueurs maximum.'); return; }
    const used = new Set(picks.map(x=>x.slot));
    const slot = [1,2,3].find(n => !used.has(n));
    await queryOrThrow(db.from('try_predictions').insert({ user_id:state.session.user.id, round_id:ui.selectedRoundId, player_id:playerId, slot }));
  }
  await loadRoundData();
}

function leaderboardView() {
  const r = currentRound(); if (!r) return noRound();
  const totals = state.profiles.map(p => {
    const all = state.roundScores.filter(s => s.user_id === p.id);
    const total = all.reduce((a,s)=>a+(s.total_points||0),0);
    const here = all.find(s=>s.round_id===r.id);
    return {p,total,here};
  }).sort((a,b)=>b.total-a.total || (a.p.pseudo||'').localeCompare(b.p.pseudo||''));
  return `<div class="section-title"><div><h2>Classement général</h2><div class="muted">Scores calculés par l’administrateur après les matchs</div></div></div><div class="card table-wrap"><table><thead><tr><th>#</th><th>Joueur</th><th>${esc(r.label)}</th><th>Résultats</th><th>Bonus</th><th>Marqueurs</th><th>Total général</th></tr></thead><tbody>${totals.map((x,i)=>`<tr><td class="rank">${i+1}</td><td><strong>${esc(x.p.pseudo)}</strong></td><td class="points">${x.here?.total_points ?? 0}</td><td>${x.here?.result_points ?? 0}</td><td>${x.here?.bonus_points ?? 0}</td><td>${x.here?.scorer_points ?? 0}</td><td class="points">${x.total}</td></tr>`).join('')}</tbody></table></div>`;
}

function historyView() {
  const mine = state.roundScores.filter(s => s.user_id === state.session.user.id);
  return `<div class="section-title"><div><h2>Mon historique</h2><div class="muted">Toutes les journées disponibles</div></div></div><div class="stack">${state.rounds.map(r => { const s=mine.find(x=>x.round_id===r.id); return `<div class="card"><div class="scorebox"><div><strong>${esc(r.label)}</strong><div class="muted">${esc(r.season)} • deadline ${esc(fmtDate(r.deadline))}</div></div><div class="score">${s?.total_points ?? 0}</div></div>${s?`<div class="breakdown"><span class="pill">Résultats ${s.result_points}</span><span class="pill">Bonus ${s.bonus_points}</span><span class="pill">Marqueurs ${s.scorer_points}</span></div>`:'<p class="muted">Score pas encore calculé.</p>'}</div>`; }).join('') || '<div class="card">Aucune journée.</div>'}</div>`;
}

function adminView() {
  if (!isAdmin()) return '<div class="card">Accès administrateur requis.</div>';
  const r = currentRound();
  const matches = r ? roundMatches(r.id) : [];
  return `<div class="section-title"><div><h2>Administration</h2><div class="muted">Créer le championnat, saisir les résultats et calculer les scores</div></div></div>
  <div class="grid"><div class="card col-6"><h3>Ajouter une équipe</h3><form class="inline-form two" onsubmit="adminAddTeam(event)"><div class="field"><label>Nom</label><input class="input" name="name" required></div><button class="btn" type="submit">Ajouter</button></form><div class="separator"></div><h3>Ajouter un joueur</h3><form class="inline-form three" onsubmit="adminAddPlayer(event)"><div class="field"><label>Prénom</label><input class="input" name="first_name"></div><div class="field"><label>Nom</label><input class="input" name="last_name" required></div><div class="field"><label>Équipe</label><select name="team_id" required>${state.teams.filter(t=>t.active).map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></div><button class="btn" type="submit">Ajouter</button></form></div>
  <div class="card col-6"><h3>Créer une journée</h3><form class="inline-form two" onsubmit="adminAddRound(event)"><div class="field"><label>Saison</label><input class="input" name="season" value="2026-2027" required></div><div class="field"><label>N° journée</label><input class="input" name="round_number" type="number" min="1" required></div><div class="field"><label>Nom</label><input class="input" name="label" placeholder="Journée 5" required></div><div class="field"><label>Deadline</label><input class="input" name="deadline" type="datetime-local" required></div><button class="btn" type="submit">Créer</button></form></div></div>
  ${r?`<div class="card" style="margin-top:16px"><h3>${esc(r.label)}</h3><form class="inline-form" onsubmit="adminUpdateRound(event)"><div class="field"><label>Deadline</label><input class="input" name="deadline" type="datetime-local" value="${esc(formDate(r.deadline))}" required></div><div class="field"><label>Statut</label><select name="status">${['draft','open','locked','scored','archived'].map(s=>`<option ${r.status===s?'selected':''}>${s}</option>`).join('')}</select></div><button class="btn" type="submit">Enregistrer</button><button class="btn secondary" type="button" onclick="adminCalculateScores()">Calculer les scores</button></form><p class="small-note">Le calcul est prévu après la deadline ou après verrouillage, lorsque les pronostics des autres joueurs deviennent lisibles par le RLS.</p></div>
  <div class="card" style="margin-top:16px"><h3>Ajouter un match</h3><form class="inline-form" onsubmit="adminAddMatch(event)"><div class="field"><label>Domicile</label><select name="home_team_id" required>${state.teams.filter(t=>t.active).map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></div><div class="field"><label>Extérieur</label><select name="away_team_id" required>${state.teams.filter(t=>t.active).map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></div><div class="field"><label>Coup d’envoi</label><input class="input" name="kickoff_at" type="datetime-local"></div><button class="btn" type="submit">Ajouter</button></form></div>
  <div class="section-title"><h2>Résultats réels</h2></div>${matches.map(adminMatchCard).join('') || '<div class="card">Aucun match.</div>'}`:'<div class="card" style="margin-top:16px">Crée une journée pour continuer.</div>'}`;
}

function adminMatchCard(m) {
  const matchPlayers = state.players.filter(p => p.team_id===m.home_team_id || p.team_id===m.away_team_id);
  const scorerIds = new Set(state.actualScorers.filter(x=>x.match_id===m.id).map(x=>x.player_id));
  return `<div class="card" style="margin-bottom:14px"><h3>${esc(team(m.home_team_id)?.name)} — ${esc(team(m.away_team_id)?.name)}</h3><div class="match-admin-grid"><div class="field"><label>Résultat réel</label><select onchange="adminSetResult('${m.id}',this.value)"><option value="">Non renseigné</option><option value="home" ${m.actual_result==='home'?'selected':''}>Victoire ${esc(team(m.home_team_id)?.name)}</option><option value="draw" ${m.actual_result==='draw'?'selected':''}>Nul</option><option value="away" ${m.actual_result==='away'?'selected':''}>Victoire ${esc(team(m.away_team_id)?.name)}</option></select></div><div><label style="font-weight:750">Bonus obtenus</label><div class="bonus-grid">${[
    ['home_offensive_bonus',`BO ${team(m.home_team_id)?.name}`],['home_defensive_bonus',`BD ${team(m.home_team_id)?.name}`],['away_offensive_bonus',`BO ${team(m.away_team_id)?.name}`],['away_defensive_bonus',`BD ${team(m.away_team_id)?.name}`]
  ].map(([f,l])=>`<label class="check"><input type="checkbox" ${m[f]?'checked':''} onchange="adminSetBonus('${m.id}','${f}',this.checked)">${esc(l)}</label>`).join('')}</div></div></div><div class="separator"></div><strong>Marqueurs réels</strong><div class="scorer-list" style="margin-top:10px">${matchPlayers.map(p=>`<button class="scorer ${scorerIds.has(p.id)?'selected':''}" onclick="adminToggleScorer('${m.id}','${p.id}')"><strong>${esc(playerName(p))}</strong><span>${esc(team(p.team_id)?.name)}</span></button>`).join('')}</div></div>`;
}

async function adminAddTeam(e) {
  e.preventDefault(); const fd=new FormData(e.currentTarget);
  await queryOrThrow(db.from('teams').insert({name:String(fd.get('name')).trim()}));
  e.currentTarget.reset(); await loadCoreData(); await loadRoundData();
}
async function adminAddPlayer(e) {
  e.preventDefault(); const fd=new FormData(e.currentTarget);
  await queryOrThrow(db.from('players').insert({team_id:fd.get('team_id'),first_name:String(fd.get('first_name')||'').trim()||null,last_name:String(fd.get('last_name')).trim()}));
  e.currentTarget.reset(); await loadCoreData(); await loadRoundData();
}
async function adminAddRound(e) {
  e.preventDefault(); const fd=new FormData(e.currentTarget);
  const rows = await queryOrThrow(db.from('rounds').insert({season:String(fd.get('season')).trim(),round_number:Number(fd.get('round_number')),label:String(fd.get('label')).trim(),deadline:new Date(fd.get('deadline')).toISOString(),status:'open'}).select());
  await loadCoreData(); if(rows?.[0]) ui.selectedRoundId=rows[0].id; await loadRoundData();
}
async function adminUpdateRound(e) {
  e.preventDefault(); const fd=new FormData(e.currentTarget);
  await queryOrThrow(db.from('rounds').update({deadline:new Date(fd.get('deadline')).toISOString(),status:fd.get('status')}).eq('id',ui.selectedRoundId));
  await loadCoreData(); await loadRoundData();
}
async function adminAddMatch(e) {
  e.preventDefault(); const fd=new FormData(e.currentTarget);
  const home=fd.get('home_team_id'), away=fd.get('away_team_id');
  if(home===away){alert('Les deux équipes doivent être différentes.');return;}
  await queryOrThrow(db.from('matches').insert({round_id:ui.selectedRoundId,home_team_id:home,away_team_id:away,kickoff_at:fd.get('kickoff_at')?new Date(fd.get('kickoff_at')).toISOString():null}));
  e.currentTarget.reset(); await loadCoreData(); await loadRoundData();
}
async function adminSetResult(matchId,value) {
  await queryOrThrow(db.from('matches').update({actual_result:value||null}).eq('id',matchId)); await loadCoreData(); await loadRoundData();
}
async function adminSetBonus(matchId,field,value) {
  await queryOrThrow(db.from('matches').update({[field]:value}).eq('id',matchId)); await loadCoreData(); await loadRoundData();
}
async function adminToggleScorer(matchId,playerId) {
  const row=state.actualScorers.find(x=>x.match_id===matchId&&x.player_id===playerId);
  if(row) await queryOrThrow(db.from('match_try_scorers').delete().eq('match_id',matchId).eq('player_id',playerId));
  else await queryOrThrow(db.from('match_try_scorers').insert({match_id:matchId,player_id:playerId,tries:1}));
  await loadRoundData();
}

async function adminCalculateScores() {
  const r=currentRound(); if(!r)return;
  if(!isRoundRevealed(r) && !confirm('La journée n’est pas encore révélée. Le RLS peut masquer les pronostics des autres joueurs. Continuer quand même ?')) return;
  await loadRoundData(false);
  const matches=roundMatches(r.id);
  const ids=new Set(matches.map(m=>m.id));
  const actualScorerIds=new Set(state.actualScorers.filter(x=>ids.has(x.match_id)).map(x=>x.player_id));
  const rows=state.profiles.map(profile=>{
    const preds=state.matchPredictions.filter(p=>p.user_id===profile.id&&ids.has(p.match_id));
    let result_points=0,bonus_points=0,scorer_points=0;
    for(const m of matches){
      const p=preds.find(x=>x.match_id===m.id); if(!p)continue;
      if(m.actual_result && p.predicted_result===m.actual_result) result_points+=2;
      for(const f of ['home_offensive_bonus','home_defensive_bonus','away_offensive_bonus','away_defensive_bonus']) if(p[f]===true && m[f]===true) bonus_points+=3;
    }
    const picks=state.tryPredictions.filter(x=>x.user_id===profile.id&&x.round_id===r.id);
    for(const pick of picks) if(actualScorerIds.has(pick.player_id)) scorer_points+=5;
    return {user_id:profile.id,round_id:r.id,result_points,bonus_points,scorer_points,calculated_at:new Date().toISOString()};
  });
  if(rows.length) await queryOrThrow(db.from('round_scores').upsert(rows,{onConflict:'user_id,round_id'}));
  if(r.status==='locked') await queryOrThrow(db.from('rounds').update({status:'scored'}).eq('id',r.id));
  await loadCoreData(); await loadRoundData(); alert('Scores recalculés.');
}

function render() {
  const root=document.getElementById('app');
  if(!state.session?.user){root.innerHTML=authView();return;}
  if(!state.profile){root.innerHTML=shell('<div class="card"><div class="empty-state"><h2>Profil introuvable</h2><p>Le compte existe dans Supabase Auth mais aucune ligne correspondante n’a été trouvée dans <code>profiles</code>. Vérifie le trigger <code>handle_new_user</code>.</p></div></div>');return;}
  let content=homeView();
  if(ui.view==='predictions')content=predictionsView();
  if(ui.view==='leaderboard')content=leaderboardView();
  if(ui.view==='history')content=historyView();
  if(ui.view==='admin')content=adminView();
  root.innerHTML=shell(content);
}

function switchAuth(mode){ui.authMode=mode;ui.authError='';ui.authMessage='';render();}

Object.assign(window,{setView,setRound,login,signup,logout,switchAuth,saveResult,saveBonus,toggleTryPick,adminAddTeam,adminAddPlayer,adminAddRound,adminUpdateRound,adminAddMatch,adminSetResult,adminSetBonus,adminToggleScorer,adminCalculateScores});

if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(console.warn));
init().catch(err=>{console.error(err);document.getElementById('app').innerHTML=`<div class="auth-page"><div class="auth-card"><h1>Erreur de démarrage</h1><div class="error-box">${esc(err.message||err)}</div></div></div>`;});
