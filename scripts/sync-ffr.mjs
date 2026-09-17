import * as cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const FFR_CALENDAR_URL = process.env.FFR_CALENDAR_URL ||
  'https://monclubhouse.ffr.fr/nationales/nationale-2/qualification-50110/72955/calendrier-resultats';

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  throw new Error('SUPABASE_URL ou SUPABASE_SECRET_KEY manquant.');
}

const db = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const UA = 'Mozilla/5.0 (compatible; FantasyNationale2Bot/1.0; +https://github.com/maxou-0214/fantasy-nationale2)';
const profileCache = new Map();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function clean(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

function norm(s) {
  return clean(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’']/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchHtml(url, attempts = 3) {
  let lastError;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          'user-agent': UA,
          'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'fr-FR,fr;q=0.9,en;q=0.5'
        },
        redirect: 'follow'
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
      return await res.text();
    } catch (err) {
      lastError = err;
      if (i < attempts) await sleep(800 * i);
    }
  }
  throw lastError;
}

function calculateOutcome(homeScore, awayScore) {
  if (homeScore > awayScore) return 'home';
  if (awayScore > homeScore) return 'away';
  return 'draw';
}

function calculateDefensiveBonuses(homeScore, awayScore) {
  const diff = Math.abs(homeScore - awayScore);
  return {
    home: homeScore < awayScore && diff <= 7,
    away: awayScore < homeScore && diff <= 7
  };
}

function extractCompletedCalendarEntries(html) {
  const $ = cheerio.load(html);
  const rows = [];

  $('a[href*="/nationales/nationale-2/match/"]').each((_, el) => {
    const text = clean($(el).text());
    if (!/termin[ée]/i.test(text)) return;

    const round = text.match(/journ[ée]e\s*(\d+)/i)?.[1];
    const score = text.match(/(\d+)\s*-\s*(\d+)/);
    const href = $(el).attr('href');
    if (!round || !score || !href) return;

    rows.push({
      roundNumber: Number(round),
      homeScore: Number(score[1]),
      awayScore: Number(score[2]),
      text,
      normalizedText: norm(text),
      url: new URL(href, FFR_CALENDAR_URL).href
    });
  });

  return rows;
}

function matchCalendarEntry(dbMatch, teamsById, entries) {
  const home = teamsById.get(dbMatch.home_team_id)?.name;
  const away = teamsById.get(dbMatch.away_team_id)?.name;
  if (!home || !away) return null;

  const nh = norm(home);
  const na = norm(away);

  return entries.find(e => {
    if (e.roundNumber !== dbMatch.round_number) return false;
    const h = e.normalizedText.indexOf(nh);
    const a = e.normalizedText.indexOf(na);
    return h >= 0 && a >= 0 && h < a;
  }) || null;
}

async function profileClub(profileUrl, homeName, awayName) {
  const key = `${profileUrl}|${homeName}|${awayName}`;
  if (profileCache.has(key)) return profileCache.get(key);

  const html = await fetchHtml(profileUrl);
  const $ = cheerio.load(html);
  const text = clean($('body').text());
  const nt = norm(text);
  const marker = nt.indexOf('clubs actuels');
  const snippet = marker >= 0 ? nt.slice(marker, marker + 700) : nt.slice(0, 1600);
  const nh = norm(homeName);
  const na = norm(awayName);

  let side = null;
  const ih = snippet.indexOf(nh);
  const ia = snippet.indexOf(na);
  if (ih >= 0 && ia < 0) side = 'home';
  else if (ia >= 0 && ih < 0) side = 'away';
  else if (ih >= 0 && ia >= 0) side = ih < ia ? 'home' : 'away';

  profileCache.set(key, side);
  await sleep(120);
  return side;
}

async function extractTryCounts(matchUrl, homeName, awayName) {
  const html = await fetchHtml(matchUrl);
  const $ = cheerio.load(html);
  const tryLinks = [];

  $('a[href*="/joueurs/"]').each((_, el) => {
    const label = clean($(el).text());
    if (!/\(\s*essai\s*\)/i.test(label)) return;
    const href = $(el).attr('href');
    if (!href) return;
    tryLinks.push(new URL(href, matchUrl).href);
  });

  let homeTries = 0;
  let awayTries = 0;
  let unresolved = 0;

  for (const profileUrl of tryLinks) {
    try {
      const side = await profileClub(profileUrl, homeName, awayName);
      if (side === 'home') homeTries++;
      else if (side === 'away') awayTries++;
      else unresolved++;
    } catch (err) {
      console.warn(`Impossible d'identifier le club du marqueur ${profileUrl}: ${err.message}`);
      unresolved++;
    }
  }

  return {
    homeTries,
    awayTries,
    unresolved,
    offensiveBonusReliable: unresolved === 0
  };
}

