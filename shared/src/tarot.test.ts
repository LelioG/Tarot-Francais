import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  callPartnerCard,
  CONTRACT_MULTIPLIERS,
  createDeck,
  createRoundState,
  createSuitCard,
  createTrumpCard,
  dealCards,
  dealTwoPlayerCards,
  determineTrickWinner,
  discardDog,
  findCardById,
  getAllowedCalledRanks,
  getCardImagePath,
  getPublicGameStateForPlayer,
  getPlayableCards,
  getCurrentPlayerId,
  getThreshold,
  placeBid,
  playCard,
  scoreRound,
  scoreTwoPlayerRound,
  SUITS,
  validatePlay,
  type ActiveContract,
  type Card,
  type Contract,
  type PlayerCount,
  type PlayerId,
  type RoundState
} from "./index";

const players2 = ["p1", "p2"];
const players3 = ["p1", "p2", "p3"];
const players4 = ["p1", "p2", "p3", "p4"];
const players5 = ["p1", "p2", "p3", "p4", "p5"];

function assetExists(imagePath: string): boolean {
  return existsSync(
    path.join(process.cwd(), "client", "public", "cards", imagePath.replace("/cards/", ""))
  );
}

function baseRound(playerIds: PlayerId[], playerCount: PlayerCount): RoundState {
  return createRoundState(playerIds, playerCount, {
    dealerIndex: playerCount - 1,
    deck: createDeck()
  });
}

function scoringCard(id: string, points: number, isOudler = false): Card {
  return {
    id,
    kind: "suit",
    suit: "heart",
    rank: "1",
    name: id,
    points,
    strength: 1,
    imagePath: "/cards/heart/coeur1.svg",
    isOudler
  };
}

function cardsFor(total: number, oudlerCount: number): Card[] {
  const cards: Card[] = [];
  for (let index = 0; index < oudlerCount; index += 1) {
    cards.push(scoringCard(`oudler-${index}`, 4.5, true));
  }

  let remaining = total - oudlerCount * 4.5;
  let index = 0;
  while (remaining > 0) {
    const value = Math.min(4.5, remaining);
    cards.push(scoringCard(`point-${index}`, value));
    remaining -= value;
    index += 1;
  }
  return cards;
}

function scoringRound(
  playerIds: PlayerId[],
  playerCount: PlayerCount,
  contract: ActiveContract,
  takerId: PlayerId,
  partnerId: PlayerId | null,
  takerPoints: number,
  oudlerCount: number
): RoundState {
  const round = baseRound(playerIds, playerCount);
  round.phase = "round_finished";
  round.phaseHistory.push("round_finished");
  round.winningBid = { playerId: takerId, contract };
  round.takerId = takerId;
  round.partnerId = partnerId;
  round.wonCards = Object.fromEntries(playerIds.map((playerId) => [playerId, []])) as Record<
    PlayerId,
    Card[]
  >;
  round.wonCards[takerId] = cardsFor(takerPoints, oudlerCount);
  return round;
}

function honors(rank: "R" | "D" | "C" | "V"): Card[] {
  return SUITS.map((suit) => createSuitCard(suit, rank));
}

function makePublicState(round: RoundState) {
  return {
    code: "ROOM1",
    playerCount: round.playerCount,
    players: round.playerIds.map((playerId, seat) => ({
      id: playerId,
      name: playerId,
      seat,
      connected: true
    })),
    scores: Object.fromEntries(round.playerIds.map((playerId) => [playerId, 0])) as Record<
      PlayerId,
      number
    >,
    history: [],
    round
  };
}

function finishAuction(round: RoundState, firstContract: Contract): RoundState {
  placeBid(round, round.playerIds[0] as PlayerId, firstContract);
  for (const playerId of round.playerIds.slice(1)) {
    placeBid(round, playerId, "pass");
  }
  return round;
}

describe("deck et assets", () => {
  it("applique exactement les valeurs des cartes", () => {
    expect(createTrumpCard(1).points).toBe(4.5);
    expect(createTrumpCard(21).points).toBe(4.5);
    expect(findCardById("excuse").points).toBe(4.5);
    expect(createSuitCard("heart", "R").points).toBe(4.5);
    expect(createSuitCard("heart", "D").points).toBe(3.5);
    expect(createSuitCard("heart", "C").points).toBe(2.5);
    expect(createSuitCard("heart", "V").points).toBe(1.5);
    expect(createSuitCard("heart", "2").points).toBe(0.5);
  });

  it("crée un deck complet de Tarot français", () => {
    const deck = createDeck();

    expect(deck).toHaveLength(78);
    expect(new Set(deck.map((card) => card.id)).size).toBe(78);
    expect(deck.filter((card) => card.kind === "suit")).toHaveLength(56);
    expect(deck.filter((card) => card.kind === "trump")).toHaveLength(21);
    expect(deck.filter((card) => card.kind === "excuse")).toHaveLength(1);
    expect(deck.reduce((sum, card) => sum + card.points, 0)).toBe(91);
  });

  it("associe les cartes aux SVG locaux embarqués dans client/public/cards", () => {
    const cards = [
      createSuitCard("heart", "R"),
      createSuitCard("diamond", "10"),
      createSuitCard("club", "V"),
      createSuitCard("spade", "C"),
      createTrumpCard(21),
      findCardById("excuse")
    ];

    expect(getCardImagePath(cards[0])).toBe("/cards/heart/coeurR.svg");
    expect(getCardImagePath(cards[1])).toBe("/cards/diamond/caro10.svg");
    expect(getCardImagePath(cards[2])).toBe("/cards/club/trefleV.svg");
    expect(getCardImagePath(cards[3])).toBe("/cards/spades/piqueC.svg");
    expect(getCardImagePath(cards[4])).toBe("/cards/trumps/21.svg");
    expect(getCardImagePath(cards[5])).toBe("/cards/trumps/excuse.svg");
    expect(cards.every((card) => assetExists(card.imagePath))).toBe(true);
  });
});

