import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, collection,
  query, where, orderBy, getDocs, Timestamp, writeBatch, increment
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

import { firebaseConfig, ADMIN_EMAIL } from "./firebase-config.js";
import { TOURNAMENT_2026, KO_ORDER, KO_LABELS, refLabel } from "./tournament-2026.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const state = {
  user: null, profile: null, turnierTab: null, spieleFilter: "7d", activeGroup: "A", spieleLeftTab: "tabelle", koMobileRound: "R32",
};

// ---------- helpers ----------
const fmtKickoff = (ts) => {
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString("de-DE", {
    weekday: "short", day: "2-digit", month: "2-digit",
    hour: "2-digit", minute: "2-digit"
  });
};

const isAdmin = () => state.user?.email === ADMIN_EMAIL;

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

// Map of common German team names → flagcdn ISO codes (lowercase, alpha-2 or gb-* regional).
const TEAM_TO_CC = {
  "argentinien": "ar", "australien": "au", "belgien": "be", "brasilien": "br",
  "bosnien": "ba", "bosnien und herzegowina": "ba", "chile": "cl", "china": "cn",
  "dänemark": "dk", "daenemark": "dk", "deutschland": "de", "ecuador": "ec",
  "england": "gb-eng", "schottland": "gb-sct", "wales": "gb-wls", "nordirland": "gb-nir",
  "frankreich": "fr", "ghana": "gh", "iran": "ir", "italien": "it",
  "japan": "jp", "jordanien": "jo", "kamerun": "cm", "kanada": "ca",
  "katar": "qa", "kolumbien": "co", "südkorea": "kr", "suedkorea": "kr", "korea": "kr",
  "kroatien": "hr", "marokko": "ma", "mexiko": "mx", "niederlande": "nl",
  "nigeria": "ng", "norwegen": "no", "österreich": "at", "oesterreich": "at",
  "panama": "pa", "paraguay": "py", "peru": "pe", "polen": "pl",
  "portugal": "pt", "saudi-arabien": "sa", "saudi arabien": "sa",
  "schweiz": "ch", "senegal": "sn", "serbien": "rs", "slowakei": "sk",
  "spanien": "es", "südafrika": "za", "suedafrika": "za", "tunesien": "tn",
  "türkei": "tr", "tuerkei": "tr", "ukraine": "ua", "ungarn": "hu",
  "uruguay": "uy", "usa": "us", "vereinigte staaten": "us",
  "vereinigte arabische emirate": "ae", "vae": "ae",
  "tschechien": "cz", "schweden": "se", "russland": "ru",
  "algerien": "dz", "ägypten": "eg", "aegypten": "eg",
  "elfenbeinküste": "ci", "elfenbeinkueste": "ci",
  "dr kongo": "cd", "kongo": "cg", "honduras": "hn", "costa rica": "cr",
  "jamaika": "jm", "neuseeland": "nz", "irland": "ie",
  "slowenien": "si", "albanien": "al", "griechenland": "gr",
  "bulgarien": "bg", "rumänien": "ro", "rumaenien": "ro", "israel": "il",
  "mali": "ml", "burkina faso": "bf", "bolivien": "bo", "venezuela": "ve",
  "nordkorea": "kp", "indien": "in", "indonesien": "id", "vietnam": "vn",
  "thailand": "th", "haiti": "ht", "kuba": "cu",
  "curaçao": "cw", "curacao": "cw",
  "el salvador": "sv", "guatemala": "gt",
  "trinidad und tobago": "tt", "trinidad & tobago": "tt", "trinidad und tobago": "tt",
  "irak": "iq", "usbekistan": "uz",
  "tansania": "tz", "kamerun": "cm", "kap verde": "cv", "guinea": "gn",
  "mosambik": "mz", "sambia": "zm", "angola": "ao", "kenia": "ke",
  "libyen": "ly", "äthiopien": "et", "aegypten": "eg",
  "georgien": "ge", "luxemburg": "lu", "nordmazedonien": "mk",
  "armenien": "am", "aserbaidschan": "az", "kasachstan": "kz",
  "weissrussland": "by", "weißrussland": "by",
  "philippinen": "ph", "malaysia": "my", "singapur": "sg",
  "libanon": "lb", "syrien": "sy", "kuwait": "kw", "oman": "om", "bahrain": "bh",
};

function teamFlagCode(name) {
  if (!name) return null;
  return TEAM_TO_CC[String(name).toLowerCase().trim()] || null;
}
function teamFlagHtml(name) {
  const cc = teamFlagCode(name);
  if (!cc) return "";
  return `<img class="flag" src="https://flagcdn.com/w40/${cc}.png" srcset="https://flagcdn.com/w20/${cc}.png 1x, https://flagcdn.com/w40/${cc}.png 2x" alt="" loading="lazy"/>`;
}
function teamLabelHtml(name) {
  return `<span class="team-label">${teamFlagHtml(name)}<span class="team-name">${escapeHtml(name || "")}</span></span>`;
}

const EMPTY_ICONS = {
  search: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="27" cy="27" r="14"/><line x1="38" y1="38" x2="52" y2="52"/><line x1="22" y1="27" x2="32" y2="27"/></svg>`,
  trophy: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12h24v10a12 12 0 0 1-24 0V12z"/><path d="M20 16h-6a4 4 0 0 0 0 8h6"/><path d="M44 16h6a4 4 0 0 1 0 8h-6"/><path d="M28 34v8h-4v6h16v-6h-4v-8"/></svg>`,
  medal:  `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 8l6 16M42 8l-6 16"/><circle cx="32" cy="40" r="14"/><path d="M27 36l4 4 7-8"/></svg>`,
};
function emptyStateHtml(icon, title, subtitle = "") {
  return `
    <div class="empty-state">
      <div class="empty-state-icon">${EMPTY_ICONS[icon] || ""}</div>
      <div class="empty-state-title">${escapeHtml(title)}</div>
      ${subtitle ? `<div class="empty-state-sub">${escapeHtml(subtitle)}</div>` : ""}
    </div>
  `;
}

function tendency(h, a) { return h > a ? 1 : h < a ? 2 : 0; }

function scoreBet(bet, match) {
  if (match.homeScore == null || match.awayScore == null) return null;
  if (bet.homeBet === match.homeScore && bet.awayBet === match.awayScore) return 3;
  return tendency(bet.homeBet, bet.awayBet) === tendency(match.homeScore, match.awayScore) ? 1 : 0;
}

function friendlyError(err) {
  const code = err.code || "";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found"))
    return "E-Mail oder Passwort falsch.";
  if (code.includes("email-already-in-use")) return "E-Mail ist bereits registriert.";
  if (code.includes("weak-password")) return "Passwort zu schwach (min. 6 Zeichen).";
  if (code.includes("invalid-email")) return "Ungültige E-Mail.";
  return err.message || "Fehler.";
}

// ---------- data loading ----------
async function loadTournamentConfig() {
  const snap = await getDoc(doc(db, "tournament", "config"));
  return snap.exists() ? snap.data() : { teams: {}, seeded: false };
}

