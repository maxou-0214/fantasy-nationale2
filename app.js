const STORAGE_KEY = "fantasy-n2-v1";

const demoState = {
  currentUserId: "u1",
  adminMode: false,
  view: "home",
  round: {
    id: "r1",
    number: 1,
    label: "Journée démo",
    deadline: "2026-09-20T14:00:00",
    status: "open"
  },
  users: [
    { id: "u1", name: "Max", role: "admin" },
    { id: "u2", name: "Alex", role: "user" },
    { id: "u3", name: "Tom", role: "user" }
  ],
  teams: [
    { id: "t1", name: "Équipe A" },
    { id: "t2", name: "Équipe B" },
    { id: "t3", name: "Équipe C" },
    { id: "t4", name: "Équipe D" },
    { id: "t5", name: "Équipe E" },
    { id: "t6", name: "Équipe F" }
  ],
  players: [
    { id: "p1", name: "Joueur A1", teamId: "t1", active: true },
    { id: "p2", name: "Joueur A2", teamId: "t1", active: true },
    { id: "p3", name: "Joueur B1", teamId: "t2", active: true },
    { id: "p4", name: "Joueur B2", teamId: "t2", active: true },
    { id: "p5", name: "Joueur C1", teamId: "t3", active: true },
    { id: "p6", name: "Joueur C2", teamId: "t3", active: true },
    { id: "p7", name: "Joueur D1", teamId: "t4", active: true },
    { id: "p8", name: "Joueur D2", teamId: "t4", active: true },
    { id: "p9", name: "Joueur E1", teamId: "t5", active: true },
    { id: "p10", name: "Joueur E2", teamId: "t5", active: true },
    { id: "p11", name: "Joueur F1", teamId: "t6", active: true },
    { id: "p12", name: "Joueur F2", teamId: "t6", active: true }
  ],
  matches: [
    { id: "m1", roundId: "r1", homeTeamId: "t1", awayTeamId: "t2", result: null, bonuses: [], scorerIds: [] },
    { id: "m2", roundId: "r1", homeTeamId: "t3", awayTeamId: "t4", result: null, bonuses: [], scorerIds: [] },
    { id: "m3", roundId: "r1", homeTeamId: "t5", awayTeamId: "t6", result: null, bonuses: [], scorerIds: [] }
  ],
  predictions: {
    u1: { matches: {}, scorerIds: [] },
    u2: {
      matches: {
        m1: { result: "home", bonuses: ["home_off"] },
        m2: { result: "away", bonuses: ["away_def"] },
        m3: { result: "draw", bonuses: [] }
      },
      scorerIds: ["p1", "p6", "p11"]
    },
    u3: {
      matches: {
        m1: { result: "away", bonuses: ["away_off"] },
        m2: { result: "home", bonuses: [] },
        m3: { result: "home", bonuses: ["home_off"] }
      },
      scorerIds: ["p3", "p5", "p9"]
    }
  },
  history: []
};

let state = loadState();

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return structuredClone(demoState);
  try { return { ...structuredClone(demoState), ...JSON.parse(raw) }; }
  catch { return structuredClone(demoState); }
}
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function team(id) { return state.teams.find(t => t.id === id); }
function player(id) { return state.players.find(p => p.id === id); }
function currentUser() { return state.users.find(u => u.id === state.currentUserId); }
function currentPrediction() {
  if (!state.predictions[state.currentUserId]) state.predictions[state.currentUserId] = { matches: {}, scorerIds: [] };
  return state.predictions[state.currentUserId];
}
function isLocked() {
  return state.round.status === "locked" || new Date() >= new Date(state.round.deadline);
}
function formatDateTime(value) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle:"full", timeStyle:"short" }).format(new Date(value));
}
function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#039;",'"':"&quot;"}[c]));
}
function resultLabel(result, match) {
  if (result === "home") return team(match.homeTeamId).name;
  if (result === "away") return team(match.awayTeamId).name;
  if (result === "draw") return "Nul";
  return "—";
}
function bonusLabel(key, match) {
  const map = {
    home_off: `BO ${team(match.homeTeamId).name}`,
    home_def: `BD ${team(match.homeTeamId).name}`,
    away_off: `BO ${team(match.awayTeamId).name}`,
    away_def: `BD ${team(match.awayTeamId).name}`
  };
  return map[key] || key;
}
function scoreForUser(userId) {
  const prediction = state.predictions[userId] || { matches:{}, scorerIds:[] };
  let resultPoints = 0, bonusPoints = 0, scorerPoints = 0;
  state.matches.forEach(match => {
    const pick = prediction.matches?.[match.id];
    if (!pick || !match.result) return;
    if (pick.result === match.result) resultPoints += 2;
    (pick.bonuses || []).forEach(b => {
      if ((match.bonuses || []).includes(b)) bonusPoints += 3;
    });
  });
  const actualScorers = new Set(state.matches.flatMap(m => m.scorerIds || []));
  (prediction.scorerIds || []).forEach(id => { if (actualScorers.has(id)) scorerPoints += 5; });
  return { resultPoints, bonusPoints, scorerPoints, total: resultPoints + bonusPoints + scorerPoints };
}
function countFilledMatches(pred = currentPrediction()) {
  return state.matches.filter(m => pred.matches?.[m.id]?.result).length;
}
function ticketStatus(pred = currentPrediction()) {
  const filledMatches = countFilledMatches(pred);
  const scorers = pred.scorerIds?.length || 0;
  const complete = filledMatches === state.matches.length && scorers === 3;
  return { filledMatches, scorers, complete };
}
function deadlineCountdown() {
  const diff = new Date(state.round.deadline) - new Date();
  if (diff <= 0) return "Pronostics verrouillés";
  const hours = Math.floor(diff / 36e5);
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return days > 0 ? `${days} j ${remHours} h restantes` : `${hours} h restantes`;
}

