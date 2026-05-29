import cors from "cors";
import express from "express";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import {
  callPartnerCard,
  createRoundState,
  discardDog,
  getPublicGameStateForPlayer,
  placeBid,
  playCard,
  type CalledRank,
  type ClientAck,
  type Contract,
  type PlayerCount,
  type PlayerId,
  type RoundResult,
  type RoundState,
  type Suit
} from "../../shared/src";

interface PlayerRecord {
  id: PlayerId;
  socketId: string;
  name: string;
  seat: number;
  connected: boolean;
}

interface Room {
  code: string;
  playerCount: PlayerCount;
  players: PlayerRecord[];
  hostId?: PlayerId;
  scores: Record<PlayerId, number>;
  history: RoundResult[];
  dealerIndex: number;
  round?: RoundState;
  roundResultApplied: boolean;
  blockedReason?: string;
}

interface CreateRoomPayload {
  name: string;
  playerCount: PlayerCount;
}

interface JoinRoomPayload {
  name: string;
  code: string;
}

interface BidPayload {
  contract: Contract;
}

interface CallPayload {
  suit: Suit;
  rank: CalledRank;
}

interface DiscardPayload {
  cardIds: string[];
}

interface PlayPayload {
  cardId: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");
const clientDistDir = path.join(rootDir, "client", "dist");
const builtCardsDir = path.join(clientDistDir, "cards");
const publicCardsDir = path.join(rootDir, "client", "public", "cards");
const cardsDir =
  process.env.NODE_ENV === "production" && existsSync(builtCardsDir)
    ? builtCardsDir
    : publicCardsDir;
const port = Number(process.env.PORT ?? 3001);

const app = express();
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

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: true,
    methods: ["GET", "POST"]
  }
});

const rooms = new Map<string, Room>();