async function loadAllMatches() {
  const snap = await getDocs(query(collection(db, "matches"), orderBy("order", "asc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function loadMyBets() {
  if (!state.user) return new Map();
  const snap = await getDocs(query(collection(db, "bets"), where("uid", "==", state.user.uid)));
  const m = new Map();
  snap.docs.forEach(d => m.set(d.data().matchId, d.data()));
  return m;
}


// ---------- auth UI ----------
function renderLogin() {
  document.getElementById("auth-overlay")?.remove();
  const overlay = document.createElement("div");
  overlay.id = "auth-overlay";
  document.body.style.overflow = "hidden";
  document.body.appendChild(overlay);
  overlay.appendChild($("#tpl-login").content.cloneNode(true));
  let mode = "register";
  const form = overlay.querySelector("#auth-form");
  const submit = form.querySelector("button[type=submit]");
  const nameField = form.querySelector(".name-field");
  const errEl = overlay.querySelector("#auth-error");
  const tabs = overlay.querySelectorAll(".tab");
  nameField.classList.remove("hidden");
  submit.textContent = "Registrieren";

  const setMode = (m) => {
    mode = m;
    tabs.forEach(t => t.classList.toggle("active", t.dataset.mode === m));
    nameField.classList.toggle("hidden", m === "login");
    submit.textContent = m === "login" ? "Anmelden" : "Registrieren";
    errEl.textContent = "";
  };
  tabs.forEach(t => t.addEventListener("click", () => setMode(t.dataset.mode)));

  // Info section (prize + points)
  const infoSection = document.createElement("div");
  infoSection.className = "auth-info";
  infoSection.innerHTML = `
    <div class="auth-info-divider"></div>
    <p class="auth-info-teaser">Je mehr mitspielen, desto höher ist der Gewinn – also mach mit!</p>
    <div class="auth-prize">
      <span class="auth-prize-label">Aktuelle Gewinnprämie:</span>
      <span class="auth-prize-amount">wird geladen…</span>
    </div>
    <div class="auth-points">
      <h3>Punktevergabe</h3>
      <ul>
        <li><strong>3 Punkte</strong> – Exaktes Ergebnis</li>
        <li><strong>1 Punkt</strong> – Richtiger Ausgang (Sieg / Unentschieden / Niederlage)</li>
        <li><strong>0 Punkte</strong> – Falscher Ausgang</li>
      </ul>
      <p>Tipps können bis zum <strong>Anpfiff</strong> abgegeben oder geändert werden.</p>
    </div>
  `;
  overlay.querySelector(".auth-right").appendChild(infoSection);

  getDoc(doc(db, "public", "stats")).then(snap => {
    const count = snap.exists() ? (snap.data().participantCount || 0) : 0;
    overlay.querySelector(".auth-prize-amount").textContent = `${count * 5} €`;
  }).catch(() => {
    overlay.querySelector(".auth-prize-amount").textContent = "–";
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errEl.textContent = "";
    const fd = new FormData(form);
    const email = fd.get("email").trim();
    const password = fd.get("password");
    const name = (fd.get("name") || "").trim();
    submit.disabled = true;
    try {
      if (mode === "login") {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        if (!name) throw new Error("Bitte Name angeben.");
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, "users", cred.user.uid), { name, email, totalPoints: 0 });
        await setDoc(doc(db, "public", "stats"), { participantCount: increment(1) }, { merge: true });
      }
    } catch (err) {
      errEl.textContent = friendlyError(err);
    } finally {
      submit.disabled = false;
    }
  });
}

// ---------- leaderboard (reusable) ----------
async function renderLeaderboard(targetEl, { limit = 5, title = "Tabelle – Top 5", snap = null, uid = null } = {}) {
  const node = $("#tpl-leaderboard").content.cloneNode(true);
  $("h2", node).textContent = title;
  const ol = $(".leaderboard", node);
  if (!snap) snap = await getDocs(collection(db, "users"));
  const allUsers = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0));
  const users = allUsers.slice(0, limit);
  if (users.length === 0) {
    ol.innerHTML = `<li><span style="color:var(--muted)">Noch keine Punkte vergeben.</span></li>`;
  } else {
    const medals = ["🥇", "🥈", "🥉"];
    users.forEach((u, i) => {
      const rank = medals[i] ?? `${i + 1}.`;
      const li = document.createElement("li");
      li.innerHTML = `
        <span class="rank">${rank}</span>
        <span class="lname">${escapeHtml(u.name || u.email)}</span>
        <span class="lpts">${u.totalPoints || 0} P</span>
      `;
      ol.appendChild(li);
    });

    if (uid) {
      const myIndex = allUsers.findIndex(u => u.id === uid);
      const inTopList = myIndex !== -1 && myIndex < limit;
      if (!inTopList && myIndex !== -1) {
        const me = allUsers[myIndex];
        const sep = document.createElement("li");
        sep.className = "leaderboard-sep";
        sep.innerHTML = `<span class="leaderboard-sep-line"></span>`;
        ol.appendChild(sep);
        const li = document.createElement("li");
        li.className = "leaderboard-me";
        li.innerHTML = `
          <span class="rank">${myIndex + 1}.</span>
          <span class="lname">${escapeHtml(me.name || me.email)} <span class="leaderboard-me-tag">Du</span></span>
          <span class="lpts">${me.totalPoints || 0} P</span>
        `;
        ol.appendChild(li);
      }
    }
  }
  targetEl.appendChild(node);
}

// ---------- standings ----------
function emptyRow(team) {
  return { team, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, diff: 0, pts: 0 };
}

function computeGroupStandings(groupId, matches, teamMap) {
  const slots = ["1", "2", "3", "4"].map(n => `${groupId}${n}`);
  const rows = new Map();
  for (const s of slots) rows.set(s, emptyRow(teamMap[s] || s));

  for (const m of matches) {
    if (m.groupId !== groupId || !m.finished) continue;
    if (m.homeScore == null || m.awayScore == null) continue;
    const h = rows.get(m.homeSlot);
    const a = rows.get(m.awaySlot);
    if (!h || !a) continue;
    h.played++; a.played++;
    h.gf += m.homeScore; h.ga += m.awayScore;
    a.gf += m.awayScore; a.ga += m.homeScore;
    if (m.homeScore > m.awayScore) { h.won++; a.lost++; h.pts += 3; }
    else if (m.homeScore < m.awayScore) { a.won++; h.lost++; a.pts += 3; }
    else { h.drawn++; a.drawn++; h.pts++; a.pts++; }
  }
  for (const r of rows.values()) r.diff = r.gf - r.ga;
  return [...rows.entries()]
    .map(([slot, r]) => ({ slot, ...r }))
    .sort((a, b) => b.pts - a.pts || b.diff - a.diff || b.gf - a.gf);
}

function isGroupComplete(groupId, matches) {
  return matches.filter(m => m.groupId === groupId).every(m => m.finished);
}

function rankBestThirds(matches, teamMap) {
  const thirds = [];
  for (const g of TOURNAMENT_2026.groups) {
    if (!isGroupComplete(g, matches)) return null; // not all known yet
    const standings = computeGroupStandings(g, matches, teamMap);
    thirds.push(standings[2]); // index 2 = 3rd place
  }
  return thirds.sort((a, b) => b.pts - a.pts || b.diff - a.diff || b.gf - a.gf);
}

function rankBestThirdsFrom(groups, matches, teamMap) {
  const thirds = [];
  for (const g of groups) {
    if (!isGroupComplete(g, matches)) return null;
    const standings = computeGroupStandings(g, matches, teamMap);
    thirds.push(standings[2]);
  }
  return thirds.sort((a, b) => b.pts - a.pts || b.diff - a.diff || b.gf - a.gf);
}

// ---------- KO resolver ----------
function resolveRef(ref, allMatches, teamMap) {
  if (!ref) return null;
  if (ref.type === "group_winner" || ref.type === "group_runner_up") {
    if (!isGroupComplete(ref.groupId, allMatches)) return null;
    const s = computeGroupStandings(ref.groupId, allMatches, teamMap);
    return ref.type === "group_winner" ? s[0]?.team : s[1]?.team;
  }
  if (ref.type === "best_third") {
    const ranked = rankBestThirds(allMatches, teamMap);
    if (!ranked) return null;
    return ranked[ref.rank - 1]?.team || null;
  }
  if (ref.type === "best_third_from") {
    const ranked = rankBestThirdsFrom(ref.groups, allMatches, teamMap);
    if (!ranked) return null;
    return ranked[0]?.team || null;
  }
  if (ref.type === "match_winner" || ref.type === "match_loser") {
    const m = allMatches.find(x => x.slot === ref.matchSlot);
    if (!m || !m.finished || m.homeScore == null || m.awayScore == null) return null;
    if (m.homeScore === m.awayScore) return null; // unentschieden -> Admin muss klären
    const winner = m.homeScore > m.awayScore ? m.homeTeam : m.awayTeam;
    const loser = m.homeScore > m.awayScore ? m.awayTeam : m.homeTeam;
    return ref.type === "match_winner" ? winner : loser;
  }
  return null;
}

async function resolveKnockout() {
  const allMatches = await loadAllMatches();
  const cfg = await loadTournamentConfig();
  const teamMap = cfg.teams || {};

  // Iteriere mehrfach, weil später Runden von früheren abhängen
  let changed = true;
  let safety = 6;
  const updates = new Map(); // matchId -> patch

  while (changed && safety-- > 0) {
    changed = false;
    for (const m of allMatches) {
      if (!m.homeRef && !m.awayRef) continue;
      const patch = updates.get(m.id) || {};
      const currentHome = patch.homeTeam ?? m.homeTeam;
      const currentAway = patch.awayTeam ?? m.awayTeam;
      if (!currentHome && m.homeRef) {
        const r = resolveRef(m.homeRef, allMatches, teamMap);
        if (r) { patch.homeTeam = r; changed = true; }
      }
      if (!currentAway && m.awayRef) {
        const r = resolveRef(m.awayRef, allMatches, teamMap);
        if (r) { patch.awayTeam = r; changed = true; }
      }
      if (Object.keys(patch).length) updates.set(m.id, patch);
    }
    // apply patches in-memory so later rounds can see them
    for (const [id, patch] of updates) {
      const m = allMatches.find(x => x.id === id);
      if (patch.homeTeam) m.homeTeam = patch.homeTeam;
      if (patch.awayTeam) m.awayTeam = patch.awayTeam;
    }
  }

  if (updates.size === 0) return;
  const batch = writeBatch(db);
  for (const [id, patch] of updates) {
    batch.update(doc(db, "matches", id), patch);
  }
  await batch.commit();
}

// ---------- account modal ----------
async function openAccountModal() {
  const root = $("#modal-root");
  root.innerHTML = "";
  const tpl = $("#tpl-account-modal").content.cloneNode(true);
  root.appendChild(tpl);
  const backdrop = $(".modal-backdrop", root);
  $(".account-email", root).textContent = state.user.email;
  const errEl = $(".modal-error", root);
  const okEl = $(".modal-success", root);
  const resetBtn = $(".reset-pw-btn", root);
  const cancelBtn = $(".cancel-btn", root);
  const close = () => { root.innerHTML = ""; };
  cancelBtn.addEventListener("click", close);
  backdrop.addEventListener("click", e => { if (e.target === backdrop) close(); });

  (async () => {
    try {
      const [allMatches, myBets, usersSnap] = await Promise.all([
        loadAllMatches(), loadMyBets(), getDocs(collection(db, "users"))
      ]);
      const stats = computeMyStats(myBets, allMatches);
      const ranked = usersSnap.docs
        .map(d => ({ uid: d.id, points: d.data().totalPoints || 0 }))
        .sort((a, b) => b.points - a.points);
      const myRank = ranked.findIndex(u => u.uid === state.user.uid) + 1;
      $(".account-points", root).textContent = state.profile?.totalPoints ?? 0;
      $(".account-rank", root).textContent = myRank > 0 ? `${myRank} / ${ranked.length}` : "–";
      $(".account-completion", root).textContent =
        `${stats.betsPlaced} / ${stats.betsPossible} (${Math.round(stats.completionRate * 100)}%)`;
      $(".account-exact", root).textContent = stats.exactHits;
    } catch (err) {
      // stats best-effort; password reset still works
    }
  })();

  resetBtn.addEventListener("click", async () => {
    errEl.textContent = ""; okEl.textContent = "";
    resetBtn.disabled = true;
    try {
      await sendPasswordResetEmail(auth, state.user.email);
      okEl.textContent = "E-Mail wurde gesendet. Bitte prüfe dein Postfach.";
      resetBtn.classList.add("hidden");
    } catch (err) {
      errEl.textContent = "Fehler: " + (err.message || err);
      resetBtn.disabled = false;
    }
  });
}