function setView(view) { state.view = view; saveState(); render(); }
function setUser(userId) { state.currentUserId = userId; saveState(); render(); }
function setMatchResultPick(matchId, result) {
  if (isLocked()) return;
  const pred = currentPrediction();
  pred.matches[matchId] ||= { result:null, bonuses:[] };
  pred.matches[matchId].result = result;
  saveState(); render();
}
function toggleBonusPick(matchId, key) {
  if (isLocked()) return;
  const pred = currentPrediction();
  pred.matches[matchId] ||= { result:null, bonuses:[] };
  const arr = pred.matches[matchId].bonuses ||= [];
  const index = arr.indexOf(key);
  index >= 0 ? arr.splice(index,1) : arr.push(key);
  saveState(); render();
}
function toggleScorerPick(playerId) {
  if (isLocked()) return;
  const pred = currentPrediction();
  const arr = pred.scorerIds ||= [];
  const index = arr.indexOf(playerId);
  if (index >= 0) arr.splice(index,1);
  else if (arr.length < 3) arr.push(playerId);
  saveState(); render();
}
function updateRoundField(field, value) {
  state.round[field] = value;
  saveState(); render();
}
function setActualResult(matchId, value) {
  const m = state.matches.find(x => x.id === matchId); m.result = value || null; saveState(); render();
}
function toggleActualBonus(matchId, key) {
  const m = state.matches.find(x => x.id === matchId);
  const arr = m.bonuses ||= [];
  const i = arr.indexOf(key); i >= 0 ? arr.splice(i,1) : arr.push(key); saveState(); render();
}
function toggleActualScorer(matchId, playerId) {
  const m = state.matches.find(x => x.id === matchId);
  const arr = m.scorerIds ||= [];
  const i = arr.indexOf(playerId); i >= 0 ? arr.splice(i,1) : arr.push(playerId); saveState(); render();
}
function resetDemo() {
  if (!confirm("Réinitialiser toutes les données de démonstration ?")) return;
  state = structuredClone(demoState); saveState(); render();
}
function lockRound() { state.round.status = "locked"; saveState(); render(); }
function openRound() { state.round.status = "open"; saveState(); render(); }
function addDemoUser() {
  const name = prompt("Pseudo du nouveau joueur :");
  if (!name?.trim()) return;
  const id = `u${Date.now()}`;
  state.users.push({id, name:name.trim(), role:"user"});
  state.predictions[id] = {matches:{}, scorerIds:[]}; saveState(); render();
}
function addTeam() {
  const name = prompt("Nom de l'équipe :"); if (!name?.trim()) return;
  state.teams.push({id:`t${Date.now()}`, name:name.trim()}); saveState(); render();
}
function addPlayer() {
  const name = prompt("Nom du joueur :"); if (!name?.trim()) return;
  const teamName = prompt("Nom exact de son équipe :");
  const t = state.teams.find(x => x.name.toLowerCase() === (teamName||"").trim().toLowerCase());
  if (!t) return alert("Équipe introuvable. Ajoute d'abord l'équipe.");
  state.players.push({id:`p${Date.now()}`, name:name.trim(), teamId:t.id, active:true}); saveState(); render();
}
function addMatch() {
  if (state.teams.length < 2) return alert("Ajoute au moins 2 équipes.");
  const home = prompt("Équipe domicile (nom exact) :");
  const away = prompt("Équipe extérieure (nom exact) :");
  const h = state.teams.find(x => x.name.toLowerCase() === (home||"").trim().toLowerCase());
  const a = state.teams.find(x => x.name.toLowerCase() === (away||"").trim().toLowerCase());
  if (!h || !a || h.id === a.id) return alert("Équipes invalides.");
  state.matches.push({id:`m${Date.now()}`, roundId:state.round.id, homeTeamId:h.id, awayTeamId:a.id, result:null, bonuses:[], scorerIds:[]}); saveState(); render();
}

