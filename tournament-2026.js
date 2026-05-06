// Hardcoded WM-2026-Struktur.
// 48 Teams, 12 Gruppen (A-L), 72 Gruppenspiele, 32 KO-Spiele.
//
// HINWEIS: Die offizielle FIFA-Auslosung 2026 entscheidet, welche Gruppen-Sieger
// gegen welche Zweiten/Dritten in der R32 antreten. Die Pairings unten sind eine
// plausible Standard-Bracket-Belegung. Wenn die offizielle FIFA-Map abweicht,
// `KO_PAIRINGS` und `BEST_THIRD_GROUPS` entsprechend anpassen.

const GROUPS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

// Round-robin Reihenfolge innerhalb einer 4er-Gruppe.
// Slots: 1,2,3,4. 6 Spiele pro Gruppe.
const GROUP_PAIRINGS = [
  [1, 2], [3, 4],   // Spieltag 1
  [1, 3], [2, 4],   // Spieltag 2
  [1, 4], [2, 3],   // Spieltag 3
];

// Basisdatum 11.06.2026 18:00 UTC. Jeder Gruppen-Spieltag rückt einen Tag weiter,
// jede Gruppe hat zur selben Zeit Spieltage versetzt um Stunden. Reine Platzhalter
// — Admin kann jeden Anpfiff später überschreiben.
function groupMatches() {
  const matches = [];
  const baseDay = new Date("2026-06-11T18:00:00Z").getTime();
  const ONE_DAY = 24 * 60 * 60 * 1000;
  const THREE_HOURS = 3 * 60 * 60 * 1000;

  GROUPS.forEach((g, gi) => {
    GROUP_PAIRINGS.forEach((pair, mi) => {
      const matchDay = mi * 5 + Math.floor(gi / 4); // 3 Spieltage, gestaffelt
      const slotInDay = gi % 4;
      const kickoff = new Date(baseDay + matchDay * ONE_DAY + slotInDay * THREE_HOURS);
      matches.push({
        slot: `${g}_M${mi + 1}`,
        groupId: g,
        order: gi * 10 + mi,
        homeSlot: `${g}${pair[0]}`,
        awaySlot: `${g}${pair[1]}`,
        kickoff: kickoff.toISOString(),
      });
    });
  });
  return matches;
}

// R32-Pairings (1X = Sieger Gruppe X, 2X = Zweiter, T1..T8 = beste Dritte sortiert)
// HINWEIS: TODO — gegen offizielle FIFA-2026-Map abgleichen.
const KO_PAIRINGS = [
  // R32 (16 Spiele)
  { slot: "R32_1", home: { type: "group_winner", groupId: "A" }, away: { type: "best_third", rank: 1 } },
  { slot: "R32_2", home: { type: "group_winner", groupId: "B" }, away: { type: "best_third", rank: 2 } },
  { slot: "R32_3", home: { type: "group_winner", groupId: "C" }, away: { type: "best_third", rank: 3 } },
  { slot: "R32_4", home: { type: "group_winner", groupId: "D" }, away: { type: "best_third", rank: 4 } },
  { slot: "R32_5", home: { type: "group_winner", groupId: "E" }, away: { type: "best_third", rank: 5 } },
  { slot: "R32_6", home: { type: "group_winner", groupId: "F" }, away: { type: "best_third", rank: 6 } },
  { slot: "R32_7", home: { type: "group_winner", groupId: "G" }, away: { type: "best_third", rank: 7 } },
  { slot: "R32_8", home: { type: "group_winner", groupId: "H" }, away: { type: "best_third", rank: 8 } },
  { slot: "R32_9", home: { type: "group_winner", groupId: "I" }, away: { type: "group_runner_up", groupId: "L" } },
  { slot: "R32_10", home: { type: "group_winner", groupId: "J" }, away: { type: "group_runner_up", groupId: "K" } },
  { slot: "R32_11", home: { type: "group_winner", groupId: "K" }, away: { type: "group_runner_up", groupId: "J" } },
  { slot: "R32_12", home: { type: "group_winner", groupId: "L" }, away: { type: "group_runner_up", groupId: "I" } },
  { slot: "R32_13", home: { type: "group_runner_up", groupId: "A" }, away: { type: "group_runner_up", groupId: "B" } },
  { slot: "R32_14", home: { type: "group_runner_up", groupId: "C" }, away: { type: "group_runner_up", groupId: "D" } },
  { slot: "R32_15", home: { type: "group_runner_up", groupId: "E" }, away: { type: "group_runner_up", groupId: "F" } },
  { slot: "R32_16", home: { type: "group_runner_up", groupId: "G" }, away: { type: "group_runner_up", groupId: "H" } },
];

