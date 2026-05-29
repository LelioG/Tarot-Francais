// src/index.ts
import cors from "cors";
import express from "express";
import { existsSync } from "fs";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { Server } from "socket.io";

// ../shared/src/types.ts
var SUITS = ["club", "diamond", "heart", "spade"];
var SUIT_RANKS = [
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
];
var CONTRACTS = ["pass", "petite", "garde", "garde-sans", "garde-contre"];

// ../shared/src/cards.ts
var suitFolders = {
  club: "club",
  diamond: "diamond",
  heart: "heart",
  spade: "spades"
};
var suitPrefixes = {
  club: "trefle",
  diamond: "caro",
  heart: "coeur",
  spade: "pique"
};
var suitLabels = {
  club: "Tr\xE8fle",
  diamond: "Carreau",
  heart: "C\u0153ur",
  spade: "Pique"
};
var rankLabels = {
  "1": "As",
  "2": "2",
  "3": "3",
  "4": "4",
  "5": "5",
  "6": "6",
  "7": "7",
  "8": "8",
  "9": "9",
  "10": "10",
  V: "Valet",
  C: "Cavalier",
  D: "Dame",
  R: "Roi"
};
var rankStrength = {
  "1": 1,
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
  V: 11,
  C: 12,
  D: 13,
  R: 14
};
function getCardImagePath(card) {
  if (card.kind === "excuse") {
    return "/cards/trumps/excuse.svg";
  }
  if (card.kind === "trump") {
    if (!card.trump) {
      throw new Error("Atout invalide sans num\xE9ro.");
    }
    return `/cards/trumps/${card.trump}.svg`;
  }
  if (!card.suit || !card.rank) {
    throw new Error("Carte de couleur invalide sans couleur ou rang.");
  }
  return `/cards/${suitFolders[card.suit]}/${suitPrefixes[card.suit]}${card.rank}.svg`;
}
function createSuitCard(suit, rank) {
  const points = rank === "R" ? 4.5 : rank === "D" ? 3.5 : rank === "C" ? 2.5 : rank === "V" ? 1.5 : 0.5;
  const card = {
    id: `suit-${suit}-${rank}`,
    kind: "suit",
    suit,
    rank,
    name: `${rankLabels[rank]} de ${suitLabels[suit]}`,
    points,
    strength: rankStrength[rank],
    isOudler: false,
    imagePath: ""
  };
  return { ...card, imagePath: getCardImagePath(card) };
}
function createTrumpCard(trump) {
  if (trump < 1 || trump > 21 || !Number.isInteger(trump)) {
    throw new Error(`Atout invalide: ${trump}`);
  }
  const card = {
    id: `trump-${trump}`,
    kind: "trump",
    trump,
    name: `Atout ${trump}`,
    points: trump === 1 || trump === 21 ? 4.5 : 0.5,
    strength: trump,
    isOudler: trump === 1 || trump === 21,
    imagePath: ""
  };
  return { ...card, imagePath: getCardImagePath(card) };
}
function createExcuseCard() {
  const card = {
    id: "excuse",
    kind: "excuse",
    name: "Excuse",
    points: 4.5,
    strength: 0,
    isOudler: true,
    imagePath: ""
  };
  return { ...card, imagePath: getCardImagePath(card) };
}
function createDeck() {
  const suitedCards = SUITS.flatMap((suit) => SUIT_RANKS.map((rank) => createSuitCard(suit, rank)));
  const trumps = Array.from({ length: 21 }, (_, index) => createTrumpCard(index + 1));
  return [...suitedCards, ...trumps, createExcuseCard()];
}
function makeCalledCard(suit, rank) {
  return createSuitCard(suit, rank);
}
function sortCards(cards) {
  const suitOrder = {
    club: 0,
    diamond: 1,
    heart: 2,
    spade: 3
  };
  return [...cards].sort((a, b) => {
    const groupA = a.kind === "suit" ? suitOrder[a.suit] : a.kind === "trump" ? 4 : 5;
    const groupB = b.kind === "suit" ? suitOrder[b.suit] : b.kind === "trump" ? 4 : 5;
    if (groupA !== groupB) {
      return groupA - groupB;
    }
    return a.strength - b.strength;
  });
}