function nav() {
  const items = [["home","Accueil"],["predictions","Pronostics"],["leaderboard","Classement"],["history","Historique"]];
  if (currentUser()?.role === "admin") items.push(["admin","Admin"]);
  return items.map(([v,label]) => `<button class="${state.view===v?'active':''}" onclick="setView('${v}')">${label}</button>`).join("");
}
function appShell(content) {
  return `<div class="shell">
    <header class="topbar">
      <div class="brand"><div class="brand-badge">🏉</div><div>Fantasy Nationale 2</div></div>
      <nav class="nav">${nav()}</nav>
      <div class="userbox">
        <select onchange="setUser(this.value)">${state.users.map(u=>`<option value="${u.id}" ${u.id===state.currentUserId?'selected':''}>${escapeHtml(u.name)}</option>`).join('')}</select>
        <div class="avatar">${escapeHtml(currentUser()?.name?.slice(0,1).toUpperCase() || '?')}</div>
      </div>
    </header>
    <main class="main">${content}</main>
    <footer class="footer">V1 prototype • barème : résultat +2 • bonus correct +3 • marqueur correct +5</footer>
  </div>`;
}

function homeView() {
  const pred = currentPrediction();
  const score = scoreForUser(state.currentUserId);
  const ticket = ticketStatus(pred);
  return `<section class="hero">
    <div class="hero-card"><div class="kicker">${escapeHtml(state.round.label)}</div><h1>Pronostique la Nationale 2.</h1><p>Sélectionne le résultat de chaque match, les bonus que tu anticipes et exactement trois marqueurs d'essai.</p><div style="margin-top:20px"><button class="btn" onclick="setView('predictions')">Faire mes pronostics</button></div></div>
    <div class="hero-stat card"><div class="kicker">Deadline</div><div class="big">${isLocked()?'Fermé':'Ouvert'}</div><div class="muted">${formatDateTime(state.round.deadline)}<br>${deadlineCountdown()}</div></div>
  </section>
  <section class="grid">
    <div class="card col-4"><div class="muted">Matchs pronostiqués</div><div class="score">${countFilledMatches(pred)}/${state.matches.length}</div></div>
    <div class="card col-4"><div class="muted">Marqueurs choisis</div><div class="score">${pred.scorerIds?.length || 0}/3</div></div>
    <div class="card col-4"><div class="muted">Points journée</div><div class="score">${score.total}</div><div class="breakdown"><span class="pill">Résultats ${score.resultPoints}</span><span class="pill">Bonus ${score.bonusPoints}</span><span class="pill">Essais ${score.scorerPoints}</span></div></div>
    <div class="card col-12">${ticket.complete ? '<div class="notice success" style="margin-bottom:14px"><strong>✓ Ticket complet.</strong> Tes pronostics sont enregistrés et resteront modifiables jusqu’à la deadline.</div>' : '<div class="notice" style="margin-bottom:14px"><strong>Ticket incomplet.</strong> Renseigne tous les résultats et sélectionne exactement 3 marqueurs avant la deadline.</div>'}<h2>Règles de la journée</h2><p><strong>+2</strong> par bon résultat (victoire, nul ou défaite), <strong>+3</strong> pour chaque bonus correctement pronostiqué, indépendamment du résultat, et <strong>+5</strong> pour chacun de tes 3 marqueurs qui inscrit au moins un essai.</p><div class="notice">La V1 stocke les données dans le navigateur pour permettre un test immédiat. Le schéma Supabase fourni dans le projet permet de passer ensuite au vrai mode multi-utilisateur.</div></div>
  </section>`;
}