describe("distribution et enchères", () => {
  function expectFullDistribution(hands: Record<PlayerId, Card[]>, dog: Card[]) {
    const allCards = [...Object.values(hands).flat(), ...dog];
    expect(allCards).toHaveLength(78);
    expect(new Set(allCards.map((card) => card.id)).size).toBe(78);
  }

  it("distribue 24 cartes à 3 joueurs et 6 cartes au chien", () => {
    const { hands, dog } = dealCards(players3, 3, createDeck());
    expect(players3.every((playerId) => hands[playerId]?.length === 24)).toBe(true);
    expect(dog).toHaveLength(6);
    expectFullDistribution(hands, dog);
  });

  it("distribue 18 cartes à 4 joueurs et 6 cartes au chien", () => {
    const { hands, dog } = dealCards(players4, 4, createDeck());
    expect(players4.every((playerId) => hands[playerId]?.length === 18)).toBe(true);
    expect(dog).toHaveLength(6);
    expectFullDistribution(hands, dog);
  });

  it("distribue 15 cartes à 5 joueurs et 3 cartes au chien", () => {
    const { hands, dog } = dealCards(players5, 5, createDeck());
    expect(players5.every((playerId) => hands[playerId]?.length === 15)).toBe(true);
    expect(dog).toHaveLength(3);
    expectFullDistribution(hands, dog);
  });

  it("n'expose jamais les mains privées dans l'état public", () => {
    const round = baseRound(players4, 4);
    const publicForP1 = getPublicGameStateForPlayer(makePublicState(round), "p1");

    expect(publicForP1.you?.hand.map((card) => card.id)).toEqual(
      round.hands.p1?.map((card) => card.id)
    );
    expect(
      publicForP1.you?.hand.some((card) => round.hands.p2?.some((other) => other.id === card.id))
    ).toBe(false);
    expect(publicForP1.players.find((player) => player.id === "p2")?.cardCount).toBe(18);
  });

  it("valide l'ordre des enchères et la surenchère", () => {
    const round = baseRound(players4, 4);

    placeBid(round, "p1", "pass");
    placeBid(round, "p2", "petite");
    expect(() => placeBid(round, "p3", "petite")).toThrow();
    placeBid(round, "p3", "garde");
    placeBid(round, "p4", "pass");

    expect(round.takerId).toBe("p3");
    expect(round.winningBid?.contract).toBe("garde");
    expect(round.phase).toBe("discard");
  });

  it.each<Contract>(["pass", "petite", "garde", "garde-sans", "garde-contre"])(
    "autorise l'enchère %s quand elle est légale",
    (contract) => {
      const round = baseRound(players4, 4);
      expect(() => placeBid(round, "p1", contract)).not.toThrow();
    }
  );

  it("refuse une enchère inférieure, égale, hors tour ou inconnue", () => {
    const lower = baseRound(players4, 4);
    placeBid(lower, "p1", "garde");
    expect(() => placeBid(lower, "p2", "petite")).toThrow();

    const equal = baseRound(players4, 4);
    placeBid(equal, "p1", "garde");
    expect(() => placeBid(equal, "p2", "garde")).toThrow();

    const outOfTurn = baseRound(players4, 4);
    expect(() => placeBid(outOfTurn, "p2", "petite")).toThrow();

    const unknown = baseRound(players4, 4);
    expect(() => placeBid(unknown, "p1", "coinche" as Contract)).toThrow();
  });

  it("annule la manche si tous les joueurs passent", () => {
    const round = baseRound(players4, 4);
    for (const playerId of players4) {
      placeBid(round, playerId, "pass");
    }

    expect(round.phase).toBe("passed-out");
    expect(round.takerId).toBeUndefined();
    expect(round.winningBid).toBeUndefined();
  });
});

