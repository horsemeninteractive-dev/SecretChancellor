import { randomUUID } from "crypto";
import { Server, Socket } from "socket.io";
import {
  GameState, Player, Policy, ExecutiveAction,
} from "../src/types.ts";
import { shuffle, createDeck } from "./utils.ts";
import { AI_BOTS, CHAT } from "./aiConstants.ts";
import { getExecutiveAction, assignRoles } from "./gameRules.ts";
import {
  initializeSuspicion,
  getSuspicion,
  leastSuspicious,
  mostSuspicious,
  updateSuspicionFromPolicy,
  updateSuspicionFromDeclarations,
  updateSuspicionFromInvestigation,
  updateSuspicionFromNomination,
} from "./suspicion.ts";
import { getUserById, saveUser } from "./supabaseService.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Deps = {
  io: Server;
};

// ---------------------------------------------------------------------------
// GameEngine
// ---------------------------------------------------------------------------

export class GameEngine {
  private io: Server;
  readonly rooms: Map<string, GameState> = new Map();

  private lobbyTimers:  Map<string, NodeJS.Timeout> = new Map();
  private pauseTimers:  Map<string, NodeJS.Timeout> = new Map();
  private actionTimers: Map<string, any>             = new Map();

  constructor({ io }: Deps) {
    this.io = io;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Broadcasting
  // ═══════════════════════════════════════════════════════════════════════════

  broadcastState(roomId: string): void {
    const state = this.rooms.get(roomId);
    if (!state) return;

    // Start action timer if phase changed or just started
    if (
      state.actionTimer > 0 &&
      !state.actionTimerEnd &&
      state.phase !== "Lobby" &&
      state.phase !== "GameOver" &&
      !state.isPaused
    ) {
      this.startActionTimer(roomId);
    }

    // Public view — hide roles until game over
    const publicState = {
      ...state,
      players: state.players.map(p => {
        const { role, ...rest } = p;
        return state.phase === "GameOver" ? { ...rest, role } : rest;
      }),
    };
    this.io.to(roomId).emit("gameStateUpdate", publicState);

    // Private role info per human player
    state.players.forEach(p => {
      if (p.isAI) return;
      const fascists = state.players
        .filter(pl => pl.role === "Fascist" || pl.role === "Hitler")
        .map(pl => ({ id: pl.id, name: pl.name, role: pl.role! }));

      if (p.role === "Fascist") {
        this.io.to(p.id).emit("privateInfo", { role: p.role, fascists });
      } else if (p.role === "Hitler" && state.players.length <= 6) {
        this.io.to(p.id).emit("privateInfo", { role: p.role, fascists });
      } else {
        this.io.to(p.id).emit("privateInfo", { role: p.role! });
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Action Timer
  // ═══════════════════════════════════════════════════════════════════════════

  startActionTimer(roomId: string): void {
    const state = this.rooms.get(roomId);
    if (
      !state ||
      state.actionTimer === 0 ||
      state.phase === "Lobby" ||
      state.phase === "GameOver"
    ) {
      if (state) state.actionTimerEnd = undefined;
      if (this.actionTimers.has(roomId)) {
        clearTimeout(this.actionTimers.get(roomId));
        this.actionTimers.delete(roomId);
      }
      return;
    }

    // Clear any existing timer
    if (this.actionTimers.has(roomId)) {
      clearTimeout(this.actionTimers.get(roomId));
    }

    state.actionTimerEnd = Date.now() + state.actionTimer * 1000;

    const timer = setTimeout(() => {
      const s = this.rooms.get(roomId);
      if (!s || s.phase === "Lobby" || s.phase === "GameOver") return;
      s.actionTimerEnd = undefined;
      this.handleActionTimerExpiry(s, roomId);
    }, state.actionTimer * 1000);

    this.actionTimers.set(roomId, timer);
  }

  private handleActionTimerExpiry(s: GameState, roomId: string): void {
    if (s.phase === "Election") {
      const president = s.players[s.presidentIdx];
      const eligible = s.players.filter(p =>
        p.isAlive &&
        p.id !== president.id &&
        !p.wasChancellor &&
        !(s.players.filter(pl => pl.isAlive).length > 5 && p.wasPresident)
      );
      if (eligible.length > 0) {
        const target = eligible[Math.floor(Math.random() * eligible.length)];
        target.isChancellorCandidate = true;
        s.phase = "Voting";
        s.log.push(`[Timer] ${president.name} was too slow. ${target.name} was auto-nominated.`);
        this.broadcastState(roomId);
        this.processAITurns(roomId);
      }

    } else if (s.phase === "Voting") {
      s.players.forEach(p => {
        if (p.isAlive && !p.vote) {
          p.vote = Math.random() > 0.3 ? "Ja" : "Nein";
        }
      });
      const jaVotes   = s.players.filter(p => p.vote === "Ja").length;
      const neinVotes = s.players.filter(p => p.vote === "Nein").length;
      s.log.push("[Timer] Voting time expired. Remaining votes were auto-cast.");
      this.handleVoteResult(s, roomId, jaVotes, neinVotes);

    } else if (s.phase === "Legislative_President") {
      const president = s.players.find(p => p.isPresident);
      if (president) {
        s.presidentSaw = [...s.drawnPolicies];
        const discarded = s.drawnPolicies.splice(
          Math.floor(Math.random() * s.drawnPolicies.length), 1
        )[0];
        s.discard.push(discarded);
        s.chancellorPolicies = [...s.drawnPolicies];
        s.chancellorSaw = [...s.chancellorPolicies];
        s.drawnPolicies = [];
        s.phase = "Legislative_Chancellor";
        s.presidentTimedOut = true;
        s.log.push(`[Timer] ${president.name} was too slow. A random policy was discarded.`);
        this.broadcastState(roomId);
        this.processAITurns(roomId);
        // Note: triggerAIDeclarations is NOT called here. It will be called
        // by triggerPolicyEnactment after the chancellor plays their policy.
      }

    } else if (s.phase === "Legislative_Chancellor") {
      const chancellor = s.players.find(p => p.isChancellor);
      if (chancellor && s.chancellorPolicies.length > 0) {
        const played   = s.chancellorPolicies.splice(
          Math.floor(Math.random() * s.chancellorPolicies.length), 1
        )[0];
        const discarded = s.chancellorPolicies[0];
        s.discard.push(discarded);
        s.chancellorPolicies = [];
        s.chancellorTimedOut = true;
        s.log.push(`[Timer] ${chancellor.name} was too slow. A random policy was played.`);
        this.triggerPolicyEnactment(s, roomId, played, false, chancellor.id);
      }

    } else if (s.phase === "Executive_Action") {
      const president = s.players.find(p => p.isPresident);
      if (president) {
        const eligible = s.players.filter(p => p.isAlive && p.id !== president.id);
        if (eligible.length > 0) {
          const target = eligible[Math.floor(Math.random() * eligible.length)];
          s.log.push(`[Timer] ${president.name} was too slow. A random target was selected.`);
          this.handleExecutiveAction(s, roomId, target.id);
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AI Turns
  // ═══════════════════════════════════════════════════════════════════════════

  processAITurns(roomId: string): void {
    const state = this.rooms.get(roomId);
    if (!state || state.phase === "Lobby" || state.phase === "GameOver" || state.isPaused) return;

    setTimeout(async () => {
      const s = this.rooms.get(roomId);
      if (!s || s.isPaused) return;

      if (s.phase === "Election") {
        this.aiNominateChancellor(s, roomId);
      } else if (s.phase === "Voting") {
        this.aiCastVotes(s, roomId);
      } else if (s.phase === "Legislative_President") {
        this.aiPresidentDiscard(s, roomId);
      } else if (s.phase === "Legislative_Chancellor") {
        this.aiChancellorPlay(s, roomId);
      } else if (s.phase === "Executive_Action") {
        await this.aiExecutiveAction(s, roomId);
      }

      // AI President response to Veto
      if (s.vetoRequested) {
        await this.aiVetoResponse(s, roomId);
      }
    }, 2000); // 2-second AI "thinking" delay
  }

  // ─── AI: Election phase ────────────────────────────────────────────────────

  private aiNominateChancellor(s: GameState, roomId: string): void {
    const president = s.players[s.presidentIdx];
    if (!president.isAI) return;

    const eligible = s.players.filter(p =>
      p.isAlive &&
      p.id !== president.id &&
      !p.wasChancellor &&
      !(s.players.filter(pl => pl.isAlive).length > 5 && p.wasPresident)
    );
    if (eligible.length === 0) return;

    let target: Player;

    if (president.role === "Liberal" && president.suspicion) {
      target = leastSuspicious(president, eligible);
    } else {
      const hitlerCandidate  = eligible.find(p => p.role === "Hitler");
      const fascistTeammate  = eligible.find(p => p.role === "Fascist");
      if (s.fascistPolicies >= 3 && hitlerCandidate) {
        target = hitlerCandidate;
      } else if (fascistTeammate && Math.random() > 0.3) {
        target = fascistTeammate;
      } else {
        target = eligible[Math.floor(Math.random() * eligible.length)];
      }
    }

    target.isChancellorCandidate = true;
    s.phase = "Voting";
    s.log.push(`${president.name} nominated ${target.name} for Chancellor.`);
    updateSuspicionFromNomination(s, president.id, target.id);
    this.broadcastState(roomId);
    this.processAITurns(roomId);
  }

  // ─── AI: Voting phase ──────────────────────────────────────────────────────

  private aiCastVotes(s: GameState, roomId: string): void {
    const aiVoters = s.players.filter(p => p.isAI && p.isAlive && !p.vote);
    if (aiVoters.length === 0) return;

    const chancellor = s.players.find(p => p.isChancellorCandidate);
    const president  = s.players[s.presidentIdx];

    aiVoters.forEach(ai => {
      ai.vote = this.computeAIVote(ai, s, president, chancellor ?? null);
    });

    const jaVotes   = s.players.filter(p => p.vote === "Ja").length;
    const neinVotes = s.players.filter(p => p.vote === "Nein").length;

    if (s.players.filter(p => p.isAlive && !p.vote).length === 0) {
      this.handleVoteResult(s, roomId, jaVotes, neinVotes);
    } else {
      this.broadcastState(roomId);
    }
  }

  private computeAIVote(
    ai: Player,
    s: GameState,
    president: Player,
    chancellor: Player | null
  ): "Ja" | "Nein" {
    if (ai.role === "Liberal" && ai.suspicion) {
      const presSusp  = getSuspicion(ai, president.id);
      const chanSusp  = chancellor ? getSuspicion(ai, chancellor.id) : 0;
      const threshold = Math.min(0.65, 0.50 + s.round * 0.015);

      if (presSusp > threshold || chanSusp > threshold) {
        return s.electionTracker >= 2 ? "Ja" : "Nein";
      }
      if (s.fascistPolicies >= 3 && chancellor?.role === "Hitler") return "Nein";
      if (s.electionTracker >= 2) return "Ja";
      return Math.random() > 0.15 ? "Ja" : "Nein";
    }

    // Fascist strategic voting
    if (s.fascistPolicies >= 3 && chancellor?.role === "Hitler") return "Ja";
    if (chancellor?.role !== "Liberal" || president.role !== "Liberal") {
      return Math.random() > 0.15 ? "Ja" : "Nein";
    }
    return Math.random() > 0.45 ? "Ja" : "Nein";
  }

  // ─── AI: Legislative — President discard ──────────────────────────────────

  private aiPresidentDiscard(s: GameState, roomId: string): void {
    const president = s.players.find(p => p.isPresident);
    if (!president?.isAI) return;

    s.presidentSaw = [...s.drawnPolicies];
    let idx = this.choosePolicyToDiscard(president, s.drawnPolicies, s.fascistPolicies);

    const discarded = s.drawnPolicies.splice(idx, 1)[0];
    s.discard.push(discarded);
    s.chancellorPolicies = [...s.drawnPolicies];
    s.chancellorSaw = [...s.chancellorPolicies];
    s.drawnPolicies = [];
    s.phase = "Legislative_Chancellor";
    this.broadcastState(roomId);
    this.processAITurns(roomId);
  }

  private choosePolicyToDiscard(player: Player, hand: Policy[], fascistPolicies: number): number {
    let idx = -1;
    if (player.personality === "Aggressive" && player.role !== "Liberal") {
      idx = hand.findIndex(p => p === "Liberal");
    } else if (player.personality === "Strategic" && player.role !== "Liberal") {
      idx = fascistPolicies < 2
        ? hand.findIndex(p => p === "Fascist")
        : hand.findIndex(p => p === "Liberal");
    } else if (player.personality === "Honest" || player.role === "Liberal") {
      idx = hand.findIndex(p => p === "Fascist");
    }
    return idx === -1 ? 0 : idx;
  }

  // ─── AI: Legislative — Chancellor play ────────────────────────────────────

  private aiChancellorPlay(s: GameState, roomId: string): void {
    const chancellor = s.players.find(p => p.isChancellor);
    if (!chancellor?.isAI || s.chancellorPolicies.length === 0) return;

    let idx = this.choosePolicyToPlay(chancellor, s.chancellorPolicies, s.fascistPolicies);

    const played    = s.chancellorPolicies.splice(idx, 1)[0];
    const discarded = s.chancellorPolicies[0];
    s.discard.push(discarded);
    s.chancellorPolicies = [];
    this.triggerPolicyEnactment(s, roomId, played, false, chancellor.id);
  }

  private choosePolicyToPlay(player: Player, hand: Policy[], fascistPolicies: number): number {
    let idx = -1;
    if (player.personality === "Aggressive" && player.role !== "Liberal") {
      idx = hand.findIndex(p => p === "Liberal"); // Discard liberal, play fascist
    } else if (player.personality === "Strategic" && player.role !== "Liberal") {
      idx = fascistPolicies < 3
        ? hand.findIndex(p => p === "Liberal")
        : hand.findIndex(p => p === "Fascist");
    } else if (player.personality === "Honest" || player.role === "Liberal") {
      idx = hand.findIndex(p => p === "Liberal"); // Play liberal
    }
    return idx === -1 ? 0 : idx;
  }

  // ─── AI: Executive Action ──────────────────────────────────────────────────

  private async aiExecutiveAction(s: GameState, roomId: string): Promise<void> {
    const president = s.players.find(p => p.isPresident);
    if (!president?.isAI) return;

    const eligible = s.players.filter(p => p.isAlive && p.id !== president.id);
    if (eligible.length === 0) return;

    let target: Player;

    if (president.role === "Liberal" && president.suspicion) {
      target = s.currentExecutiveAction === "SpecialElection"
        ? leastSuspicious(president, eligible)
        : mostSuspicious(president, eligible);
    } else {
      const liberals     = eligible.filter(p => p.role === "Liberal");
      const fascistTeam  = eligible.filter(p => p.role === "Fascist" || p.role === "Hitler");
      if (s.currentExecutiveAction === "SpecialElection") {
        target = fascistTeam.length > 0
          ? fascistTeam[Math.floor(Math.random() * fascistTeam.length)]
          : eligible[Math.floor(Math.random() * eligible.length)];
      } else if (s.currentExecutiveAction === "Investigate") {
        target = liberals.length > 0
          ? liberals[Math.floor(Math.random() * liberals.length)]
          : eligible[Math.floor(Math.random() * eligible.length)];
      } else {
        target = liberals.length > 0
          ? liberals[Math.floor(Math.random() * liberals.length)]
          : eligible[Math.floor(Math.random() * eligible.length)];
      }
    }

    await this.handleExecutiveAction(s, roomId, target.id);
  }

  // ─── AI: Veto response ─────────────────────────────────────────────────────

  private async aiVetoResponse(s: GameState, roomId: string): Promise<void> {
    const president = s.players.find(p => p.isPresident);
    if (!president?.isAI) return;

    const fascistInHand = s.chancellorPolicies.filter(p => p === "Fascist").length;
    const liberalInHand = s.chancellorPolicies.filter(p => p === "Liberal").length;
    let agree: boolean;

    if (president.role === "Liberal") {
      if (s.electionTracker >= 2) {
        agree = false;
      } else if (fascistInHand === 2) {
        agree = true;
      } else {
        agree = Math.random() > 0.75;
      }
    } else {
      if (liberalInHand >= 1 && s.fascistPolicies < 4) {
        agree = false;
      } else if (s.electionTracker === 0 && Math.random() > 0.6) {
        agree = true;
      } else {
        agree = Math.random() > 0.7;
      }
    }

    this.handleVetoResponse(s, roomId, president, agree);
  }

  // ─── AI: Chat helpers ──────────────────────────────────────────────────────

  private postAIChat(state: GameState, ai: Player, lines: readonly string[]): void {
    const text = lines[Math.floor(Math.random() * lines.length)];
    state.messages.push({ sender: ai.name, text, timestamp: Date.now(), type: "text" });
    if (state.messages.length > 50) state.messages.shift();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AI Declarations
  // ═══════════════════════════════════════════════════════════════════════════

  triggerAIDeclarations(state: GameState, roomId: string): void {
    if (state.isPaused) return;
    const president  = state.players.find(p => p.isPresident);
    const chancellor = state.players.find(p => p.isChancellor);
    if (!president || !chancellor) return;

    const presIsFascist = president.role === "Fascist" || president.role === "Hitler";
    const chanIsFascist = chancellor.role === "Fascist" || chancellor.role === "Hitler";
    const bothFascist   = presIsFascist && chanIsFascist;
    const enacted       = state.lastEnactedPolicy?.type;

    const declareForAI = (player: Player, type: "President" | "Chancellor") => {
      const alreadyDeclared = state.declarations.some(
        d => d.playerId === player.id && d.type === type
      );
      if (alreadyDeclared) return;

      const saw  = type === "President" ? (state.presidentSaw ?? []) : (state.chancellorSaw ?? []);
      let libs   = saw.filter(p => p === "Liberal").length;
      let fas    = saw.filter(p => p === "Fascist").length;

      if (bothFascist && enacted === "Fascist") {
        // ── Coordinated fascist lying ─────────────────────────────────────
        if (type === "President") {
          const actualFas = fas;
          if (actualFas === 3) {
            if (Math.random() > 0.45) { libs = 1; fas = 2; }
          } else if (actualFas === 2) {
            libs = 2; fas = 1;
          }
          const chanFas = Math.max(1, fas - 1);
          state.pendingChancellorClaim = { libs: 2 - chanFas, fas: chanFas };
        } else {
          if (state.pendingChancellorClaim) {
            libs = state.pendingChancellorClaim.libs;
            fas  = state.pendingChancellorClaim.fas;
            state.pendingChancellorClaim = undefined;
          }
        }
      } else {
        // ── Independent lying (non-coordinated) ──────────────────────────
        let shouldLie = false;
        if (player.role !== "Liberal") {
          if      (player.personality === "Deceptive")  shouldLie = true;
          else if (player.personality === "Aggressive")  shouldLie = Math.random() > 0.2;
          else if (player.personality === "Strategic")   shouldLie = state.fascistPolicies >= 2;
          else if (player.personality === "Chaotic")     shouldLie = Math.random() > 0.5;
        }
        if (shouldLie && libs > 0) { libs--; fas++; }
      }

      state.declarations.push({
        playerId: player.id,
        playerName: player.name,
        libs, fas, type,
        timestamp: Date.now(),
      });
      state.log.push(
        `${player.name} (${type}) declared seeing ${libs} Liberal and ${fas} Fascist policies.`
      );
      if (state.messages.length > 50) state.messages.shift();

      // AI chat reactions after declaration
      if (player.isAI && enacted === "Fascist" && Math.random() > 0.4) {
        setTimeout(() => {
          if (state.isPaused) return;
          const lines = type === "Chancellor"
            ? (player.role === "Liberal" ? CHAT.chanLibFascistEnacted : CHAT.chanFasFascistEnacted)
            : (player.role === "Liberal" ? CHAT.presLibFascistEnacted : CHAT.presFasFascistEnacted);
          this.postAIChat(state, player, lines);
          this.broadcastState(roomId);
        }, 1200);
      }

      this.broadcastState(roomId);
      this.checkRoundEnd(state, roomId);
    };

    // President declares first, then chancellor waits for president
    setTimeout(() => {
      if (state.isPaused) return;
      const presidentDeclared = state.declarations.some(d => d.type === "President");
      if (!presidentDeclared && (president.isAI || state.presidentTimedOut)) {
        declareForAI(president, "President");
      }

      const checkAndDeclareChancellor = () => {
        if (state.isPaused) return;
        const chancellorDeclared = state.declarations.some(d => d.type === "Chancellor");
        if (chancellorDeclared) return;
        if (chancellor.isAI || state.chancellorTimedOut) {
          const presidentDeclared = state.declarations.some(d => d.type === "President");
          if (!presidentDeclared) { setTimeout(checkAndDeclareChancellor, 2000); return; }
          declareForAI(chancellor, "Chancellor");
        }
      };
      setTimeout(checkAndDeclareChancellor, 2000);
    }, 1500);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Policy Enactment
  // ═══════════════════════════════════════════════════════════════════════════

  triggerPolicyEnactment(
    state: GameState,
    roomId: string,
    played: Policy,
    isChaos: boolean = false,
    playerId?: string
  ): void {
    state.lastEnactedPolicy = { type: played, timestamp: Date.now(), playerId };

    setTimeout(async () => {
      if (state.isPaused) return;

      if (played === "Liberal") {
        state.liberalPolicies++;
        state.log.push("A Liberal policy was enacted.");
      } else {
        state.fascistPolicies++;
        state.log.push("A Fascist policy was enacted.");
        if (state.fascistPolicies >= 5) state.vetoUnlocked = true;
      }

      updateSuspicionFromPolicy(state, played);

      await this.checkVictory(state, roomId);
      if (state.phase !== "GameOver") {
        if (isChaos) {
          this.nextPresident(state, roomId);
        } else {
          this.triggerAIDeclarations(state, roomId);
        }
      }
      this.broadcastState(roomId);
    }, 6000); // Wait for animation
  }

  private captureRoundHistory(state: GameState, played: Policy, isChaos: boolean): void {
    if (isChaos || !state.lastGovernmentPresidentId || !state.lastGovernmentChancellorId) return;
    const presPlayer = state.players.find(p => p.id === state.lastGovernmentPresidentId);
    const chanPlayer = state.players.find(p => p.id === state.lastGovernmentChancellorId);
    if (!presPlayer || !chanPlayer) return;

    const presDecl = state.declarations.find(d => d.type === "President");
    const chanDecl = state.declarations.find(d => d.type === "Chancellor");
    const action   = getExecutiveAction(state);

    if (!state.roundHistory) state.roundHistory = [];
    state.roundHistory.push({
      round:          state.round,
      presidentName:  presPlayer.name,
      chancellorName: chanPlayer.name,
      policy:         played,
      votes: Object.entries(state.lastGovernmentVotes ?? {}).map(([pid, v]) => {
        const pl = state.players.find(p => p.id === pid);
        return { playerId: pid, playerName: pl?.name ?? pid, vote: v };
      }),
      presDeclaration: presDecl ? { libs: presDecl.libs, fas: presDecl.fas } : undefined,
      chanDeclaration: chanDecl ? { libs: chanDecl.libs, fas: chanDecl.fas } : undefined,
      executiveAction: action !== "None" ? action : undefined,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Voting
  // ═══════════════════════════════════════════════════════════════════════════

  handleVoteResult(state: GameState, roomId: string, jaVotes: number, neinVotes: number): void {
    state.phase = "Voting_Reveal" as any;

    if (!state.previousVotes) state.previousVotes = {};
    state.players.forEach(p => {
      if (p.vote) state.previousVotes![p.id] = p.vote;
      p.vote = undefined;
    });

    const voteInfo = `(${jaVotes} Ja, ${neinVotes} Nein)`;
    state.actionTimerEnd = Date.now() + 4000;
    this.broadcastState(roomId);

    setTimeout(async () => {
      const s = this.rooms.get(roomId);
      if (!s || s.phase !== "Voting_Reveal") return;
      s.actionTimerEnd = undefined;

      if (jaVotes > neinVotes) {
        this.handleElectionPassed(s, roomId, voteInfo);
      } else {
        await this.handleElectionFailed(s, roomId, voteInfo);
      }

      s.previousVotes = undefined;
      this.broadcastState(roomId);
      this.processAITurns(roomId);
    }, 6000);
  }

  private handleElectionPassed(s: GameState, roomId: string, voteInfo: string): void {
    s.log.push(`The election passed! ${voteInfo}`);
    const chancellor = s.players.find(p => p.isChancellorCandidate)!;
    const president  = s.players.find(p => p.isPresidentialCandidate)!;

    if (s.fascistPolicies >= 3 && chancellor.role === "Hitler") {
      s.phase = "GameOver";
      startActionTimerRef(this, roomId);
      s.winner    = "Fascists";
      s.winReason = "Hitler was elected Chancellor!";
      s.log.push("Hitler was elected Chancellor! Fascists win!");
      this.updateUserStats(s, "Fascists");
      return;
    }

    s.phase = "Legislative_President";
    startActionTimerRef(this, roomId);
    s.electionTracker = 0;
    s.players.forEach(p => { p.isPresident = false; p.isChancellor = false; });
    president.isPresident   = true;
    chancellor.isChancellor = true;
    s.presidentId  = president.id;
    s.chancellorId = chancellor.id;

    s.lastGovernmentVotes          = { ...s.previousVotes };
    s.lastGovernmentPresidentId    = president.id;
    s.lastGovernmentChancellorId   = chancellor.id;

    updateSuspicionFromNomination(s, president.id, chancellor.id);

    // Ensure we have 3 cards to draw (should already be true due to pre-round reshuffle)
    if (s.deck.length < 3) {
      s.deck = shuffle([...s.deck, ...s.discard]);
      s.discard = [];
    }
    s.drawnPolicies = s.deck.splice(0, 3);
  }

  private async handleElectionFailed(s: GameState, roomId: string, voteInfo: string): Promise<void> {
    s.log.push(`The election failed! ${voteInfo}`);

    const presPlayer = s.players[s.presidentIdx];
    const chanPlayer = s.players.find(p => p.isChancellorCandidate);
    if (!s.roundHistory) s.roundHistory = [];
    s.roundHistory.push({
      round:          s.round,
      presidentName:  presPlayer?.name ?? "?",
      chancellorName: chanPlayer?.name ?? "?",
      failed:         true,
      failReason:     "vote",
      votes: Object.entries(s.previousVotes ?? {}).map(([pid, v]) => {
        const pl = s.players.find(p => p.id === pid);
        return { playerId: pid, playerName: pl?.name ?? pid, vote: v };
      }),
    });

    s.electionTracker++;
    if (s.electionTracker === 3) {
      s.log.push("Election tracker reached 3! Chaos policy enacted.");
      if (s.deck.length < 1) {
        s.deck = shuffle([...s.deck, ...s.discard]);
        s.discard = [];
      }
      const chaosPolicy = s.deck.shift()!;
      s.electionTracker = 0;
      s.players.forEach(p => { p.wasPresident = false; p.wasChancellor = false; });
      this.triggerPolicyEnactment(s, roomId, chaosPolicy, true);
    } else {
      if ((s.phase as string) !== "GameOver") this.nextPresident(s, roomId);
    }

    // Random AI comments on the failure
    const aiAlive = s.players.filter(p => p.isAI && p.isAlive);
    if (aiAlive.length > 0 && Math.random() > 0.5) {
      const commentator = aiAlive[Math.floor(Math.random() * aiAlive.length)];
      setTimeout(() => {
        if (!s.isPaused) {
          this.postAIChat(s, commentator, CHAT.governmentFailed);
          this.broadcastState(roomId);
        }
      }, 900);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Round End / Executive Actions
  // ═══════════════════════════════════════════════════════════════════════════

  checkRoundEnd(state: GameState, roomId: string): void {
    if (state.phase === "GameOver") return;

    const presidentDeclared  = state.declarations.some(d => d.type === "President");
    const chancellorDeclared = state.declarations.some(d => d.type === "Chancellor");
    if (!presidentDeclared || !chancellorDeclared) return;

    // Both have declared — capture round history now that we have all the data
    if (state.lastEnactedPolicy && !state.lastEnactedPolicy.historyCaptured) {
      this.captureRoundHistory(state, state.lastEnactedPolicy.type, false);
      state.lastEnactedPolicy.historyCaptured = true;
      state.lastGovernmentVotes = undefined; // safe to clear now
    }

    updateSuspicionFromDeclarations(state);
    const action = getExecutiveAction(state);

    if (action !== "None") {
      state.phase = "Executive_Action";
      this.startActionTimer(roomId);
      state.currentExecutiveAction = action;
      state.log.push(`Executive Action: ${action}`);

      if (action === "PolicyPeek") {
        const top3 = state.deck.slice(0, 3);
        this.io.to(state.presidentId!).emit("policyPeekResult", top3);
        state.log.push(
          `${state.players.find(p => p.id === state.presidentId)?.name} peeked at the top 3 policies.`
        );
      }

      this.processAITurns(roomId);
    } else {
      this.nextPresident(state, roomId, true);
    }

    this.broadcastState(roomId);
  }

  async handleExecutiveAction(state: GameState, roomId: string, targetId: string): Promise<void> {
    const target = state.players.find(p => p.id === targetId);
    if (!target || !target.isAlive) return;

    if (state.currentExecutiveAction === "Execution") {
      await this.executePlayer(state, roomId, target);
    } else if (state.currentExecutiveAction === "Investigate") {
      await this.investigatePlayer(state, roomId, target);
    } else if (state.currentExecutiveAction === "SpecialElection") {
      state.log.push(`Special Election! ${target.name} is the next candidate.`);
      state.lastPresidentIdx = state.presidentIdx;
      state.presidentIdx = state.players.indexOf(target);
      this.startElection(state, roomId);
    } else if (state.currentExecutiveAction === "PolicyPeek") {
      state.log.push("President peeked at the top 3 policies.");
      if (state.presidentId) {
        this.io.to(state.presidentId).emit("policyPeekResult", state.deck.slice(0, 3));
      }
      this.nextPresident(state, roomId, true);
    }

    this.broadcastState(roomId);
    this.processAITurns(roomId);
  }

  private async executePlayer(state: GameState, roomId: string, target: Player): Promise<void> {
    target.isAlive = false;
    state.log.push(`${target.name} was executed!`);

    // Update kill/death stats
    const president = state.players.find(p => p.id === state.presidentId);
    if (president?.userId) {
      const u = await getUserById(president.userId);
      if (u) { u.stats.kills++; await saveUser(u); }
    }
    if (target.userId) {
      const u = await getUserById(target.userId);
      if (u) { u.stats.deaths++; await saveUser(u); }
    }

    if (target.role === "Hitler") {
      state.phase    = "GameOver";
      state.winner   = "Liberals";
      state.winReason = "Hitler was executed!";
      state.log.push("Hitler was executed! Liberals win!");
      await this.updateUserStats(state, "Liberals");
    } else {
      this.nextPresident(state, roomId, true);
    }
  }

  private async investigatePlayer(state: GameState, roomId: string, target: Player): Promise<void> {
    state.log.push(`President investigated ${target.name}.`);
    if (!state.presidentId) return;

    const investigationRole = target.role === "Liberal" ? "Liberal" : "Fascist";
    this.io.to(state.presidentId).emit("investigationResult", {
      targetName: target.name,
      role: investigationRole,
    });
    updateSuspicionFromInvestigation(state, state.presidentId, target.id, investigationRole);

    // AI president hints at the result in chat
    const presPlayer = state.players.find(p => p.id === state.presidentId);
    if (presPlayer?.isAI && Math.random() > 0.3) {
      setTimeout(() => {
        if (!state.isPaused) {
          this.postAIChat(
            state, presPlayer,
            investigationRole === "Fascist" ? CHAT.investigateFascist : CHAT.investigateLiberal
          );
          this.broadcastState(roomId);
        }
      }, 1000);
    }

    this.nextPresident(state, roomId, true);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Veto
  // ═══════════════════════════════════════════════════════════════════════════

  handleVetoResponse(state: GameState, roomId: string, player: Player, agree: boolean): void {
    if (agree) {
      state.log.push(`${player.name} (President) agreed to the Veto. Both policies discarded.`);
      state.discard.push(...state.chancellorPolicies);
      state.chancellorPolicies = [];
      state.vetoRequested = false;

      // Record vetoed government in round history
      const presPlayer = state.players.find(p => p.isPresident);
      const chanPlayer = state.players.find(p => p.isChancellor);
      if (!state.roundHistory) state.roundHistory = [];
      state.roundHistory.push({
        round:          state.round,
        presidentName:  presPlayer?.name ?? "?",
        chancellorName: chanPlayer?.name ?? "?",
        failed:         true,
        failReason:     "veto",
        votes:          [],
      });

      state.electionTracker++;
      if (state.electionTracker === 3) {
        state.log.push("Election tracker reached 3! Chaos policy enacted.");
        if (state.deck.length < 1) {
          state.deck = shuffle([...state.deck, ...state.discard]);
          state.discard = [];
        }
        const chaosPolicy = state.deck.shift()!;
        state.electionTracker = 0;
        state.players.forEach(p => { p.wasPresident = false; p.wasChancellor = false; });
        this.triggerPolicyEnactment(state, roomId, chaosPolicy, true);
      } else {
        if ((state.phase as string) !== "GameOver") {
          this.nextPresident(state, roomId, false);
        }
      }

      this.triggerAIDeclarations(state, roomId);
    } else {
      state.log.push(`${player.name} (President) denied the Veto. Chancellor must play a policy.`);
      state.vetoRequested = false;
    }

    this.broadcastState(roomId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Election flow
  // ═══════════════════════════════════════════════════════════════════════════

  nextPresident(state: GameState, roomId: string, isSuccessfulGovernment: boolean = false): void {
    state.vetoRequested = false;

    if (isSuccessfulGovernment) {
      const prevPres = state.players.find(p => p.isPresident);
      const prevChan = state.players.find(p => p.isChancellor);
      state.players.forEach(p => { p.wasPresident = false; p.wasChancellor = false; });
      if (prevPres) prevPres.wasPresident = true;
      if (prevChan) prevChan.wasChancellor = true;
    }

    state.players.forEach(p => {
      p.isPresident = false;
      p.isChancellor = false;
      p.isPresidentialCandidate = false;
      p.isChancellorCandidate = false;
    });

    if (state.lastPresidentIdx !== -1) {
      state.presidentIdx = state.lastPresidentIdx;
      state.lastPresidentIdx = -1;
    }

    state.round++;
    state.log.push(`--- Round ${state.round} Started ---`);

    // Reshuffle if fewer than 3 cards remain before the round starts
    if (state.deck.length < 3) {
      state.log.push("Fewer than 3 cards in deck. Reshuffling discard pile...");
      state.deck = shuffle([...state.deck, ...state.discard]);
      state.discard = [];
    }

    state.messages.push({
      sender: "System",
      text: `Round ${state.round} Started`,
      timestamp: Date.now(),
      type: "round_separator",
      round: state.round,
    });

    do {
      state.presidentIdx = (state.presidentIdx + 1) % state.players.length;
    } while (!state.players[state.presidentIdx].isAlive);

    this.startElection(state, roomId);
  }

  startElection(state: GameState, roomId: string): void {
    state.phase = "Election";
    this.startActionTimer(roomId);
    state.previousVotes        = undefined;
    state.declarations         = [];
    state.presidentTimedOut    = false;
    state.chancellorTimedOut   = false;
    state.players.forEach(p => {
      p.isPresidentialCandidate = false;
      p.isChancellorCandidate   = false;
    });
    state.players[state.presidentIdx].isPresidentialCandidate = true;
    state.log.push(`${state.players[state.presidentIdx].name} is the Presidential Candidate.`);
    this.broadcastState(roomId);
    this.processAITurns(roomId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Lobby / Room management
  // ═══════════════════════════════════════════════════════════════════════════

  fillWithAI(roomId: string): void {
    const state = this.rooms.get(roomId);
    if (!state) return;

    const currentNames = state.players.map(p => p.name);
    const availableBots = AI_BOTS.filter(bot => !currentNames.includes(`${bot.name} (AI)`));

    while (state.players.length < state.maxPlayers && availableBots.length > 0) {
      const botIdx = Math.floor(Math.random() * availableBots.length);
      const bot    = availableBots.splice(botIdx, 1)[0];
      state.players.push({
        id:                    `ai-${randomUUID()}`,
        name:                  `${bot.name} (AI)`,
        avatarUrl:             bot.avatarUrl,
        personality:           bot.personality,
        isAlive:               true,
        isPresidentialCandidate: false,
        isChancellorCandidate:   false,
        isPresident:           false,
        isChancellor:          false,
        wasPresident:          false,
        wasChancellor:         false,
        isAI:                  true,
      });
    }

    this.startGame(roomId);
  }

  startGame(roomId: string): void {
    const state = this.rooms.get(roomId);
    if (!state || state.phase !== "Lobby") return;

    if (state.players.length < state.maxPlayers) {
      this.fillWithAI(roomId);
      return;
    }

    const numPlayers = state.players.length;
    const roles = assignRoles(numPlayers);
    state.players.forEach((p, i) => (p.role = roles[i]));

    state.phase = "Election";
    state.declarations = [];
    state.log.push(`--- Round ${state.round} Started ---`);

    // Reshuffle if fewer than 3 cards remain (though deck is full at start)
    if (state.deck.length < 3) {
      state.deck = shuffle([...state.deck, ...state.discard]);
      state.discard = [];
    }

    state.messages.push({
      sender: "System",
      text: `Round ${state.round} Started`,
      timestamp: Date.now(),
      type: "round_separator",
      round: state.round,
    });

    state.presidentIdx = Math.floor(Math.random() * numPlayers);
    state.players[state.presidentIdx].isPresidentialCandidate = true;
    state.log.push("Game started! Roles assigned.");
    state.log.push(`${state.players[state.presidentIdx].name} is the Presidential Candidate.`);
    initializeSuspicion(state);
    this.broadcastState(roomId);
    this.processAITurns(roomId);
  }

  handleLeave(socket: Socket, roomId: string): void {
    const state = this.rooms.get(roomId);
    if (!state) return;

    const player = state.players.find(p => p.id === socket.id);
    if (player) {
      if (state.phase === "Lobby") {
        state.players = state.players.filter(p => p.id !== socket.id);
        state.log.push(`${player.name} left the room.`);
      } else if (!player.isAI && !player.isDisconnected) {
        player.isDisconnected = true;
        state.isPaused        = true;
        state.pauseReason     = `${player.name} disconnected. Waiting 60s for reconnection...`;
        state.pauseTimer      = 60;
        state.disconnectedPlayerId = player.id;
        state.log.push(`${player.name} disconnected. Game paused.`);

        if (this.actionTimers.has(roomId)) {
          clearTimeout(this.actionTimers.get(roomId));
          this.actionTimers.delete(roomId);
        }
        state.actionTimerEnd = undefined;

        if (this.pauseTimers.has(roomId)) clearInterval(this.pauseTimers.get(roomId));

        const pauseInterval = setInterval(() => {
          const s = this.rooms.get(roomId);
          if (!s || !s.isPaused) {
            clearInterval(pauseInterval);
            this.pauseTimers.delete(roomId);
            return;
          }
          s.pauseTimer!--;
          if (s.pauseTimer! <= 0) {
            clearInterval(pauseInterval);
            this.pauseTimers.delete(roomId);
            this.handlePauseTimeout(roomId);
          }
          this.broadcastState(roomId);
        }, 1000);

        this.pauseTimers.set(roomId, pauseInterval);
      }
    }

    const spectator = state.spectators.find(s => s.id === socket.id);
    if (spectator) {
      state.spectators = state.spectators.filter(s => s.id !== socket.id);
      state.log.push(`${spectator.name} (Spectator) left the room.`);
    }

    socket.leave(roomId);

    const humanPlayers = state.players.filter(p => !p.isAI);
    if (humanPlayers.length === 0 && state.spectators.length === 0) {
      this.rooms.delete(roomId);
      if (this.lobbyTimers.has(roomId)) {
        clearInterval(this.lobbyTimers.get(roomId)!);
        this.lobbyTimers.delete(roomId);
      }
    } else {
      this.broadcastState(roomId);
    }
  }

  handlePauseTimeout(roomId: string): void {
    const state = this.rooms.get(roomId);
    if (!state || !state.isPaused) return;

    const player = state.players.find(p => p.id === state.disconnectedPlayerId);
    if (!player) {
      state.isPaused = false;
      this.broadcastState(roomId);
      return;
    }

    if (state.mode === "Ranked") {
      state.phase = "GameOver";
      state.winner = undefined;
      state.log.push(`Game ended as inconclusive because ${player.name} failed to reconnect.`);
      state.messages.push({
        sender: "System",
        text: `Game ended as inconclusive because ${player.name} failed to reconnect.`,
        timestamp: Date.now(),
        type: "text",
      });
    } else {
      const availableBots = AI_BOTS.filter(bot => !state.players.some(p => p.name === bot.name));
      const bot = availableBots.length > 0
        ? availableBots[Math.floor(Math.random() * availableBots.length)]
        : AI_BOTS[Math.floor(Math.random() * AI_BOTS.length)];

      player.isAI          = true;
      player.isDisconnected = false;
      player.id            = `ai-${randomUUID()}`;
      player.userId        = undefined;
      player.name          = bot.name;
      player.avatarUrl     = bot.avatarUrl;
      player.personality   = bot.personality;
      state.log.push(`${player.name} (AI) has taken over the seat.`);
      state.isPaused = false;
      this.processAITurns(roomId);
    }

    state.disconnectedPlayerId = undefined;
    state.pauseReason          = undefined;
    state.pauseTimer           = undefined;
    this.broadcastState(roomId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Victory and stats
  // ═══════════════════════════════════════════════════════════════════════════

  async checkVictory(state: GameState, roomId: string): Promise<void> {
    if (state.phase === "GameOver") return;
    if (state.liberalPolicies >= 5) {
      state.phase    = "GameOver";
      state.winner   = "Liberals";
      state.winReason = "5 Liberal policies enacted!";
      state.log.push("5 Liberal policies enacted! Liberals win!");
      await this.updateUserStats(state, "Liberals");
    } else if (state.fascistPolicies >= 6) {
      state.phase    = "GameOver";
      state.winner   = "Fascists";
      state.winReason = "6 Fascist policies enacted!";
      state.log.push("6 Fascist policies enacted! Fascists win!");
      await this.updateUserStats(state, "Fascists");
    }
  }

  async updateUserStats(state: GameState, winningSide: "Liberals" | "Fascists"): Promise<void> {
    for (const p of state.players) {
      if (p.isAI || !p.userId) continue;
      const user = await getUserById(p.userId);
      if (!user) continue;

      user.stats.gamesPlayed++;
      if      (p.role === "Liberal") user.stats.liberalGames++;
      else if (p.role === "Fascist") user.stats.fascistGames++;
      else if (p.role === "Hitler")  user.stats.hitlerGames++;

      const isWinner =
        (winningSide === "Liberals" && p.role === "Liberal") ||
        (winningSide === "Fascists" && (p.role === "Fascist" || p.role === "Hitler"));

      if (isWinner) {
        user.stats.wins++;
        user.stats.elo    += state.mode === "Ranked" ? 25 : 0;
        user.stats.points += state.mode === "Ranked" ? 100 : 40;
      } else {
        user.stats.losses++;
        user.stats.elo    = state.mode === "Ranked" ? Math.max(0, user.stats.elo - 15) : user.stats.elo;
        user.stats.points += state.mode === "Ranked" ? 25 : 10;
      }

      await saveUser(user);
      const { password: _, ...userWithoutPassword } = user;
      this.io.to(p.id).emit("userUpdate", userWithoutPassword);
    }
  }
}

// ---------------------------------------------------------------------------
// Small helper to call startActionTimer from handleElectionPassed without
// breaking the "this" context inside an arrow-function callback.
// ---------------------------------------------------------------------------
function startActionTimerRef(engine: GameEngine, roomId: string): void {
  engine.startActionTimer(roomId);
}
