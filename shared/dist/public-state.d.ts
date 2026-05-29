import type { PlayerCount, PlayerId, PublicRoomState, RoundResult, RoundState } from "./types";
export interface PublicStatePlayerInput {
    id: PlayerId;
    name: string;
    seat: number;
    connected: boolean;
}
export interface PrivateGameStateForPublicView {
    code: string;
    playerCount: PlayerCount;
    players: PublicStatePlayerInput[];
    scores: Record<PlayerId, number>;
    history: RoundResult[];
    hostId?: PlayerId;
    round?: RoundState;
    blockedReason?: string;
}
export declare function getPublicGameStateForPlayer(gameState: PrivateGameStateForPublicView, playerId?: PlayerId): PublicRoomState;