describe("mode 2 joueurs - variante 15 cartes + 6 tas", () => {
  it("distribue 15 cartes en main, 6 tas de 4 cartes, sans chien ni doublon", () => {
    const { hands, piles, dog } = dealTwoPlayerCards(players2, createDeck());
    const allCards = [
      ...Object.values(hands).flat(),
      ...Object.values(piles).flatMap((playerPiles) => playerPiles.flatMap((pile) => pile.cards))
    ];

    expect(players2.every((playerId) => hands[playerId]?.length === 15)).toBe(true);
    expect(players2.every((playerId) => piles[playerId]?.length === 6)).toBe(true);
    expect(
      Object.values(piles).every((playerPiles) =>
        playerPiles.every((pile) => pile.cards.length === 4)
      )
    ).toBe(true);
    expect(dog).toHaveLength(0);
    expect(allCards).toHaveLength(78);
    expect(new Set(allCards.map((card) => card.id)).size).toBe(78);
  });

  it("démarre directement en playing sans enchères, chien ni écart", () => {
    const round = baseRound(players2, 2);

    expect(round.phase).toBe("playing");
    expect(round.phaseHistory).toEqual(["dealing", "playing"]);
    expect(round.bids).toHaveLength(0);
    expect(round.dog).toHaveLength(0);
    expect(round.discard).toHaveLength(0);
    expect(() => placeBid(round, "p1", "petite")).toThrow();
    expect(() => discardDog(round, "p1", [])).toThrow();
  });

  it("filtre l'état public sans main adverse ni cartes cachées adverses", () => {
    const round = baseRound(players2, 2);
    round.hands.p1 = [createSuitCard("heart", "1")];
    round.hands.p2 = [createSuitCard("spade", "1")];
    round.piles.p1 = [{ cards: [createSuitCard("club", "1"), createSuitCard("club", "2")] }];
    round.piles.p2 = [{ cards: [createSuitCard("diamond", "1"), createSuitCard("diamond", "2")] }];

    const publicForP1 = getPublicGameStateForPlayer(makePublicState(round), "p1");
    const serialized = JSON.stringify(publicForP1);

    expect(publicForP1.you?.hand.map((card) => card.id)).toEqual(["suit-heart-1"]);
    expect(publicForP1.piles.p2?.[0]?.visibleCard?.id).toBe("suit-diamond-1");
    expect(publicForP1.piles.p2?.[0]?.remaining).toBe(2);
    expect(serialized).not.toContain("suit-spade-1");
    expect(serialized).not.toContain("suit-diamond-2");
  });

  it("révèle la carte suivante après avoir joué une carte visible d'un tas", () => {
    const round = baseRound(players2, 2);
    round.currentTurnIndex = 0;
    round.hands.p1 = [];
    round.hands.p2 = [createSuitCard("heart", "2")];
    round.piles.p1 = [{ cards: [createSuitCard("heart", "1"), createSuitCard("club", "1")] }];
    round.piles.p2 = [];

    expect(
      getPublicGameStateForPlayer(makePublicState(round), "p1").piles.p1?.[0]?.visibleCard?.id
    ).toBe("suit-heart-1");
    playCard(round, "p1", "suit-heart-1");
    expect(
      getPublicGameStateForPlayer(makePublicState(round), "p1").piles.p1?.[0]?.visibleCard?.id
    ).toBe("suit-club-1");
  });

  it("joue une carte de la main ou une carte visible d'un tas et refuse cachée, adverse ou hors tour", () => {
    const round = baseRound(players2, 2);
    round.currentTurnIndex = 0;
    round.hands.p1 = [createSuitCard("heart", "1")];
    round.hands.p2 = [createSuitCard("heart", "2")];
    round.piles.p1 = [{ cards: [createSuitCard("club", "1"), createSuitCard("club", "2")] }];
    round.piles.p2 = [{ cards: [createSuitCard("spade", "1")] }];

    expect(validatePlay(round, "p1", createSuitCard("heart", "1")).ok).toBe(true);
    expect(validatePlay(round, "p1", createSuitCard("club", "1")).ok).toBe(true);
    expect(validatePlay(round, "p1", createSuitCard("club", "2")).ok).toBe(false);
    expect(validatePlay(round, "p1", createSuitCard("spade", "1")).ok).toBe(false);
    expect(validatePlay(round, "p2", createSuitCard("heart", "2")).ok).toBe(false);
  });

  it("applique les obligations avec la main et les cartes visibles, sans compter les cartes cachées", () => {
    const round = baseRound(players2, 2);
    round.currentTurnIndex = 1;
    round.currentTrick = [{ playerId: "p1", card: createSuitCard("heart", "10") }];
    round.hands.p2 = [createSuitCard("spade", "1")];
    round.piles.p2 = [{ cards: [createSuitCard("heart", "1")] }];

    expect(validatePlay(round, "p2", createSuitCard("spade", "1")).ok).toBe(false);
    expect(validatePlay(round, "p2", createSuitCard("heart", "1")).ok).toBe(true);

    round.piles.p2 = [{ cards: [createSuitCard("club", "1"), createSuitCard("heart", "1")] }];
    expect(validatePlay(round, "p2", createSuitCard("spade", "1")).ok).toBe(true);
  });

  it("impose la coupe visible et autorise la défausse sans couleur ni atout visible", () => {
    const round = baseRound(players2, 2);
    round.currentTurnIndex = 1;
    round.currentTrick = [{ playerId: "p1", card: createSuitCard("heart", "10") }];
    round.hands.p2 = [createSuitCard("spade", "1")];
    round.piles.p2 = [{ cards: [createTrumpCard(3)] }];

    expect(validatePlay(round, "p2", createSuitCard("spade", "1")).ok).toBe(false);
    expect(validatePlay(round, "p2", createTrumpCard(3)).ok).toBe(true);

    round.piles.p2 = [{ cards: [createSuitCard("club", "1")] }];
    expect(validatePlay(round, "p2", createSuitCard("spade", "1")).ok).toBe(true);
  });

  it("calcule le gagnant du pli et le fait commencer le pli suivant", () => {
    const round = baseRound(players2, 2);
    round.currentTurnIndex = 0;
    round.leaderId = "p1";
    round.hands.p1 = [createSuitCard("heart", "1"), createSuitCard("club", "1")];
    round.hands.p2 = [createSuitCard("heart", "R"), createSuitCard("club", "2")];
    round.piles.p1 = [];
    round.piles.p2 = [];

    playCard(round, "p1", "suit-heart-1");
    playCard(round, "p2", "suit-heart-R");

    expect(round.tricks.at(-1)?.winnerId).toBe("p2");
    expect(getCurrentPlayerId(round)).toBe("p2");
  });

  it("gère l'Excuse depuis la main ou un tas visible, mais pas cachée", () => {
    const handRound = baseRound(players2, 2);
    handRound.currentTurnIndex = 0;
    handRound.hands.p1 = [findCardById("excuse")];
    handRound.piles.p1 = [];
    expect(validatePlay(handRound, "p1", findCardById("excuse")).ok).toBe(true);

    const visibleRound = baseRound(players2, 2);
    visibleRound.currentTurnIndex = 0;
    visibleRound.hands.p1 = [];
    visibleRound.piles.p1 = [{ cards: [findCardById("excuse")] }];
    expect(validatePlay(visibleRound, "p1", findCardById("excuse")).ok).toBe(true);
    expect(getPlayableCards(visibleRound, "p1").some((card) => card.id === "excuse")).toBe(true);

    const hiddenRound = baseRound(players2, 2);
    hiddenRound.currentTurnIndex = 0;
    hiddenRound.hands.p1 = [];
    hiddenRound.piles.p1 = [{ cards: [createSuitCard("club", "1"), findCardById("excuse")] }];
    expect(validatePlay(hiddenRound, "p1", findCardById("excuse")).ok).toBe(false);
  });

  it("laisse l'Excuse au bon joueur et ne lui fait pas gagner le pli", () => {
    const round = baseRound(players2, 2);
    round.currentTurnIndex = 0;
    round.leaderId = "p1";
    round.hands.p1 = [findCardById("excuse")];
    round.hands.p2 = [createSuitCard("heart", "1")];
    round.piles.p1 = [];
    round.piles.p2 = [];

    playCard(round, "p1", "excuse");
    playCard(round, "p2", "suit-heart-1");

    expect(round.tricks.at(-1)?.winnerId).toBe("p2");
    expect(round.wonCards.p1?.map((card) => card.id)).toContain("excuse");
    expect(round.roundResult?.mode).toBe("duel");
    expect(round.roundResult?.mode === "duel" ? round.roundResult.pointsByPlayer.p1 : 0).toBe(4.5);
  });

  it("compte les points du duel et produit un score zéro-somme", () => {
    const round = baseRound(players2, 2);
    round.wonCards.p1 = [createSuitCard("heart", "R"), createTrumpCard(1)];
    round.wonCards.p2 = createDeck().filter(
      (card) => !round.wonCards.p1?.some((wonCard) => wonCard.id === card.id)
    );

    const result = scoreTwoPlayerRound(round);
    expect(result.pointsByPlayer.p1).toBe(9);
    expect(result.pointsByPlayer.p2).toBe(82);
    expect(result.totalPoints).toBe(91);
    expect(result.winnerId).toBe("p2");
    expect(result.margin).toBe(73);
    expect(Object.values(result.deltas).reduce((sum, delta) => sum + delta, 0)).toBe(0);
  });

  it("termine la manche après 39 plis et toutes les cartes jouées", () => {
    const round = baseRound(players2, 2);

    while (round.phase !== "round_finished") {
      const playerId = getCurrentPlayerId(round);
      const card = getPlayableCards(round, playerId)[0];
      expect(card).toBeDefined();
      playCard(round, playerId, card?.id ?? "");
    }

    expect(round.tricks).toHaveLength(39);
    expect(round.playerIds.every((playerId) => round.hands[playerId]?.length === 0)).toBe(true);
    expect(
      round.playerIds.every((playerId) =>
        round.piles[playerId]?.every((pile) => pile.cards.length === 0)
      )
    ).toBe(true);
    expect(round.wonCards.p1?.length + round.wonCards.p2?.length).toBe(78);
    expect(round.roundResult?.mode).toBe("duel");
  });
});

