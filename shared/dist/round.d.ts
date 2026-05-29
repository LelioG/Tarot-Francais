import { type ActiveContract, type CalledRank, type Card, type CardPile, type Contract, type PlayedCard, type PlayerCount, type PlayerId, type RoundState, type Suit } from "./types";
export declare class RuleError extends Error {
    constructor(message: string);
}
export declare const CONTRACT_STRENGTH: Record<Contract, number>;
export interface PlayValidation {
    ok: boolean;
    reason?: string;
}
export interface CreateRoundOptions {
    dealerIndex?: number;
    deck?: Card[];
    rng?: () => number;
}
export declare function fail(message: string): never;
export declare function getDogSize(playerCount: PlayerCount): number;
export declare function getHandSize(playerCount: PlayerCount): number;
export declare function isDogContract(contract: ActiveContract): boolean;
export declare function shuffleCards(cards: Card[], rng?: () => number): Card[];
export declare function dealCards(playerIds: PlayerId[], playerCount: PlayerCount, deck: Card[]): {
    hands: Record<PlayerId, Card[]>;
    dog: Card[];
};
export declare function dealTwoPlayerCards(playerIds: PlayerId[], deck: Card[]): {
    hands: Record<PlayerId, Card[]>;
    piles: Record<PlayerId, CardPile[]>;
    dog: Card[];
};
export declare function createRoundState(playerIds: PlayerId[], playerCount: PlayerCount, options?: CreateRoundOptions): RoundState;
export declare function getCurrentPlayerId(round: RoundState): PlayerId;
export declare function canBid(currentWinningBid: WinningBidLike | undefined, contract: Contract): boolean;
interface WinningBidLike {
    contract: Contract;
}
export declare function placeBid(round: RoundState, playerId: PlayerId, contract: Contract): RoundState;
export declare function getAllowedCalledRanks(hand: Card[]): CalledRank[];
export declare function callPartnerCard(round: RoundState, playerId: PlayerId, suit: Suit, rank: CalledRank): RoundState;
export declare function validateDogDiscard(round: RoundState, playerId: PlayerId, cardIds: string[]): void;
export declare function discardDog(round: RoundState, playerId: PlayerId, cardIds: string[]): RoundState;
export declare function validatePlay(round: RoundState, playerId: PlayerId, card: Card): PlayValidation;
export declare function getPlayableCards(round: RoundState, playerId: PlayerId): Card[];
export declare function playCard(round: RoundState, playerId: PlayerId, cardId: string): RoundState;
export declare function determineTrickWinner(cards: PlayedCard[]): PlayerId;
export {};