// ---------- bet modal ----------
function openBetModal(match, onSaved) {
  const root = $("#modal-root");
  root.innerHTML = "";
  const tpl = $("#tpl-bet-modal").content.cloneNode(true);
  root.appendChild(tpl);
  const backdrop = $(".modal-backdrop", root);
  $(".modal-title", root).innerHTML = `${teamLabelHtml(match.homeTeam)} – ${teamLabelHtml(match.awayTeam)}`;
  $(".modal-meta", root).textContent = fmtKickoff(match.kickoff);
  $(".team-home", root).innerHTML = teamLabelHtml(match.homeTeam);
  $(".team-away", root).innerHTML = teamLabelHtml(match.awayTeam);
  const [hi, ai] = $$(".bet-row .score", root);
  const errEl = $(".modal-error", root);
  const saveBtn = $(".save-btn", root);
  const cancelBtn = $(".cancel-btn", root);

  // existierenden Tipp laden
  const betRef = doc(db, "bets", `${match.id}_${state.user.uid}`);
  getDoc(betRef).then(snap => {
    if (snap.exists()) { hi.value = snap.data().homeBet; ai.value = snap.data().awayBet; }
  });

  const close = () => { root.innerHTML = ""; };
  cancelBtn.addEventListener("click", close);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });

  saveBtn.addEventListener("click", async () => {
    errEl.textContent = "";
    const h = parseInt(hi.value, 10);
    const a = parseInt(ai.value, 10);
    if (Number.isNaN(h) || Number.isNaN(a) || h < 0 || a < 0) {
      errEl.textContent = "Bitte gültigen Tipp eingeben."; return;
    }
    const ko = match.kickoff.toMillis ? match.kickoff.toMillis() : new Date(match.kickoff).getTime();
    if (ko <= Date.now()) { errEl.textContent = "Angepfiffen – Tipp gesperrt."; return; }
    if (!match.homeTeam || !match.awayTeam) {
      errEl.textContent = "Teams stehen noch nicht fest."; return;
    }
    saveBtn.disabled = true;
    try {
      await setDoc(betRef, {
        uid: state.user.uid, matchId: match.id,
        homeBet: h, awayBet: a, points: null
      });
      close();
      onSaved && onSaved();
    } catch (err) {
      errEl.textContent = "Fehler beim Speichern: " + (err.message || err);
    } finally {
      saveBtn.disabled = false;
    }
  });
}

// ---------- bracket match card ----------
function isTipTippable(match) {
  if (!match.homeTeam || !match.awayTeam) return false;
  const ko = match.kickoff.toMillis ? match.kickoff.toMillis() : new Date(match.kickoff).getTime();
  return ko > Date.now() && !match.finished;
}

function renderBracketMatch(match, bet, onSaved) {
  const node = $("#tpl-bracket-match").content.cloneNode(true);
  const btn = $(".bracket-match", node);
  const homeLabel = match.homeTeam || refLabel(match.homeRef);
  const awayLabel = match.awayTeam || refLabel(match.awayRef);
  $(".bm-home", node).innerHTML = teamLabelHtml(homeLabel);
  $(".bm-away", node).innerHTML = teamLabelHtml(awayLabel);

  const meta = $(".bm-meta", node);
  meta.textContent = match.finished ? "Beendet" : fmtKickoff(match.kickoff);

  const scoreEl = $(".bm-score", node);
  if (match.finished && match.homeScore != null) {
    scoreEl.textContent = `${match.homeScore} : ${match.awayScore}`;
  } else {
    scoreEl.classList.add("pending");
    scoreEl.textContent = "vs";
  }

  const tipEl = $(".bm-tip", node);
  if (bet) {
    const ptsLabel = bet.points == null ? "–" : `${bet.points}P`;
    const ptsCls = (bet.points == null || bet.points === 0) ? "zero" : "";
    tipEl.innerHTML = `Dein Tipp: <strong>${bet.homeBet}:${bet.awayBet}</strong> <span class="pts ${ptsCls}">${ptsLabel}</span>`;
  } else {
    tipEl.textContent = isTipTippable(match) ? "Klicken zum Tippen" : "—";
  }

  if (!isTipTippable(match)) {
    btn.classList.add("locked");
    btn.disabled = true;
  } else {
    btn.addEventListener("click", () => openBetModal(match, onSaved));
  }
  return node;
}

function renderSpielCard(match, bet, onSaved) {
  const node = $("#tpl-spiel-card").content.cloneNode(true);
  const btn = $(".spiel-card", node);

  $(".sc-home", node).innerHTML = teamLabelHtml(match.homeTeam);
  $(".sc-away", node).innerHTML = teamLabelHtml(match.awayTeam);
  $(".sc-date", node).textContent = fmtKickoff(match.kickoff);

  const scoreEl = $(".sc-tip-score", node);
  const labelEl = $(".sc-tip-label", node);
  const timerEl = $(".sc-timer", node);

  if (bet) {
    scoreEl.textContent = `${bet.homeBet} : ${bet.awayBet}`;
    labelEl.textContent = "Dein Tipp";
  } else {
    scoreEl.textContent = "? : ?";
    labelEl.textContent = "Tipp abgeben";
    btn.classList.add("sc-no-tip");
  }

  const ko = match.kickoff instanceof Date ? match.kickoff : match.kickoff.toDate();
  function fmtCountdown() {
    const diff = ko - Date.now();
    if (diff <= 0) { timerEl.textContent = ""; return; }
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    if (d > 0) timerEl.textContent = `in ${d}t ${h}st ${m}m`;
    else if (h > 0) timerEl.textContent = `in ${h}st ${m}m ${s}s`;
    else timerEl.textContent = `in ${m}m ${s}s`;
  }
  fmtCountdown();
  const iv = setInterval(fmtCountdown, 1000);
  btn.addEventListener("click", () => openBetModal(match, onSaved));
  // clean up interval when card is removed from DOM
  new MutationObserver((_, obs) => {
    if (!btn.isConnected) { clearInterval(iv); obs.disconnect(); }
  }).observe(document.body, { childList: true, subtree: true });
  return node;
}

// ---------- views ----------
function renderStatsCard(parent, myBets, allMatches, usersSnap) {
  const myUid = state.user?.uid;
  const stats = computeMyStats(myBets, allMatches);
  const allUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Recent points per user (rolling 48h window — not surfaced in UI)
  const cutoff = Date.now() - 48 * 60 * 60 * 1000;
  const tsToMs = ts => {
    if (!ts) return 0;
    if (typeof ts.toMillis === "function") return ts.toMillis();
    if (ts instanceof Date) return ts.getTime();
    if (typeof ts.seconds === "number") return ts.seconds * 1000;
    return Number(ts) || 0;
  };
  const recentSumOf = u => {
    const arr = Array.isArray(u.recentScores) ? u.recentScores : [];
    let sum = 0;
    for (const s of arr) {
      if (tsToMs(s.ts) >= cutoff) sum += s.pts || 0;
    }
    return sum;
  };
  const usersWithRecent = allUsers.map(u => ({ ...u, _recent: recentSumOf(u) }));
  const anyRecent = usersWithRecent.some(u => u._recent > 0);

  // --- Platzbewegung: now vs. (totalPoints − recent window) ---
  const sortedNow = [...usersWithRecent].sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0));
  const sortedBefore = [...usersWithRecent].sort(
    (a, b) => ((b.totalPoints || 0) - b._recent) - ((a.totalPoints || 0) - a._recent)
  );
  const myRankNow = 1 + sortedNow.findIndex(u => u.id === myUid);
  const myRankBefore = 1 + sortedBefore.findIndex(u => u.id === myUid);
  const rankDelta = anyRecent && myRankNow > 0 && myRankBefore > 0 ? myRankBefore - myRankNow : null;

  let platzValue, platzClass = "", platzSub;
  if (rankDelta == null) {
    platzValue = "–";
    platzSub = "Noch nicht genug Daten";
  } else if (rankDelta > 0) {
    platzValue = `▲ +${rankDelta}`;
    platzClass = "up";
    platzSub = rankDelta === 1 ? "Platz nach oben" : "Plätze nach oben";
  } else if (rankDelta < 0) {
    platzValue = `▼ ${rankDelta}`;
    platzClass = "down";
    platzSub = rankDelta === -1 ? "Platz nach unten" : "Plätze nach unten";
  } else {
    platzValue = "—";
    platzSub = "Position unverändert";
  }

  // --- Den besten Lauf ---
  const sortedByRecent = [...usersWithRecent]
    .filter(u => u._recent > 0)
    .sort((a, b) => b._recent - a._recent || (a.name || "").localeCompare(b.name || ""));
  let laufValue = "–", laufSub = "Noch keine Punkte vergeben.";
  if (sortedByRecent.length > 0) {
    const top = sortedByRecent[0];
    laufValue = top.name || "–";
    laufSub = `${top._recent} ${top._recent === 1 ? "Punkt" : "Punkte"} aus den letzten Spielen`;
  }

  // --- Personal tile values ---
  const hitPct = stats.matchesScored > 0 ? Math.round(stats.hitRate * 100) : null;

  const card = document.createElement("section");
  card.className = "card stats-card";
  card.innerHTML = `
    <h2>Statistiken & Highlights</h2>
    <div class="stats-grid">
      <div class="stat-tile" style="display:flex;flex-direction:column;">
        <div class="stat-tile-label">Platzbewegung</div>
        <div style="flex:1;display:flex;align-items:center;">
          <div class="stat-tile-value ${platzClass}">${platzValue}</div>
        </div>
      </div>
      <div class="stat-tile" style="display:flex;flex-direction:column;">
        <div class="stat-tile-label">Den besten Lauf</div>
        <div style="flex:1;display:flex;align-items:center;">
          <div class="stat-tile-value stat-tile-value-sm">${escapeHtml(laufValue)}</div>
        </div>
      </div>
      <div class="stats-divider"></div>
      <div class="stat-tile">
        <div class="stat-tile-label">Trefferquote</div>
        <div class="stat-tile-value">${hitPct == null ? "–" : `${hitPct}%`}</div>
        <div class="stat-tile-sub">${stats.matchesScored === 0 ? "Noch keine bewerteten Tipps" : `${stats.pointsEarning} von ${stats.matchesScored} mit Punkten`}</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile-label">Davon Volltreffer</div>
        <div class="stat-tile-value">${stats.exactHits}</div>
        <div class="stat-tile-sub">3-Punkte-Tipps</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile-label">Nullnummer-Serie</div>
        <div class="stat-tile-value">${stats.zeroStreak}</div>
        <div class="stat-tile-sub">Spiele in Folge ohne Punkte</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile-label">Tipps abgegeben</div>
        <div class="stat-tile-value">${stats.betsPlaced}/${stats.betsPossible}</div>
        <div class="stat-tile-sub">${escapeHtml(completionMessage(stats.completionRate))}</div>
      </div>
    </div>
  `;
  parent.appendChild(card);
}

