import { sortCards } from "./cards";
import { getAllowedCalledRanks, getCurrentPlayerId, getDogSize, getPlayableCards } from "./round";
function currentPhase(gameState) {
    if (gameState.blockedReason) {
        return "blocked";
    }
    return gameState.round?.phase ?? "lobby";
}
function publicPlayers(gameState) {
    return gameState.players.map((player) => ({
        id: player.id,
        name: player.name,
        seat: player.seat,
        connected: player.connected,
        score: gameState.scores[player.id] ?? 0,
        cardCount: getPublicCardCount(gameState.round, player.id)
    }));
}
function getPublicCardCount(round, playerId) {
    if (!round) {
        return 0;
    }
    return ((round.hands[playerId]?.length ?? 0) +
        (round.piles[playerId]?.reduce((total, pile) => total + pile.cards.length, 0) ?? 0));
}
function getPartnerPublicState(round, viewerId) {
    if (!round?.calledCard) {
        return { status: "none" };
    }
    if (round.roundResult) {
        if (round.roundResult.mode === "duel") {
            return { status: "none" };
        }
        return round.roundResult.partnerId
            ? { status: "revealed", playerId: round.roundResult.partnerId }
            : { status: "solo" };
    }
    if (round.partnerRevealed && round.partnerId) {
        return { status: "revealed", playerId: round.partnerId };
    }
    const calledCardInRevealedDog = round.dogRevealed && round.dog.some((card) => card.id === round.calledCard?.id);
    const viewerIsSelfCallingTaker = viewerId === round.takerId &&
        viewerId !== undefined &&
        round.hands[viewerId]?.some((card) => card.id === round.calledCard?.id);
    if (!round.partnerId &&
        (round.calledCardPlayed || calledCardInRevealedDog || viewerIsSelfCallingTaker)) {
        return { status: "solo" };
    }
    return { status: "hidden" };
}
function hasCurrentTurn(round) {
    return Boolean(round &&
        ["bidding", "king_call", "dog_reveal", "discard", "playing", "trick_resolution"].includes(round.phase));
}
function publicPiles(round) {
    if (!round || round.playerCount !== 2) {
        return {};
    }
    return Object.fromEntries(round.playerIds.map((playerId) => [
        playerId,
        (round.piles[playerId] ?? []).map((pile) => ({
            visibleCard: pile.cards[0],
            remaining: pile.cards.length
        }))
    ]));
}
export function getPublicGameStateForPlayer(gameState, playerId) {
    const round = gameState.round;
    const hand = playerId && round?.hands[playerId] ? sortCards(round.hands[playerId]) : [];
    const playableCards = playerId && round ? getPlayableCards(round, playerId) : [];
    const piles = publicPiles(round);
    const allowedCalledRanks = playerId && round?.phase === "king_call" && playerId === round.takerId
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
//# sourceMappingURL=public-state.js.map