// ../shared/src/scoring.ts
var CONTRACT_MULTIPLIERS = {
  petite: 1,
  garde: 2,
  "garde-sans": 4,
  "garde-contre": 6
};
var thresholdsByOudlers = {
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
function getThreshold(oudlerCount) {
  const threshold = thresholdsByOudlers[oudlerCount];
  if (threshold === void 0) {
    throw new Error(`Nombre de bouts invalide: ${oudlerCount}`);
  }
  return threshold;
}
function getTakerTeam(round) {
  if (!round.takerId) {
    throw new Error("Aucun preneur d\xE9fini.");
  }
  if (round.playerCount === 5 && round.partnerId && round.partnerId !== round.takerId) {
    return [round.takerId, round.partnerId];
  }
  return [round.takerId];
}
function scoreRound(round) {
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
  } else {
    const solo = takerTeam.length === 1;
    if (solo) {
      deltas[round.takerId] = (takerWon ? 4 : -4) * baseScore;
      for (const defenderId of defenseTeam) {
        deltas[defenderId] = (takerWon ? -1 : 1) * baseScore;
      }
    } else {
      const partnerId = takerTeam.find((playerId) => playerId !== round.takerId);
      if (!partnerId) {
        throw new Error("Partenaire introuvable pour une manche \xE0 5 non solo.");
      }
      deltas[round.takerId] = (takerWon ? 2 : -2) * baseScore;
      deltas[partnerId] = (takerWon ? 1 : -1) * baseScore;
      for (const defenderId of defenseTeam) {
        deltas[defenderId] = (takerWon ? -1 : 1) * baseScore;
      }
    }
  }
  const total = Object.values(deltas).reduce((sum, delta) => sum + delta, 0);
  if (Math.abs(total) > 1e-5) {
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
function scoreTwoPlayerRound(round) {
  if (round.playerCount !== 2 || round.playerIds.length !== 2) {
    throw new Error("Le comptage duel n\xE9cessite exactement 2 joueurs.");
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
  if (Math.abs(totalScore) > 1e-5) {
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

// ../shared/src/round.ts
var RuleError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "RuleError";
  }
};
var CONTRACT_STRENGTH = {
  pass: 0,
  petite: 1,
  garde: 2,
  "garde-sans": 3,
  "garde-contre": 4
};
var contractSet = new Set(CONTRACTS);
function fail(message) {
  throw new RuleError(message);
}
function activeContract(contract) {
  if (contract === "pass") {
    fail("Passe n'est pas un contrat actif.");
  }
  return contract;
}
function assertContract(contract) {
  if (!contractSet.has(contract)) {
    fail("Contrat inconnu.");
  }
}
function setPhase(round, phase) {
  round.phase = phase;
  if (round.phaseHistory.at(-1) !== phase) {
    round.phaseHistory.push(phase);
  }
}
function getDogSize(playerCount) {
  if (playerCount === 2) {
    return 0;
  }
  return playerCount === 5 ? 3 : 6;
}
function getHandSize(playerCount) {
  if (playerCount === 2) {
    return 15;
  }
  if (playerCount === 3) {
    return 24;
  }
  return playerCount === 4 ? 18 : 15;
}
function isDogContract(contract) {
  return contract === "petite" || contract === "garde";
}
function shuffleCards(cards, rng = Math.random) {
  const shuffled = [...cards];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    const current = shuffled[index];
    const swap = shuffled[swapIndex];
    if (!current || !swap) {
      fail("Erreur interne pendant le m\xE9lange.");
    }
    shuffled[index] = swap;
    shuffled[swapIndex] = current;
  }
  return shuffled;
}
function dealCards(playerIds, playerCount, deck) {
  if (playerCount === 2) {
    fail("Le mode 2 joueurs utilise une distribution avec piles.");
  }
  if (playerIds.length !== playerCount) {
    fail(`La distribution attend ${playerCount} joueurs.`);
  }
  if (deck.length !== 78) {
    fail(`Le deck doit contenir 78 cartes, re\xE7u: ${deck.length}.`);
  }
  const hands = Object.fromEntries(playerIds.map((playerId) => [playerId, []]));
  const handSize = getHandSize(playerCount);
  let cursor = 0;
  for (const playerId of playerIds) {
    hands[playerId] = sortCards(deck.slice(cursor, cursor + handSize));
    cursor += handSize;
  }
  const dog = deck.slice(cursor, cursor + getDogSize(playerCount));
  return { hands, dog };
}
function dealTwoPlayerCards(playerIds, deck) {
  if (playerIds.length !== 2) {
    fail("La distribution \xE0 2 joueurs attend exactement 2 joueurs.");
  }
  if (deck.length !== 78) {
    fail(`Le deck doit contenir 78 cartes, re\xE7u: ${deck.length}.`);
  }
  const hands = Object.fromEntries(playerIds.map((playerId) => [playerId, []]));
  const piles = Object.fromEntries(playerIds.map((playerId) => [playerId, []]));
  let cursor = 0;
  for (const playerId of playerIds) {
    hands[playerId] = sortCards(deck.slice(cursor, cursor + 15));
    cursor += 15;
    piles[playerId] = Array.from({ length: 6 }, () => {
      const cards = deck.slice(cursor, cursor + 4);
      cursor += 4;
      return { cards };
    });
  }
  return { hands, piles, dog: [] };
}
function emptyPiles(playerIds) {
  return Object.fromEntries(playerIds.map((playerId) => [playerId, []]));
}
function createRoundState(playerIds, playerCount, options = {}) {
  const dealerIndex = options.dealerIndex ?? 0;
  if (dealerIndex < 0 || dealerIndex >= playerIds.length) {
    fail("Index de donneur invalide.");
  }
  const deck = options.deck ? [...options.deck] : shuffleCards(createDeck(), options.rng);
  const dealt = playerCount === 2 ? dealTwoPlayerCards(playerIds, deck) : { ...dealCards(playerIds, playerCount, deck), piles: emptyPiles(playerIds) };
  const wonCards = Object.fromEntries(playerIds.map((playerId) => [playerId, []]));
  return {
    playerCount,
    playerIds,
    dealerIndex,
    phase: playerCount === 2 ? "playing" : "bidding",
    phaseHistory: playerCount === 2 ? ["dealing", "playing"] : ["dealing", "bidding"],
    hands: dealt.hands,
    piles: dealt.piles,
    dog: dealt.dog,
    dogRevealed: false,
    bids: [],
    partnerRevealed: false,
    calledCardPlayed: false,
    currentTurnIndex: (dealerIndex + 1) % playerCount,
    currentTrick: [],
    tricks: [],
    wonCards,
    takerBonusCards: [],
    defenseBonusCards: [],
    discard: []
  };
}
function getPlayerAt(round, index) {
  const playerId = round.playerIds[index];
  if (!playerId) {
    fail("Joueur introuvable.");
  }
  return playerId;
}
function getCurrentPlayerId(round) {
  return getPlayerAt(round, round.currentTurnIndex);
}
function getHand(round, playerId) {
  const hand = round.hands[playerId];
  if (!hand) {
    fail("Main introuvable.");
  }
  return hand;
}
function getPiles(round, playerId) {
  const piles = round.piles[playerId];
  if (!piles) {
    fail("Piles introuvables.");
  }
  return piles;
}
function getWonPile(round, playerId) {
  const pile = round.wonCards[playerId];
  if (!pile) {
    fail("Pile de plis introuvable.");
  }
  return pile;
}
function getTakerId(round) {
  if (!round.takerId) {
    fail("Aucun preneur d\xE9fini.");
  }
  return round.takerId;
}
function getWinningContract(round) {
  if (!round.winningBid) {
    fail("Aucun contrat gagnant d\xE9fini.");
  }
  return round.winningBid.contract;
}
function canBid(currentWinningBid, contract) {
  assertContract(contract);
  if (contract === "pass") {
    return true;
  }
  return CONTRACT_STRENGTH[contract] > CONTRACT_STRENGTH[currentWinningBid?.contract ?? "pass"];
}
function placeBid(round, playerId, contract) {
  if (round.phase !== "bidding") {
    fail("Les ench\xE8res ne sont pas ouvertes.");
  }
  assertContract(contract);
  if (playerId !== getCurrentPlayerId(round)) {
    fail("Ce n'est pas le tour de ce joueur d'ench\xE9rir.");
  }
  if (!canBid(round.winningBid, contract)) {
    fail("Cette ench\xE8re ne surench\xE9rit pas le contrat courant.");
  }
  const bid = { playerId, contract };
  round.bids.push(bid);
  if (contract !== "pass") {
    round.winningBid = { playerId, contract: activeContract(contract) };
  }
  if (round.bids.length >= round.playerCount) {
    finishBidding(round);
    return round;
  }
  round.currentTurnIndex = (round.currentTurnIndex + 1) % round.playerCount;
  return round;
}
function finishBidding(round) {
  if (!round.winningBid) {
    setPhase(round, "passed-out");
    return;
  }
  round.takerId = round.winningBid.playerId;
  round.currentTurnIndex = round.playerIds.indexOf(round.takerId);
  if (round.playerCount === 5) {
    setPhase(round, "king_call");
    return;
  }
  enterAfterTakerKnown(round);
}
function enterAfterTakerKnown(round) {
  const contract = getWinningContract(round);
  if (isDogContract(contract)) {
    beginDogPhase(round);
    return;
  }
  if (contract === "garde-sans") {
    round.takerBonusCards.push(...round.dog);
  } else {
    round.defenseBonusCards.push(...round.dog);
  }
  beginPlayingPhase(round);
}
function beginDogPhase(round) {
  const takerId = getTakerId(round);
  setPhase(round, "dog_reveal");
  round.dogRevealed = true;
  round.currentTurnIndex = round.playerIds.indexOf(takerId);
  round.hands[takerId] = sortCards([...getHand(round, takerId), ...round.dog]);
  setPhase(round, "discard");
}
function beginPlayingPhase(round) {
  setPhase(round, "playing");
  round.currentTurnIndex = (round.dealerIndex + 1) % round.playerCount;
  round.leaderId = getCurrentPlayerId(round);
}
function hasEveryRank(hand, rank) {
  return SUITS.every(
    (suit) => hand.some((card) => card.kind === "suit" && card.suit === suit && card.rank === rank)
  );
}
function getAllowedCalledRanks(hand) {
  const ranks = ["R"];
  if (hasEveryRank(hand, "R")) {
    ranks.push("D");
  }
  if (hasEveryRank(hand, "R") && hasEveryRank(hand, "D")) {
    ranks.push("C");
  }
  if (hasEveryRank(hand, "R") && hasEveryRank(hand, "D") && hasEveryRank(hand, "C")) {
    ranks.push("V");
  }
  return ranks;
}
function callPartnerCard(round, playerId, suit, rank) {
  if (round.phase !== "king_call") {
    fail("L'appel n'est pas ouvert.");
  }
  const takerId = getTakerId(round);
  if (playerId !== takerId) {
    fail("Seul le preneur peut appeler une carte.");
  }
  const allowedRanks = getAllowedCalledRanks(getHand(round, takerId));
  if (!allowedRanks.includes(rank)) {
    fail(`Le preneur ne peut pas appeler ${rank}.`);
  }
  const calledCard = makeCalledCard(suit, rank);
  round.calledCard = calledCard;
  const holderId = findHolder(round, calledCard.id);
  round.partnerId = holderId && holderId !== takerId ? holderId : null;
  enterAfterTakerKnown(round);
  return round;
}
function findHolder(round, cardId) {
  for (const playerId of round.playerIds) {
    if (getHand(round, playerId).some((card) => card.id === cardId)) {
      return playerId;
    }
  }
  return round.dog.some((card) => card.id === cardId) ? void 0 : void 0;
}
function validateDogDiscard(round, playerId, cardIds) {
  if (round.phase !== "discard") {
    fail("Il n'y a pas d'\xE9cart \xE0 faire.");
  }
  const takerId = getTakerId(round);
  if (playerId !== takerId) {
    fail("Seul le preneur peut faire l'\xE9cart.");
  }
  const discardSize = getDogSize(round.playerCount);
  const uniqueIds = new Set(cardIds);
  if (uniqueIds.size !== cardIds.length || cardIds.length !== discardSize) {
    fail(`L'\xE9cart doit contenir exactement ${discardSize} cartes distinctes.`);
  }
  const hand = getHand(round, playerId);
  const selected = cardIds.map((cardId) => {
    const card = hand.find((candidate) => candidate.id === cardId);
    if (!card) {
      fail("Une carte de l'\xE9cart n'est pas dans la main du preneur.");
    }
    return card;
  });
  const plainEligibleCount = hand.filter(
    (card) => card.kind === "suit" && card.rank !== "R" && !card.isOudler
  ).length;
  const trumpsAllowed = plainEligibleCount < discardSize;
  for (const card of selected) {
    if (card.isOudler) {
      fail("Les bouts ne peuvent pas \xEAtre \xE9cart\xE9s.");
    }
    if (card.kind === "suit" && card.rank === "R") {
      fail("Les Rois ne peuvent pas \xEAtre \xE9cart\xE9s.");
    }
    if (round.calledCard && card.id === round.calledCard.id) {
      fail("La carte appel\xE9e ne peut pas \xEAtre \xE9cart\xE9e.");
    }
    if (card.kind === "trump" && !trumpsAllowed) {
      fail(
        "Un atout ne peut \xEAtre \xE9cart\xE9 que si l'\xE9cart est impossible avec les cartes de couleur autoris\xE9es."
      );
    }
  }
}
function discardDog(round, playerId, cardIds) {
  validateDogDiscard(round, playerId, cardIds);
  const hand = getHand(round, playerId);
  const selectedIds = new Set(cardIds);
  const selectedCards = hand.filter((card) => selectedIds.has(card.id));
  round.discard = selectedCards;
  round.takerBonusCards.push(...selectedCards);
  round.hands[playerId] = sortCards(hand.filter((card) => !selectedIds.has(card.id)));
  beginPlayingPhase(round);
  return round;
}
function getLedConstraint(trick) {
  const firstEffectiveCard = trick.find((played) => played.card.kind !== "excuse")?.card;
  if (!firstEffectiveCard) {
    return void 0;
  }
  if (firstEffectiveCard.kind === "trump") {
    return { kind: "trump" };
  }
  if (!firstEffectiveCard.suit) {
    fail("Carte de couleur sans couleur.");
  }
  return { kind: "suit", suit: firstEffectiveCard.suit };
}
function highestTrumpInTrick(trick) {
  return trick.reduce((highest, played) => {
    if (played.card.kind !== "trump" || played.card.trump === void 0) {
      return highest;
    }
    return Math.max(highest, played.card.trump);
  }, 0);
}
function shouldApplyCalledSuitLeadRestriction(round) {
  return Boolean(round.playerCount === 5 && round.calledCard && !round.calledCardPlayed);
}
function getVisiblePileCards(round, playerId) {
  if (round.playerCount !== 2) {
    return [];
  }
  return getPiles(round, playerId).flatMap((pile) => pile.cards[0] ? [pile.cards[0]] : []);
}
function getAvailableCardsForRules(round, playerId) {
  return round.playerCount === 2 ? [...getHand(round, playerId), ...getVisiblePileCards(round, playerId)] : getHand(round, playerId);
}
function isCardPlayableByPlayer(round, playerId, cardId) {
  return getAvailableCardsForRules(round, playerId).some((card) => card.id === cardId);
}
function validatePlay(round, playerId, card) {
  if (round.phase !== "playing") {
    return { ok: false, reason: "La manche n'est pas en phase de jeu." };
  }
  if (playerId !== getCurrentPlayerId(round)) {
    return { ok: false, reason: "Ce n'est pas le tour de ce joueur." };
  }
  const availableCards = getAvailableCardsForRules(round, playerId);
  if (!isCardPlayableByPlayer(round, playerId, card.id)) {
    return { ok: false, reason: "Cette carte n'est pas dans la main du joueur." };
  }
  if (card.kind === "excuse") {
    return { ok: true };
  }
  if (round.currentTrick.length === 0) {
    if (shouldApplyCalledSuitLeadRestriction(round) && round.calledCard && card.kind === "suit" && card.suit === round.calledCard.suit && card.id !== round.calledCard.id) {
      return {
        ok: false,
        reason: "L'entame dans la couleur appel\xE9e est interdite tant que la carte appel\xE9e n'a pas \xE9t\xE9 jou\xE9e."
      };
    }
    return { ok: true };
  }
  const led = getLedConstraint(round.currentTrick);
  if (!led) {
    return { ok: true };
  }
  if (led.kind === "suit") {
    const hasLedSuit = availableCards.some(
      (candidate) => candidate.kind === "suit" && candidate.suit === led.suit
    );
    if (hasLedSuit) {
      return card.kind === "suit" && card.suit === led.suit ? { ok: true } : { ok: false, reason: "Le joueur doit fournir la couleur demand\xE9e." };
    }
    const trumpCards2 = availableCards.filter((candidate) => candidate.kind === "trump");
    if (trumpCards2.length === 0) {
      return { ok: true };
    }
    if (card.kind !== "trump") {
      return { ok: false, reason: "Le joueur doit couper \xE0 l'atout." };
    }
    return validateTrumpRise(trumpCards2, highestTrumpInTrick(round.currentTrick), card);
  }
  const trumpCards = availableCards.filter((candidate) => candidate.kind === "trump");
  if (trumpCards.length === 0) {
    return { ok: true };
  }
  if (card.kind !== "trump") {
    return { ok: false, reason: "Le joueur doit fournir de l'atout." };
  }
  return validateTrumpRise(trumpCards, highestTrumpInTrick(round.currentTrick), card);
}
function validateTrumpRise(trumpCards, currentHighestTrump, card) {
  const canRise = trumpCards.some((trump) => (trump.trump ?? 0) > currentHighestTrump);
  if (canRise && (card.trump ?? 0) <= currentHighestTrump) {
    return { ok: false, reason: "Le joueur doit monter \xE0 l'atout s'il le peut." };
  }
  return { ok: true };
}
function getPlayableCards(round, playerId) {
  if (round.phase !== "playing" || playerId !== getCurrentPlayerId(round)) {
    return [];
  }
  return getAvailableCardsForRules(round, playerId).filter(
    (card) => validatePlay(round, playerId, card).ok
  );
}
function playCard(round, playerId, cardId) {
  const card = getAvailableCardsForRules(round, playerId).find(
    (candidate) => candidate.id === cardId
  );
  if (!card) {
    fail("Carte absente de la main.");
  }
  const validation = validatePlay(round, playerId, card);
  if (!validation.ok) {
    fail(validation.reason ?? "Coup invalide.");
  }
  removePlayedCard(round, playerId, cardId);
  round.currentTrick.push({ playerId, card });
  if (round.calledCard && round.calledCard.id === card.id) {
    round.calledCardPlayed = true;
    round.partnerRevealed = Boolean(round.partnerId);
  }
  if (round.currentTrick.length === round.playerCount) {
    completeCurrentTrick(round);
    return round;
  }
  round.currentTurnIndex = (round.currentTurnIndex + 1) % round.playerCount;
  return round;
}
function removePlayedCard(round, playerId, cardId) {
  const hand = getHand(round, playerId);
  if (hand.some((candidate) => candidate.id === cardId)) {
    round.hands[playerId] = hand.filter((candidate) => candidate.id !== cardId);
    return;
  }
  if (round.playerCount !== 2) {
    fail("Carte absente de la main.");
  }
  const pile = getPiles(round, playerId).find((candidate) => candidate.cards[0]?.id === cardId);
  if (!pile) {
    fail("La carte n'est pas visible sur un tas du joueur.");
  }
  pile.cards.shift();
}
function determineTrickWinner(cards) {
  if (cards.length === 0) {
    fail("Un pli vide ne peut pas avoir de gagnant.");
  }
  const trumpCards = cards.filter((played) => played.card.kind === "trump");
  if (trumpCards.length > 0) {
    return highestPlay(trumpCards).playerId;
  }
  const led = getLedConstraint(cards);
  if (!led) {
    return firstPlayed(cards).playerId;
  }
  if (led.kind === "trump") {
    fail("Pli d'atout sans atout.");
  }
  const candidates = cards.filter(
    (played) => played.card.kind === "suit" && played.card.suit === led.suit
  );
  return highestPlay(candidates).playerId;
}
function firstPlayed(cards) {
  const first = cards[0];
  if (!first) {
    fail("Pli vide.");
  }
  return first;
}
function highestPlay(cards) {
  const first = firstPlayed(cards);
  return cards.slice(1).reduce((best, played) => played.card.strength > best.card.strength ? played : best, first);
}
function completeCurrentTrick(round) {
  setPhase(round, "trick_resolution");
  const cards = [...round.currentTrick];
  const winnerId = determineTrickWinner(cards);
  const leaderId = round.leaderId ?? firstPlayed(cards).playerId;
  const completedTrick = {
    leaderId,
    winnerId,
    cards
  };
  for (const played of cards) {
    const ownerId = played.card.kind === "excuse" ? played.playerId : winnerId;
    getWonPile(round, ownerId).push(played.card);
  }
  round.tricks.push(completedTrick);
  round.currentTrick = [];
  if (round.playerIds.every((playerId) => !hasRemainingCards(round, playerId))) {
    setPhase(round, "round_scoring");
    round.roundResult = round.playerCount === 2 ? scoreTwoPlayerRound(round) : scoreRound(round);
    setPhase(round, "round_finished");
    return;
  }
  round.currentTurnIndex = round.playerIds.indexOf(winnerId);
  round.leaderId = winnerId;
  setPhase(round, "playing");
}
function hasRemainingCards(round, playerId) {
  return getHand(round, playerId).length > 0 || getPiles(round, playerId).some((pile) => pile.cards.length > 0);
}

// ../shared/src/public-state.ts
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
  return (round.hands[playerId]?.length ?? 0) + (round.piles[playerId]?.reduce((total, pile) => total + pile.cards.length, 0) ?? 0);
}
function getPartnerPublicState(round, viewerId) {
  if (!round?.calledCard) {
    return { status: "none" };
  }
  if (round.roundResult) {
    if (round.roundResult.mode === "duel") {
      return { status: "none" };
    }
    return round.roundResult.partnerId ? { status: "revealed", playerId: round.roundResult.partnerId } : { status: "solo" };
  }
  if (round.partnerRevealed && round.partnerId) {
    return { status: "revealed", playerId: round.partnerId };
  }
  const calledCardInRevealedDog = round.dogRevealed && round.dog.some((card) => card.id === round.calledCard?.id);
  const viewerIsSelfCallingTaker = viewerId === round.takerId && viewerId !== void 0 && round.hands[viewerId]?.some((card) => card.id === round.calledCard?.id);
  if (!round.partnerId && (round.calledCardPlayed || calledCardInRevealedDog || viewerIsSelfCallingTaker)) {
    return { status: "solo" };
  }
  return { status: "hidden" };
}
function hasCurrentTurn(round) {
  return Boolean(
    round && ["bidding", "king_call", "dog_reveal", "discard", "playing", "trick_resolution"].includes(
      round.phase
    )
  );
}
function publicPiles(round) {
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
  );
}
function getPublicGameStateForPlayer(gameState, playerId) {
  const round = gameState.round;
  const hand = playerId && round?.hands[playerId] ? sortCards(round.hands[playerId]) : [];
  const playableCards = playerId && round ? getPlayableCards(round, playerId) : [];
  const piles = publicPiles(round);
  const allowedCalledRanks = playerId && round?.phase === "king_call" && playerId === round.takerId ? getAllowedCalledRanks(round.hands[playerId] ?? []) : [];
  return {
    code: gameState.code,
    playerCount: gameState.playerCount,
    phase: currentPhase(gameState),
    players: publicPlayers(gameState),
    hostId: gameState.hostId,
    currentTurnId: hasCurrentTurn(round) ? getCurrentPlayerId(round) : void 0,
    bids: round?.bids ?? [],
    winningBid: round?.winningBid,
    takerId: round?.takerId,
    contract: round?.winningBid?.contract,
    calledCard: round?.calledCard,
    partner: getPartnerPublicState(round, playerId),
    dog: round?.dogRevealed ? round.dog : void 0,
    piles,
    discardSize: round ? getDogSize(round.playerCount) : 0,
    currentTrick: round?.currentTrick ?? [],
    tricks: round?.tricks ?? [],
    scores: gameState.scores,
    history: gameState.history,
    roundResult: round?.roundResult,
    blockedReason: gameState.blockedReason,
    you: playerId ? {
      playerId,
      hand,
      piles: playerId ? piles[playerId] ?? [] : [],
      playableCardIds: playableCards.map((card) => card.id),
      allowedCalledRanks
    } : void 0
  };
}

