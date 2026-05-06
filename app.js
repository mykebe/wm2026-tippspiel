import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut
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

const state = { user: null, profile: null };

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
  document.body.appendChild(overlay);
  overlay.appendChild($("#tpl-login").content.cloneNode(true));
  let mode = "login";
  const form = overlay.querySelector("#auth-form");
  const submit = form.querySelector("button[type=submit]");
  const nameField = form.querySelector(".name-field");
  const errEl = overlay.querySelector("#auth-error");
  const tabs = overlay.querySelectorAll(".tab");

  const setMode = (m) => {
    mode = m;
    tabs.forEach(t => t.classList.toggle("active", t.dataset.mode === m));
    nameField.classList.toggle("hidden", m === "login");
    submit.textContent = m === "login" ? "Anmelden" : "Registrieren";
    errEl.textContent = "";
  };
  tabs.forEach(t => t.addEventListener("click", () => setMode(t.dataset.mode)));

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
      }
    } catch (err) {
      errEl.textContent = friendlyError(err);
    } finally {
      submit.disabled = false;
    }
  });
}

// ---------- leaderboard (reusable) ----------
async function renderLeaderboard(targetEl, { limit = 5, title = "Tabelle – Top 5", snap = null } = {}) {
  const node = $("#tpl-leaderboard").content.cloneNode(true);
  $("h2", node).textContent = title;
  const ol = $(".leaderboard", node);
  if (!snap) snap = await getDocs(collection(db, "users"));
  const users = snap.docs.map(d => d.data())
    .sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0))
    .slice(0, limit);
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