describe("appel du Roi à 5 joueurs", () => {
  it("détermine les rangs appelables selon les honneurs du preneur", () => {
    const kings = honors("R");
    const queens = honors("D");
    const knights = honors("C");

    expect(getAllowedCalledRanks([createSuitCard("heart", "R")])).toEqual(["R"]);
    expect(getAllowedCalledRanks(kings)).toEqual(["R", "D"]);
    expect(getAllowedCalledRanks([...kings, ...queens])).toEqual(["R", "D", "C"]);
    expect(getAllowedCalledRanks([...kings, ...queens, ...knights])).toEqual(["R", "D", "C", "V"]);
  });

  it("assigne secrètement le partenaire qui possède la carte appelée", () => {
    const round = baseRound(players5, 5);
    round.phase = "king_call";
    round.takerId = "p1";
    round.winningBid = { playerId: "p1", contract: "garde" };
    round.hands.p1 = [createSuitCard("club", "1")];
    round.hands.p2 = [createSuitCard("heart", "R")];

    callPartnerCard(round, "p1", "heart", "R");

    expect(round.calledCard?.id).toBe("suit-heart-R");
    expect(round.partnerId).toBe("p2");
    expect(round.partnerRevealed).toBe(false);
  });

  it("autorise l'appel d'une Dame seulement avec les 4 Rois", () => {
    const refused = baseRound(players5, 5);
    refused.phase = "king_call";
    refused.takerId = "p1";
    refused.winningBid = { playerId: "p1", contract: "garde-sans" };
    refused.hands.p1 = [createSuitCard("club", "R"), createSuitCard("diamond", "R")];

    expect(() => callPartnerCard(refused, "p1", "heart", "D")).toThrow();

    const allowed = baseRound(players5, 5);
    allowed.phase = "king_call";
    allowed.takerId = "p1";
    allowed.winningBid = { playerId: "p1", contract: "garde-sans" };
    allowed.hands.p1 = honors("R");

    expect(() => callPartnerCard(allowed, "p1", "heart", "D")).not.toThrow();
  });

  it("autorise l'appel d'un Cavalier seulement avec les 4 Rois et les 4 Dames", () => {
    const refused = baseRound(players5, 5);
    refused.phase = "king_call";
    refused.takerId = "p1";
    refused.winningBid = { playerId: "p1", contract: "garde-sans" };
    refused.hands.p1 = honors("R");

    expect(() => callPartnerCard(refused, "p1", "heart", "C")).toThrow();

    const allowed = baseRound(players5, 5);
    allowed.phase = "king_call";
    allowed.takerId = "p1";
    allowed.winningBid = { playerId: "p1", contract: "garde-sans" };
    allowed.hands.p1 = [...honors("R"), ...honors("D")];

    expect(() => callPartnerCard(allowed, "p1", "heart", "C")).not.toThrow();
  });

  it("autorise l'appel d'un Valet seulement avec les 4 Rois, 4 Dames et 4 Cavaliers", () => {
    const refused = baseRound(players5, 5);
    refused.phase = "king_call";
    refused.takerId = "p1";
    refused.winningBid = { playerId: "p1", contract: "garde-sans" };
    refused.hands.p1 = [...honors("R"), ...honors("D")];

    expect(() => callPartnerCard(refused, "p1", "heart", "V")).toThrow();

    const allowed = baseRound(players5, 5);
    allowed.phase = "king_call";
    allowed.takerId = "p1";
    allowed.winningBid = { playerId: "p1", contract: "garde-sans" };
    allowed.hands.p1 = [...honors("R"), ...honors("D"), ...honors("C")];

    expect(() => callPartnerCard(allowed, "p1", "heart", "V")).not.toThrow();
  });

  it("passe en solo quand la carte appelée est au chien", () => {
    const round = baseRound(players5, 5);
    round.phase = "king_call";
    round.takerId = "p1";
    round.winningBid = { playerId: "p1", contract: "garde-sans" };
    round.hands.p1 = [createSuitCard("club", "1")];
    round.hands.p2 = [];
    round.hands.p3 = [];
    round.hands.p4 = [];
    round.hands.p5 = [];
    round.dog = [createSuitCard("heart", "R")];

    callPartnerCard(round, "p1", "heart", "R");

    expect(round.partnerId).toBeNull();
    expect(round.takerBonusCards.map((card) => card.id)).toContain("suit-heart-R");
    expect(round.phase).toBe("playing");
  });

  it("passe en solo quand le preneur s'appelle lui-même", () => {
    const round = baseRound(players5, 5);
    round.phase = "king_call";
    round.takerId = "p1";
    round.winningBid = { playerId: "p1", contract: "garde-contre" };
    round.hands.p1 = [createSuitCard("heart", "R")];

    callPartnerCard(round, "p1", "heart", "R");

    expect(round.partnerId).toBeNull();
    expect(round.phase).toBe("playing");
  });

  it("cache puis révèle le partenaire quand la carte appelée est jouée", () => {
    const round = baseRound(players5, 5);
    round.phase = "playing";
    round.takerId = "p1";
    round.winningBid = { playerId: "p1", contract: "garde-sans" };
    round.calledCard = createSuitCard("heart", "R");
    round.partnerId = "p2";
    round.currentTurnIndex = 1;
    round.hands.p2 = [createSuitCard("heart", "R")];

    const publicBefore = getPublicGameStateForPlayer(makePublicState(round), "p3");
    expect(publicBefore.partner).toEqual({ status: "hidden" });

    playCard(round, "p2", "suit-heart-R");

    const publicAfter = getPublicGameStateForPlayer(makePublicState(round), "p3");
    expect(round.partnerRevealed).toBe(true);
    expect(publicAfter.partner).toEqual({ status: "revealed", playerId: "p2" });
  });

  it("interdit l'entame dans la couleur appelée mais autorise la carte appelée", () => {
    const round = baseRound(players5, 5);
    round.phase = "playing";
    round.currentTurnIndex = 0;
    round.calledCard = createSuitCard("spade", "R");
    round.hands.p1 = [createSuitCard("spade", "2"), createSuitCard("spade", "R")];

    expect(validatePlay(round, "p1", createSuitCard("spade", "2")).ok).toBe(false);
    expect(validatePlay(round, "p1", createSuitCard("spade", "R")).ok).toBe(true);
  });
});