// src/index.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var rootDir = path.resolve(__dirname, "../..");
var clientDistDir = path.join(rootDir, "client", "dist");
var builtCardsDir = path.join(clientDistDir, "cards");
var publicCardsDir = path.join(rootDir, "client", "public", "cards");
var cardsDir = process.env.NODE_ENV === "production" && existsSync(builtCardsDir) ? builtCardsDir : publicCardsDir;
var port = Number(process.env.PORT ?? 3001);
var app = express();
app.use(cors({ origin: true }));
app.use("/cards", express.static(cardsDir));
app.use(express.json());
app.get("/health", (_request, response) => response.json({ ok: true }));
app.use(express.static(clientDistDir));
app.get(/.*/, (_request, response) => {
  response.sendFile(path.join(clientDistDir, "index.html"), (error) => {
    if (error) {
      response.status(404).send("Client build not found. Run npm run build first.");
    }
  });
});
var httpServer = createServer(app);
var io = new Server(httpServer, {
  cors: {
    origin: true,
    methods: ["GET", "POST"]
  }
});
var rooms = /* @__PURE__ */ new Map();
function normalizeName(name) {
  return name.trim().slice(0, 24) || "Joueur";
}
function normalizeCode(code) {
  return code.trim().toUpperCase();
}
function makeRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 50; attempt += 1) {
    let code = "";
    for (let index = 0; index < 5; index += 1) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    if (!rooms.has(code)) {
      return code;
    }
  }
  throw new Error("Impossible de g\xE9n\xE9rer un code de salon.");
}
function ackOk(ack, data) {
  ack?.({ ok: true, data });
}
function ackError(ack, error) {
  ack?.({ ok: false, error });
}
function getSocketRoomCode(socketId) {
  for (const room of rooms.values()) {
    if (room.players.some((player) => player.socketId === socketId)) {
      return room.code;
    }
  }
  return void 0;
}
function getRoomForSocket(socketId) {
  const roomCode = getSocketRoomCode(socketId);
  return roomCode ? rooms.get(roomCode) : void 0;
}
function getPlayerForSocket(room, socketId) {
  return room.players.find((player) => player.socketId === socketId);
}
function ensureActiveRoom(room) {
  if (room.blockedReason) {
    throw new Error(room.blockedReason);
  }
}
function emitRoom(room) {
  for (const player of room.players) {
    if (!player.connected) {
      continue;
    }
    io.to(player.socketId).emit("roomState", getPublicGameStateForPlayer(room, player.id));
  }
}
function applyRoundResult(room) {
  if (!room.round?.roundResult || room.roundResultApplied) {
    return;
  }
  for (const [playerId, delta] of Object.entries(room.round.roundResult.deltas)) {
    room.scores[playerId] = (room.scores[playerId] ?? 0) + delta;
  }
  room.history.push(room.round.roundResult);
  room.roundResultApplied = true;
}
function createPlayer(socketId, name, seat) {
  return {
    id: socketId,
    socketId,
    name: normalizeName(name),
    seat,
    connected: true
  };
}
function startRound(room) {
  if (room.players.length !== room.playerCount) {
    throw new Error(`La partie requiert ${room.playerCount} joueurs.`);
  }
  if (room.players.some((player) => !player.connected)) {
    throw new Error("Tous les joueurs doivent \xEAtre connect\xE9s.");
  }
  const playerIds = [...room.players].sort((a, b) => a.seat - b.seat).map((player) => player.id);
  room.round = createRoundState(playerIds, room.playerCount, {
    dealerIndex: room.dealerIndex % room.playerCount
  });
  room.roundResultApplied = false;
  room.blockedReason = void 0;
}
function withRoomAction(socketId, ack, action) {
  const room = getRoomForSocket(socketId);
  if (!room) {
    ackError(ack, "Salon introuvable.");
    return;
  }
  const player = getPlayerForSocket(room, socketId);
  if (!player) {
    ackError(ack, "Joueur introuvable.");
    return;
  }
  try {
    ensureActiveRoom(room);
    action(room, player);
    applyRoundResult(room);
    emitRoom(room);
    ackOk(ack);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Action invalide.";
    ackError(ack, message);
    io.to(socketId).emit("errorMessage", message);
  }
}
io.on("connection", (socket) => {
  socket.on(
    "createRoom",
    (payload, ack) => {
      try {
        if (payload.playerCount !== 2 && payload.playerCount !== 3 && payload.playerCount !== 4 && payload.playerCount !== 5) {
          throw new Error("Le nombre de joueurs doit \xEAtre 2, 3, 4 ou 5.");
        }
        const code = makeRoomCode();
        const player = createPlayer(socket.id, payload.name, 0);
        const room = {
          code,
          playerCount: payload.playerCount,
          players: [player],
          hostId: player.id,
          scores: { [player.id]: 0 },
          history: [],
          dealerIndex: 0,
          roundResultApplied: false
        };
        rooms.set(code, room);
        socket.join(code);
        emitRoom(room);
        ackOk(ack, { code });
      } catch (error) {
        ackError(ack, error instanceof Error ? error.message : "Cr\xE9ation impossible.");
      }
    }
  );
  socket.on(
    "joinRoom",
    (payload, ack) => {
      try {
        const code = normalizeCode(payload.code);
        const room = rooms.get(code);
        if (!room) {
          throw new Error("Salon introuvable.");
        }
        if (room.round) {
          throw new Error("La partie est d\xE9j\xE0 commenc\xE9e.");
        }
        if (room.players.length >= room.playerCount) {
          throw new Error("Le salon est complet.");
        }
        const player = createPlayer(socket.id, payload.name, room.players.length);
        room.players.push(player);
        room.scores[player.id] = 0;
        socket.join(code);
        emitRoom(room);
        ackOk(ack, { code });
      } catch (error) {
        ackError(ack, error instanceof Error ? error.message : "Impossible de rejoindre.");
      }
    }
  );
  socket.on("startGame", (_payload, ack) => {
    withRoomAction(socket.id, ack, (room, player) => {
      if (room.hostId !== player.id) {
        throw new Error("Seul l'h\xF4te peut d\xE9marrer.");
      }
      if (room.round) {
        throw new Error("La partie est d\xE9j\xE0 d\xE9marr\xE9e.");
      }
      startRound(room);
    });
  });
  socket.on("placeBid", (payload, ack) => {
    withRoomAction(socket.id, ack, (room, player) => {
      if (!room.round) {
        throw new Error("Aucune manche en cours.");
      }
      placeBid(room.round, player.id, payload.contract);
    });
  });
  socket.on("callCard", (payload, ack) => {
    withRoomAction(socket.id, ack, (room, player) => {
      if (!room.round) {
        throw new Error("Aucune manche en cours.");
      }
      callPartnerCard(room.round, player.id, payload.suit, payload.rank);
    });
  });
  socket.on("discardDog", (payload, ack) => {
    withRoomAction(socket.id, ack, (room, player) => {
      if (!room.round) {
        throw new Error("Aucune manche en cours.");
      }
      discardDog(room.round, player.id, payload.cardIds);
    });
  });
  socket.on("playCard", (payload, ack) => {
    withRoomAction(socket.id, ack, (room, player) => {
      if (!room.round) {
        throw new Error("Aucune manche en cours.");
      }
      playCard(room.round, player.id, payload.cardId);
    });
  });
  socket.on("newRound", (_payload, ack) => {
    withRoomAction(socket.id, ack, (room) => {
      if (!room.round || room.round.phase !== "round_finished" && room.round.phase !== "passed-out") {
        throw new Error("Une nouvelle donne n'est pas encore disponible.");
      }
      room.dealerIndex = (room.dealerIndex + 1) % room.playerCount;
      startRound(room);
    });
  });
  socket.on("disconnect", () => {
    const room = getRoomForSocket(socket.id);
    if (!room) {
      return;
    }
    const player = getPlayerForSocket(room, socket.id);
    if (!player) {
      return;
    }
    const gameInProgress = room.round && room.round.phase !== "round_finished" && room.round.phase !== "passed-out";
    if (!gameInProgress) {
      room.players = room.players.filter((candidate) => candidate.id !== player.id);
      delete room.scores[player.id];
      if (room.hostId === player.id) {
        room.hostId = room.players[0]?.id;
      }
      if (room.players.length === 0) {
        rooms.delete(room.code);
        return;
      }
      room.players = room.players.map((candidate, index) => ({ ...candidate, seat: index }));
      emitRoom(room);
      return;
    }
    player.connected = false;
    room.blockedReason = `${player.name} est d\xE9connect\xE9. La manche est bloqu\xE9e.`;
    emitRoom(room);
  });
});
httpServer.listen(port, () => {
  console.log(`Tarot server listening on http://localhost:${port}`);
  console.log(`Serving client from ${clientDistDir}`);
  console.log(`Serving cards from ${cardsDir}`);
});
//# sourceMappingURL=index.js.map