// ---------- bet modal ----------
function openBetModal(match, onSaved) {
  const root = $("#modal-root");
  root.innerHTML = "";
  const tpl = $("#tpl-bet-modal").content.cloneNode(true);
  root.appendChild(tpl);
  const backdrop = $(".modal-backdrop", root);
  $(".modal-title", root).textContent = `${match.homeTeam} – ${match.awayTeam}`;
  $(".modal-meta", root).textContent = fmtKickoff(match.kickoff);
  $(".team-home", root).textContent = match.homeTeam;
  $(".team-away", root).textContent = match.awayTeam;
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
  $(".bm-home", node).textContent = homeLabel;
  $(".bm-away", node).textContent = awayLabel;

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

  $(".sc-home", node).textContent = match.homeTeam;
  $(".sc-away", node).textContent = match.awayTeam;
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
async function renderSpiele() {
  const main = $("#app");
  main.classList.remove("wide");
  main.innerHTML = "";
  await renderLeaderboard(main);

  // --- Upcoming matches ---
  const heading = document.createElement("h1");
  heading.textContent = "Nächste Spiele";
  main.appendChild(heading);

  const container = document.createElement("div");
  main.appendChild(container);

  const allMatches = await loadAllMatches();
  const myBets = await loadMyBets();
  const now = Date.now();
  const in7days = now + 7 * 24 * 60 * 60 * 1000;

  const upcoming = allMatches
    .filter(m => {
      if (m.finished) return false;
      if (!m.homeTeam || !m.awayTeam) return false;
      const ko = m.kickoff.toMillis ? m.kickoff.toMillis() : new Date(m.kickoff).getTime();
      return ko > now && ko <= in7days;
    })
    .sort((a, b) => {
      const ka = a.kickoff.toMillis ? a.kickoff.toMillis() : new Date(a.kickoff).getTime();
      const kb = b.kickoff.toMillis ? b.kickoff.toMillis() : new Date(b.kickoff).getTime();
      return ka - kb;
    });

  if (upcoming.length === 0) {
    container.innerHTML = `<div class="empty">Aktuell keine kommenden Spiele.</div>`;
  } else {
    for (const m of upcoming) {
      container.appendChild(renderSpielCard(m, myBets.get(m.id), () => route()));
    }
  }

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
    <p>Willkommen beim WM-Tippspiel 2026! Der Gewinner erhält <strong>50&nbsp;€</strong>.</p>
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
}

async function renderTurnierbaum() {
  const main = $("#app");
  main.classList.add("wide");
  main.innerHTML = "";
  await renderLeaderboard(main);

  const allMatches = await loadAllMatches();
  const myBets = await loadMyBets();
  const cfg = await loadTournamentConfig();
  const teamMap = cfg.teams || {};

  if (allMatches.length === 0) {
    main.innerHTML += `<div class="card empty">Turnier noch nicht initialisiert. Admin: bitte unter „Admin" auf „Turnier initialisieren" klicken.</div>`;
    return;
  }

  // Gruppenphase
  main.insertAdjacentHTML("beforeend", `<div class="section-title">Gruppenphase</div>`);
  const groupGrid = document.createElement("div");
  groupGrid.className = "group-grid";
  main.appendChild(groupGrid);

  for (const g of TOURNAMENT_2026.groups) {
    const groupMatches = allMatches.filter(m => m.groupId === g).sort((a, b) => a.order - b.order);
    if (groupMatches.length === 0) continue;
    const node = $("#tpl-group-card").content.cloneNode(true);
    $(".group-title", node).textContent = `Gruppe ${g}`;
    const tbody = $("tbody", node);
    const standings = computeGroupStandings(g, allMatches, teamMap);
    standings.forEach((row, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${i + 1}</td>
        <td class="t">${escapeHtml(row.team)}</td>
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
    for (const m of groupMatches) {
      matchesContainer.appendChild(renderBracketMatch(m, myBets.get(m.id), () => route()));
    }
    groupGrid.appendChild(node);
  }

  // KO-Phase bracket
  main.insertAdjacentHTML("beforeend", `<div class="section-title">K.-o.-Phase</div>`);

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

  main.appendChild(bracket);
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
        <strong>${m.groupId}</strong> ${escapeHtml(homeLbl)} – ${escapeHtml(awayLbl)}
        <span class="when">${m.finished ? `Beendet ${m.homeScore}:${m.awayScore}` : ""}</span>
      </div>
      <div class="result-inputs">
        <input type="datetime-local" class="kickoff-input" value="${localValue}" style="width:220px">
        <input class="score" type="number" min="0" max="20" placeholder="H" value="${m.homeScore ?? ""}" ${!m.homeTeam ? "disabled" : ""}>
        <span>:</span>
        <input class="score" type="number" min="0" max="20" placeholder="A" value="${m.awayScore ?? ""}" ${!m.awayTeam ? "disabled" : ""}>
        <button class="primary save">Speichern</button>
      </div>
    `;
    const koInput = $(".kickoff-input", row);
    const [hi, ai] = $$(".score", row);
    const saveBtn = $("button.save", row);
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
}



async function finalizeMatch(matchId, homeScore, awayScore, extraPatch = {}) {
  const matchRef = doc(db, "matches", matchId);
  await updateDoc(matchRef, { ...extraPatch, homeScore, awayScore, finished: true });

  // Punkte vergeben
  const betsSnap = await getDocs(query(collection(db, "bets"), where("matchId", "==", matchId)));
  if (!betsSnap.empty) {
    const matchData = { homeScore, awayScore };
    const batch = writeBatch(db);
    for (const b of betsSnap.docs) {
      const bet = b.data();
      const pts = scoreBet(bet, matchData);
      batch.update(b.ref, { points: pts });
      if (pts > 0) {
        batch.update(doc(db, "users", bet.uid), { totalPoints: increment(pts) });
      }
    }
    await batch.commit();
  }

  // KO-Folgespiele auflösen
  await resolveKnockout();
}

// ---------- routing ----------
const routes = {
  "#spiele": renderSpiele,
  "#turnierbaum": renderTurnierbaum,
  "#admin": renderAdmin,
};

async function route() {
  if (!state.user) { renderLogin(); return; }
  const hash = routes[location.hash] ? location.hash : "#spiele";
  if (location.hash !== hash) { location.hash = hash; return; }
  $$("#nav a").forEach(a => a.classList.toggle("active", a.getAttribute("href") === hash));
  document.getElementById("rules-drawer")?.remove();
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
    $("#user-name").textContent = "";
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
  $("#user-name").textContent = state.profile.name;
  $("#nav").classList.remove("hidden");
  $("#logout-btn").classList.remove("hidden");
  $("#nav-admin").classList.toggle("hidden", !isAdmin());
  if (!routes[location.hash]) location.hash = "#spiele";
  route();
});

$("#logout-btn").addEventListener("click", () => signOut(auth));