describe("chien et plis", () => {
  it.each<Contract>(["petite", "garde"])("révèle le chien pour %s", (contract) => {
    const round = finishAuction(baseRound(players4, 4), contract);

    expect(round.phase).toBe("discard");
    expect(round.phaseHistory).toContain("dog_reveal");
    expect(round.dogRevealed).toBe(true);
    expect(round.hands.p1).toHaveLength(24);
  });

  it("garde le chien caché et le compte au preneur en Garde sans", () => {
    const round = baseRound(players4, 4);
    round.dog = [createSuitCard("heart", "R"), createTrumpCard(1)];

    finishAuction(round, "garde-sans");

    expect(round.phase).toBe("playing");
    expect(round.dogRevealed).toBe(false);
    expect(round.takerBonusCards.map((card) => card.id)).toEqual(["suit-heart-R", "trump-1"]);
  });

  it("garde le chien caché et le compte à la défense en Garde contre", () => {
    const round = baseRound(players4, 4);
    round.dog = [createSuitCard("heart", "R"), createTrumpCard(1)];

    finishAuction(round, "garde-contre");

    expect(round.phase).toBe("playing");
    expect(round.dogRevealed).toBe(false);
    expect(round.defenseBonusCards.map((card) => card.id)).toEqual(["suit-heart-R", "trump-1"]);
    expect(round.takerBonusCards).toHaveLength(0);
  });

  it("fait le chien à 3 joueurs après une prise et écarte exactement 6 cartes", () => {
    const round = baseRound(players3, 3);

    placeBid(round, "p1", "garde");
    placeBid(round, "p2", "pass");
    placeBid(round, "p3", "pass");

    expect(round.phase).toBe("discard");
    expect(round.dog).toHaveLength(6);
    expect(round.hands.p1).toHaveLength(30);

    discardDog(round, "p1", [
      "suit-club-1",
      "suit-club-2",
      "suit-club-3",
      "suit-club-4",
      "suit-club-5",
      "suit-club-6"
    ]);

    expect(round.phase).toBe("playing");
    expect(round.hands.p1).toHaveLength(24);
    expect(round.takerBonusCards).toHaveLength(6);
  });

  it("écarte 6 cartes à 4 joueurs et garde l'écart secret", () => {
    const round = finishAuction(baseRound(players4, 4), "garde");

    discardDog(round, "p1", [
      "suit-club-1",
      "suit-club-2",
      "suit-club-3",
      "suit-club-4",
      "suit-club-5",
      "suit-club-6"
    ]);

    const publicForP2 = getPublicGameStateForPlayer(makePublicState(round), "p2");
    expect(round.phase).toBe("playing");
    expect(round.discard).toHaveLength(6);
    expect(round.takerBonusCards).toHaveLength(6);
    expect(JSON.stringify(publicForP2)).not.toContain("suit-club-1");
  });

  it("écarte 3 cartes à 5 joueurs", () => {
    const round = baseRound(players5, 5);
    round.phase = "king_call";
    round.takerId = "p1";
    round.winningBid = { playerId: "p1", contract: "garde" };
    round.hands.p1 = [
      createSuitCard("club", "1"),
      createSuitCard("club", "2"),
      createSuitCard("club", "3"),
      createSuitCard("club", "4"),
      createSuitCard("club", "5")
    ];
    round.dog = [
      createSuitCard("diamond", "1"),
      createSuitCard("diamond", "2"),
      createSuitCard("diamond", "3")
    ];

    callPartnerCard(round, "p1", "heart", "R");
    discardDog(round, "p1", ["suit-club-1", "suit-club-2", "suit-club-3"]);

    expect(round.phase).toBe("playing");
    expect(round.discard).toHaveLength(3);
    expect(round.hands.p1).toHaveLength(5);
  });

  it("refuse un écart contenant un bout ou un Roi", () => {
    const round = baseRound(players4, 4);
    round.phase = "discard";
    round.takerId = "p1";
    round.winningBid = { playerId: "p1", contract: "garde" };
    round.hands.p1 = [
      createSuitCard("heart", "R"),
      createTrumpCard(1),
      createSuitCard("heart", "2"),
      createSuitCard("heart", "3"),
      createSuitCard("heart", "4"),
      createSuitCard("heart", "5")
    ];

    expect(() =>
      discardDog(round, "p1", [
        "suit-heart-R",
        "trump-1",
        "suit-heart-2",
        "suit-heart-3",
        "suit-heart-4",
        "suit-heart-5"
      ])
    ).toThrow();
  });

  it("valide un coup légal et refuse un coup illégal", () => {
    const round = baseRound(players4, 4);
    round.phase = "playing";
    round.currentTurnIndex = 1;
    round.leaderId = "p1";
    round.currentTrick = [{ playerId: "p1", card: createSuitCard("heart", "10") }];
    round.hands.p2 = [createSuitCard("heart", "1"), createTrumpCard(5)];

    expect(validatePlay(round, "p2", createSuitCard("heart", "1")).ok).toBe(true);
    expect(validatePlay(round, "p2", createTrumpCard(5)).ok).toBe(false);
  });

  it("impose la coupe si le joueur n'a pas la couleur demandée", () => {
    const round = baseRound(players4, 4);
    round.phase = "playing";
    round.currentTurnIndex = 1;
    round.currentTrick = [{ playerId: "p1", card: createSuitCard("heart", "10") }];
    round.hands.p2 = [createSuitCard("spade", "1"), createTrumpCard(5)];

    expect(validatePlay(round, "p2", createSuitCard("spade", "1")).ok).toBe(false);
    expect(validatePlay(round, "p2", createTrumpCard(5)).ok).toBe(true);
  });

  it("impose la surcoupe si possible et autorise la sous-coupe sinon", () => {
    const round = baseRound(players4, 4);
    round.phase = "playing";
    round.currentTurnIndex = 2;
    round.currentTrick = [
      { playerId: "p1", card: createSuitCard("heart", "10") },
      { playerId: "p2", card: createTrumpCard(10) }
    ];
    round.hands.p3 = [createTrumpCard(2), createTrumpCard(11)];

    expect(validatePlay(round, "p3", createTrumpCard(2)).ok).toBe(false);
    expect(validatePlay(round, "p3", createTrumpCard(11)).ok).toBe(true);

    round.hands.p3 = [createTrumpCard(2)];
    expect(validatePlay(round, "p3", createTrumpCard(2)).ok).toBe(true);
  });

  it("autorise la défausse si le joueur n'a ni couleur demandée ni atout", () => {
    const round = baseRound(players4, 4);
    round.phase = "playing";
    round.currentTurnIndex = 1;
    round.currentTrick = [{ playerId: "p1", card: createSuitCard("heart", "10") }];
    round.hands.p2 = [createSuitCard("spade", "1")];

    expect(validatePlay(round, "p2", createSuitCard("spade", "1")).ok).toBe(true);
  });

  it("autorise l'Excuse à tout moment", () => {
    const round = baseRound(players4, 4);
    round.phase = "playing";
    round.currentTurnIndex = 1;
    round.currentTrick = [{ playerId: "p1", card: createSuitCard("spade", "10") }];
    round.hands.p2 = [createSuitCard("spade", "1"), findCardById("excuse")];

    expect(validatePlay(round, "p2", findCardById("excuse")).ok).toBe(true);
  });

  it("interdit l'entame de la couleur appelée avant révélation", () => {
    const round = baseRound(players5, 5);
    round.phase = "playing";
    round.currentTurnIndex = 0;
    round.calledCard = createSuitCard("spade", "R");
    round.partnerId = "p3";
    round.hands.p1 = [createSuitCard("spade", "2"), createSuitCard("heart", "2")];

    expect(validatePlay(round, "p1", createSuitCard("spade", "2")).ok).toBe(false);
    expect(validatePlay(round, "p1", createSuitCard("heart", "2")).ok).toBe(true);
  });

  it("détermine automatiquement le gagnant du pli", () => {
    const winner = determineTrickWinner([
      { playerId: "p1", card: createSuitCard("heart", "R") },
      { playerId: "p2", card: createSuitCard("heart", "1") },
      { playerId: "p3", card: createTrumpCard(2) },
      { playerId: "p4", card: findCardById("excuse") }
    ]);

    expect(winner).toBe("p3");
  });

  it("détermine le gagnant avec la couleur demandée", () => {
    const winner = determineTrickWinner([
      { playerId: "p1", card: createSuitCard("heart", "10") },
      { playerId: "p2", card: createSuitCard("heart", "R") },
      { playerId: "p3", card: createSuitCard("spade", "R") },
      { playerId: "p4", card: findCardById("excuse") }
    ]);

    expect(winner).toBe("p2");
  });

  it("empêche l'Excuse de gagner le pli", () => {
    const winner = determineTrickWinner([
      { playerId: "p1", card: findCardById("excuse") },
      { playerId: "p2", card: createSuitCard("heart", "1") },
      { playerId: "p3", card: createSuitCard("heart", "2") }
    ]);

    expect(winner).toBe("p3");
  });

  it("laisse l'Excuse dans le camp du preneur quand il la joue", () => {
    const round = baseRound(players4, 4);
    round.phase = "playing";
    round.takerId = "p1";
    round.winningBid = { playerId: "p1", contract: "petite" };
    round.currentTurnIndex = 0;
    round.leaderId = "p1";
    round.hands.p1 = [findCardById("excuse")];
    round.hands.p2 = [createSuitCard("heart", "R")];
    round.hands.p3 = [createSuitCard("heart", "1")];
    round.hands.p4 = [createSuitCard("heart", "2")];

    playCard(round, "p1", "excuse");
    playCard(round, "p2", "suit-heart-R");
    playCard(round, "p3", "suit-heart-1");
    playCard(round, "p4", "suit-heart-2");

    expect(round.wonCards.p1?.map((card) => card.id)).toContain("excuse");
    expect(round.roundResult?.oudlerCount).toBe(1);
    expect(round.roundResult?.takerPoints).toBe(4.5);
  });

  it("laisse l'Excuse dans le camp de la défense quand elle la joue", () => {
    const round = baseRound(players4, 4);
    round.phase = "playing";
    round.takerId = "p1";
    round.winningBid = { playerId: "p1", contract: "petite" };
    round.currentTurnIndex = 0;
    round.leaderId = "p1";
    round.hands.p1 = [createSuitCard("heart", "R")];
    round.hands.p2 = [findCardById("excuse")];
    round.hands.p3 = [createSuitCard("heart", "1")];
    round.hands.p4 = [createSuitCard("heart", "2")];

    playCard(round, "p1", "suit-heart-R");
    playCard(round, "p2", "excuse");
    playCard(round, "p3", "suit-heart-1");
    playCard(round, "p4", "suit-heart-2");

    expect(round.wonCards.p2?.map((card) => card.id)).toContain("excuse");
    expect(round.roundResult?.oudlerCount).toBe(0);
  });
});