async function renderSpiele() {
  const main = $("#app");
  main.classList.add("spiele-wide");
  main.innerHTML = "";

  const grid = document.createElement("div");
  grid.className = "spiele-grid";
  main.appendChild(grid);

  const left = document.createElement("section");
  left.className = "spiele-left";
  grid.appendChild(left);

  const right = document.createElement("section");
  right.className = "spiele-right";
  grid.appendChild(right);

  // Load shared data once
  const [allMatches, myBets, usersSnap] = await Promise.all([
    loadAllMatches(),
    loadMyBets(),
    getDocs(collection(db, "users")),
  ]);

  // Left column: tab switcher (mobile only) + leaderboard + stats
  const leftSwitcher = document.createElement("div");
  leftSwitcher.className = "spiele-left-switcher";
  for (const [tab, label] of [["tabelle", "Tabelle"], ["statistiken", "Statistiken"]]) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "spiele-left-tab" + (tab === state.spieleLeftTab ? " active" : "");
    btn.dataset.tab = tab;
    btn.textContent = label;
    leftSwitcher.appendChild(btn);
  }
  left.appendChild(leftSwitcher);
  left.dataset.activeTab = state.spieleLeftTab;
  leftSwitcher.addEventListener("click", e => {
    const btn = e.target.closest(".spiele-left-tab");
    if (!btn) return;
    state.spieleLeftTab = btn.dataset.tab;
    left.dataset.activeTab = state.spieleLeftTab;
    leftSwitcher.querySelectorAll(".spiele-left-tab").forEach(b =>
      b.classList.toggle("active", b.dataset.tab === state.spieleLeftTab));
  });

  const tabellePanel = document.createElement("div");
  tabellePanel.className = "spiele-panel";
  tabellePanel.dataset.panel = "tabelle";
  left.appendChild(tabellePanel);

  const statistikenPanel = document.createElement("div");
  statistikenPanel.className = "spiele-panel";
  statistikenPanel.dataset.panel = "statistiken";
  left.appendChild(statistikenPanel);

  await renderLeaderboard(tabellePanel, { uid: state.user?.uid, snap: usersSnap });
  renderStatsCard(statistikenPanel, myBets, allMatches, usersSnap);

  // Right column: heading + filter + matches
  const heading = document.createElement("h1");
  heading.textContent = "Nächste Spiele";
  heading.style.marginTop = "0";
  right.appendChild(heading);

  // Build filter options dynamically based on current tournament state
  const groupMatchesAll = allMatches.filter(m => TOURNAMENT_2026.groups.includes(m.groupId));
  const matchdayHasUnfinished = md =>
    groupMatchesAll.some(m => matchdayOfGroupMatch(m) === md && !m.finished);
  const stageHasResolvedMatch = stage =>
    allMatches.some(m => m.groupId === stage && m.homeTeam && m.awayTeam);

  const SPIELE_FILTERS = [
    { id: "24h", label: "Nächste 24 Stunden" },
    { id: "3d",  label: "Nächste 3 Tage" },
    { id: "5d",  label: "Nächste 5 Tage" },
    { id: "7d",  label: "Nächste 7 Tage" },
  ];
  if (matchdayHasUnfinished(1)) SPIELE_FILTERS.push({ id: "md1", label: "Alle Spieltag 1" });
  if (matchdayHasUnfinished(2)) SPIELE_FILTERS.push({ id: "md2", label: "Alle Spieltag 2" });
  if (matchdayHasUnfinished(3)) SPIELE_FILTERS.push({ id: "md3", label: "Alle Spieltag 3" });
  if (groupMatchesAll.some(m => !m.finished)) {
    SPIELE_FILTERS.push({ id: "group", label: "Alle Gruppenspiele" });
  }
  for (const stage of ["R32", "R16", "QF", "SF"]) {
    if (stageHasResolvedMatch(stage)) {
      SPIELE_FILTERS.push({ id: `stage_${stage}`, label: `Alle ${KO_LABELS[stage]}` });
    }
  }
  if (stageHasResolvedMatch("THIRD") || stageHasResolvedMatch("FINAL")) {
    SPIELE_FILTERS.push({ id: "stage_FINALS", label: "Finale & Spiel um Platz 3" });
  }

  if (!SPIELE_FILTERS.some(f => f.id === state.spieleFilter)) {
    state.spieleFilter = "7d";
  }

  const filterBar = document.createElement("div");
  filterBar.className = "spiele-filter";
  const filterLabel = document.createElement("label");
  filterLabel.className = "spiele-filter-label";
  filterLabel.textContent = "Anzeigen:";
  const select = document.createElement("select");
  select.className = "spiele-filter-select";
  for (const f of SPIELE_FILTERS) {
    const opt = document.createElement("option");
    opt.value = f.id;
    opt.textContent = f.label;
    if (f.id === state.spieleFilter) opt.selected = true;
    select.appendChild(opt);
  }
  filterLabel.appendChild(select);
  filterBar.appendChild(filterLabel);
  right.appendChild(filterBar);

  const container = document.createElement("div");
  right.appendChild(container);

  function koMs(m) {
    return m.kickoff.toMillis ? m.kickoff.toMillis() : new Date(m.kickoff).getTime();
  }

  function filterMatches(filterId) {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const ranges = { "24h": 1, "3d": 3, "5d": 5, "7d": 7 };

    return allMatches
      .filter(m => {
        if (m.finished) return false;
        if (!m.homeTeam || !m.awayTeam) return false;
        const ko = koMs(m);
        if (ko <= now) return false;

        if (ranges[filterId] != null) {
          return ko <= now + ranges[filterId] * dayMs;
        }
        const isGroup = TOURNAMENT_2026.groups.includes(m.groupId);
        if (filterId === "md1") return isGroup && matchdayOfGroupMatch(m) === 1;
        if (filterId === "md2") return isGroup && matchdayOfGroupMatch(m) === 2;
        if (filterId === "md3") return isGroup && matchdayOfGroupMatch(m) === 3;
        if (filterId === "group") return isGroup;
        if (filterId === "stage_FINALS") return m.groupId === "THIRD" || m.groupId === "FINAL";
        if (filterId.startsWith("stage_")) return m.groupId === filterId.slice(6);
        return true;
      })
      .sort((a, b) => koMs(a) - koMs(b));
  }

  function renderList() {
    container.innerHTML = "";
    const matches = filterMatches(state.spieleFilter);
    if (matches.length === 0) {
      container.innerHTML = emptyStateHtml(
        "search",
        "Keine Spiele gefunden",
        "Versuche einen anderen Filter aus dem Menü oben."
      );
      return;
    }
    for (const m of matches) {
      container.appendChild(renderSpielCard(m, myBets.get(m.id), () => route()));
    }
  }

  select.addEventListener("change", () => {
    state.spieleFilter = select.value;
    renderList();
  });
  renderList();

  // --- Rules side drawer ---
  const drawer = document.createElement("div");
  drawer.className = "rules-drawer";
  drawer.id = "rules-drawer";

  const tab = document.createElement("button");
  tab.className = "rules-drawer-tab";
  tab.textContent = "Spielregeln";
  tab.addEventListener("click", () => drawer.classList.toggle("open"));
  drawer.appendChild(tab);

  const inner = document.createElement("div");
  inner.className = "rules-drawer-inner";
  inner.innerHTML = `
    <h2>Spielregeln &amp; Infos</h2>
    <p>Willkommen beim WM-Tippspiel 2026! Der Gewinner erhält <strong class="rules-prize">…&nbsp;€</strong>.</p>
    <h3>Punktevergabe</h3>
    <ul>
      <li><strong>3 Punkte</strong> – Exaktes Ergebnis (z.&nbsp;B. 2:1 getippt, 2:1 gespielt)</li>
      <li><strong>1 Punkt</strong> – Richtiger Ausgang (Sieg, Unentschieden oder Niederlage)</li>
      <li><strong>0 Punkte</strong> – Falscher Ausgang</li>
    </ul>
    <h3>Mannschaftsqualifikation</h3>
    <ul>
      <li>48 Teams spielen in 12 Gruppen (A–L) mit je 4 Mannschaften.</li>
      <li>Die <strong>ersten zwei</strong> jeder Gruppe sowie die <strong>8 besten Dritten</strong> qualifizieren sich für das Sechzehntelfinale (32 Teams).</li>
      <li>Ab dem Sechzehntelfinale geht es im K.o.-Modus weiter bis zum Finale am 19.&nbsp;Juli 2026.</li>
    </ul>
    <h3>Tipps abgeben</h3>
    <ul>
      <li>Tipps können bis zum <strong>Anpfiff</strong> des jeweiligen Spiels abgegeben oder geändert werden.</li>
      <li>Nach Anpfiff ist kein Tipp mehr möglich – das Spiel ist dann gesperrt.</li>
      <li>Einfach auf eine Spielkarte klicken, Ergebnis eingeben und speichern.</li>
    </ul>
  `;
  drawer.appendChild(inner);
  document.body.appendChild(drawer);

  getDoc(doc(db, "public", "stats")).then(snap => {
    const count = snap.exists() ? (snap.data().participantCount || 0) : 0;
    const el = drawer.querySelector(".rules-prize");
    if (el) el.textContent = `${count * 5} €`;
  }).catch(() => {});
}

