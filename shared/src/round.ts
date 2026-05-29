import { createDeck, makeCalledCard, sortCards } from "./cards";
import { scoreRound, scoreTwoPlayerRound } from "./scoring";
import {
  CONTRACTS,
  SUITS,
  type ActiveContract,
  type Bid,
  type CalledRank,
  type Card,
  type CardPile,
  type CompletedTrick,
  type Contract,
  type PlayedCard,
  type PlayerCount,
  type PlayerId,
  type RoundState,
  type Suit
} from "./types";

export class RuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuleError";
  }
}

export const CONTRACT_STRENGTH: Record<Contract, number> = {
  pass: 0,
  petite: 1,
  garde: 2,
  "garde-sans": 3,
  "garde-contre": 4
};

const contractSet = new Set<Contract>(CONTRACTS);

export interface PlayValidation {
  ok: boolean;
  reason?: string;
}

export interface CreateRoundOptions {
  dealerIndex?: number;
  deck?: Card[];
  rng?: () => number;
}

export function fail(message: string): never {
  throw new RuleError(message);
}

function activeContract(contract: Contract): ActiveContract {
  if (contract === "pass") {
    fail("Passe n'est pas un contrat actif.");
  }
  return contract;
}

function assertContract(contract: Contract): void {
  if (!contractSet.has(contract)) {
    fail("Contrat inconnu.");
  }
}

function setPhase(round: RoundState, phase: RoundState["phase"]): void {
  round.phase = phase;
  if (round.phaseHistory.at(-1) !== phase) {
    round.phaseHistory.push(phase);
  }
}

export function getDogSize(playerCount: PlayerCount): number {
  if (playerCount === 2) {
    return 0;
  }
  return playerCount === 5 ? 3 : 6;
}

export function getHandSize(playerCount: PlayerCount): number {
  if (playerCount === 2) {
    return 15;
  }
  if (playerCount === 3) {
    return 24;
  }
  return playerCount === 4 ? 18 : 15;
}

export function isDogContract(contract: ActiveContract): boolean {
  return contract === "petite" || contract === "garde";
}

export function shuffleCards(cards: Card[], rng: () => number = Math.random): Card[] {
  const shuffled = [...cards];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    const current = shuffled[index];
    const swap = shuffled[swapIndex];
    if (!current || !swap) {
      fail("Erreur interne pendant le mélange.");
    }
    shuffled[index] = swap;
    shuffled[swapIndex] = current;
  }
  return shuffled;
}

export function dealCards(
  playerIds: PlayerId[],
  playerCount: PlayerCount,
  deck: Card[]
): { hands: Record<PlayerId, Card[]>; dog: Card[] } {
  if (playerCount === 2) {
    fail("Le mode 2 joueurs utilise une distribution avec piles.");
  }

  if (playerIds.length !== playerCount) {
    fail(`La distribution attend ${playerCount} joueurs.`);
  }

  if (deck.length !== 78) {
    fail(`Le deck doit contenir 78 cartes, reçu: ${deck.length}.`);
  }

  const hands = Object.fromEntries(playerIds.map((playerId) => [playerId, []])) as Record<
    PlayerId,
    Card[]
  >;
  const handSize = getHandSize(playerCount);
  let cursor = 0;

  for (const playerId of playerIds) {
    hands[playerId] = sortCards(deck.slice(cursor, cursor + handSize));
    cursor += handSize;
  }

  const dog = deck.slice(cursor, cursor + getDogSize(playerCount));
  return { hands, dog };
}

