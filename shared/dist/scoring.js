export const CONTRACT_MULTIPLIERS = {
    petite: 1,
    garde: 2,
    "garde-sans": 4,
    "garde-contre": 6
};
const thresholdsByOudlers = {
    0: 56,
    1: 51,
    2: 41,
    3: 36
};
function getCards(cardsByPlayer, playerId) {
    return cardsByPlayer[playerId] ?? [];
}
function sumPoints(cards) {
    return cards.reduce((total, card) => total + card.points, 0);
}
function countOudlers(cards) {
    return cards.filter((card) => card.isOudler).length;
}
export function getThreshold(oudlerCount) {
    const threshold = thresholdsByOudlers[oudlerCount];
    if (threshold === undefined) {
        throw new Error(`Nombre de bouts invalide: ${oudlerCount}`);
    }
    return threshold;
}
export function getTakerTeam(round) {
    if (!round.takerId) {
        throw new Error("Aucun preneur défini.");
    }
    if (round.playerCount === 5 && round.partnerId && round.partnerId !== round.takerId) {
        return [round.takerId, round.partnerId];
    }
    return [round.takerId];
}
export function scoreRound(round) {
    if (!round.takerId || !round.winningBid) {
        throw new Error("Impossible de compter une manche sans preneur ni contrat.");
    }
    const takerTeam = getTakerTeam(round);
    const defenseTeam = round.playerIds.filter((playerId) => !takerTeam.includes(playerId));
    const takerCards = takerTeam.flatMap((playerId) => getCards(round.wonCards, playerId));
    const scoringCards = [...takerCards, ...round.takerBonusCards];
    const takerPoints = sumPoints(scoringCards);
    const oudlerCount = countOudlers(scoringCards);
    const threshold = getThreshold(oudlerCount);
    const margin = takerPoints - threshold;
    const takerWon = margin >= 0;
    const multiplier = CONTRACT_MULTIPLIERS[round.winningBid.contract];
    const rawScore = 25 + Math.abs(margin);
    const baseScore = rawScore * multiplier;
    const deltas = Object.fromEntries(round.playerIds.map((playerId) => [playerId, 0]));
    if (round.playerCount !== 5) {
        deltas[round.takerId] = (takerWon ? defenseTeam.length : -defenseTeam.length) * baseScore;
        for (const defenderId of defenseTeam) {
            deltas[defenderId] = (takerWon ? -1 : 1) * baseScore;
        }
    }
    else {
        const solo = takerTeam.length === 1;
        if (solo) {
            deltas[round.takerId] = (takerWon ? 4 : -4) * baseScore;
            for (const defenderId of defenseTeam) {
                deltas[defenderId] = (takerWon ? -1 : 1) * baseScore;
            }
        }
        else {
            const partnerId = takerTeam.find((playerId) => playerId !== round.takerId);
            if (!partnerId) {
                throw new Error("Partenaire introuvable pour une manche à 5 non solo.");
            }
            deltas[round.takerId] = (takerWon ? 2 : -2) * baseScore;
            deltas[partnerId] = (takerWon ? 1 : -1) * baseScore;
            for (const defenderId of defenseTeam) {
                deltas[defenderId] = (takerWon ? -1 : 1) * baseScore;
            }
        }
    }
    const total = Object.values(deltas).reduce((sum, delta) => sum + delta, 0);
    if (Math.abs(total) > 0.00001) {
        throw new Error(`Score non nul: ${total}`);
    }
    return {
        mode: "contract",
        takerId: round.takerId,
        partnerId: round.partnerId,
        takerTeam,
        defenseTeam,
        calledCard: round.calledCard,
        partnerRevealed: round.partnerRevealed,
        solo: takerTeam.length === 1,
        takerPoints,
        oudlerCount,
        threshold,
        margin,
        contract: round.winningBid.contract,
        multiplier,
        rawScore,
        baseScore,
        takerWon,
        deltas
    };
}
export function scoreTwoPlayerRound(round) {
    if (round.playerCount !== 2 || round.playerIds.length !== 2) {
        throw new Error("Le comptage duel nécessite exactement 2 joueurs.");
    }
    const [firstPlayerId, secondPlayerId] = round.playerIds;
    if (!firstPlayerId || !secondPlayerId) {
        throw new Error("Joueurs du duel introuvables.");
    }
    const firstPoints = sumPoints(getCards(round.wonCards, firstPlayerId));
    const secondPoints = sumPoints(getCards(round.wonCards, secondPlayerId));
    const totalPoints = firstPoints + secondPoints;
    const winnerId = firstPoints >= secondPoints ? firstPlayerId : secondPlayerId;
    const loserId = winnerId === firstPlayerId ? secondPlayerId : firstPlayerId;
    const margin = Math.abs(firstPoints - secondPoints);
    const deltas = {
        [winnerId]: margin,
        [loserId]: -margin
    };
    const totalScore = Object.values(deltas).reduce((sum, delta) => sum + delta, 0);
    if (Math.abs(totalScore) > 0.00001) {
        throw new Error(`Score duel non nul: ${totalScore}`);
    }
    return {
        mode: "duel",
        winnerId,
        loserId,
        pointsByPlayer: {
            [firstPlayerId]: firstPoints,
            [secondPlayerId]: secondPoints
        },
        totalPoints,
        margin,
        deltas
    };
}
//# sourceMappingURL=scoring.js.map