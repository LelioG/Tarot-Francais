import { sortCards } from "./cards";
import { getAllowedCalledRanks, getCurrentPlayerId, getDogSize, getPlayableCards } from "./round";
import type {
  PlayerCount,
  PlayerId,
  PublicPile,
  PublicPlayer,
  PublicRoomState,
  RoundResult,
  RoundState
} from "./types";

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

function currentPhase(gameState: PrivateGameStateForPublicView): PublicRoomState["phase"] {
  if (gameState.blockedReason) {
    return "blocked";
  }
  return gameState.round?.phase ?? "lobby";
}

function publicPlayers(gameState: PrivateGameStateForPublicView): PublicPlayer[] {
  return gameState.players.map((player) => ({
    id: player.id,
    name: player.name,
    seat: player.seat,
    connected: player.connected,
    score: gameState.scores[player.id] ?? 0,
    cardCount: getPublicCardCount(gameState.round, player.id)
  }));
}

function getPublicCardCount(round: RoundState | undefined, playerId: PlayerId): number {
  if (!round) {
    return 0;
  }
  return (
    (round.hands[playerId]?.length ?? 0) +
    (round.piles[playerId]?.reduce((total, pile) => total + pile.cards.length, 0) ?? 0)
  );
}

function getPartnerPublicState(round: RoundState | undefined, viewerId: PlayerId | undefined) {
  if (!round?.calledCard) {
    return { status: "none" as const };
  }

  if (round.roundResult) {
    if (round.roundResult.mode === "duel") {
      return { status: "none" as const };
    }
    return round.roundResult.partnerId
      ? { status: "revealed" as const, playerId: round.roundResult.partnerId }
      : { status: "solo" as const };
  }

  if (round.partnerRevealed && round.partnerId) {
    return { status: "revealed" as const, playerId: round.partnerId };
  }

  const calledCardInRevealedDog =
    round.dogRevealed && round.dog.some((card) => card.id === round.calledCard?.id);
  const viewerIsSelfCallingTaker =
    viewerId === round.takerId &&
    viewerId !== undefined &&
    round.hands[viewerId]?.some((card) => card.id === round.calledCard?.id);

  if (
    !round.partnerId &&
    (round.calledCardPlayed || calledCardInRevealedDog || viewerIsSelfCallingTaker)
  ) {
    return { status: "solo" as const };
  }

  return { status: "hidden" as const };
}

function hasCurrentTurn(round: RoundState | undefined): round is RoundState {
  return Boolean(
    round &&
    ["bidding", "king_call", "dog_reveal", "discard", "playing", "trick_resolution"].includes(
      round.phase
    )
  );
}

function publicPiles(round: RoundState | undefined): Record<PlayerId, PublicPile[]> {
  if (!round || round.playerCount !== 2) {
    return {};
  }

  return Object.fromEntries(
    round.playerIds.map((playerId) => [
      playerId,
      (round.piles[playerId] ?? []).map((pile) => ({
        visibleCard: pile.cards[0],
        remaining: pile.cards.length
      }))
    ])
  ) as Record<PlayerId, PublicPile[]>;
}

export function getPublicGameStateForPlayer(
  gameState: PrivateGameStateForPublicView,
  playerId?: PlayerId
): PublicRoomState {
  const round = gameState.round;
  const hand = playerId && round?.hands[playerId] ? sortCards(round.hands[playerId]) : [];
  const playableCards = playerId && round ? getPlayableCards(round, playerId) : [];
  const piles = publicPiles(round);
  const allowedCalledRanks =
    playerId && round?.phase === "king_call" && playerId === round.takerId
      ? getAllowedCalledRanks(round.hands[playerId] ?? [])
      : [];

  return {
    code: gameState.code,
    playerCount: gameState.playerCount,
    phase: currentPhase(gameState),
    players: publicPlayers(gameState),
    hostId: gameState.hostId,
    currentTurnId: hasCurrentTurn(round) ? getCurrentPlayerId(round) : undefined,
    bids: round?.bids ?? [],
    winningBid: round?.winningBid,
    takerId: round?.takerId,
    contract: round?.winningBid?.contract,
    calledCard: round?.calledCard,
    partner: getPartnerPublicState(round, playerId),
    dog: round?.dogRevealed ? round.dog : undefined,
    piles,
    discardSize: round ? getDogSize(round.playerCount) : 0,
    currentTrick: round?.currentTrick ?? [],
    tricks: round?.tricks ?? [],
    scores: gameState.scores,
    history: gameState.history,
    roundResult: round?.roundResult,
    blockedReason: gameState.blockedReason,
    you: playerId
      ? {
          playerId,
          hand,
          piles: playerId ? (piles[playerId] ?? []) : [],
          playableCardIds: playableCards.map((card) => card.id),
          allowedCalledRanks
        }
      : undefined
  };
}
