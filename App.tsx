
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GamePhase, PlayerRole, GameState, RoundResult, GameMode, SpectrumCard } from './types';
import { SCORING_ZONES } from './constants';
import { generateCard } from './services/geminiService';
import { peerService, generateShortId } from './services/peerService';
import Dial from './components/Dial';

const App: React.FC = () => {
  // --- Local UI State ---
  const [roomId, setRoomId] = useState('');
  const [joinId, setJoinId] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [inputClue, setInputClue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [hasSetName, setHasSetName] = useState(false);

  // Custom Card Builder State
  const [newCardLeft, setNewCardLeft] = useState('');
  const [newCardRight, setNewCardRight] = useState('');

  // --- Game State ---
  const [state, setState] = useState<GameState>({
    phase: GamePhase.LOBBY,
    score: 0,
    currentRound: 0,
    playerName: '',
    opponentName: null,
    settings: {
      totalRounds: 5,
      gameMode: 'STANDARD',
      customCards: []
    },
    currentCard: null,
    targetPercent: 50,
    guessPercent: 50,
    currentClue: '',
    history: [],
    isHost: false,
    myRole: null,
  });

  // --- Networking Setup ---
  useEffect(() => {
    // Setup message listeners
    peerService.onMessage((msg) => {
      // console.log("Received:", msg);
      switch (msg.type) {
        case 'WELCOME':
          setIsConnected(true);
          setState(prev => ({ ...prev, opponentName: msg.username }));
          break;
        case 'SYNC_SETTINGS':
          setState(prev => ({ ...prev, settings: msg.settings }));
          break;
        case 'NEW_ROUND':
          setState(prev => ({
            ...prev,
            phase: GamePhase.PSYCHIC_VIEW,
            currentRound: prev.currentRound + 1,
            currentCard: msg.card,
            targetPercent: msg.target,
            myRole: msg.role === PlayerRole.PSYCHIC ? PlayerRole.GUESSER : PlayerRole.PSYCHIC,
            currentClue: '',
            guessPercent: 50,
          }));
          break;
        case 'CLUE_GIVEN':
          setState(prev => ({
            ...prev,
            currentClue: msg.clue,
            phase: GamePhase.GUESSING
          }));
          break;
        case 'DIAL_MOVE':
          setState(prev => ({ ...prev, guessPercent: msg.percent }));
          break;
        case 'LOCK_GUESS':
          setState(prev => ({ ...prev, guessPercent: msg.percent, phase: GamePhase.REVEAL }));
          break;
        case 'SYNC_STATE':
          setState(prev => ({ ...prev, ...msg.state }));
          break;
        case 'NEXT_PHASE':
          setState(prev => ({ ...prev, phase: msg.phase }));
          break;
        case 'RESTART':
          window.location.reload();
          break;
      }
    });

    peerService.onConnect(() => {
      setIsConnected(true);
    });

    return () => {
      peerService.destroy();
    };
  }, []);

  // Workaround to send name on connect inside the closure
  const sendWelcome = (name: string) => {
    peerService.send({ type: 'WELCOME', username: name });
  };

  // --- Host Logic ---
  const createGame = async () => {
    setIsLoading(true);
    const newId = generateShortId();
    setRoomId(newId);
    try {
      await peerService.init(newId);
      setState(prev => ({ ...prev, isHost: true }));
      setIsLoading(false);
    } catch (e) {
      console.error(e);
      alert("Failed to create room. Refresh and try again.");
      setIsLoading(false);
    }
  };

  const handleSettingsChange = (newSettings: Partial<typeof state.settings>) => {
    if (!state.isHost) return;

    const updated = { ...state.settings, ...newSettings };
    setState(prev => ({ ...prev, settings: updated }));

    // Sync to guest
    peerService.send({ type: 'SYNC_SETTINGS', settings: updated });
  };

  const addCustomCard = () => {
    if (!newCardLeft.trim() || !newCardRight.trim()) return;
    const newCard: SpectrumCard = { left: newCardLeft, right: newCardRight };
    const updatedCards = [...state.settings.customCards, newCard];

    handleSettingsChange({ customCards: updatedCards });
    setNewCardLeft('');
    setNewCardRight('');
  };

  const removeCustomCard = (index: number) => {
    const updatedCards = state.settings.customCards.filter((_, i) => i !== index);
    handleSettingsChange({ customCards: updatedCards });
  };

  const startFirstRound = async () => {
    if (!state.isHost) return;

    if (state.settings.gameMode === 'CUSTOM' && state.settings.customCards.length === 0) {
      alert("Please add at least one custom card before starting!");
      return;
    }

    // Trigger start
    await initRound(1);
  };

  const initRound = async (roundNum: number) => {
    setState(prev => ({ ...prev, phase: GamePhase.LOADING_CARD }));

    // 1. Generate Content (Host only)
    let card: SpectrumCard;

    if (state.settings.gameMode === 'CUSTOM') {
      // Cycle through custom cards
      const cardIndex = (roundNum - 1) % state.settings.customCards.length;
      card = state.settings.customCards[cardIndex];
      // Simulate slight delay for UX consistency
      await new Promise(r => setTimeout(r, 800));
    } else {
      // Standard AI Mode
      card = await generateCard();
    }

    const target = Math.floor(Math.random() * 100);

    // 2. Determine Roles (Swap every round)
    const hostRole = roundNum % 2 !== 0 ? PlayerRole.PSYCHIC : PlayerRole.GUESSER;

    // 3. Update Local State
    const newState = {
      currentRound: roundNum,
      currentCard: card,
      targetPercent: target,
      myRole: hostRole,
      currentClue: '',
      guessPercent: 50,
      phase: GamePhase.PSYCHIC_VIEW
    };

    setState(prev => ({ ...prev, ...newState }));

    // 4. Send to Guest
    peerService.send({
      type: 'NEW_ROUND',
      card,
      target,
      role: hostRole
    });
  };

  // --- Join Logic ---
  const joinGame = async () => {
    if (!joinId) return;
    setIsLoading(true);
    try {
      const myId = generateShortId();
      await peerService.init(myId);
      await peerService.connect(joinId.toUpperCase());

      // Connection event will fire, but let's assume we are good
      setState(prev => ({ ...prev, isHost: false }));
      sendWelcome(state.playerName);

      setIsLoading(false);
    } catch (e) {
      console.error(e);
      alert("Could not connect to room: " + joinId);
      setIsLoading(false);
    }
  };

  // When Host gets a connection, they need to send their name AND settings
  useEffect(() => {
    if (state.isHost && isConnected) {
      sendWelcome(state.playerName);
      peerService.send({ type: 'SYNC_SETTINGS', settings: state.settings });
    }
  }, [isConnected, state.isHost]); // eslint-disable-line react-hooks/exhaustive-deps


  // --- Gameplay Actions ---

  const handleDialChange = (p: number) => {
    if (state.myRole !== PlayerRole.GUESSER) return;
    setState(prev => ({ ...prev, guessPercent: p }));
    peerService.send({ type: 'DIAL_MOVE', percent: p });
  };

  const submitClue = () => {
    if (!inputClue.trim()) return;
    const newClue = inputClue;
    setState(prev => ({ ...prev, currentClue: newClue, phase: GamePhase.GUESSING }));
    peerService.send({ type: 'CLUE_GIVEN', clue: newClue });
    setInputClue('');
  };

  const lockGuess = () => {
    if (state.myRole !== PlayerRole.GUESSER) return;
    setState(prev => ({ ...prev, phase: GamePhase.REVEAL }));
    peerService.send({ type: 'LOCK_GUESS', percent: state.guessPercent });
  };

  const calculatePoints = (target: number, guess: number) => {
    const diff = Math.abs(target - guess);
    for (const zone of SCORING_ZONES) {
      if (diff <= zone.threshold) return zone.points;
    }
    return 0;
  };

  const getScoreColor = (points: number) => {
    if (points === 4) return 'text-rose-500';
    if (points === 3) return 'text-amber-400';
    if (points === 2) return 'text-emerald-500';
    return 'text-zinc-500';
  };

  const handleNextRound = () => {
    if (!state.isHost) return;

    const points = calculatePoints(state.targetPercent, state.guessPercent);
    const result: RoundResult = {
      card: state.currentCard!,
      target: state.targetPercent,
      guess: state.guessPercent,
      score: points,
      clue: state.currentClue
    };

    const newHistory = [...state.history, result];
    const newScore = state.score + points;

    if (state.currentRound >= state.settings.totalRounds) {
      const finalState = { score: newScore, history: newHistory, phase: GamePhase.GAME_OVER };
      setState(prev => ({ ...prev, ...finalState }));
      peerService.send({ type: 'SYNC_STATE', state: finalState });
    } else {
      setState(prev => ({ ...prev, score: newScore, history: newHistory }));
      peerService.send({ type: 'SYNC_STATE', state: { score: newScore, history: newHistory } });
      setTimeout(() => initRound(state.currentRound + 1), 1000);
    }
  };

  const restartGame = () => {
    peerService.send({ type: 'RESTART' });
    window.location.reload();
  };

  // --- UI Renderers ---

  // 0. NAME ENTRY
  if (!hasSetName) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-zinc-900/80 p-8 rounded-3xl border border-zinc-800 text-center shadow-2xl animate-fade-in">
          <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-indigo-500 mb-6">
            MindMatch
          </h1>
          <p className="text-zinc-400 mb-6">Enter your codename agent.</p>
          <input
            type="text"
            placeholder="Your Name"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            maxLength={12}
            className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-4 text-center text-xl text-white focus:border-teal-500 focus:outline-none mb-4"
            onKeyDown={(e) => e.key === 'Enter' && nameInput.trim() && (setHasSetName(true), setState(s => ({ ...s, playerName: nameInput })))}
            autoFocus
          />
          <button
            onClick={() => {
              if (nameInput.trim()) {
                setState(s => ({ ...s, playerName: nameInput }));
                setHasSetName(true);
              }
            }}
            disabled={!nameInput.trim()}
            className="w-full py-3 bg-white text-black font-bold rounded-xl hover:bg-zinc-200 transition-colors disabled:opacity-50"
          >
            CONTINUE
          </button>
        </div>
      </div>
    );
  }

  // 1. LOBBY
  if (state.phase === GamePhase.LOBBY) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 relative overflow-hidden">
        {/* Background decor */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden opacity-20 pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-teal-900 rounded-full blur-3xl"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-indigo-900 rounded-full blur-3xl"></div>
        </div>

        <div className="max-w-md w-full bg-zinc-900/95 backdrop-blur-xl p-8 rounded-3xl border border-zinc-800 shadow-2xl text-center z-10 max-h-[90vh] overflow-y-auto">
          <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-indigo-500 mb-2">
            MindMatch
          </h1>
          <div className="flex justify-center items-center gap-2 mb-6 text-sm text-zinc-500">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            Logged in as <span className="text-white font-bold">{state.playerName}</span>
          </div>

          {!roomId && !isConnected && (
            <div className="space-y-4 animate-fade-in">
              <button
                onClick={createGame}
                disabled={isLoading}
                className="w-full py-4 px-6 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-teal-900/50 flex items-center justify-center gap-2"
              >
                {isLoading ? 'Creating...' : 'Host New Game'}
              </button>

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-zinc-700"></div></div>
                <div className="relative flex justify-center text-xs uppercase tracking-widest"><span className="px-2 bg-zinc-900 text-zinc-500">or join</span></div>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="ROOM CODE"
                  value={joinId}
                  onChange={(e) => setJoinId(e.target.value.toUpperCase())}
                  className="flex-1 bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-3 text-center text-lg font-mono tracking-widest uppercase focus:border-teal-500 focus:outline-none"
                />
                <button
                  onClick={joinGame}
                  disabled={isLoading || !joinId}
                  className="bg-zinc-800 hover:bg-zinc-700 text-white font-bold px-6 rounded-xl transition-colors disabled:opacity-50"
                >
                  JOIN
                </button>
              </div>
            </div>
          )}

          {/* HOST LOBBY VIEW */}
          {roomId && !isConnected && (
            <div className="animate-fade-in">
              <p className="text-zinc-400 mb-2 text-sm">Share code with opponent</p>
              <div
                onClick={() => {
                  navigator.clipboard.writeText(roomId);
                  setCopyFeedback(true);
                  setTimeout(() => setCopyFeedback(false), 2000);
                }}
                className="bg-zinc-950 border-2 border-dashed border-zinc-700 rounded-2xl p-4 mb-6 cursor-pointer hover:border-teal-500 transition-colors group relative"
              >
                <div className="text-3xl font-mono font-bold text-white tracking-[0.2em]">{roomId}</div>
                <div className="mt-1 text-[10px] text-zinc-500 group-hover:text-teal-400 font-bold uppercase">
                  {copyFeedback ? "COPIED!" : "CLICK TO COPY"}
                </div>
              </div>

              {/* Game Settings */}
              <div className="bg-zinc-800/30 rounded-xl p-4 mb-6 text-left border border-zinc-800">
                <h3 className="text-zinc-300 font-bold text-sm mb-3 flex items-center gap-2">
                  ⚙️ GAME SETTINGS
                </h3>

                <div className="mb-4">
                  <label className="block text-xs text-zinc-500 uppercase font-bold mb-1">Rounds</label>
                  <input
                    type="range"
                    min="1" max="10"
                    value={state.settings.totalRounds}
                    onChange={(e) => handleSettingsChange({ totalRounds: parseInt(e.target.value) })}
                    className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-teal-500"
                  />
                  <div className="text-right text-teal-400 font-mono font-bold text-sm mt-1">{state.settings.totalRounds} Rounds</div>
                </div>

                {/* Mode Toggle */}
                <div className="mb-4">
                  <label className="block text-xs text-zinc-500 uppercase font-bold mb-2">Game Mode</label>
                  <div className="flex bg-zinc-900 rounded-lg p-1 border border-zinc-700">
                    <button
                      onClick={() => handleSettingsChange({ gameMode: 'STANDARD' })}
                      className={`flex-1 py-2 rounded-md text-xs font-bold transition-colors ${state.settings.gameMode === 'STANDARD' ? 'bg-teal-600 text-white shadow-md' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                      STANDARD (AI)
                    </button>
                    <button
                      onClick={() => handleSettingsChange({ gameMode: 'CUSTOM' })}
                      className={`flex-1 py-2 rounded-md text-xs font-bold transition-colors ${state.settings.gameMode === 'CUSTOM' ? 'bg-indigo-600 text-white shadow-md' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                      CUSTOM (MANUAL)
                    </button>
                  </div>
                </div>

                {/* Custom Card Builder */}
                {state.settings.gameMode === 'CUSTOM' && (
                  <div className="animate-fade-in mt-4 pt-4 border-t border-zinc-700">
                    <label className="block text-xs text-zinc-500 uppercase font-bold mb-2">Your Cards ({state.settings.customCards.length})</label>

                    {/* List */}
                    <div className="space-y-2 mb-3 max-h-40 overflow-y-auto custom-scrollbar">
                      {state.settings.customCards.map((card, idx) => (
                        <div key={idx} className="flex items-center justify-between bg-zinc-900 p-2 rounded-lg border border-zinc-700 text-xs">
                          <div className="flex-1 grid grid-cols-2 gap-2">
                            <span className="text-blue-300 truncate">{card.left}</span>
                            <span className="text-orange-300 truncate text-right">{card.right}</span>
                          </div>
                          <button onClick={() => removeCustomCard(idx)} className="ml-2 text-zinc-600 hover:text-red-500">✕</button>
                        </div>
                      ))}
                      {state.settings.customCards.length === 0 && (
                        <div className="text-xs text-zinc-600 italic text-center py-2">No cards added yet.</div>
                      )}
                    </div>

                    {/* Input */}
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <input
                        placeholder="Left (e.g. Hot)"
                        value={newCardLeft}
                        onChange={(e) => setNewCardLeft(e.target.value)}
                        className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-xs text-white focus:border-indigo-500 outline-none"
                      />
                      <input
                        placeholder="Right (e.g. Cold)"
                        value={newCardRight}
                        onChange={(e) => setNewCardRight(e.target.value)}
                        className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-xs text-white focus:border-indigo-500 outline-none"
                      />
                    </div>
                    <button
                      onClick={addCustomCard}
                      disabled={!newCardLeft.trim() || !newCardRight.trim()}
                      className="w-full py-2 bg-indigo-900/50 border border-indigo-500/50 text-indigo-300 text-xs font-bold rounded-lg hover:bg-indigo-900 transition-colors disabled:opacity-50"
                    >
                      + ADD CARD
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-center gap-2 text-zinc-500 text-sm animate-pulse">
                <div className="w-2 h-2 bg-teal-500 rounded-full"></div>
                Waiting for opponent to join...
              </div>

              {/* Monetization / Support */}
              <div className="mt-8 pt-6 border-t border-zinc-800">
                <a
                  href="https://www.buymeacoffee.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 text-xs text-zinc-500 hover:text-yellow-400 transition-colors group"
                >
                  <span>☕</span>
                  <span className="group-hover:underline">Enjoying the game? Support the dev</span>
                </a>
              </div>
            </div>
          )}

          {/* CONNECTED VIEW */}
          {isConnected && (
            <div className="animate-fade-in">
              <div className="flex items-center justify-between bg-zinc-800/50 p-4 rounded-xl mb-6 border border-zinc-700/50">
                <div className="text-left">
                  <div className="text-[10px] text-zinc-500 uppercase font-bold">Opponent</div>
                  <div className="font-bold text-white">{state.opponentName || "Unknown"}</div>
                </div>
                <div className="w-8 h-8 bg-green-500/20 text-green-400 rounded-full flex items-center justify-center text-lg">✓</div>
              </div>

              {/* Show Settings Summary */}
              <div className="mb-8 text-sm text-zinc-400 bg-zinc-900/50 p-4 rounded-xl border border-zinc-800 text-left">
                <div className="flex justify-between mb-1">
                  <span>Rounds:</span>
                  <span className="text-white font-mono">{state.settings.totalRounds}</span>
                </div>
                <div className="flex justify-between mb-1">
                  <span>Mode:</span>
                  <span className={`font-bold ${state.settings.gameMode === 'CUSTOM' ? 'text-indigo-400' : 'text-teal-400'}`}>
                    {state.settings.gameMode}
                  </span>
                </div>
                {state.settings.gameMode === 'CUSTOM' && (
                  <div className="text-xs text-zinc-500 mt-2 pt-2 border-t border-zinc-800">
                    {state.settings.customCards.length} custom cards loaded.
                  </div>
                )}
                {!state.isHost && <div className="mt-2 text-xs text-zinc-600 italic text-center pt-2">Host controls settings</div>}
              </div>

              {state.isHost ? (
                <button
                  onClick={startFirstRound}
                  className="w-full py-4 bg-white text-black font-bold rounded-2xl hover:bg-zinc-200 transition-transform hover:scale-[1.02] shadow-lg"
                >
                  START GAME
                </button>
              ) : (
                <div className="text-center">
                  <p className="text-white font-bold mb-1">Ready!</p>
                  <p className="text-sm text-zinc-500 animate-pulse">Waiting for host to start...</p>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    );
  }

  // 2. GAME OVER
  if (state.phase === GamePhase.GAME_OVER) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-zinc-900 p-8 rounded-3xl border border-zinc-800 text-center shadow-2xl">
          <h2 className="text-3xl font-bold text-white mb-4">Session Complete</h2>
          <div className="flex flex-col items-center justify-center mb-8">
            <div className="text-8xl font-black text-transparent bg-clip-text bg-gradient-to-b from-teal-300 to-teal-600">{state.score}</div>
            <div className="text-zinc-500 font-medium uppercase tracking-widest text-sm mt-2">Final Score</div>
          </div>

          <div className="space-y-3 mb-8 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
            {state.history.map((round, idx) => (
              <div key={idx} className="flex justify-between items-center bg-zinc-800/50 p-4 rounded-xl border border-zinc-800/50">
                <div className="text-left">
                  <div className="text-xs text-zinc-500 mb-1">Round {idx + 1}</div>
                  <span className="text-zinc-300 font-medium">"{round.clue}"</span>
                </div>
                <span className={`text-xl font-bold ${getScoreColor(round.score)}`}>+{round.score}</span>
              </div>
            ))}
          </div>

          <button
            onClick={restartGame}
            className="w-full py-3 bg-white text-black font-bold rounded-full hover:bg-zinc-200 transition-colors"
          >
            New Game
          </button>
        </div>
      </div>
    );
  }

  // 3. LOADING
  if (state.phase === GamePhase.LOADING_CARD || !state.currentCard) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-4">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-zinc-800 rounded-full"></div>
          <div className="w-16 h-16 border-4 border-teal-500 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
        </div>
        <p className="text-zinc-500 font-medium animate-pulse">
          {state.settings.gameMode === 'CUSTOM' ? "Shuffling custom deck..." : "Consulting the spirits..."}
        </p>
      </div>
    );
  }

  // 4. MAIN GAME BOARD
  const roleLabel = state.myRole === PlayerRole.PSYCHIC ? "PSYCHIC" : "GUESSER";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col overflow-hidden relative">

      {/* Top Bar */}
      <header className="px-6 py-4 flex justify-between items-center bg-zinc-900/50 backdrop-blur-md border-b border-zinc-800 z-20">
        <div className="flex flex-col">
          <span className="text-[10px] font-bold text-zinc-500 tracking-widest uppercase">Round</span>
          <span className="text-xl font-bold font-mono">{state.currentRound}/{state.settings.totalRounds}</span>
        </div>

        <div className="absolute left-1/2 transform -translate-x-1/2 flex flex-col items-center">
          <div className="px-4 py-1 bg-zinc-800 rounded-full border border-zinc-700 mb-1">
            <span className={`text-xs font-bold tracking-wider ${state.myRole === PlayerRole.PSYCHIC ? 'text-purple-400' : 'text-blue-400'}`}>
              YOU ARE {roleLabel}
            </span>
          </div>
          <div className="text-[10px] text-zinc-600 font-bold tracking-widest uppercase">
            vs {state.opponentName || "Opponent"}
          </div>
        </div>

        <div className="flex flex-col items-end">
          <span className="text-[10px] font-bold text-zinc-500 tracking-widest uppercase">Score</span>
          <span className="text-xl font-bold text-teal-400 font-mono">{state.score}</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center relative p-4 w-full max-w-3xl mx-auto z-10">

        {/* Card */}
        <div className="w-full flex justify-between items-stretch mb-12 bg-zinc-900 rounded-3xl border border-zinc-800 shadow-2xl overflow-hidden relative">
          {/* Center Divider */}
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-zinc-700 to-transparent transform -translate-x-1/2"></div>

          <div className="w-1/2 p-6 md:p-8 text-center bg-gradient-to-r from-blue-900/10 to-transparent">
            <span className="text-2xl md:text-3xl font-bold text-blue-200 leading-tight break-words">{state.currentCard.left}</span>
          </div>
          <div className="w-1/2 p-6 md:p-8 text-center bg-gradient-to-l from-orange-900/10 to-transparent">
            <span className="text-2xl md:text-3xl font-bold text-orange-200 leading-tight break-words">{state.currentCard.right}</span>
          </div>
        </div>

        {/* Dial */}
        <div className="w-full mb-12 transform scale-110">
          <Dial
            targetPercent={state.targetPercent}
            currentPercent={state.guessPercent}
            onChange={handleDialChange}
            isInteractive={state.phase === GamePhase.GUESSING && state.myRole === PlayerRole.GUESSER}
            showTarget={state.phase === GamePhase.REVEAL || (state.phase === GamePhase.PSYCHIC_VIEW && state.myRole === PlayerRole.PSYCHIC) || (state.phase === GamePhase.GUESSING && state.myRole === PlayerRole.PSYCHIC)}
          />
        </div>

        {/* Action Area */}
        <div className="w-full max-w-lg h-32 relative flex items-center justify-center">

          {/* 1. PSYCHIC INPUT */}
          {state.phase === GamePhase.PSYCHIC_VIEW && (
            <div className="w-full animate-fade-in">
              {state.myRole === PlayerRole.PSYCHIC ? (
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={inputClue}
                    onChange={(e) => setInputClue(e.target.value)}
                    placeholder="Enter a one-word clue..."
                    maxLength={30}
                    className="flex-1 bg-zinc-900 border border-zinc-700 rounded-2xl px-6 text-xl text-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all"
                    onKeyDown={(e) => e.key === 'Enter' && submitClue()}
                    autoFocus
                  />
                  <button
                    onClick={submitClue}
                    disabled={!inputClue.trim()}
                    className="bg-purple-600 text-white font-bold px-8 rounded-2xl disabled:opacity-50 hover:bg-purple-500 transition-colors shadow-lg shadow-purple-900/50"
                  >
                    GIVE
                  </button>
                </div>
              ) : (
                <div className="text-center text-zinc-500 animate-pulse font-medium">
                  Waiting for Psychic ({state.opponentName}) to give a clue...
                </div>
              )}
            </div>
          )}

          {/* 2. GUESSING */}
          {state.phase === GamePhase.GUESSING && (
            <div className="w-full text-center animate-fade-in">
              <div className="mb-6">
                <span className="text-zinc-500 text-xs font-bold tracking-widest uppercase mb-2 block">Current Clue</span>
                <span className="text-4xl font-black text-white bg-zinc-800/50 px-6 py-2 rounded-xl border border-zinc-700/50 inline-block">
                  "{state.currentClue}"
                </span>
              </div>

              {state.myRole === PlayerRole.GUESSER ? (
                <button
                  onClick={lockGuess}
                  className="w-full bg-white text-black font-black text-xl py-4 rounded-2xl shadow-[0_0_30px_rgba(255,255,255,0.2)] hover:scale-[1.02] transition-transform active:scale-[0.98]"
                >
                  LOCK IN GUESS
                </button>
              ) : (
                <div className="text-zinc-500 animate-pulse flex items-center justify-center gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  {state.opponentName} is moving the dial...
                </div>
              )}
            </div>
          )}

          {/* 3. REVEAL */}
          {state.phase === GamePhase.REVEAL && (
            <div className="w-full animate-fade-in text-center">
              <div className="mb-4">
                {(() => {
                  const pts = calculatePoints(state.targetPercent, state.guessPercent);
                  return (
                    <span className={`text-6xl font-black ${getScoreColor(pts)} drop-shadow-[0_0_15px_rgba(0,0,0,0.5)]`}>
                      +{pts} pts
                    </span>
                  )
                })()}
              </div>

              {state.isHost ? (
                <button
                  onClick={handleNextRound}
                  className="bg-teal-600 hover:bg-teal-500 text-white font-bold px-8 py-3 rounded-xl transition-colors shadow-lg"
                >
                  {state.currentRound >= state.settings.totalRounds ? "FINISH GAME" : "NEXT ROUND →"}
                </button>
              ) : (
                <div className="text-zinc-500 text-sm">Waiting for host...</div>
              )}
            </div>
          )}

        </div>
      </main>
    </div>
  );
};

export default App;
