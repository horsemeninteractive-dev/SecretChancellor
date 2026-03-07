import { GameState, Player, Policy } from "../src/types.ts";

// =============================================================================
// BAYESIAN SUSPICION MODEL
// Each AI maintains a per-player belief about whether that player is Fascist/Hitler,
// stored as log-odds so evidence compounds correctly via addition.
//
// Evidence sources:
//   1. Government voting outcomes (who voted Ja for a fascist-policy government)
//   2. Policy declarations (president/chancellor claims about what they saw)
//   3. Declaration inconsistency (president vs chancellor claims)
//   4. Fascist enactment count (chancellor repeatedly passing fascist policies)
//   5. Investigation results (direct, strong evidence)
//   6. Chancellor nomination choices (fascist presidents nominate fascist chancellors)
// =============================================================================

function logOdds(p: number): number {
  p = Math.max(0.01, Math.min(0.99, p));
  return Math.log(p / (1 - p));
}

function fromLogOdds(lo: number): number {
  return 1 / (1 + Math.exp(-lo));
}

function clampLO(lo: number): number {
  return Math.max(logOdds(0.02), Math.min(logOdds(0.98), lo));
}

/**
 * Initialise suspicion scores for every AI at game-start.
 * Liberals start at the uninformed prior (numFascists / numPlayers).
 * Fascists already have perfect team knowledge, so they start near-certain.
 */
export function initializeSuspicion(state: GameState): void {
  const n = state.players.length;
  const numFascists = n <= 6 ? 2 : n <= 8 ? 3 : 4; // includes Hitler
  const prior = numFascists / n;

  for (const ai of state.players.filter(p => p.isAI)) {
    ai.suspicion = {};
    ai.fascistEnactments = 0;
    for (const target of state.players) {
      if (target.id === ai.id) continue;
      if (ai.role === "Liberal") {
        ai.suspicion[target.id] = logOdds(prior);
      } else {
        // Fascists / Hitler know everyone's alignment
        const isFascistTeam = target.role === "Fascist" || target.role === "Hitler";
        ai.suspicion[target.id] = logOdds(isFascistTeam ? 0.97 : 0.03);
      }
    }
  }
}

export function getSuspicion(ai: Player, targetId: string): number {
  if (!ai.suspicion || ai.suspicion[targetId] === undefined) return 0.4;
  return fromLogOdds(ai.suspicion[targetId]);
}

function nudge(ai: Player, targetId: string, lr: number): void {
  if (!ai.suspicion || ai.suspicion[targetId] === undefined || targetId === ai.id) return;
  ai.suspicion[targetId] = clampLO(ai.suspicion[targetId] + Math.log(lr));
}

/**
 * After a policy is enacted by a successful government, update every Liberal AI's
 * beliefs based on who voted for this government and who was President/Chancellor.
 */
export function updateSuspicionFromPolicy(state: GameState, policy: Policy): void {
  const votes = state.lastGovernmentVotes;
  const presId = state.lastGovernmentPresidentId;
  const chanId = state.lastGovernmentChancellorId;
  if (!votes) return;

  for (const ai of state.players.filter(p => p.isAI && p.role === "Liberal")) {
    if (!ai.suspicion) continue;

    // Voting evidence: P(Ja|fascist)/P(Ja|lib)
    // Fascist enacted → LR(Ja)≈1.78, LR(Nein)≈0.56
    // Liberal enacted → LR(Ja)≈0.71, LR(Nein)≈1.40
    for (const [pid, v] of Object.entries(votes)) {
      if (pid === ai.id) continue;
      if (policy === "Fascist") {
        nudge(ai, pid, v === "Ja" ? 1.78 : 0.56);
      } else {
        nudge(ai, pid, v === "Ja" ? 0.71 : 1.40);
      }
    }

    // Government members are stronger signals than plain votes
    if (presId && presId !== ai.id) {
      nudge(ai, presId, policy === "Fascist" ? 2.0 : 0.60);
    }
    if (chanId && chanId !== ai.id) {
      nudge(ai, chanId, policy === "Fascist" ? 2.8 : 0.50);
      const chan = state.players.find(p => p.id === chanId);
      if (chan && policy === "Fascist") {
        chan.fascistEnactments = (chan.fascistEnactments ?? 0) + 1;
      }
    }
  }
}

