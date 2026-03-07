import { ExecutiveAction, GameState, Role } from "../src/types.ts";
import { shuffle } from "./utils.ts";

/**
 * Returns the executive action triggered after the nth Fascist policy is enacted,
 * based on player count. Returns "None" if no action is triggered.
 */
export function getExecutiveAction(state: GameState): ExecutiveAction {
  const n = state.players.length;
  const f = state.fascistPolicies;

  if (n <= 6) {
    if (f === 3) return "PolicyPeek";
    if (f === 4) return "Execution";
    if (f === 5) return "Execution";
  } else if (n <= 8) {
    if (f === 2) return "Investigate";
    if (f === 3) return "SpecialElection";
    if (f === 4) return "Execution";
    if (f === 5) return "Execution";
  } else {
    if (f === 1) return "Investigate";
    if (f === 2) return "Investigate";
    if (f === 3) return "SpecialElection";
    if (f === 4) return "Execution";
    if (f === 5) return "Execution";
  }
  return "None";
}

/**
 * Returns a shuffled role array for the given player count.
 */
export function assignRoles(numPlayers: number): Role[] {
  const roleMap: Record<number, Role[]> = {
    5:  ["Liberal", "Liberal", "Liberal", "Fascist", "Hitler"],
    6:  ["Liberal", "Liberal", "Liberal", "Liberal", "Fascist", "Hitler"],
    7:  ["Liberal", "Liberal", "Liberal", "Liberal", "Fascist", "Fascist", "Hitler"],
    8:  ["Liberal", "Liberal", "Liberal", "Liberal", "Liberal", "Fascist", "Fascist", "Hitler"],
    9:  ["Liberal", "Liberal", "Liberal", "Liberal", "Liberal", "Fascist", "Fascist", "Fascist", "Hitler"],
    10: ["Liberal", "Liberal", "Liberal", "Liberal", "Liberal", "Liberal", "Fascist", "Fascist", "Fascist", "Hitler"],
  };
  return shuffle(roleMap[numPlayers] ?? []);
}