describe("comptage", () => {
  it("applique les seuils selon le nombre de bouts", () => {
    expect(getThreshold(0)).toBe(56);
    expect(getThreshold(1)).toBe(51);
    expect(getThreshold(2)).toBe(41);
    expect(getThreshold(3)).toBe(36);
  });

  it("calcule les points et les seuils du camp preneur", () => {
    const round = scoringRound(players4, 4, "petite", "p1", null, 56, 1);
    const result = scoreRound(round);

    expect(result.takerPoints).toBe(56);
    expect(result.oudlerCount).toBe(1);
    expect(result.threshold).toBe(51);
    expect(result.margin).toBe(5);
    expect(result.rawScore).toBe(30);
    expect(result.takerWon).toBe(true);
  });

  it("détecte un contrat chuté", () => {
    const result = scoreRound(scoringRound(players4, 4, "petite", "p1", null, 40, 1));

    expect(result.threshold).toBe(51);
    expect(result.margin).toBe(-11);
    expect(result.takerWon).toBe(false);
    expect(result.rawScore).toBe(36);
  });

  it.each<[ActiveContract, number]>([
    ["petite", 1],
    ["garde", 2],
    ["garde-sans", 4],
    ["garde-contre", 6]
  ])("applique le multiplicateur %s", (contract, multiplier) => {
    const result = scoreRound(scoringRound(players4, 4, contract, "p1", null, 56, 1));

    expect(CONTRACT_MULTIPLIERS[contract]).toBe(multiplier);
    expect(result.multiplier).toBe(multiplier);
    expect(result.baseScore).toBe(30 * multiplier);
  });

  it("calcule le score final à 4 joueurs", () => {
    const result = scoreRound(scoringRound(players4, 4, "petite", "p1", null, 56, 1));

    expect(result.baseScore).toBe(30);
    expect(result.deltas).toEqual({ p1: 90, p2: -30, p3: -30, p4: -30 });
    expect(Object.values(result.deltas).reduce((sum, delta) => sum + delta, 0)).toBe(0);
  });

  it("calcule le score chuté à 4 joueurs", () => {
    const result = scoreRound(scoringRound(players4, 4, "petite", "p1", null, 40, 1));

    expect(result.baseScore).toBe(36);
    expect(result.deltas).toEqual({ p1: -108, p2: 36, p3: 36, p4: 36 });
    expect(Object.values(result.deltas).reduce((sum, delta) => sum + delta, 0)).toBe(0);
  });

  it("calcule le score final à 3 joueurs", () => {
    const result = scoreRound(scoringRound(players3, 3, "petite", "p1", null, 56, 1));

    expect(result.baseScore).toBe(30);
    expect(result.deltas).toEqual({ p1: 60, p2: -30, p3: -30 });
    expect(Object.values(result.deltas).reduce((sum, delta) => sum + delta, 0)).toBe(0);
  });

  it("calcule le score final à 5 joueurs avec partenaire", () => {
    const result = scoreRound(scoringRound(players5, 5, "garde", "p1", "p3", 56, 1));

    expect(result.baseScore).toBe(60);
    expect(result.deltas).toEqual({ p1: 120, p2: -60, p3: 60, p4: -60, p5: -60 });
    expect(Object.values(result.deltas).reduce((sum, delta) => sum + delta, 0)).toBe(0);
  });

  it("calcule le score chuté à 5 joueurs avec partenaire", () => {
    const result = scoreRound(scoringRound(players5, 5, "garde", "p1", "p3", 40, 1));

    expect(result.baseScore).toBe(72);
    expect(result.deltas).toEqual({ p1: -144, p2: 72, p3: -72, p4: 72, p5: 72 });
    expect(Object.values(result.deltas).reduce((sum, delta) => sum + delta, 0)).toBe(0);
  });

  it("calcule le score final à 5 joueurs en solo contre 4", () => {
    const result = scoreRound(scoringRound(players5, 5, "garde-contre", "p1", null, 56, 1));

    expect(result.baseScore).toBe(180);
    expect(result.deltas).toEqual({ p1: 720, p2: -180, p3: -180, p4: -180, p5: -180 });
    expect(Object.values(result.deltas).reduce((sum, delta) => sum + delta, 0)).toBe(0);
  });

  it("calcule le score chuté à 5 joueurs en solo contre 4", () => {
    const result = scoreRound(scoringRound(players5, 5, "garde-contre", "p1", null, 40, 1));

    expect(result.baseScore).toBe(216);
    expect(result.deltas).toEqual({ p1: -864, p2: 216, p3: 216, p4: 216, p5: 216 });
    expect(Object.values(result.deltas).reduce((sum, delta) => sum + delta, 0)).toBe(0);
  });
});