/**
 * After both President and Chancellor have declared what they saw/passed,
 * check for logical impossibilities and update beliefs accordingly.
 *
 * President draws 3, discards 1, passes 2 to chancellor.
 * Consistent iff: chanDecl.fas <= presDecl.fas  AND  presDecl.fas - chanDecl.fas <= 1
 */
export function updateSuspicionFromDeclarations(state: GameState): void {
  const presDecl = state.declarations.find(d => d.type === "President");
  const chanDecl = state.declarations.find(d => d.type === "Chancellor");
  if (!presDecl || !chanDecl) return;

  const gap = presDecl.fas - chanDecl.fas;
  const inconsistent = chanDecl.fas > presDecl.fas || gap > 1;

  for (const ai of state.players.filter(p => p.isAI && p.role === "Liberal")) {
    if (!ai.suspicion) continue;

    if (inconsistent) {
      // Definite lie — raise both by LR ≈ 2.5
      if (presDecl.playerId !== ai.id) nudge(ai, presDecl.playerId, 2.5);
      if (chanDecl.playerId !== ai.id) nudge(ai, chanDecl.playerId, 2.5);
      state.log.push(`[Suspicion] Inconsistent declarations: ${presDecl.playerName} vs ${chanDecl.playerName}.`);
    } else {
      // Consistent — modest trust boost
      if (presDecl.playerId !== ai.id) nudge(ai, presDecl.playerId, 0.82);
      if (chanDecl.playerId !== ai.id) nudge(ai, chanDecl.playerId, 0.82);
    }

    // "All 3 were fascist" is a common fascist deflection
    if (presDecl.fas === 3 && presDecl.playerId !== ai.id) nudge(ai, presDecl.playerId, 1.4);

    // Chancellor claiming 2-fascist hand is exculpatory for them but pins president
    if (chanDecl.fas === 2 && presDecl.fas >= 2 && presDecl.playerId !== ai.id) {
      nudge(ai, presDecl.playerId, 1.3);
    }
  }
}

export function updateSuspicionFromInvestigation(
  state: GameState,
  investigatorId: string,
  targetId: string,
  result: "Liberal" | "Fascist"
): void {
  for (const ai of state.players.filter(p => p.isAI && p.role === "Liberal")) {
    if (!ai.suspicion) continue;
    if (targetId !== ai.id) nudge(ai, targetId, result === "Fascist" ? 10.0 : 0.08);
    if (investigatorId !== ai.id) nudge(ai, investigatorId, result === "Fascist" ? 0.85 : 0.88);
  }
}

/**
 * When a president nominates a chancellor, observing Liberal AIs note who was chosen.
 * Nominating an already-suspicious player increases suspicion of the president.
 */
export function updateSuspicionFromNomination(
  state: GameState,
  presidentId: string,
  chancellorId: string
): void {
  for (const ai of state.players.filter(p => p.isAI && p.role === "Liberal")) {
    if (!ai.suspicion) continue;
    const chanSusp = getSuspicion(ai, chancellorId);
    if (chanSusp > 0.60 && presidentId !== ai.id) {
      nudge(ai, presidentId, 1.0 + chanSusp);
    }
    if (chancellorId !== ai.id) {
      nudge(ai, chancellorId, chanSusp > 0.55 ? 1.2 : 0.95);
    }
  }
}

export function leastSuspicious(ai: Player, candidates: Player[]): Player {
  return candidates.reduce((best, p) =>
    getSuspicion(ai, p.id) < getSuspicion(ai, best.id) ? p : best
  );
}

export function mostSuspicious(ai: Player, candidates: Player[]): Player {
  return candidates.reduce((most, p) =>
    getSuspicion(ai, p.id) > getSuspicion(ai, most.id) ? p : most
  );
}
