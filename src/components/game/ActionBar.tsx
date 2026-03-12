import React from 'react';
import { Scroll, Scale, Eye, Mic, Video, VideoOff, MicOff } from 'lucide-react';
import { socket } from '../../socket';
import { GameState, Player, User } from '../../types';
import { getPolicyStyles, getVoteStyles } from '../../lib/cosmetics';
import { cn } from '../../lib/utils';

interface ActionBarProps {
  gameState: GameState;
  me: Player | undefined;
  user: User | null;
  showDebug: boolean;
  onOpenLog: () => void;
  onPlayAgain: () => void;
  onLeaveRoom: () => void;
  playSound: (key: string) => void;
  isVoiceActive: boolean;
  setIsVoiceActive: (active: boolean) => void;
  isVideoActive: boolean;
  setIsVideoActive: (active: boolean) => void;
}

export const ActionBar = ({ gameState, me, user, showDebug, onOpenLog, onPlayAgain, onLeaveRoom, playSound, isVoiceActive, setIsVoiceActive, isVideoActive, setIsVideoActive }: ActionBarProps) => {
  const isPresident = me?.isPresident;
  const isChancellor = me?.isChancellor;

  const filteredLog = showDebug ? gameState.log : gameState.log.filter(entry => !entry.includes('DEBUG:'));
  const lastEntry = filteredLog[filteredLog.length - 1];

  const phaseLabel = () => {
    switch (gameState.phase) {
      case 'Lobby': return `Waiting for players (${gameState.players.length}/${gameState.maxPlayers})...`;
      case 'Election': return `${gameState.players[gameState.presidentIdx]?.name} is nominating a Chancellor.`;
      case 'Voting':
      case 'Voting_Reveal': return 'The Assembly is voting.';
      case 'Legislative_President': return 'President is reviewing directives.';
      case 'Legislative_Chancellor': return 'Chancellor is enacting a directive.';
      case 'Executive_Action': return `Executive Action: ${gameState.currentExecutiveAction}`;
      case 'Assassin_Action': return 'Assassin is choosing a target.';
      case 'GameOver': return `${gameState.winner === 'Civil' ? 'Civil' : 'State'} faction victorious!`;
      case 'Nomination_Review': return 'A Broker is reviewing the nomination.';
      default: return '';
    }
  };

  return (
    <div className="shrink-0 bg-[#1a1a1a] border-t border-[#222] flex flex-col">
      {/* Phase status */}
      <div className="px-4 py-3 bg-white/5 border-b border-[#222] flex justify-between items-center">
        <div>
          <div className="text-[9px] uppercase tracking-[0.2em] text-[#666] font-mono mb-1">Current Phase</div>
          <div className="text-xs font-serif italic text-white">{phaseLabel()}</div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { playSound('click'); setIsVoiceActive(!isVoiceActive); }}
            className={cn("p-2 rounded-full transition-colors", isVoiceActive ? "bg-red-900/40 text-red-500" : "bg-[#222] text-[#666]")}
          >
            {isVoiceActive ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
          </button>
          <button
            onClick={() => { playSound('click'); setIsVideoActive(!isVideoActive); }}
            className={cn("p-2 rounded-full transition-colors", isVideoActive ? "bg-red-900/40 text-red-500" : "bg-[#222] text-[#666]")}
          >
            {isVideoActive ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Action area - fixed height to prevent layout shift */}
      <div className="px-4 py-2 sm:py-3 h-24 sm:h-32 flex items-center justify-center">
        {/* Voting */}
        {gameState.phase === 'Voting' && me?.isAlive && !me.vote && (
          <div className="flex gap-3 sm:gap-4 w-full justify-center h-full items-center">
            {gameState.detainedPlayerId === me.id ? (
              <div className="text-purple-400 font-mono text-[10px] uppercase tracking-widest text-center animate-pulse">
                You are detained and cannot vote this round
              </div>
            ) : (
              <>
                <button
                  onClick={() => { socket.emit('vote', 'Aye'); playSound('click'); }}
                  className={cn('flex-1 h-20 sm:h-24 rounded-xl border-2 sm:border-4 flex flex-col items-center justify-center transition-all hover:scale-[1.02] active:scale-95 shadow-lg', getVoteStyles(user?.activeVotingStyle, 'Aye'))}
                >
                  <span className="text-2xl sm:text-3xl font-thematic uppercase leading-none">AYE!</span>
                  <span className="text-[8px] sm:text-[10px] font-mono uppercase tracking-widest opacity-60">(YES)</span>
                </button>
                <button
                  onClick={() => { socket.emit('vote', 'Nay'); playSound('defeat'); }}
                  className={cn('flex-1 h-20 sm:h-24 rounded-xl border-2 sm:border-4 flex flex-col items-center justify-center transition-all hover:scale-[1.02] active:scale-95 shadow-lg', getVoteStyles(user?.activeVotingStyle, 'Nay'))}
                >
                  <span className="text-2xl sm:text-3xl font-thematic uppercase leading-none">NAY!</span>
                  <span className="text-[8px] sm:text-[10px] font-mono uppercase tracking-widest opacity-60">(NO)</span>
                </button>
              </>
            )}
          </div>
        )}

        {/* President discard */}
        {gameState.phase === 'Legislative_President' && isPresident && (
          <div className="flex gap-2 sm:gap-3 w-full justify-center h-full items-center">
            {gameState.drawnPolicies.map((p, i) => (
              <button
                key={i}
                onClick={() => { playSound('click'); socket.emit('presidentDiscard', i); }}
                className={cn('flex-1 h-20 sm:h-28 rounded-lg border-2 flex flex-col items-center justify-center gap-1 transition-all', getPolicyStyles(user?.activePolicyStyle, p))}
              >
                {p === 'Civil' ? <Scale className="w-5 h-5 sm:w-6 sm:h-6" /> : <Eye className="w-5 h-5 sm:w-6 sm:h-6" />}
                <span className="text-[7px] sm:text-[8px] font-mono uppercase tracking-widest">Discard</span>
              </button>
            ))}
          </div>
        )}

        {/* Chancellor enact */}
        {gameState.phase === 'Legislative_Chancellor' && isChancellor && (
          <div className="flex gap-2 sm:gap-4 w-full justify-center h-full items-center">
            {gameState.chancellorPolicies.map((p, i) => (
              <button
                key={i}
                onClick={() => { playSound('click'); socket.emit('chancellorPlay', i); }}
                className={cn('flex-1 h-20 sm:h-28 rounded-lg border-2 flex flex-col items-center justify-center gap-2 transition-all', getPolicyStyles(user?.activePolicyStyle, p))}
              >
                {p === 'Civil' ? <Scale className="w-5 h-5 sm:w-6 sm:h-6" /> : <Eye className="w-5 h-5 sm:w-6 sm:h-6" />}
                <span className="text-[7px] sm:text-[8px] font-mono uppercase tracking-widest">Enact</span>
              </button>
            ))}
          </div>
        )}

        {/* Veto (chancellor can propose during Legislative_Chancellor) */}
        {gameState.phase === 'Legislative_Chancellor' && isChancellor && gameState.stateDirectives >= 5 && (
          <button
            onClick={() => { playSound('click'); socket.emit('vetoRequest'); }}
            className="absolute bottom-2 right-4 text-[9px] text-purple-400 font-mono uppercase tracking-widest hover:text-purple-300"
          >
            Propose Veto
          </button>
        )}

        {/* GameOver summary */}
        {gameState.phase === 'GameOver' && (
          <div className="flex flex-col gap-3 w-full max-w-xs h-full justify-center">
            <div className="text-center p-4 rounded-2xl border-2 mb-2 bg-[#222] border-[#333] text-[#666]">
              <div className="text-xl font-thematic tracking-wide uppercase">Game Over</div>
              <div className="text-[10px] font-mono uppercase tracking-widest">See Assembly Results</div>
            </div>
            <button onClick={onPlayAgain} className="py-3 bg-white text-black font-thematic text-xl rounded-xl hover:bg-gray-200 transition-all shadow-xl shadow-white/5">
              Play Again
            </button>
          </div>
        )}

        {/* Lobby ready */}
        {gameState.phase === 'Lobby' && (
          <div className="flex flex-col gap-2 w-full max-w-xs h-full justify-center">
            <button
              onClick={() => { playSound('click'); socket.emit('toggleReady'); }}
              className={cn('py-3 font-thematic text-xl rounded-lg shadow-xl transition-all active:scale-95', me?.isReady ? 'bg-emerald-500 text-white shadow-emerald-500/10' : 'bg-white text-black shadow-white/5')}
            >
              {me?.isReady ? 'Ready!' : 'Ready Up'}
            </button>
            <div className="text-center">
              <span className="text-[9px] uppercase tracking-widest text-[#666]">
                {gameState.players.filter(p => !p.isAI && p.isReady).length} / {gameState.players.filter(p => !p.isAI).length} Players Ready
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Log bar */}
      <button
        onClick={() => { playSound('click'); onOpenLog(); }}
        className="h-12 px-4 flex items-center gap-3 bg-[#141414] hover:bg-[#1a1a1a] transition-colors border-t border-[#222] group"
      >
        <Scroll className="w-4 h-4 text-white group-hover:text-red-500 transition-colors" />
        <div className="flex-1 text-[11px] text-[#666] truncate text-left italic">
          {lastEntry}
        </div>
        <div className="text-[9px] uppercase tracking-widest text-[#444] font-mono">Log</div>
      </button>
    </div>
  );
};