describe("phases et état public", () => {
  it("refuse les actions dans une mauvaise phase", () => {
    const round = baseRound(players4, 4);

    expect(() => playCard(round, "p1", round.hands.p1?.[0]?.id ?? "")).toThrow();
    expect(() => discardDog(round, "p1", [])).toThrow();
    expect(() => callPartnerCard(round, "p1", "heart", "R")).toThrow();

    round.phase = "playing";
    expect(() => placeBid(round, "p1", "petite")).toThrow();
  });

  it("trace les transitions après enchères", () => {
    const fourWithDog = finishAuction(baseRound(players4, 4), "petite");
    expect(fourWithDog.phaseHistory).toEqual(["dealing", "bidding", "dog_reveal", "discard"]);
    expect(fourWithDog.phase).toBe("discard");

    const fourWithoutDog = finishAuction(baseRound(players4, 4), "garde-sans");
    expect(fourWithoutDog.phaseHistory).toEqual(["dealing", "bidding", "playing"]);
    expect(fourWithoutDog.phase).toBe("playing");

    const five = baseRound(players5, 5);
    finishAuction(five, "garde");
    expect(five.phaseHistory).toEqual(["dealing", "bidding", "king_call"]);
    expect(five.phase).toBe("king_call");
  });

  it("trace les transitions après appel du Roi et après écart", () => {
    const round = baseRound(players5, 5);
    finishAuction(round, "garde");

    callPartnerCard(round, "p1", "heart", "R");
    expect(round.phaseHistory).toEqual([
      "dealing",
      "bidding",
      "king_call",
      "dog_reveal",
      "discard"
    ]);
    expect(round.phase).toBe("discard");

    discardDog(round, "p1", ["suit-club-1", "suit-club-2", "suit-club-3"]);
    expect(round.phaseHistory.at(-1)).toBe("playing");
    expect(round.phase).toBe("playing");
  });

  it("trace la résolution du dernier pli puis le comptage", () => {
    const round = baseRound(players4, 4);
    round.phase = "playing";
    round.phaseHistory = ["dealing", "bidding", "playing"];
    round.takerId = "p1";
    round.winningBid = { playerId: "p1", contract: "petite" };
    round.currentTurnIndex = 0;
    round.leaderId = "p1";
    round.hands.p1 = [createSuitCard("heart", "R")];
    round.hands.p2 = [createSuitCard("heart", "1")];
    round.hands.p3 = [createSuitCard("heart", "2")];
    round.hands.p4 = [createSuitCard("heart", "3")];

    playCard(round, "p1", "suit-heart-R");
    playCard(round, "p2", "suit-heart-1");
    playCard(round, "p3", "suit-heart-2");
    playCard(round, "p4", "suit-heart-3");

    expect(round.phase).toBe("round_finished");
    expect(round.phaseHistory).toEqual([
      "dealing",
      "bidding",
      "playing",
      "trick_resolution",
      "round_scoring",
      "round_finished"
    ]);
  });

  it("n'envoie pas le chien caché, l'écart, les mains adverses ou le partenaire secret", () => {
    const round = baseRound(players5, 5);
    round.phase = "playing";
    round.takerId = "p1";
    round.winningBid = { playerId: "p1", contract: "garde-sans" };
    round.calledCard = createSuitCard("heart", "R");
    round.partnerId = "p2";
    round.partnerRevealed = false;
    round.dogRevealed = false;
    round.dog = [createSuitCard("spade", "R")];
    round.discard = [createSuitCard("club", "1")];

    const publicForP3 = getPublicGameStateForPlayer(makePublicState(round), "p3");
    const serialized = JSON.stringify(publicForP3);

    expect(publicForP3.you?.hand.map((card) => card.id)).toEqual(
      round.hands.p3?.map((card) => card.id)
    );
    expect(serialized).not.toContain(round.hands.p2?.[0]?.id ?? "missing-card");
    expect(publicForP3.dog).toBeUndefined();
    expect(serialized).not.toContain("suit-club-1");
    expect(publicForP3.partner).toEqual({ status: "hidden" });

    round.partnerRevealed = true;
    const publicAfterReveal = getPublicGameStateForPlayer(makePublicState(round), "p3");
    expect(publicAfterReveal.partner).toEqual({ status: "revealed", playerId: "p2" });
  });
});
