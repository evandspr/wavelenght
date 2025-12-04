
export enum GamePhase {
  LOBBY = 'LOBBY',
  LOADING_CARD = 'LOADING_CARD',
  PSYCHIC_VIEW = 'PSYCHIC_VIEW', // Psychic sees target, writes clue
  GUESSING = 'GUESSING', // Guesser sees clue, moves dial
  REVEAL = 'REVEAL', // Score is shown
  GAME_OVER = 'GAME_OVER'
}

export enum PlayerRole {
  PSYCHIC = 'PSYCHIC',
  GUESSER = 'GUESSER'
}

export interface SpectrumCard {
  left: string;
  right: string;
}

export interface RoundResult {
  card: SpectrumCard;
  target: number;
  guess: number;
  score: number;
  clue: string;
}

export type GameMode = 'STANDARD' | 'CUSTOM';

export interface GameSettings {
  totalRounds: number;
  gameMode: GameMode;
  customCards: SpectrumCard[];
}

export interface GameState {
  phase: GamePhase;
  score: number;
  currentRound: number;
  
  // Config
  playerName: string;
  opponentName: string | null;
  settings: GameSettings;

  // Round Data
  currentCard: SpectrumCard | null;
  targetPercent: number; // 0 to 100
  guessPercent: number; // 0 to 100
  currentClue: string;
  
  history: RoundResult[];
  isHost: boolean;
  myRole: PlayerRole | null;
}

// Network Messages
export type NetworkMessage = 
  | { type: 'WELCOME'; username: string }
  | { type: 'SYNC_SETTINGS'; settings: GameSettings }
  | { type: 'SYNC_STATE'; state: Partial<GameState> }
  | { type: 'NEW_ROUND'; card: SpectrumCard; target: number; role: PlayerRole }
  | { type: 'CLUE_GIVEN'; clue: string }
  | { type: 'DIAL_MOVE'; percent: number }
  | { type: 'LOCK_GUESS'; percent: number }
  | { type: 'NEXT_PHASE'; phase: GamePhase }
  | { type: 'RESTART' };