function predictionsView() {
  const pred = currentPrediction();
  const locked = isLocked();
  const ticket = ticketStatus(pred);
  const matchHtml = state.matches.map(match => {
    const pick = pred.matches?.[match.id] || {result:null,bonuses:[]};
    const bonusKeys = ["home_off","home_def","away_off","away_def"];
    return `<div class="card" style="margin-bottom:14px">
      <div class="match"><div><div class="team">${escapeHtml(team(match.homeTeamId).name)}</div><div class="muted">Domicile</div></div><div class="vs">VS</div><div><div class="team away">${escapeHtml(team(match.awayTeamId).name)}</div><div class="muted" style="text-align:right">Extérieur</div></div></div>
      <div class="result-row">
        <button ${locked?'disabled':''} class="choice ${pick.result==='home'?'selected':''}" onclick="setMatchResultPick('${match.id}','home')">Victoire ${escapeHtml(team(match.homeTeamId).name)}</button>
        <button ${locked?'disabled':''} class="choice ${pick.result==='draw'?'selected':''}" onclick="setMatchResultPick('${match.id}','draw')">Match nul</button>
        <button ${locked?'disabled':''} class="choice ${pick.result==='away'?'selected':''}" onclick="setMatchResultPick('${match.id}','away')">Victoire ${escapeHtml(team(match.awayTeamId).name)}</button>
      </div>
      <h3 style="margin:16px 0 8px">Bonus pronostiqués</h3>
      <div class="bonus-grid">${bonusKeys.map(key=>`<label class="check"><input type="checkbox" ${locked?'disabled':''} ${pick.bonuses?.includes(key)?'checked':''} onchange="toggleBonusPick('${match.id}','${key}')"><span>${escapeHtml(bonusLabel(key, match))}</span></label>`).join('')}</div>
    </div>`;
  }).join('');

  const participatingTeams = new Set(state.matches.flatMap(m=>[m.homeTeamId,m.awayTeamId]));
  const availablePlayers = state.players.filter(p => p.active && participatingTeams.has(p.teamId));
  const scorerHtml = availablePlayers.map(p => `<button ${locked?'disabled':''} class="scorer ${pred.scorerIds?.includes(p.id)?'selected':''}" onclick="toggleScorerPick('${p.id}')"><strong>${escapeHtml(p.name)}</strong><span>${escapeHtml(team(p.teamId)?.name || '')}</span></button>`).join('');

  return `<div class="section-title"><div><h2>Mes pronostics</h2><div class="muted">${escapeHtml(state.round.label)} • limite : ${formatDateTime(state.round.deadline)}</div></div><span class="pill ${locked?'locked':'open'}">${locked?'🔒 Verrouillé':'● Ouvert'}</span></div>
  ${locked?'<div class="notice">La deadline est dépassée ou la journée a été verrouillée par un administrateur. Les choix ne sont plus modifiables.</div>':''}
  <h3>1. Résultats et bonus</h3>${matchHtml}
  <div class="section-title"><div><h3 style="margin:0">2. Mes 3 marqueurs d'essai</h3><div class="muted">${pred.scorerIds?.length || 0}/3 sélectionnés</div></div></div>
  <div class="scorer-list">${scorerHtml}</div>
  <div class="card" style="margin-top:16px">${ticket.complete ? '<div class="notice success"><strong>✓ Pronostics complets et enregistrés.</strong> Tu peux encore les modifier jusqu’à la deadline.</div>' : `<div class="notice"><strong>Pronostics incomplets.</strong> ${ticket.filledMatches}/${state.matches.length} résultats et ${ticket.scorers}/3 marqueurs renseignés.</div>`}<p class="muted" style="margin-bottom:0">Chaque modification est sauvegardée automatiquement sur cet appareil.</p></div>`;
}

function leaderboardView() {
  const rows = state.users.map(u => ({...u, score:scoreForUser(u.id)})).sort((a,b)=>b.score.total-a.score.total);
  return `<div class="section-title"><div><h2>Classement</h2><div class="muted">${escapeHtml(state.round.label)}</div></div></div>
  <div class="card table-wrap"><table><thead><tr><th>#</th><th>Joueur</th><th>Résultats</th><th>Bonus</th><th>Marqueurs</th><th>Total</th></tr></thead><tbody>
    ${rows.map((r,i)=>`<tr><td class="rank">${i+1}</td><td><strong>${escapeHtml(r.name)}</strong></td><td>${r.score.resultPoints}</td><td>${r.score.bonusPoints}</td><td>${r.score.scorerPoints}</td><td class="points">${r.score.total}</td></tr>`).join('')}
  </tbody></table></div>
  <div class="notice" style="margin-top:14px">Les points restent à 0 tant que l'administrateur n'a pas renseigné les résultats réels, les bonus obtenus et les marqueurs.</div>`;
}

