import type { ActiveContract, ContractRoundResult, DuelRoundResult, PlayerId, RoundState } from "./types";
export declare const CONTRACT_MULTIPLIERS: Record<ActiveContract, number>;
export declare function getThreshold(oudlerCount: number): number;
export declare function getTakerTeam(round: RoundState): PlayerId[];
export declare function scoreRound(round: RoundState): ContractRoundResult;
export declare function scoreTwoPlayerRound(round: RoundState): DuelRoundResult;