async function main() {
  console.log(`Synchronisation FFR démarrée: ${new Date().toISOString()}`);
  console.log(`Source: ${FFR_CALENDAR_URL}`);

  const [teamsRes, roundsRes, matchesRes] = await Promise.all([
    db.from('teams').select('id,name'),
    db.from('rounds').select('id,round_number,season,status,deadline').eq('season', '2026-2027'),
    db.from('matches').select('id,round_id,home_team_id,away_team_id,home_score,away_score,home_offensive_bonus,away_offensive_bonus')
  ]);

  for (const r of [teamsRes, roundsRes, matchesRes]) {
    if (r.error) throw r.error;
  }

  const teamsById = new Map((teamsRes.data || []).map(t => [t.id, t]));
  const roundsById = new Map((roundsRes.data || []).map(r => [r.id, r]));
  const dbMatches = (matchesRes.data || []).map(m => ({
    ...m,
    round_number: roundsById.get(m.round_id)?.round_number
  }));

  const calendarHtml = await fetchHtml(FFR_CALENDAR_URL);
  const entries = extractCompletedCalendarEntries(calendarHtml);
  if (!entries.length) throw new Error('Aucun match terminé détecté sur la page FFR. Synchronisation interrompue par sécurité.');
  console.log(`${entries.length} match(s) terminé(s) détecté(s) sur la FFR.`);

  let updated = 0;
  let boWarnings = 0;
  const completedRounds = new Map();

  for (const m of dbMatches) {
    const round = roundsById.get(m.round_id);
    if (!round?.round_number) continue;

    const entry = matchCalendarEntry(m, teamsById, entries);
    if (!entry) continue;

    const homeName = teamsById.get(m.home_team_id)?.name;
    const awayName = teamsById.get(m.away_team_id)?.name;
    const bd = calculateDefensiveBonuses(entry.homeScore, entry.awayScore);
    const outcome = calculateOutcome(entry.homeScore, entry.awayScore);

    const patch = {
      home_score: entry.homeScore,
      away_score: entry.awayScore,
      actual_result: outcome,
      home_defensive_bonus: bd.home,
      away_defensive_bonus: bd.away
    };

    try {
      const tries = await extractTryCounts(entry.url, homeName, awayName);
      if (tries.offensiveBonusReliable) {
        patch.home_offensive_bonus = tries.homeTries - tries.awayTries >= 3;
        patch.away_offensive_bonus = tries.awayTries - tries.homeTries >= 3;
        console.log(`J${round.round_number} ${homeName} ${entry.homeScore}-${entry.awayScore} ${awayName} | essais ${tries.homeTries}-${tries.awayTries} | BO ${patch.home_offensive_bonus ? homeName : patch.away_offensive_bonus ? awayName : 'aucun'} | BD ${bd.home ? homeName : bd.away ? awayName : 'aucun'}`);
      } else {
        boWarnings++;
        console.warn(`J${round.round_number} ${homeName}-${awayName}: ${tries.unresolved} essai(s) non attribué(s), BO laissé inchangé.`);
      }
    } catch (err) {
      boWarnings++;
      console.warn(`J${round.round_number} ${homeName}-${awayName}: détails des essais indisponibles (${err.message}), BO laissé inchangé.`);
    }

    const { error } = await db.from('matches').update(patch).eq('id', m.id);
    if (error) throw error;
    updated++;

    const stats = completedRounds.get(round.id) || { round, updated: 0, total: 0 };
    stats.updated++;
    completedRounds.set(round.id, stats);
  }

  // Compte le nombre total de matchs de chaque journée, puis archive automatiquement
  // une journée seulement lorsque tous ses matchs sont maintenant renseignés.
  for (const stats of completedRounds.values()) {
    stats.total = dbMatches.filter(m => m.round_id === stats.round.id).length;
    const roundMatches = dbMatches.filter(m => m.round_id === stats.round.id);

    const { data: refreshed, error } = await db
      .from('matches')
      .select('id,home_score,away_score')
      .eq('round_id', stats.round.id);
    if (error) throw error;

    const allComplete = refreshed.length === stats.total && refreshed.every(x => x.home_score !== null && x.away_score !== null);
    if (allComplete) {
      const { error: roundError } = await db.from('rounds').update({ status: 'scored' }).eq('id', stats.round.id);
      if (roundError) throw roundError;
      console.log(`J${stats.round.round_number}: tous les matchs sont renseignés, statut -> scored.`);
    }
  }

  // Ouvre automatiquement la prochaine journée encore en draft.
  const now = Date.now();
  const futureDrafts = (roundsRes.data || [])
    .filter(r => r.status === 'draft' && new Date(r.deadline).getTime() > now)
    .sort((a, b) => a.round_number - b.round_number);

  if (futureDrafts.length) {
    const next = futureDrafts[0];
    const earlierUnfinished = (roundsRes.data || []).some(r =>
      r.round_number < next.round_number && ['open', 'locked'].includes(r.status) && new Date(r.deadline).getTime() <= now
    );
    if (!earlierUnfinished) {
      const { error } = await db.from('rounds').update({ status: 'open' }).eq('id', next.id);
      if (error) throw error;
      console.log(`J${next.round_number}: statut -> open.`);
    }
  }

  console.log(`Synchronisation terminée. ${updated} match(s) mis à jour. Avertissements BO: ${boWarnings}.`);
}

main().catch(err => {
  console.error('ÉCHEC SYNCHRONISATION FFR');
  console.error(err);
  process.exit(1);
});
