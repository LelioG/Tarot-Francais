export type PlayerId = string;
export type PlayerCount = 2 | 3 | 4 | 5;

export const SUITS = ["club", "diamond", "heart", "spade"] as const;
export type Suit = (typeof SUITS)[number];

export const SUIT_RANKS = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "V",
  "C",
  "D",
  "R"
] as const;
export type SuitRank = (typeof SUIT_RANKS)[number];

export type CalledRank = "R" | "D" | "C" | "V";

export type CardKind = "suit" | "trump" | "excuse";

export interface Card {
  id: string;
  kind: CardKind;
  name: string;
  points: number;
  strength: number;
  imagePath: string;
  isOudler: boolean;
  suit?: Suit;
  rank?: SuitRank;
  trump?: number;
}

export const CONTRACTS = ["pass", "petite", "garde", "garde-sans", "garde-contre"] as const;
export type Contract = (typeof CONTRACTS)[number];
export type ActiveContract = Exclude<Contract, "pass">;

export interface Bid {
  playerId: PlayerId;
  contract: Contract;
}

export interface WinningBid {
  playerId: PlayerId;
  contract: ActiveContract;
}

export type RoundPhase =
  | "dealing"
  | "bidding"
  | "king_call"
  | "dog_reveal"
  | "discard"
  | "playing"
  | "trick_resolution"
  | "round_scoring"
  | "round_finished"
  | "passed-out";

export interface PlayedCard {
  playerId: PlayerId;
  card: Card;
}

export interface CompletedTrick {
  leaderId: PlayerId;
  winnerId: PlayerId;
  cards: PlayedCard[];
}

export interface CardPile {
  cards: Card[];
}

export interface PublicPile {
  visibleCard?: Card;
  remaining: number;
}

export interface RoundState {
  playerCount: PlayerCount;
  playerIds: PlayerId[];
  dealerIndex: number;
  phase: RoundPhase;
  phaseHistory: RoundPhase[];
  hands: Record<PlayerId, Card[]>;
  piles: Record<PlayerId, CardPile[]>;
  dog: Card[];
  dogRevealed: boolean;
  bids: Bid[];
  winningBid?: WinningBid;
  takerId?: PlayerId;
  calledCard?: Card;
  partnerId?: PlayerId | null;
  partnerRevealed: boolean;
  calledCardPlayed: boolean;
  currentTurnIndex: number;
  leaderId?: PlayerId;
  currentTrick: PlayedCard[];
  tricks: CompletedTrick[];
  wonCards: Record<PlayerId, Card[]>;
  takerBonusCards: Card[];
  defenseBonusCards: Card[];
  discard: Card[];
  roundResult?: RoundResult;
}

export type RoundResult = ContractRoundResult | DuelRoundResult;

export interface ContractRoundResult {
  mode: "contract";
  takerId: PlayerId;
  partnerId?: PlayerId | null;
  takerTeam: PlayerId[];
  defenseTeam: PlayerId[];
  calledCard?: Card;
  partnerRevealed: boolean;
  solo: boolean;
  takerPoints: number;
  oudlerCount: number;
  threshold: number;
  margin: number;
  contract: ActiveContract;
  multiplier: number;
  rawScore: number;
  baseScore: number;
  takerWon: boolean;
  deltas: Record<PlayerId, number>;
}

export interface DuelRoundResult {
  mode: "duel";
  winnerId: PlayerId;
  loserId: PlayerId;
  pointsByPlayer: Record<PlayerId, number>;
  totalPoints: number;
  margin: number;
  deltas: Record<PlayerId, number>;
}

export interface PublicPlayer {
  id: PlayerId;
  name: string;
  seat: number;
  connected: boolean;
  score: number;
  cardCount: number;
}

export type RoomPhase = RoundPhase | "lobby" | "blocked";
export type PartnerPublicStatus = "none" | "hidden" | "revealed" | "solo";

export interface PublicRoomState {
  code: string;
  playerCount: PlayerCount;
  phase: RoomPhase;
  players: PublicPlayer[];
  hostId?: PlayerId;
  currentTurnId?: PlayerId;
  bids: Bid[];
  winningBid?: WinningBid;
  takerId?: PlayerId;
  contract?: ActiveContract;
  calledCard?: Card;
  partner: {
    status: PartnerPublicStatus;
    playerId?: PlayerId;
  };
  dog?: Card[];
  piles: Record<PlayerId, PublicPile[]>;
  discardSize: number;
  currentTrick: PlayedCard[];
  tricks: CompletedTrick[];
  scores: Record<PlayerId, number>;
  history: RoundResult[];
  roundResult?: RoundResult;
  blockedReason?: string;
  message?: string;
  you?: {
    playerId: PlayerId;
    hand: Card[];
    piles: PublicPile[];
    playableCardIds: string[];
    allowedCalledRanks: CalledRank[];
  };
}

export interface ClientAck<T = undefined> {
  ok: boolean;
  data?: T;
  error?: string;
}