export function dealTwoPlayerCards(
  playerIds: PlayerId[],
  deck: Card[]
): { hands: Record<PlayerId, Card[]>; piles: Record<PlayerId, CardPile[]>; dog: Card[] } {
  if (playerIds.length !== 2) {
    fail("La distribution à 2 joueurs attend exactement 2 joueurs.");
  }

  if (deck.length !== 78) {
    fail(`Le deck doit contenir 78 cartes, reçu: ${deck.length}.`);
  }

  const hands = Object.fromEntries(playerIds.map((playerId) => [playerId, []])) as Record<
    PlayerId,
    Card[]
  >;
  const piles = Object.fromEntries(playerIds.map((playerId) => [playerId, []])) as Record<
    PlayerId,
    CardPile[]
  >;
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

function emptyPiles(playerIds: PlayerId[]): Record<PlayerId, CardPile[]> {
  return Object.fromEntries(playerIds.map((playerId) => [playerId, []])) as Record<
    PlayerId,
    CardPile[]
  >;
}

export function createRoundState(
  playerIds: PlayerId[],
  playerCount: PlayerCount,
  options: CreateRoundOptions = {}
): RoundState {
  const dealerIndex = options.dealerIndex ?? 0;
  if (dealerIndex < 0 || dealerIndex >= playerIds.length) {
    fail("Index de donneur invalide.");
  }

  const deck = options.deck ? [...options.deck] : shuffleCards(createDeck(), options.rng);
  const dealt =
    playerCount === 2
      ? dealTwoPlayerCards(playerIds, deck)
      : { ...dealCards(playerIds, playerCount, deck), piles: emptyPiles(playerIds) };
  const wonCards = Object.fromEntries(playerIds.map((playerId) => [playerId, []])) as Record<
    PlayerId,
    Card[]
  >;

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

function getPlayerAt(round: RoundState, index: number): PlayerId {
  const playerId = round.playerIds[index];
  if (!playerId) {
    fail("Joueur introuvable.");
  }
  return playerId;
}

export function getCurrentPlayerId(round: RoundState): PlayerId {
  return getPlayerAt(round, round.currentTurnIndex);
}

function getHand(round: RoundState, playerId: PlayerId): Card[] {
  const hand = round.hands[playerId];
  if (!hand) {
    fail("Main introuvable.");
  }
  return hand;
}

function getPiles(round: RoundState, playerId: PlayerId): CardPile[] {
  const piles = round.piles[playerId];
  if (!piles) {
    fail("Piles introuvables.");
  }
  return piles;
}

function getWonPile(round: RoundState, playerId: PlayerId): Card[] {
  const pile = round.wonCards[playerId];
  if (!pile) {
    fail("Pile de plis introuvable.");
  }
  return pile;
}

function getTakerId(round: RoundState): PlayerId {
  if (!round.takerId) {
    fail("Aucun preneur défini.");
  }
  return round.takerId;
}

function getWinningContract(round: RoundState): ActiveContract {
  if (!round.winningBid) {
    fail("Aucun contrat gagnant défini.");
  }
  return round.winningBid.contract;
}

export function canBid(currentWinningBid: WinningBidLike | undefined, contract: Contract): boolean {
  assertContract(contract);
  if (contract === "pass") {
    return true;
  }
  return CONTRACT_STRENGTH[contract] > CONTRACT_STRENGTH[currentWinningBid?.contract ?? "pass"];
}

interface WinningBidLike {
  contract: Contract;
}

export function placeBid(round: RoundState, playerId: PlayerId, contract: Contract): RoundState {
  if (round.phase !== "bidding") {
    fail("Les enchères ne sont pas ouvertes.");
  }
  assertContract(contract);

  if (playerId !== getCurrentPlayerId(round)) {
    fail("Ce n'est pas le tour de ce joueur d'enchérir.");
  }

  if (!canBid(round.winningBid, contract)) {
    fail("Cette enchère ne surenchérit pas le contrat courant.");
  }

  const bid: Bid = { playerId, contract };
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

function finishBidding(round: RoundState): void {
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

function enterAfterTakerKnown(round: RoundState): void {
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

function beginDogPhase(round: RoundState): void {
  const takerId = getTakerId(round);
  setPhase(round, "dog_reveal");
  round.dogRevealed = true;
  round.currentTurnIndex = round.playerIds.indexOf(takerId);
  round.hands[takerId] = sortCards([...getHand(round, takerId), ...round.dog]);
  setPhase(round, "discard");
}

function beginPlayingPhase(round: RoundState): void {
  setPhase(round, "playing");
  round.currentTurnIndex = (round.dealerIndex + 1) % round.playerCount;
  round.leaderId = getCurrentPlayerId(round);
}

function hasEveryRank(hand: Card[], rank: CalledRank): boolean {
  return SUITS.every((suit) =>
    hand.some((card) => card.kind === "suit" && card.suit === suit && card.rank === rank)
  );
}

export function getAllowedCalledRanks(hand: Card[]): CalledRank[] {
  const ranks: CalledRank[] = ["R"];
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

export function callPartnerCard(
  round: RoundState,
  playerId: PlayerId,
  suit: Suit,
  rank: CalledRank
): RoundState {
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

function findHolder(round: RoundState, cardId: string): PlayerId | undefined {
  for (const playerId of round.playerIds) {
    if (getHand(round, playerId).some((card) => card.id === cardId)) {
      return playerId;
    }
  }

  return round.dog.some((card) => card.id === cardId) ? undefined : undefined;
}

export function validateDogDiscard(round: RoundState, playerId: PlayerId, cardIds: string[]): void {
  if (round.phase !== "discard") {
    fail("Il n'y a pas d'écart à faire.");
  }

  const takerId = getTakerId(round);
  if (playerId !== takerId) {
    fail("Seul le preneur peut faire l'écart.");
  }

  const discardSize = getDogSize(round.playerCount);
  const uniqueIds = new Set(cardIds);
  if (uniqueIds.size !== cardIds.length || cardIds.length !== discardSize) {
    fail(`L'écart doit contenir exactement ${discardSize} cartes distinctes.`);
  }

  const hand = getHand(round, playerId);
  const selected = cardIds.map((cardId) => {
    const card = hand.find((candidate) => candidate.id === cardId);
    if (!card) {
      fail("Une carte de l'écart n'est pas dans la main du preneur.");
    }
    return card;
  });

  const plainEligibleCount = hand.filter(
    (card) => card.kind === "suit" && card.rank !== "R" && !card.isOudler
  ).length;
  const trumpsAllowed = plainEligibleCount < discardSize;

  for (const card of selected) {
    if (card.isOudler) {
      fail("Les bouts ne peuvent pas être écartés.");
    }
    if (card.kind === "suit" && card.rank === "R") {
      fail("Les Rois ne peuvent pas être écartés.");
    }
    if (round.calledCard && card.id === round.calledCard.id) {
      fail("La carte appelée ne peut pas être écartée.");
    }
    if (card.kind === "trump" && !trumpsAllowed) {
      fail(
        "Un atout ne peut être écarté que si l'écart est impossible avec les cartes de couleur autorisées."
      );
    }
  }
}

export function discardDog(round: RoundState, playerId: PlayerId, cardIds: string[]): RoundState {
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

function getLedConstraint(
  trick: PlayedCard[]
): { kind: "suit"; suit: Suit } | { kind: "trump" } | undefined {
  const firstEffectiveCard = trick.find((played) => played.card.kind !== "excuse")?.card;
  if (!firstEffectiveCard) {
    return undefined;
  }
  if (firstEffectiveCard.kind === "trump") {
    return { kind: "trump" };
  }
  if (!firstEffectiveCard.suit) {
    fail("Carte de couleur sans couleur.");
  }
  return { kind: "suit", suit: firstEffectiveCard.suit };
}

function highestTrumpInTrick(trick: PlayedCard[]): number {
  return trick.reduce((highest, played) => {
    if (played.card.kind !== "trump" || played.card.trump === undefined) {
      return highest;
    }
    return Math.max(highest, played.card.trump);
  }, 0);
}

function shouldApplyCalledSuitLeadRestriction(round: RoundState): boolean {
  return Boolean(round.playerCount === 5 && round.calledCard && !round.calledCardPlayed);
}

function getVisiblePileCards(round: RoundState, playerId: PlayerId): Card[] {
  if (round.playerCount !== 2) {
    return [];
  }
  return getPiles(round, playerId).flatMap((pile) => (pile.cards[0] ? [pile.cards[0]] : []));
}

function getAvailableCardsForRules(round: RoundState, playerId: PlayerId): Card[] {
  return round.playerCount === 2
    ? [...getHand(round, playerId), ...getVisiblePileCards(round, playerId)]
    : getHand(round, playerId);
}

function isCardPlayableByPlayer(round: RoundState, playerId: PlayerId, cardId: string): boolean {
  return getAvailableCardsForRules(round, playerId).some((card) => card.id === cardId);
}

export function validatePlay(round: RoundState, playerId: PlayerId, card: Card): PlayValidation {
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
    if (
      shouldApplyCalledSuitLeadRestriction(round) &&
      round.calledCard &&
      card.kind === "suit" &&
      card.suit === round.calledCard.suit &&
      card.id !== round.calledCard.id
    ) {
      return {
        ok: false,
        reason:
          "L'entame dans la couleur appelée est interdite tant que la carte appelée n'a pas été jouée."
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
      return card.kind === "suit" && card.suit === led.suit
        ? { ok: true }
        : { ok: false, reason: "Le joueur doit fournir la couleur demandée." };
    }

    const trumpCards = availableCards.filter((candidate) => candidate.kind === "trump");
    if (trumpCards.length === 0) {
      return { ok: true };
    }

    if (card.kind !== "trump") {
      return { ok: false, reason: "Le joueur doit couper à l'atout." };
    }

    return validateTrumpRise(trumpCards, highestTrumpInTrick(round.currentTrick), card);
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

function validateTrumpRise(
  trumpCards: Card[],
  currentHighestTrump: number,
  card: Card
): PlayValidation {
  const canRise = trumpCards.some((trump) => (trump.trump ?? 0) > currentHighestTrump);
  if (canRise && (card.trump ?? 0) <= currentHighestTrump) {
    return { ok: false, reason: "Le joueur doit monter à l'atout s'il le peut." };
  }
  return { ok: true };
}

export function getPlayableCards(round: RoundState, playerId: PlayerId): Card[] {
  if (round.phase !== "playing" || playerId !== getCurrentPlayerId(round)) {
    return [];
  }
  return getAvailableCardsForRules(round, playerId).filter(
    (card) => validatePlay(round, playerId, card).ok
  );
}

export function playCard(round: RoundState, playerId: PlayerId, cardId: string): RoundState {
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

function removePlayedCard(round: RoundState, playerId: PlayerId, cardId: string): void {
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

export function determineTrickWinner(cards: PlayedCard[]): PlayerId {
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

function firstPlayed(cards: PlayedCard[]): PlayedCard {
  const first = cards[0];
  if (!first) {
    fail("Pli vide.");
  }
  return first;
}

function highestPlay(cards: PlayedCard[]): PlayedCard {
  const first = firstPlayed(cards);
  return cards
    .slice(1)
    .reduce((best, played) => (played.card.strength > best.card.strength ? played : best), first);
}

function completeCurrentTrick(round: RoundState): void {
  setPhase(round, "trick_resolution");
  const cards = [...round.currentTrick];
  const winnerId = determineTrickWinner(cards);
  const leaderId = round.leaderId ?? firstPlayed(cards).playerId;
  const completedTrick: CompletedTrick = {
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

function hasRemainingCards(round: RoundState, playerId: PlayerId): boolean {
  return (
    getHand(round, playerId).length > 0 ||
    getPiles(round, playerId).some((pile) => pile.cards.length > 0)
  );
}