function historyView() {
  if (!state.history.length) return `<div class="section-title"><div><h2>Historique</h2><div class="muted">Journées précédentes</div></div></div><div class="card"><p>Aucune journée archivée dans cette V1 de démonstration.</p><p class="muted">L'architecture Supabase inclut une table de journées : l'historique complet sera conservé en production.</p></div>`;
  return `<div class="section-title"><h2>Historique</h2></div>${state.history.map(h=>`<div class="card"><strong>${escapeHtml(h.label)}</strong></div>`).join('')}`;
}

function adminView() {
  if (currentUser()?.role !== "admin") return `<div class="card">Accès administrateur requis.</div>`;
  const matchCards = state.matches.map(match => {
    const keys = ["home_off","home_def","away_off","away_def"];
    const matchPlayers = state.players.filter(p => p.teamId === match.homeTeamId || p.teamId === match.awayTeamId);
    return `<div class="card" style="margin-bottom:14px"><h3>${escapeHtml(team(match.homeTeamId).name)} — ${escapeHtml(team(match.awayTeamId).name)}</h3>
      <div class="field"><label>Résultat réel</label><select onchange="setActualResult('${match.id}',this.value)"><option value="">Non renseigné</option><option value="home" ${match.result==='home'?'selected':''}>Victoire ${escapeHtml(team(match.homeTeamId).name)}</option><option value="draw" ${match.result==='draw'?'selected':''}>Nul</option><option value="away" ${match.result==='away'?'selected':''}>Victoire ${escapeHtml(team(match.awayTeamId).name)}</option></select></div>
      <div class="separator"></div><strong>Bonus obtenus</strong><div class="bonus-grid">${keys.map(k=>`<label class="check"><input type="checkbox" ${match.bonuses?.includes(k)?'checked':''} onchange="toggleActualBonus('${match.id}','${k}')">${escapeHtml(bonusLabel(k, match))}</label>`).join('')}</div>
      <div class="separator"></div><strong>Marqueurs réels</strong><div class="scorer-list" style="margin-top:10px">${matchPlayers.map(p=>`<button class="scorer ${match.scorerIds?.includes(p.id)?'selected':''}" onclick="toggleActualScorer('${match.id}','${p.id}')"><strong>${escapeHtml(p.name)}</strong><span>${escapeHtml(team(p.teamId).name)}</span></button>`).join('')}</div>
    </div>`;
  }).join('');
  return `<div class="section-title"><div><h2>Administration</h2><div class="muted">Configuration de la journée et saisie des résultats</div></div></div>
  <div class="grid">
    <div class="card col-6"><h3>Journée</h3><div class="admin-grid"><div class="field"><label>Nom</label><input class="input" value="${escapeHtml(state.round.label)}" onchange="updateRoundField('label',this.value)"></div><div class="field"><label>Deadline</label><input class="input" type="datetime-local" value="${state.round.deadline.slice(0,16)}" onchange="updateRoundField('deadline',this.value)"></div></div><div class="toolbar" style="margin-top:14px"><button class="btn small" onclick="lockRound()">Verrouiller</button><button class="btn secondary small" onclick="openRound()">Rouvrir</button></div></div>
    <div class="card col-6"><h3>Données</h3><div class="toolbar"><button class="btn small" onclick="addDemoUser()">+ Utilisateur</button><button class="btn secondary small" onclick="addTeam()">+ Équipe</button><button class="btn secondary small" onclick="addPlayer()">+ Joueur</button><button class="btn secondary small" onclick="addMatch()">+ Match</button><button class="btn danger small" onclick="resetDemo()">Réinitialiser</button></div></div>
  </div>
  <div class="section-title"><div><h2>Résultats réels</h2><div class="muted">Le classement se recalcule automatiquement à chaque saisie.</div></div></div>${matchCards}`;
}

function render() {
  let content = homeView();
  if (state.view === "predictions") content = predictionsView();
  if (state.view === "leaderboard") content = leaderboardView();
  if (state.view === "history") content = historyView();
  if (state.view === "admin") content = adminView();
  document.getElementById("app").innerHTML = appShell(content);
}

window.setView=setView; window.setUser=setUser; window.setMatchResultPick=setMatchResultPick; window.toggleBonusPick=toggleBonusPick; window.toggleScorerPick=toggleScorerPick;
window.updateRoundField=updateRoundField; window.setActualResult=setActualResult; window.toggleActualBonus=toggleActualBonus; window.toggleActualScorer=toggleActualScorer;
window.resetDemo=resetDemo; window.lockRound=lockRound; window.openRound=openRound; window.addDemoUser=addDemoUser; window.addTeam=addTeam; window.addPlayer=addPlayer; window.addMatch=addMatch;

if ("serviceWorker" in navigator) navigator.serviceWorker.register("service-worker.js").catch(()=>{});
render();