function normalizeName(name: string): string {
  return name.trim().slice(0, 24) || "Joueur";
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

function makeRoomCode(): string {
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
  throw new Error("Impossible de générer un code de salon.");
}

function ackOk<T>(ack: ((response: ClientAck<T>) => void) | undefined, data?: T): void {
  ack?.({ ok: true, data });
}

function ackError(ack: ((response: ClientAck) => void) | undefined, error: string): void {
  ack?.({ ok: false, error });
}

function getSocketRoomCode(socketId: string): string | undefined {
  for (const room of rooms.values()) {
    if (room.players.some((player) => player.socketId === socketId)) {
      return room.code;
    }
  }
  return undefined;
}

function getRoomForSocket(socketId: string): Room | undefined {
  const roomCode = getSocketRoomCode(socketId);
  return roomCode ? rooms.get(roomCode) : undefined;
}

function getPlayerForSocket(room: Room, socketId: string): PlayerRecord | undefined {
  return room.players.find((player) => player.socketId === socketId);
}

function ensureActiveRoom(room: Room): void {
  if (room.blockedReason) {
    throw new Error(room.blockedReason);
  }
}

function emitRoom(room: Room): void {
  for (const player of room.players) {
    if (!player.connected) {
      continue;
    }
    io.to(player.socketId).emit("roomState", getPublicGameStateForPlayer(room, player.id));
  }
}

function applyRoundResult(room: Room): void {
  if (!room.round?.roundResult || room.roundResultApplied) {
    return;
  }

  for (const [playerId, delta] of Object.entries(room.round.roundResult.deltas)) {
    room.scores[playerId] = (room.scores[playerId] ?? 0) + delta;
  }
  room.history.push(room.round.roundResult);
  room.roundResultApplied = true;
}

function createPlayer(socketId: string, name: string, seat: number): PlayerRecord {
  return {
    id: socketId,
    socketId,
    name: normalizeName(name),
    seat,
    connected: true
  };
}

function startRound(room: Room): void {
  if (room.players.length !== room.playerCount) {
    throw new Error(`La partie requiert ${room.playerCount} joueurs.`);
  }
  if (room.players.some((player) => !player.connected)) {
    throw new Error("Tous les joueurs doivent être connectés.");
  }

  const playerIds = [...room.players].sort((a, b) => a.seat - b.seat).map((player) => player.id);
  room.round = createRoundState(playerIds, room.playerCount, {
    dealerIndex: room.dealerIndex % room.playerCount
  });
  room.roundResultApplied = false;
  room.blockedReason = undefined;
}

function withRoomAction(
  socketId: string,
  ack: ((response: ClientAck) => void) | undefined,
  action: (room: Room, player: PlayerRecord) => void
): void {
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
    (payload: CreateRoomPayload, ack?: (response: ClientAck<{ code: string }>) => void) => {
      try {
        if (
          payload.playerCount !== 2 &&
          payload.playerCount !== 3 &&
          payload.playerCount !== 4 &&
          payload.playerCount !== 5
        ) {
          throw new Error("Le nombre de joueurs doit être 2, 3, 4 ou 5.");
        }

        const code = makeRoomCode();
        const player = createPlayer(socket.id, payload.name, 0);
        const room: Room = {
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
        ackError(ack, error instanceof Error ? error.message : "Création impossible.");
      }
    }
  );

  socket.on(
    "joinRoom",
    (payload: JoinRoomPayload, ack?: (response: ClientAck<{ code: string }>) => void) => {
      try {
        const code = normalizeCode(payload.code);
        const room = rooms.get(code);
        if (!room) {
          throw new Error("Salon introuvable.");
        }
        if (room.round) {
          throw new Error("La partie est déjà commencée.");
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

  socket.on("startGame", (_payload: unknown, ack?: (response: ClientAck) => void) => {
    withRoomAction(socket.id, ack, (room, player) => {
      if (room.hostId !== player.id) {
        throw new Error("Seul l'hôte peut démarrer.");
      }
      if (room.round) {
        throw new Error("La partie est déjà démarrée.");
      }
      startRound(room);
    });
  });

  socket.on("placeBid", (payload: BidPayload, ack?: (response: ClientAck) => void) => {
    withRoomAction(socket.id, ack, (room, player) => {
      if (!room.round) {
        throw new Error("Aucune manche en cours.");
      }
      placeBid(room.round, player.id, payload.contract);
    });
  });

  socket.on("callCard", (payload: CallPayload, ack?: (response: ClientAck) => void) => {
    withRoomAction(socket.id, ack, (room, player) => {
      if (!room.round) {
        throw new Error("Aucune manche en cours.");
      }
      callPartnerCard(room.round, player.id, payload.suit, payload.rank);
    });
  });

  socket.on("discardDog", (payload: DiscardPayload, ack?: (response: ClientAck) => void) => {
    withRoomAction(socket.id, ack, (room, player) => {
      if (!room.round) {
        throw new Error("Aucune manche en cours.");
      }
      discardDog(room.round, player.id, payload.cardIds);
    });
  });

  socket.on("playCard", (payload: PlayPayload, ack?: (response: ClientAck) => void) => {
    withRoomAction(socket.id, ack, (room, player) => {
      if (!room.round) {
        throw new Error("Aucune manche en cours.");
      }
      playCard(room.round, player.id, payload.cardId);
    });
  });

  socket.on("newRound", (_payload: unknown, ack?: (response: ClientAck) => void) => {
    withRoomAction(socket.id, ack, (room) => {
      if (
        !room.round ||
        (room.round.phase !== "round_finished" && room.round.phase !== "passed-out")
      ) {
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

    const gameInProgress =
      room.round && room.round.phase !== "round_finished" && room.round.phase !== "passed-out";

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
    room.blockedReason = `${player.name} est déconnecté. La manche est bloquée.`;
    emitRoom(room);
  });
});

httpServer.listen(port, () => {
  console.log(`Tarot server listening on http://localhost:${port}`);
  console.log(`Serving client from ${clientDistDir}`);
  console.log(`Serving cards from ${cardsDir}`);
});
