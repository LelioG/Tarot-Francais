import { SUIT_RANKS, SUITS } from "./types";
const suitFolders = {
    club: "club",
    diamond: "diamond",
    heart: "heart",
    spade: "spades"
};
const suitPrefixes = {
    club: "trefle",
    diamond: "caro",
    heart: "coeur",
    spade: "pique"
};
const suitLabels = {
    club: "Trèfle",
    diamond: "Carreau",
    heart: "Cœur",
    spade: "Pique"
};
const rankLabels = {
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
const rankStrength = {
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
export function getCardImagePath(card) {
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
export function createSuitCard(suit, rank) {
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
export function createTrumpCard(trump) {
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
export function createExcuseCard() {
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
export function createDeck() {
    const suitedCards = SUITS.flatMap((suit) => SUIT_RANKS.map((rank) => createSuitCard(suit, rank)));
    const trumps = Array.from({ length: 21 }, (_, index) => createTrumpCard(index + 1));
    return [...suitedCards, ...trumps, createExcuseCard()];
}
export function findCardById(cardId) {
    const card = createDeck().find((deckCard) => deckCard.id === cardId);
    if (!card) {
        throw new Error(`Carte inconnue: ${cardId}`);
    }
    return card;
}
export function makeCalledCard(suit, rank) {
    return createSuitCard(suit, rank);
}
export function sortCards(cards) {
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
export function cloneCard(card) {
    return { ...card };
}
//# sourceMappingURL=cards.js.map