async function renderTurnierbaum() {
  const main = $("#app");
  main.classList.add("wide");
  main.innerHTML = "";

  const allMatches = await loadAllMatches();
  const myBets = await loadMyBets();
  const cfg = await loadTournamentConfig();
  const teamMap = cfg.teams || {};

  if (allMatches.length === 0) {
    main.insertAdjacentHTML("beforeend", emptyStateHtml(
      "trophy",
      "Turnier noch nicht initialisiert",
      `Der Admin muss das Turnier zuerst unter "Admin" → "Turnier initialisieren" starten.`
    ));
    return;
  }

  const groupStageMatches = allMatches.filter(m => TOURNAMENT_2026.groups.includes(m.groupId));
  const groupsDone = groupStageMatches.length > 0 && groupStageMatches.every(m => m.finished);
  const initialTab = state.turnierTab || (groupsDone ? "ko" : "gruppen");

  const tabBar = document.createElement("div");
  tabBar.className = "subtabs";
  tabBar.innerHTML = `
    <button class="subtab" data-tab="gruppen" type="button">Gruppen</button>
    <button class="subtab" data-tab="ko" type="button">KO-Phase</button>
  `;
  main.appendChild(tabBar);

  const content = document.createElement("div");
  content.className = "subtab-content";
  main.appendChild(content);

  function activate(tab) {
    state.turnierTab = tab;
    tabBar.querySelectorAll(".subtab").forEach(b =>
      b.classList.toggle("active", b.dataset.tab === tab));
    content.innerHTML = "";
    if (tab === "gruppen") renderGruppenTab(content, allMatches, myBets, teamMap);
    else                   renderKoTab(content, allMatches, myBets);
  }
  tabBar.addEventListener("click", e => {
    const btn = e.target.closest(".subtab");
    if (btn) activate(btn.dataset.tab);
  });
  activate(initialTab);
}

function matchdayOfGroupMatch(match) {
  return Math.floor((match.order % 10) / 2) + 1;
}

function computeMyStats(myBets, allMatches) {
  const matchById = new Map(allMatches.map(m => [m.id, m]));
  const betsArr = [...myBets.values()];

  const betsPlaced = betsArr.length;
  const betsPossible = allMatches.filter(m => m.homeTeam && m.awayTeam).length;
  const completionRate = betsPossible > 0 ? betsPlaced / betsPossible : 0;

  const scored = betsArr.filter(b => b.points != null);
  const matchesScored = scored.length;
  const pointsEarning = scored.filter(b => b.points > 0).length;
  const hitRate = matchesScored > 0 ? pointsEarning / matchesScored : 0;
  const exactHits = scored.filter(b => b.points === 3).length;

  // Nullnummer-Serie: walk finished bets newest-first, count leading zeros
  const finishedBets = scored
    .map(b => ({ b, m: matchById.get(b.matchId) }))
    .filter(x => x.m && x.m.finished)
    .sort((a, b) => {
      const ka = a.m.kickoff.toMillis ? a.m.kickoff.toMillis() : new Date(a.m.kickoff).getTime();
      const kb = b.m.kickoff.toMillis ? b.m.kickoff.toMillis() : new Date(b.m.kickoff).getTime();
      return kb - ka;
    });
  let zeroStreak = 0;
  for (const x of finishedBets) {
    if (x.b.points === 0) zeroStreak++;
    else break;
  }

  return { betsPlaced, betsPossible, completionRate, matchesScored, pointsEarning, hitRate, exactHits, zeroStreak };
}

function completionMessage(rate) {
  if (rate >= 0.9) return "Du bist top dabei!";
  if (rate >= 0.7) return "Stark dabei — bleib dran!";
  if (rate >= 0.4) return "Da geht noch was, weiter so!";
  return "Es warten noch viele Spiele auf deinen Tipp!";
}