// R16 (8): Sieger benachbarter R32-Spiele
for (let i = 0; i < 8; i++) {
  KO_PAIRINGS.push({
    slot: `R16_${i + 1}`,
    home: { type: "match_winner", matchSlot: `R32_${2 * i + 1}` },
    away: { type: "match_winner", matchSlot: `R32_${2 * i + 2}` },
  });
}
// QF (4)
for (let i = 0; i < 4; i++) {
  KO_PAIRINGS.push({
    slot: `QF_${i + 1}`,
    home: { type: "match_winner", matchSlot: `R16_${2 * i + 1}` },
    away: { type: "match_winner", matchSlot: `R16_${2 * i + 2}` },
  });
}
// SF (2)
for (let i = 0; i < 2; i++) {
  KO_PAIRINGS.push({
    slot: `SF_${i + 1}`,
    home: { type: "match_winner", matchSlot: `QF_${2 * i + 1}` },
    away: { type: "match_winner", matchSlot: `QF_${2 * i + 2}` },
  });
}
// Spiel um Platz 3
KO_PAIRINGS.push({
  slot: "THIRD",
  home: { type: "match_loser", matchSlot: "SF_1" },
  away: { type: "match_loser", matchSlot: "SF_2" },
});
// Finale
KO_PAIRINGS.push({
  slot: "FINAL",
  home: { type: "match_winner", matchSlot: "SF_1" },
  away: { type: "match_winner", matchSlot: "SF_2" },
});

// stage zu jedem KO-Slot
function koGroupId(slot) {
  if (slot.startsWith("R32_")) return "R32";
  if (slot.startsWith("R16_")) return "R16";
  if (slot.startsWith("QF_")) return "QF";
  if (slot.startsWith("SF_")) return "SF";
  if (slot === "THIRD") return "THIRD";
  if (slot === "FINAL") return "FINAL";
  return "KO";
}

// KO-Anpfiffe (Platzhalter; per Admin änderbar)
const KO_DATES = {
  R32: "2026-06-29T18:00:00Z",
  R16: "2026-07-04T18:00:00Z",
  QF: "2026-07-09T18:00:00Z",
  SF: "2026-07-14T20:00:00Z",
  THIRD: "2026-07-18T16:00:00Z",
  FINAL: "2026-07-19T19:00:00Z",
};

function knockoutMatches() {
  return KO_PAIRINGS.map((p, i) => ({
    slot: p.slot,
    groupId: koGroupId(p.slot),
    order: 1000 + i,
    homeSlot: null,
    awaySlot: null,
    homeRef: p.home,
    awayRef: p.away,
    kickoff: KO_DATES[koGroupId(p.slot)],
  }));
}

export const TOURNAMENT_2026 = {
  groups: GROUPS,
  groupMatches: groupMatches(),
  knockoutMatches: knockoutMatches(),
};

// Reihenfolge der KO-Runden für die UI
export const KO_ORDER = ["R32", "R16", "QF", "SF", "THIRD", "FINAL"];
export const KO_LABELS = {
  R32: "Sechzehntelfinale",
  R16: "Achtelfinale",
  QF: "Viertelfinale",
  SF: "Halbfinale",
  THIRD: "Spiel um Platz 3",
  FINAL: "Finale",
};

// Lesbares Label für eine Ref (wenn das Team noch nicht feststeht)
export function refLabel(ref) {
  if (!ref) return "?";
  if (ref.type === "group_winner") return `Sieger Gruppe ${ref.groupId}`;
  if (ref.type === "group_runner_up") return `Zweiter Gruppe ${ref.groupId}`;
  if (ref.type === "best_third") return `Bester Dritter #${ref.rank}`;
  if (ref.type === "match_winner") return `Sieger ${ref.matchSlot}`;
  if (ref.type === "match_loser") return `Verlierer ${ref.matchSlot}`;
  return "?";
}
