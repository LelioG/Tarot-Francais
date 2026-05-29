import { SUIT_RANKS, SUITS, type Card, type CalledRank, type Suit, type SuitRank } from "./types";

const suitFolders: Record<Suit, string> = {
  club: "club",
  diamond: "diamond",
  heart: "heart",
  spade: "spades"
};

const suitPrefixes: Record<Suit, string> = {
  club: "trefle",
  diamond: "caro",
  heart: "coeur",
  spade: "pique"
};

const suitLabels: Record<Suit, string> = {
  club: "Trèfle",
  diamond: "Carreau",
  heart: "Cœur",
  spade: "Pique"
};

const rankLabels: Record<SuitRank, string> = {
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

const rankStrength: Record<SuitRank, number> = {
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

export function getCardImagePath(card: Pick<Card, "kind" | "suit" | "rank" | "trump">): string {
  if (card.kind === "excuse") {
    return "/cards/trumps/excuse.svg";
  }

  if (card.kind === "trump") {
    if (!card.trump) {
      throw new Error("Atout invalide sans numéro.");
    }
    return `/cards/trumps/${card.trump}.svg`;
  }

  if (!card.suit || !card.rank) {
    throw new Error("Carte de couleur invalide sans couleur ou rang.");
  }

  return `/cards/${suitFolders[card.suit]}/${suitPrefixes[card.suit]}${card.rank}.svg`;
}

export function createSuitCard(suit: Suit, rank: SuitRank): Card {
  const points =
    rank === "R" ? 4.5 : rank === "D" ? 3.5 : rank === "C" ? 2.5 : rank === "V" ? 1.5 : 0.5;
  const card: Card = {
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

export function createTrumpCard(trump: number): Card {
  if (trump < 1 || trump > 21 || !Number.isInteger(trump)) {
    throw new Error(`Atout invalide: ${trump}`);
  }

  const card: Card = {
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

export function createExcuseCard(): Card {
  const card: Card = {
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

export function createDeck(): Card[] {
  const suitedCards = SUITS.flatMap((suit) => SUIT_RANKS.map((rank) => createSuitCard(suit, rank)));
  const trumps = Array.from({ length: 21 }, (_, index) => createTrumpCard(index + 1));
  return [...suitedCards, ...trumps, createExcuseCard()];
}

export function findCardById(cardId: string): Card {
  const card = createDeck().find((deckCard) => deckCard.id === cardId);
  if (!card) {
    throw new Error(`Carte inconnue: ${cardId}`);
  }
  return card;
}

export function makeCalledCard(suit: Suit, rank: CalledRank): Card {
  return createSuitCard(suit, rank);
}

export function sortCards(cards: Card[]): Card[] {
  const suitOrder: Record<Suit, number> = {
    club: 0,
    diamond: 1,
    heart: 2,
    spade: 3
  };

  return [...cards].sort((a, b) => {
    const groupA = a.kind === "suit" ? suitOrder[a.suit as Suit] : a.kind === "trump" ? 4 : 5;
    const groupB = b.kind === "suit" ? suitOrder[b.suit as Suit] : b.kind === "trump" ? 4 : 5;
    if (groupA !== groupB) {
      return groupA - groupB;
    }
    return a.strength - b.strength;
  });
}

export function cloneCard(card: Card): Card {
  return { ...card };
}
