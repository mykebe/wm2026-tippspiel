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

// R32-Pairings — offizielle FIFA-2026-Map.
// Zeiten in UTC (Anstoßzeiten aus MESZ-Spielplan umgerechnet).
// best_third_from = bester Dritter aus dem angegebenen Gruppen-Pool.
// Reihenfolge im Array bestimmt die `order`-Werte (1000+i) und damit die
// visuelle Position im Turnierbaum: je 2 aufeinanderfolgende R32-Einträge
// speisen dasselbe R16-Spiel.
const KO_PAIRINGS = [
  // R32 — linke Klammerhälfte (speisen R16_1–4)
  { slot: "R32_1",  kickoff: "2026-06-29T17:00:00Z", home: { type: "group_runner_up",    groupId: "A" }, away: { type: "group_runner_up", groupId: "B" } },

  { slot: "R32_2",  kickoff: "2026-06-30T17:00:00Z", home: { type: "group_winner", groupId: "F" }, away: { type: "group_runner_up", groupId: "C" } },
  
  { slot: "R32_3",  kickoff: "2026-06-28T19:00:00Z", home: { type: "group_winner", groupId: "E" }, away: { type: "best_third_from", groups: ["A","B","C","D","F"]} },
  
  { slot: "R32_4",  kickoff: "2026-06-29T20:30:00Z", home: { type: "group_winner",    groupId: "I" }, away: { type: "best_third_from", groups: ["C","D","F","G","H"] } },
  
  { slot: "R32_5",  kickoff: "2026-06-30T01:00:00Z", home: { type: "group_runner_up",    groupId: "K" }, away: { type: "group_runner_up", groupId: "L" } },

  { slot: "R32_6",  kickoff: "2026-06-30T21:00:00Z", home: { type: "group_winner",    groupId: "H" }, away: { type: "group_runner_up", groupID: "J" } },

  { slot: "R32_7",  kickoff: "2026-07-01T01:00:00Z", home: { type: "group_winner",    groupId: "D" }, away: { type: "best_third_from", groups: ["B","E","F","I","J"] } },

  { slot: "R32_8",  kickoff: "2026-07-01T16:00:00Z", home: { type: "group_winner",    groupId: "G" }, away: { type: "best_third_from", groups: ["A","E","H","I","J"] } },

  // R32 — rechte Klammerhälfte (speisen R16_5–8, Display umgekehrt)
  { slot: "R32_9", kickoff: "2026-07-03T22:00:00Z", home: { type: "group_winner",    groupId: "K" }, away: { type: "best_third_from", groups: ["D","E","I","J","L"] } },

  { slot: "R32_10", kickoff: "2026-07-03T03:00:00Z", home: { type: "group_winner",    groupId: "B" }, away: { type: "best_third_from", groups: ["E","F","G","I","J"] } },

  { slot: "R32_11", kickoff: "2026-07-04T01:30:00Z", home: { type: "group_runner_up",    groupId: "D" }, away: { type: "group_runner_up", groupId: "G" } },

  { slot: "R32_12", kickoff: "2026-07-03T18:00:00Z", home: { type: "group_winner", groupId: "J" }, away: { type: "group_runner_up", groupId: "H" } },

  { slot: "R32_13", kickoff: "2026-07-02T00:00:00Z", home: { type: "group_winner",    groupId: "F" }, away: { type: "group_runner_up", groupId: "C" } },

  { slot: "R32_14",  kickoff: "2026-07-01T20:00:00Z", home: { type: "group_winner",    groupId: "A" }, away: { type: "best_third_from", groups: ["C","E","F","H","I"] } },

  { slot: "R32_15", kickoff: "2026-07-02T23:00:00Z", home: { type: "group_runner_up", groupId: "E" }, away: { type: "group_runner_up", groupId: "I" } },

  { slot: "R32_16", kickoff: "2026-07-02T19:00:00Z", home: { type: "group_winner",    groupId: "C" }, away: { type: "group_runner_up", groupId: "F" } },  
];

// R16 (8 Spiele) — offizielle FIFA-2026-Paarungen (Spiele 89–96)
KO_PAIRINGS.push(
  { slot: "R16_1", kickoff: "2026-07-04T21:00:00Z", home: { type: "match_winner", matchSlot: "R32_1"  }, away: { type: "match_winner", matchSlot: "R32_2"  } },
  { slot: "R16_2", kickoff: "2026-07-04T17:00:00Z", home: { type: "match_winner", matchSlot: "R32_3"  }, away: { type: "match_winner", matchSlot: "R32_4"  } },
  { slot: "R16_3", kickoff: "2026-07-05T20:00:00Z", home: { type: "match_winner", matchSlot: "R32_5"  }, away: { type: "match_winner", matchSlot: "R32_6"  } },
  { slot: "R16_4", kickoff: "2026-07-06T00:00:00Z", home: { type: "match_winner", matchSlot: "R32_7"  }, away: { type: "match_winner", matchSlot: "R32_8"  } },
  { slot: "R16_5", kickoff: "2026-07-06T19:00:00Z", home: { type: "match_winner", matchSlot: "R32_9" }, away: { type: "match_winner", matchSlot: "R32_10" } },
  { slot: "R16_6", kickoff: "2026-07-07T00:00:00Z", home: { type: "match_winner", matchSlot: "R32_11"  }, away: { type: "match_winner", matchSlot: "R32_12" } },
  { slot: "R16_7", kickoff: "2026-07-07T16:00:00Z", home: { type: "match_winner", matchSlot: "R32_13" }, away: { type: "match_winner", matchSlot: "R32_14" } },
  { slot: "R16_8", kickoff: "2026-07-07T20:00:00Z", home: { type: "match_winner", matchSlot: "R32_15" }, away: { type: "match_winner", matchSlot: "R32_16" } },
);
// QF (4) — Spiele 97–100
KO_PAIRINGS.push(
  { slot: "QF_1", home: { type: "match_winner", matchSlot: "R16_1" }, away: { type: "match_winner", matchSlot: "R16_2" } },
  { slot: "QF_2", home: { type: "match_winner", matchSlot: "R16_3" }, away: { type: "match_winner", matchSlot: "R16_4" } },
  { slot: "QF_3", home: { type: "match_winner", matchSlot: "R16_7" }, away: { type: "match_winner", matchSlot: "R16_8" } },
  { slot: "QF_4", home: { type: "match_winner", matchSlot: "R16_5" }, away: { type: "match_winner", matchSlot: "R16_6" } },
);
// SF (2) — Spiele 101–102
KO_PAIRINGS.push(
  { slot: "SF_1", home: { type: "match_winner", matchSlot: "QF_1" }, away: { type: "match_winner", matchSlot: "QF_2" } },
  { slot: "SF_2", home: { type: "match_winner", matchSlot: "QF_3" }, away: { type: "match_winner", matchSlot: "QF_4" } },
);
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
    kickoff: p.kickoff || KO_DATES[koGroupId(p.slot)],
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
  if (ref.type === "best_third_from") return `Bester Dritter (${ref.groups.join("/")})`;

  if (ref.type === "match_winner") return `Sieger ${ref.matchSlot}`;
  if (ref.type === "match_loser") return `Verlierer ${ref.matchSlot}`;
  return "?";
}