function renderGruppenTab(container, allMatches, myBets, teamMap) {
  const legend = document.createElement("div");
  legend.className = "matchday-legend";
  legend.innerHTML = `
    <span class="matchday-legend-label">Spieltage:</span>
    <button type="button" class="matchday-chip matchday-1 active" data-matchday="1" aria-pressed="true"><span class="matchday-dot"></span>Spieltag 1</button>
    <button type="button" class="matchday-chip matchday-2 active" data-matchday="2" aria-pressed="true"><span class="matchday-dot"></span>Spieltag 2</button>
    <button type="button" class="matchday-chip matchday-3 active" data-matchday="3" aria-pressed="true"><span class="matchday-dot"></span>Spieltag 3</button>
  `;
  container.appendChild(legend);

  legend.addEventListener("click", e => {
    const chip = e.target.closest(".matchday-chip");
    if (!chip) return;
    const md = chip.dataset.matchday;
    const active = chip.classList.toggle("active");
    chip.setAttribute("aria-pressed", active ? "true" : "false");
    container.querySelectorAll(`.bracket-match.matchday-${md}`).forEach(card => {
      card.classList.toggle("matchday-hidden", !active);
    });
  });

  if (!TOURNAMENT_2026.groups.includes(state.activeGroup)) state.activeGroup = TOURNAMENT_2026.groups[0];

  const switcher = document.createElement("div");
  switcher.className = "group-switcher";
  for (const g of TOURNAMENT_2026.groups) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "group-chip" + (g === state.activeGroup ? " active" : "");
    chip.dataset.group = g;
    chip.textContent = g;
    switcher.appendChild(chip);
  }
  container.appendChild(switcher);

  const groupGrid = document.createElement("div");
  groupGrid.className = "group-grid";
  groupGrid.dataset.activeGroup = state.activeGroup;
  container.appendChild(groupGrid);

  switcher.addEventListener("click", e => {
    const chip = e.target.closest(".group-chip");
    if (!chip) return;
    state.activeGroup = chip.dataset.group;
    groupGrid.dataset.activeGroup = state.activeGroup;
    switcher.querySelectorAll(".group-chip").forEach(c =>
      c.classList.toggle("active", c.dataset.group === state.activeGroup));
  });

  for (const g of TOURNAMENT_2026.groups) {
    const groupMatches = allMatches.filter(m => m.groupId === g).sort((a, b) => a.order - b.order);
    if (groupMatches.length === 0) continue;
    const node = $("#tpl-group-card").content.cloneNode(true);
    const cardEl = node.querySelector(".group-card");
    if (cardEl) cardEl.dataset.group = g;
    $(".group-title", node).textContent = `Gruppe ${g}`;
    const tbody = $("tbody", node);
    const standings = computeGroupStandings(g, allMatches, teamMap);
    standings.forEach((row, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${i + 1}</td>
        <td class="t">${teamLabelHtml(row.team)}</td>
        <td>${row.played}</td>
        <td>${row.won}</td>
        <td>${row.drawn}</td>
        <td>${row.lost}</td>
        <td>${row.gf}:${row.ga}</td>
        <td>${row.diff > 0 ? "+" : ""}${row.diff}</td>
        <td><strong>${row.pts}</strong></td>
      `;
      tbody.appendChild(tr);
    });

    const matchesContainer = $(".group-matches", node);
    const details = document.createElement("details");
    details.className = "group-matches-details";
    if (window.innerWidth <= 640) details.open = true;
    const summary = document.createElement("summary");
    summary.textContent = "Spiele anzeigen";
    details.appendChild(summary);
    for (const m of groupMatches) {
      const card = renderBracketMatch(m, myBets.get(m.id), () => route());
      const btn = card.querySelector(".bracket-match");
      if (btn) btn.classList.add(`matchday-${matchdayOfGroupMatch(m)}`);
      details.appendChild(card);
    }
    matchesContainer.appendChild(details);

    groupGrid.appendChild(node);
  }
}

function renderKoTab(container, allMatches, myBets) {
  function getStageSorted(stage) {
    return allMatches.filter(m => m.groupId === stage).sort((a, b) => a.order - b.order);
  }

  const r32 = getStageSorted("R32");
  const r16 = getStageSorted("R16");
  const qf  = getStageSorted("QF");
  const sf  = getStageSorted("SF");
  const thirdM = getStageSorted("THIRD");
  const finalM = getStageSorted("FINAL");

  function makeKoSlot(match) {
    const slot = document.createElement("div");
    slot.className = "ko-slot";
    if (match) slot.appendChild(renderBracketMatch(match, myBets.get(match.id), () => route()));
    return slot;
  }

  function buildKoCol(matches, stage) {
    const col = document.createElement("div");
    col.className = "ko-col";
    col.dataset.stage = stage;
    if (matches.length === 1) {
      col.appendChild(makeKoSlot(matches[0]));
    } else {
      for (let i = 0; i < matches.length; i += 2) {
        const pair = document.createElement("div");
        pair.className = "ko-pair";
        pair.appendChild(makeKoSlot(matches[i]));
        pair.appendChild(makeKoSlot(matches[i + 1]));
        col.appendChild(pair);
      }
    }
    return col;
  }

  const leftR32 = r32.slice(0, 8);
  const leftR16 = r16.slice(0, 4);
  const leftQF  = qf.slice(0, 2);
  const leftSF  = sf.slice(0, 1);
  const rightSF  = sf.slice(1);
  const rightQF  = qf.slice(2).reverse();
  const rightR16 = r16.slice(4).reverse();
  const rightR32 = r32.slice(8).reverse();

  const bracket = document.createElement("div");
  bracket.className = "ko-bracket";

  const leftHalf = document.createElement("div");
  leftHalf.className = "ko-half ko-half-left";
  if (leftR32.length) leftHalf.appendChild(buildKoCol(leftR32, "R32"));
  if (leftR16.length) leftHalf.appendChild(buildKoCol(leftR16, "R16"));
  if (leftQF.length)  leftHalf.appendChild(buildKoCol(leftQF,  "QF"));
  if (leftSF.length)  leftHalf.appendChild(buildKoCol(leftSF,  "SF"));
  bracket.appendChild(leftHalf);

  const center = document.createElement("div");
  center.className = "ko-center";
  if (finalM.length) {
    const fLabel = document.createElement("div");
    fLabel.className = "ko-third-label";
    fLabel.textContent = KO_LABELS["FINAL"];
    center.appendChild(fLabel);
    const fSlot = document.createElement("div");
    fSlot.className = "ko-final-slot";
    fSlot.appendChild(renderBracketMatch(finalM[0], myBets.get(finalM[0].id), () => route()));
    center.appendChild(fSlot);
  }
  if (thirdM.length) {
    const tLabel = document.createElement("div");
    tLabel.className = "ko-third-label";
    tLabel.textContent = KO_LABELS["THIRD"];
    const tSlot = document.createElement("div");
    tSlot.className = "ko-slot";
    tSlot.appendChild(renderBracketMatch(thirdM[0], myBets.get(thirdM[0].id), () => route()));
    center.appendChild(tLabel);
    center.appendChild(tSlot);
  }
  bracket.appendChild(center);

  const rightHalf = document.createElement("div");
  rightHalf.className = "ko-half ko-half-right";
  if (rightSF.length)  rightHalf.appendChild(buildKoCol(rightSF,  "SF"));
  if (rightQF.length)  rightHalf.appendChild(buildKoCol(rightQF,  "QF"));
  if (rightR16.length) rightHalf.appendChild(buildKoCol(rightR16, "R16"));
  if (rightR32.length) rightHalf.appendChild(buildKoCol(rightR32, "R32"));
  bracket.appendChild(rightHalf);

  container.appendChild(bracket);

  // Mobile KO view — arrow switcher + vertical match list (hidden on desktop via CSS)
  const MOBILE_KO_ROUNDS = [
    { id: "R32",    label: KO_LABELS["R32"] },
    { id: "R16",    label: KO_LABELS["R16"] },
    { id: "QF",     label: KO_LABELS["QF"] },
    { id: "SF",     label: KO_LABELS["SF"] },
    { id: "FINALS", label: "Finale & Platz 3" },
  ];
  if (!MOBILE_KO_ROUNDS.find(r => r.id === state.koMobileRound)) state.koMobileRound = "R32";

  const mobileView = document.createElement("div");
  mobileView.className = "ko-mobile-view";

  const mobileSwitcher = document.createElement("div");
  mobileSwitcher.className = "ko-mobile-switcher";

  const prevBtn = document.createElement("button");
  prevBtn.type = "button";
  prevBtn.className = "ko-mobile-arrow";
  prevBtn.innerHTML = "&#8592;";
  prevBtn.setAttribute("aria-label", "Vorherige Runde");

  const roundLabel = document.createElement("span");
  roundLabel.className = "ko-mobile-label";

  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "ko-mobile-arrow";
  nextBtn.innerHTML = "&#8594;";
  nextBtn.setAttribute("aria-label", "Nächste Runde");

  mobileSwitcher.append(prevBtn, roundLabel, nextBtn);

  const mobileList = document.createElement("div");
  mobileList.className = "ko-mobile-list";

  mobileView.append(mobileSwitcher, mobileList);
  container.appendChild(mobileView);

  function getMobileKoMatches(id) {
    if (id === "FINALS") return [...thirdM, ...finalM];
    return getStageSorted(id);
  }

  function updateMobileKoView() {
    const idx = MOBILE_KO_ROUNDS.findIndex(r => r.id === state.koMobileRound);
    roundLabel.textContent = MOBILE_KO_ROUNDS[idx].label;
    prevBtn.disabled = idx === 0;
    nextBtn.disabled = idx === MOBILE_KO_ROUNDS.length - 1;
    mobileList.innerHTML = "";
    for (const m of getMobileKoMatches(state.koMobileRound)) {
      mobileList.appendChild(renderBracketMatch(m, myBets.get(m.id), () => route()));
    }
  }

  prevBtn.addEventListener("click", () => {
    const idx = MOBILE_KO_ROUNDS.findIndex(r => r.id === state.koMobileRound);
    if (idx > 0) { state.koMobileRound = MOBILE_KO_ROUNDS[idx - 1].id; updateMobileKoView(); }
  });
  nextBtn.addEventListener("click", () => {
    const idx = MOBILE_KO_ROUNDS.findIndex(r => r.id === state.koMobileRound);
    if (idx < MOBILE_KO_ROUNDS.length - 1) { state.koMobileRound = MOBILE_KO_ROUNDS[idx + 1].id; updateMobileKoView(); }
  });

  updateMobileKoView();
}

// ---------- admin ----------
async function renderAdmin() {
  if (!isAdmin()) { location.hash = "#spiele"; return; }
  const main = $("#app");
  main.classList.add("wide");
  main.innerHTML = `<h1>Admin</h1>`;

  // --- Collapsible user scores table ---
  const usersSnap = await getDocs(collection(db, "users"));
  const userCount = usersSnap.docs.length;
  try { await setDoc(doc(db, "public", "stats"), { participantCount: userCount }, { merge: true }); } catch (_) {}

  const usersCard = document.createElement("section");
  usersCard.className = "card";
  usersCard.style.marginBottom = "14px";

  const usersHeader = document.createElement("button");
  usersHeader.className = "link";
  usersHeader.style.cssText = "display:flex;align-items:center;justify-content:space-between;width:100%;font-size:16px;font-weight:700;padding:0";
  usersHeader.innerHTML = `<span>Teilnehmer &amp; Punkte</span><span class="users-toggle-icon">▾</span>`;

  const usersBody = document.createElement("div");
  usersBody.style.cssText = "margin-top:14px;display:none";
  await renderLeaderboard(usersBody, { limit: userCount, title: `Alle Teilnehmer (${userCount})`, snap: usersSnap });

  usersHeader.addEventListener("click", () => {
    const isOpen = usersBody.style.display === "none";
    usersBody.style.display = isOpen ? "" : "none";
    usersHeader.querySelector(".users-toggle-icon").textContent = isOpen ? "▴" : "▾";
  });

  usersCard.appendChild(usersHeader);
  usersCard.appendChild(usersBody);
  main.appendChild(usersCard);

  const allMatches = await loadAllMatches();

  // Anpfiffe / Manuelle Match-Felder editieren (kompakt)
  const kickCard = document.createElement("section");
  kickCard.className = "card";
  kickCard.innerHTML = `
    <h2>Spiele bearbeiten / Ergebnisse eintragen</h2>
    <p style="color:var(--muted);font-size:13px;margin-top:0">
      Anpfiff anpassen oder Ergebnis eintragen. Punkte werden bei „Speichern" automatisch berechnet, KO-Folgespiele aktualisiert.
    </p>
    <div id="match-edit-list" class="admin-list"></div>
  `;
  main.appendChild(kickCard);

  const list = $("#match-edit-list", kickCard);
  const sorted = [...allMatches].sort((a, b) => {
    const ka = a.kickoff.toMillis ? a.kickoff.toMillis() : new Date(a.kickoff).getTime();
    const kb = b.kickoff.toMillis ? b.kickoff.toMillis() : new Date(b.kickoff).getTime();
    return ka - kb;
  });

  const open   = sorted.filter(m => !m.finished);
  const closed = sorted.filter(m => m.finished);
  let showAll  = open.length === 0;

  function buildMatchRow(m) {
    const row = document.createElement("div");
    row.className = "admin-match";
    const homeLbl = m.homeTeam || refLabel(m.homeRef);
    const awayLbl = m.awayTeam || refLabel(m.awayRef);
    const koDate = m.kickoff.toDate ? m.kickoff.toDate() : new Date(m.kickoff);
    const localValue = new Date(koDate.getTime() - koDate.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    row.innerHTML = `
      <div class="label">
        <strong>${m.groupId}</strong> ${teamLabelHtml(homeLbl)} – ${teamLabelHtml(awayLbl)}
        <span class="when">${m.finished ? `Beendet ${m.homeScore}:${m.awayScore}` : ""}</span>
      </div>
      <div class="result-inputs">
        <input type="datetime-local" class="kickoff-input" value="${localValue}" style="width:220px">
        <button type="button" class="link swap-btn" title="Heim/Auswärts tauschen">⇄</button>
        <input class="score" type="number" min="0" max="20" placeholder="H" value="${m.homeScore ?? ""}" ${!m.homeTeam ? "disabled" : ""}>
        <span>:</span>
        <input class="score" type="number" min="0" max="20" placeholder="A" value="${m.awayScore ?? ""}" ${!m.awayTeam ? "disabled" : ""}>
        <button class="primary save">Speichern</button>
      </div>
    `;
    const koInput = $(".kickoff-input", row);
    const [hi, ai] = $$(".score", row);
    const saveBtn = $("button.save", row);
    const swapBtn = $(".swap-btn", row);
    swapBtn.addEventListener("click", async () => {
      swapBtn.disabled = true;
      try {
        const patch = {};
        if (m.homeTeam || m.awayTeam) {
          patch.homeTeam = m.awayTeam || null;
          patch.awayTeam = m.homeTeam || null;
        }
        if (m.homeRef || m.awayRef) {
          patch.homeRef = m.awayRef || null;
          patch.awayRef = m.homeRef || null;
        }
        if (m.homeSlot || m.awaySlot) {
          patch.homeSlot = m.awaySlot || null;
          patch.awaySlot = m.homeSlot || null;
        }
        if (Object.keys(patch).length) {
          await updateDoc(doc(db, "matches", m.id), patch);
        }
        renderAdmin();
      } catch (err) {
        alert("Fehler: " + (err.message || err));
        swapBtn.disabled = false;
      }
    });
    saveBtn.addEventListener("click", async () => {
      saveBtn.disabled = true;
      try {
        const patch = {};
        if (koInput.value) {
          patch.kickoff = Timestamp.fromDate(new Date(koInput.value));
        }
        const h = hi.value === "" ? null : parseInt(hi.value, 10);
        const a = ai.value === "" ? null : parseInt(ai.value, 10);
        const enteringResult = h != null && a != null && m.homeTeam && m.awayTeam;
        if (enteringResult && !m.finished) {
          await finalizeMatch(m.id, h, a, patch);
        } else {
          if (Object.keys(patch).length > 0) {
            await updateDoc(doc(db, "matches", m.id), patch);
          }
        }
        renderAdmin();
      } catch (err) {
        alert("Fehler: " + (err.message || err));
        saveBtn.disabled = false;
      }
    });
    return row;
  }

  function renderList() {
    list.innerHTML = "";
    const toShow = showAll ? sorted : open;

    if (toShow.length === 0) {
      list.innerHTML = `<p style="color:var(--muted);font-size:14px">Alle Spiele abgeschlossen ✓</p>`;
    } else {
      const byDate = new Map();
      for (const m of toShow) {
        const ko = m.kickoff.toDate ? m.kickoff.toDate() : new Date(m.kickoff);
        const key = ko.toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });
        if (!byDate.has(key)) byDate.set(key, []);
        byDate.get(key).push(m);
      }
      for (const [date, matches] of byDate) {
        const header = document.createElement("div");
        header.className = "section-title";
        header.textContent = date;
        list.appendChild(header);
        for (const m of matches) list.appendChild(buildMatchRow(m));
      }
    }

    toggleBtn.textContent = showAll
      ? "Nur offene Spiele anzeigen"
      : `Alle anzeigen (inkl. ${closed.length} abgeschlossene)`;
    toggleBtn.style.display = closed.length === 0 ? "none" : "";
  }

  const toggleBtn = document.createElement("button");
  toggleBtn.className = "link";
  toggleBtn.style.cssText = "margin-bottom:12px;font-size:13px";
  toggleBtn.addEventListener("click", () => { showAll = !showAll; renderList(); });
  list.before(toggleBtn);

  renderList();

  // --- KO-Paarungen synchronisieren ---
  const koSyncCard = document.createElement("section");
  koSyncCard.className = "card";
  koSyncCard.style.marginBottom = "14px";
  koSyncCard.innerHTML = `
    <h2>KO-Paarungen aktualisieren</h2>
    <p style="color:var(--muted);font-size:13px;margin-top:0">
      Schreibt die Heim-/Auswärts-Referenzen (homeRef/awayRef) aller KO-Spiele aus <code>tournament-2026.js</code> neu in Firestore.
      Ergebnisse, Tipp-Punkte und Anpfiffe bleiben unverändert.
    </p>
    <button class="primary ko-sync-btn">KO-Paarungen neu schreiben</button>
    <p class="ko-sync-status" style="margin-top:8px;font-size:13px"></p>
  `;
  main.appendChild(koSyncCard);

  $(".ko-sync-btn", koSyncCard).addEventListener("click", async () => {
    if (!confirm("Alle homeRef/awayRef der KO-Spiele mit den Werten aus tournament-2026.js überschreiben?")) return;
    const btn = $(".ko-sync-btn", koSyncCard);
    const status = $(".ko-sync-status", koSyncCard);
    btn.disabled = true;
    btn.textContent = "Synchronisiere…";
    try {
      const firestoreMatches = await loadAllMatches();
      const slotToId = new Map(firestoreMatches.filter(m => m.slot).map(m => [m.slot, m.id]));
      const koMatches = TOURNAMENT_2026.knockoutMatches;
      const batch = writeBatch(db);
      let updated = 0;
      const skipped = [];
      for (const km of koMatches) {
        const firestoreId = slotToId.get(km.slot);
        if (!firestoreId) { skipped.push(km.slot); continue; }
        batch.update(doc(db, "matches", firestoreId), { homeRef: km.homeRef || null, awayRef: km.awayRef || null, order: km.order });
        updated++;
      }
      await batch.commit();
      status.style.color = updated > 0 ? "var(--success, #22a559)" : "var(--error)";
      status.textContent = `Fertig: ${updated} KO-Spiele aktualisiert.` + (skipped.length ? ` Übersprungen (kein slot-Match in Firestore): ${skipped.join(", ")}` : "");
      btn.disabled = false;
      btn.textContent = "KO-Paarungen neu schreiben";
    } catch (err) {
      status.style.color = "var(--error)";
      status.textContent = "Fehler: " + (err.message || err);
      btn.disabled = false;
      btn.textContent = "KO-Paarungen neu schreiben";
    }
  });

  // --- Danger zone ---
  const dangerCard = document.createElement("section");
  dangerCard.className = "card admin-danger-card";
  dangerCard.innerHTML = `
    <h2>Gefahrenzone</h2>
    <p>Alle eingetragenen Ergebnisse, Tipp-Punkte und Nutzerpunkte werden unwiderruflich zurückgesetzt. Nur für Testzwecke verwenden.</p>
    <button class="danger-btn">Alle Ergebnisse zurücksetzen</button>
    <p class="danger-status"></p>
  `;
  main.appendChild(dangerCard);

  $(".danger-btn", dangerCard).addEventListener("click", async () => {
    if (!confirm("Wirklich alle Ergebnisse, Punkte und Tipp-Wertungen löschen? Das kann nicht rückgängig gemacht werden.")) return;
    const btn = $(".danger-btn", dangerCard);
    const status = $(".danger-status", dangerCard);
    btn.disabled = true;
    btn.textContent = "Zurücksetzen…";
    try {
      await resetAllResults();
      status.style.color = "green";
      status.textContent = "✓ Erfolgreich zurückgesetzt.";
      btn.textContent = "Alle Ergebnisse zurücksetzen";
      btn.disabled = false;
    } catch (err) {
      status.style.color = "var(--error)";
      status.textContent = "Fehler: " + (err.message || err);
      btn.disabled = false;
      btn.textContent = "Alle Ergebnisse zurücksetzen";
    }
  });
}



async function resetAllResults() {
  const [matchesSnap, betsSnap, usersSnap] = await Promise.all([
    getDocs(collection(db, "matches")),
    getDocs(collection(db, "bets")),
    getDocs(collection(db, "users")),
  ]);

  const BATCH_LIMIT = 490;
  let batch = writeBatch(db);
  let ops = 0;

  const flush = async () => { await batch.commit(); batch = writeBatch(db); ops = 0; };

  for (const d of matchesSnap.docs) {
    batch.update(d.ref, { homeScore: null, awayScore: null, finished: false });
    if (++ops >= BATCH_LIMIT) await flush();
  }
  for (const d of betsSnap.docs) {
    batch.update(d.ref, { points: null });
    if (++ops >= BATCH_LIMIT) await flush();
  }
  for (const d of usersSnap.docs) {
    batch.update(d.ref, {
      totalPoints: 0,
      recentScores: [],
    });
    if (++ops >= BATCH_LIMIT) await flush();
  }
  if (ops > 0) await batch.commit();
}

async function finalizeMatch(matchId, homeScore, awayScore, extraPatch = {}) {
  const matchRef = doc(db, "matches", matchId);
  await updateDoc(matchRef, { ...extraPatch, homeScore, awayScore, finished: true });

  // Punkte vergeben
  const betsSnap = await getDocs(query(collection(db, "bets"), where("matchId", "==", matchId)));
  if (!betsSnap.empty) {
    const matchData = { homeScore, awayScore };
    const scoredBets = betsSnap.docs.map(b => ({ ref: b.ref, bet: b.data(), pts: scoreBet(b.data(), matchData) }));
    const userSnaps = await Promise.all(
      scoredBets.map(s => getDoc(doc(db, "users", s.bet.uid)))
    );

    const now = new Date();
    const batch = writeBatch(db);
    scoredBets.forEach((s, i) => {
      batch.update(s.ref, { points: s.pts });
      const userRef = userSnaps[i].ref;
      const u = userSnaps[i].exists() ? userSnaps[i].data() : {};
      const userPatch = {};
      if (s.pts > 0) {
        userPatch.totalPoints = increment(s.pts);
        const recent = Array.isArray(u.recentScores) ? u.recentScores : [];
        userPatch.recentScores = [...recent, { ts: now, pts: s.pts }];
      }
      if (Object.keys(userPatch).length > 0) {
        batch.update(userRef, userPatch);
      }
    });
    await batch.commit();
  }

  // KO-Folgespiele auflösen
  await resolveKnockout();
}

// ---------- Andere Tipps ----------
async function loadAndRenderBets(match, myBets, userMap, container) {
  try {
    const betsSnap = await getDocs(query(collection(db, "bets"), where("matchId", "==", match.id)));
    const allBets = betsSnap.docs.map(d => d.data());

    if (allBets.length === 0) {
      container.innerHTML = `<p style="color:var(--muted);font-size:14px;margin:0">Noch keine Tipps abgegeben.</p>`;
      return;
    }

    const myBet = myBets.get(match.id);
    const otherBets = allBets
      .filter(b => b.uid !== state.user.uid)
      .sort((a, b) => {
        if (match.finished) {
          const ptsDiff = (b.points ?? -1) - (a.points ?? -1);
          if (ptsDiff !== 0) return ptsDiff;
        }
        return (userMap.get(a.uid)?.name || "").localeCompare(userMap.get(b.uid)?.name || "", "de");
      });

    const showPts = match.finished;

    function ptsHtml(pts) {
      if (pts == null) return `<span style="color:var(--muted)">–</span>`;
      if (pts === 3) return `<span class="tn-pts-3">3</span>`;
      if (pts === 1) return `<span class="tn-pts-1">1</span>`;
      return `<span class="tn-pts-0">0</span>`;
    }

    function betCellHtml(bet) {
      if (!bet) return `<span style="color:var(--muted)">–</span>`;
      return `${bet.homeBet} : ${bet.awayBet}`;
    }

    // Build all row data: current user first, then others
    const meEntry = { isMe: true, name: state.profile?.name || "Du", bet: myBet };
    const allRows = [meEntry, ...otherBets.map(b => ({
      isMe: false,
      name: userMap.get(b.uid)?.name || b.uid,
      bet: b,
    }))];

    function buildTable(rows) {
      const table = document.createElement("table");
      table.className = "teilnehmer-table";
      const thead = document.createElement("thead");
      thead.innerHTML = `<tr>
        <th>Name</th>
        <th style="text-align:center">Tipp</th>
        ${showPts ? `<th style="text-align:center">Punkte</th>` : ""}
      </tr>`;
      table.appendChild(thead);
      const tbody = document.createElement("tbody");
      for (const row of rows) {
        const tr = document.createElement("tr");
        if (row.isMe) tr.className = "tn-me-row";
        const nameCellHtml = row.isMe
          ? `${escapeHtml(row.name)}<span class="tn-me-tag">Du</span>`
          : escapeHtml(row.name);
        const ptsCellHtml = row.bet ? ptsHtml(row.bet.points) : `<span style="color:var(--muted)">–</span>`;
        tr.innerHTML = `
          <td>${nameCellHtml}</td>
          <td style="text-align:center">${betCellHtml(row.bet)}</td>
          ${showPts ? `<td style="text-align:center">${ptsCellHtml}</td>` : ""}
        `;
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      return table;
    }

    container.innerHTML = "";

    if (allBets.length >= 10) {
      const mid = Math.ceil(allRows.length / 2);
      const wrapper = document.createElement("div");
      wrapper.className = "tn-two-col";
      wrapper.appendChild(buildTable(allRows.slice(0, mid)));
      wrapper.appendChild(buildTable(allRows.slice(mid)));
      container.appendChild(wrapper);
    } else {
      container.appendChild(buildTable(allRows));
    }
  } catch (err) {
    container.innerHTML = `<p class="error">Fehler: ${escapeHtml(err.message || String(err))}</p>`;
  }
}

function buildTeilnehmerCard(match, myBets, userMap) {
  const card = document.createElement("div");
  card.className = "card teilnehmer-card";

  const statusText = match.finished ? "Beendet" : "Läuft";
  const resultHtml = match.finished && match.homeScore != null
    ? `<span class="tn-score">${match.homeScore} : ${match.awayScore}</span>`
    : `<span class="tn-score tn-score-pending">? : ?</span>`;

  const header = document.createElement("button");
  header.type = "button";
  header.className = "teilnehmer-card-header";
  header.innerHTML = `
    <div class="tn-teams">
      <span class="tn-team tn-home">${teamLabelHtml(match.homeTeam)}</span>
      ${resultHtml}
      <span class="tn-team tn-away">${teamLabelHtml(match.awayTeam)}</span>
    </div>
    <div class="tn-right">
      <span class="tn-meta">${fmtKickoff(match.kickoff)} · ${statusText}</span>
      <span class="tn-chevron">▾</span>
    </div>
  `;

  const body = document.createElement("div");
  body.className = "teilnehmer-card-body";
  body.innerHTML = `<p style="color:var(--muted);font-size:14px;margin:0">Lade…</p>`;

  let loaded = false;
  header.addEventListener("click", async () => {
    const isOpen = card.classList.toggle("open");
    if (isOpen && !loaded) {
      loaded = true;
      await loadAndRenderBets(match, myBets, userMap, body);
    }
  });

  card.appendChild(header);
  card.appendChild(body);
  return card;
}

async function renderTeilnehmer() {
  const main = $("#app");
  main.innerHTML = "";

  const [allMatches, usersSnap, myBets] = await Promise.all([
    loadAllMatches(),
    getDocs(collection(db, "users")),
    loadMyBets(),
  ]);

  const userMap = new Map(usersSnap.docs.map(d => [d.id, { id: d.id, ...d.data() }]));

  const now = Date.now();
  const startedMatches = allMatches
    .filter(m => {
      const ko = m.kickoff.toMillis ? m.kickoff.toMillis() : new Date(m.kickoff).getTime();
      return ko <= now;
    })
    .sort((a, b) => {
      const ka = a.kickoff.toMillis ? a.kickoff.toMillis() : new Date(a.kickoff).getTime();
      const kb = b.kickoff.toMillis ? b.kickoff.toMillis() : new Date(b.kickoff).getTime();
      return kb - ka;
    });

  if (startedMatches.length === 0) {
    main.innerHTML = emptyStateHtml(
      "search",
      "Noch keine Spiele gestartet",
      "Hier erscheinen die Tipps aller Teilnehmer, sobald ein Spiel angepfiffen wurde."
    );
    return;
  }

  for (const match of startedMatches) {
    main.appendChild(buildTeilnehmerCard(match, myBets, userMap));
  }
}

// ---------- routing ----------
const routes = {
  "#spiele": renderSpiele,
  "#turnierbaum": renderTurnierbaum,
  "#teilnehmer": renderTeilnehmer,
  "#admin": renderAdmin,
};

async function route() {
  if (!state.user) { renderLogin(); return; }

  const hash = routes[location.hash] ? location.hash : "#spiele";
  if (location.hash !== hash) { location.hash = hash; return; }
  $$("#nav a").forEach(a => a.classList.toggle("active", a.getAttribute("href") === hash));
  document.getElementById("rules-drawer")?.remove();
  $("#app").classList.remove("wide", "spiele-wide");
  $("#app").innerHTML = `<div class="empty">Lade…</div>`;
  try {
    await routes[hash]();
  } catch (err) {
    $("#app").innerHTML = `<div class="card error">Fehler: ${escapeHtml(err.message || String(err))}</div>`;
    console.error(err);
  }
}

window.addEventListener("hashchange", route);

// ---------- auth state ----------
onAuthStateChanged(auth, async (user) => {
  state.user = user;
  if (!user) {
    $("#nav").classList.add("hidden");
    $("#logout-btn").classList.add("hidden");
    $("#account-btn").classList.add("hidden");
    $("#user-name").textContent = "";
    $("#burger-btn").classList.add("hidden");
    $("#burger-menu").classList.add("hidden");
    $("#burger-admin").classList.add("hidden");
    $("#burger-name").textContent = "";
    renderLogin();
    return;
  }
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, { name: user.email, email: user.email, totalPoints: 0 });
    state.profile = { name: user.email, email: user.email, totalPoints: 0 };
  } else {
    state.profile = snap.data();
  }

  document.getElementById("auth-overlay")?.remove();
  document.body.style.overflow = "";
  $("#user-name").textContent = state.profile.name;
  $("#nav").classList.remove("hidden");
  $("#logout-btn").classList.remove("hidden");
  $("#account-btn").classList.remove("hidden");
  $("#nav-admin").classList.toggle("hidden", !isAdmin());
  $("#burger-btn").classList.remove("hidden");
  $("#burger-name").textContent = state.profile.name + " / Konto";
  $("#burger-admin").classList.toggle("hidden", !isAdmin());

  if (!routes[location.hash]) {
    location.hash = "#spiele";
  }
  route();
});

$("#logout-btn").addEventListener("click", () => signOut(auth));
$("#account-btn").addEventListener("click", openAccountModal);
$("#burger-name").addEventListener("click", () => {
  $("#burger-menu").classList.add("hidden");
  openAccountModal();
});
$("#burger-logout").addEventListener("click", () => {
  $("#burger-menu").classList.add("hidden");
  signOut(auth);
});
$("#burger-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  $("#burger-menu").classList.toggle("hidden");
});
$("#burger-menu").addEventListener("click", (e) => {
  if (e.target.tagName === "A") $("#burger-menu").classList.add("hidden");
});
document.addEventListener("click", (e) => {
  const menu = $("#burger-menu");
  const btn = $("#burger-btn");
  if (menu.classList.contains("hidden")) return;
  if (menu.contains(e.target) || btn.contains(e.target)) return;
  menu.classList.add("hidden");
});
