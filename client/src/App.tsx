import {
  Ban,
  Check,
  Copy,
  Crown,
  LogIn,
  Play,
  Plus,
  RefreshCw,
  Send,
  Trophy,
  Users,
  WifiOff
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  CONTRACT_STRENGTH,
  CONTRACTS,
  SUITS,
  type CalledRank,
  type Card,
  type ClientAck,
  type Contract,
  type PlayerCount,
  type PublicPile,
  type PublicPlayer,
  type PublicRoomState,
  type Suit
} from "../../shared/src";

const serverUrl =
  import.meta.env.VITE_SERVER_URL ??
  (import.meta.env.DEV ? "http://localhost:3001" : window.location.origin);
const socket: Socket = io(serverUrl);

const contractLabels: Record<Contract, string> = {
  pass: "Passe",
  petite: "Petite",
  garde: "Garde",
  "garde-sans": "Garde sans",
  "garde-contre": "Garde contre"
};

const suitLabels: Record<Suit, string> = {
  club: "Trèfle",
  diamond: "Carreau",
  heart: "Cœur",
  spade: "Pique"
};

const rankLabels: Record<CalledRank, string> = {
  R: "Roi",
  D: "Dame",
  C: "Cavalier",
  V: "Valet"
};

function emitAck<T = undefined>(event: string, payload: unknown = {}): Promise<ClientAck<T>> {
  return new Promise((resolve) => {
    socket.emit(event, payload, (response: ClientAck<T>) => resolve(response));
  });
}

function formatPoints(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function playerName(room: PublicRoomState, playerId: string | undefined): string {
  return room.players.find((player) => player.id === playerId)?.name ?? "—";
}

function calledCardLabel(card: Card | undefined): string {
  if (!card?.suit || !card.rank) {
    return "—";
  }
  return `${card.name}`;
}

export default function App() {
  const [room, setRoom] = useState<PublicRoomState | undefined>();
  const [notice, setNotice] = useState<string>("");

  useEffect(() => {
    socket.on("roomState", (state: PublicRoomState) => {
      setRoom(state);
      setNotice("");
    });
    socket.on("errorMessage", (message: string) => setNotice(message));
    socket.on("disconnect", () => setNotice("Connexion serveur perdue."));

    return () => {
      socket.off("roomState");
      socket.off("errorMessage");
      socket.off("disconnect");
    };
  }, []);

  return (
    <main className="app">
      {room ? (
        <GameRoom room={room} notice={notice} setNotice={setNotice} />
      ) : (
        <Lobby setNotice={setNotice} />
      )}
      {notice ? <div className="toast">{notice}</div> : null}
    </main>
  );
}

function Lobby({ setNotice }: { setNotice: (message: string) => void }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [playerCount, setPlayerCount] = useState<PlayerCount>(4);

  async function createRoom() {
    const response = await emitAck<{ code: string }>("createRoom", { name, playerCount });
    if (!response.ok) {
      setNotice(response.error ?? "Création impossible.");
    }
  }

  async function joinRoom() {
    const response = await emitAck<{ code: string }>("joinRoom", { name, code });
    if (!response.ok) {
      setNotice(response.error ?? "Salon introuvable.");
    }
  }

  return (
    <section className="lobby">
      <div className="brand">
        <Crown size={34} />
        <h1>Tarot français</h1>
      </div>
      <div className="lobby-grid">
        <div className="panel">
          <label>
            Pseudo
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={24}
              autoFocus
            />
          </label>
          <div className="segmented">
            <button className={playerCount === 2 ? "active" : ""} onClick={() => setPlayerCount(2)}>
              2 joueurs
            </button>
            <button className={playerCount === 3 ? "active" : ""} onClick={() => setPlayerCount(3)}>
              3 joueurs
            </button>
            <button className={playerCount === 4 ? "active" : ""} onClick={() => setPlayerCount(4)}>
              4 joueurs
            </button>
            <button className={playerCount === 5 ? "active" : ""} onClick={() => setPlayerCount(5)}>
              5 joueurs
            </button>
          </div>
          <button className="primary" onClick={createRoom}>
            <Plus size={18} />
            Créer
          </button>
        </div>
        <div className="panel">
          <label>
            Code
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              maxLength={5}
            />
          </label>
          <button className="primary" onClick={joinRoom}>
            <LogIn size={18} />
            Rejoindre
          </button>
        </div>
      </div>
    </section>
  );
}

function GameRoom({
  room,
  notice,
  setNotice
}: {
  room: PublicRoomState;
  notice: string;
  setNotice: (message: string) => void;
}) {
  const me = room.you?.playerId;
  const mePlayer = room.players.find((player) => player.id === me);
  const isHost = room.hostId === me;
  const canStart = room.phase === "lobby" && isHost && room.players.length === room.playerCount;
  const [copied, setCopied] = useState(false);

  async function startGame() {
    const response = await emitAck("startGame");
    if (!response.ok) {
      setNotice(response.error ?? "Démarrage impossible.");
    }
  }

  async function newRound() {
    const response = await emitAck("newRound");
    if (!response.ok) {
      setNotice(response.error ?? "Nouvelle donne impossible.");
    }
  }

  async function copyRoomCode() {
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setNotice("Impossible de copier le code.");
    }
  }

  function tablePosition(player: PublicPlayer): number {
    if (!mePlayer) {
      return player.seat;
    }
    return (player.seat - mePlayer.seat + room.playerCount) % room.playerCount;
  }

  return (
    <section className="game">
      <header className="topbar">
        <div className="topbar-brand">
          <span className="topbar-mark">
            <Crown size={19} />
          </span>
          <div>
            <strong>Tarot français</strong>
            <span>{room.playerCount} joueurs</span>
          </div>
        </div>
        <button className="room-code-button" onClick={copyRoomCode} title="Copier le code">
          <span>Code salon</span>
          <strong>{room.code}</strong>
          {copied ? <Check size={17} /> : <Copy size={17} />}
        </button>
        <div className="top-actions">
          {room.phase === "round_finished" || room.phase === "passed-out" ? (
            <button className="primary compact" onClick={newRound}>
              <RefreshCw size={17} />
              Nouvelle donne
            </button>
          ) : null}
        </div>
      </header>

      {room.phase === "blocked" ? (
        <div className="blocked">
          <WifiOff size={18} />
          {room.blockedReason}
        </div>
      ) : null}
      {notice ? <div className="inline-error">{notice}</div> : null}

      {room.phase === "lobby" ? (
        <WaitingRoom
          room={room}
          canStart={canStart}
          copied={copied}
          onCopyCode={copyRoomCode}
          onStart={startGame}
        />
      ) : (
        <div className="game-layout">
          <aside className="status-panel">
            <StatusPanel room={room} />
            <ScoresPanel room={room} />
          </aside>

          <div className="play-area">
            <div className="table" data-count={room.playerCount}>
              {room.players.map((player) => (
                <PlayerBadge
                  key={player.id}
                  player={player}
                  position={tablePosition(player)}
                  active={room.currentTurnId === player.id}
                  taker={room.takerId === player.id}
                  me={me === player.id}
                />
              ))}
              {room.playerCount === 2 ? <TwoPlayerPiles room={room} setNotice={setNotice} /> : null}
              <TrickCenter room={room} />
            </div>

            {room.roundResult ? <FinalResultPanel room={room} /> : null}
            <ActionPanel room={room} setNotice={setNotice} />
            <HandPanel room={room} setNotice={setNotice} />
          </div>
        </div>
      )}
    </section>
  );
}

function WaitingRoom({
  room,
  canStart,
  copied,
  onCopyCode,
  onStart
}: {
  room: PublicRoomState;
  canStart: boolean;
  copied: boolean;
  onCopyCode: () => void;
  onStart: () => void;
}) {
  const seats = Array.from({ length: room.playerCount }, (_, index) => room.players[index]);

  return (
    <section className="waiting-room">
      <div className="waiting-code">
        <span>Code salon</span>
        <strong>{room.code}</strong>
        <button onClick={onCopyCode} title="Copier le code">
          {copied ? <Check size={18} /> : <Copy size={18} />}
          {copied ? "Copié" : "Copier"}
        </button>
      </div>
      <div className="waiting-panel">
        <div className="waiting-heading">
          <h2>Joueurs</h2>
          <span>
            {room.players.length}/{room.playerCount}
          </span>
        </div>
        <div className="seat-grid">
          {seats.map((player, index) => (
            <div
              key={player?.id ?? `seat-${index}`}
              className={`seat-card ${player ? "filled" : ""}`}
            >
              <span className="seat-number">{index + 1}</span>
              <strong>{player?.name ?? "En attente"}</strong>
              <small>{player ? `${formatPoints(player.score)} pts` : "Place libre"}</small>
            </div>
          ))}
        </div>
        <button className="primary start-button" disabled={!canStart} onClick={onStart}>
          <Play size={18} />
          Lancer la partie
        </button>
      </div>
    </section>
  );
}

function PlayerBadge({
  player,
  position,
  active,
  taker,
  me
}: {
  player: PublicPlayer;
  position: number;
  active: boolean;
  taker: boolean;
  me: boolean;
}) {
  return (
    <div
      className={`player-badge pos-${position} ${active ? "active" : ""} ${!player.connected ? "offline" : ""}`}
    >
      <div className="player-name">
        {taker ? <Crown size={14} /> : null}
        {player.name}
        {me ? <span className="you">vous</span> : null}
      </div>
      <div className="player-meta">
        <span>{player.cardCount} cartes</span>
        <span>{formatPoints(player.score)} pts</span>
      </div>
    </div>
  );
}

function StatusPanel({ room }: { room: PublicRoomState }) {
  const partnerText =
    room.partner.status === "none"
      ? "—"
      : room.partner.status === "hidden"
        ? "Non révélé"
        : room.partner.status === "solo"
          ? "Solo"
          : playerName(room, room.partner.playerId);

  return (
    <div className="panel side">
      <h2>État</h2>
      <dl className="facts">
        <dt>Phase</dt>
        <dd>{phaseLabel(room.phase)}</dd>
        <dt>Tour</dt>
        <dd>{playerName(room, room.currentTurnId)}</dd>
        <dt>Contrat</dt>
        <dd>{room.contract ? contractLabels[room.contract] : "—"}</dd>
        <dt>Preneur</dt>
        <dd>{playerName(room, room.takerId)}</dd>
        <dt>Carte appelée</dt>
        <dd>{calledCardLabel(room.calledCard)}</dd>
        <dt>Partenaire</dt>
        <dd>{partnerText}</dd>
      </dl>
    </div>
  );
}

function ScoresPanel({ room }: { room: PublicRoomState }) {
  return (
    <div className="panel side">
      <h2>Scores</h2>
      <div className="score-list">
        {room.players.map((player) => (
          <div key={player.id} className="score-row">
            <span>{player.name}</span>
            <strong>{formatPoints(player.score)}</strong>
          </div>
        ))}
      </div>
      {room.roundResult ? <RoundResultView room={room} /> : null}
      {room.history.length > 0 ? (
        <div className="history">
          <h3>Historique</h3>
          {room.history
            .slice()
            .reverse()
            .slice(0, 5)
            .map((result, index) => (
              <div
                key={`${result.mode === "duel" ? result.winnerId : result.takerId}-${index}`}
                className="history-line"
              >
                <Trophy size={14} />
                {result.mode === "duel"
                  ? `${playerName(room, result.winnerId)} gagne de ${formatPoints(result.margin)}`
                  : `${playerName(room, result.takerId)} ${
                      result.takerWon ? "gagne" : "chute"
                    } de ${formatPoints(Math.abs(result.margin))}`}
              </div>
            ))}
        </div>
      ) : null}
    </div>
  );
}

function RoundResultView({ room }: { room: PublicRoomState }) {
  const result = room.roundResult;
  if (!result) {
    return null;
  }

  if (result.mode === "duel") {
    return (
      <div className="result">
        <h3>Manche</h3>
        <dl className="facts compact-facts">
          <dt>Vainqueur</dt>
          <dd>{playerName(room, result.winnerId)}</dd>
          <dt>Points</dt>
          <dd>
            {room.players
              .map(
                (player) => `${player.name}: ${formatPoints(result.pointsByPlayer[player.id] ?? 0)}`
              )
              .join(" · ")}
          </dd>
          <dt>Total</dt>
          <dd>{formatPoints(result.totalPoints)}</dd>
          <dt>Écart</dt>
          <dd>{formatPoints(result.margin)}</dd>
        </dl>
      </div>
    );
  }

  return (
    <div className="result">
      <h3>Manche</h3>
      <dl className="facts compact-facts">
        <dt>Points preneur</dt>
        <dd>{formatPoints(result.takerPoints)}</dd>
        <dt>Bouts</dt>
        <dd>{result.oudlerCount}</dd>
        <dt>Seuil</dt>
        <dd>{result.threshold}</dd>
        <dt>Écart</dt>
        <dd>{formatPoints(result.margin)}</dd>
        <dt>Contrat</dt>
        <dd>{contractLabels[result.contract]}</dd>
        <dt>Multiplicateur</dt>
        <dd>x{result.multiplier}</dd>
        <dt>Base</dt>
        <dd>
          {formatPoints(result.rawScore)} × {result.multiplier} = {formatPoints(result.baseScore)}
        </dd>
        <dt>Appel</dt>
        <dd>{result.calledCard ? calledCardLabel(result.calledCard) : "—"}</dd>
        <dt>Partenaire</dt>
        <dd>{result.solo ? "Solo" : playerName(room, result.partnerId ?? undefined)}</dd>
      </dl>
    </div>
  );
}

function FinalResultPanel({ room }: { room: PublicRoomState }) {
  const result = room.roundResult;
  if (!result) {
    return null;
  }

  const scoreRows = Object.entries(result.deltas)
    .map(([playerId, delta]) => ({
      playerId,
      name: playerName(room, playerId),
      delta
    }))
    .sort((a, b) => b.delta - a.delta);

  return (
    <section className="final-result">
      <div className="final-title">
        <Trophy size={22} />
        <div>
          <h2>
            {result.mode === "duel"
              ? `${playerName(room, result.winnerId)} gagne`
              : result.takerWon
                ? "Contrat réussi"
                : "Contrat chuté"}
          </h2>
          <span>{result.mode === "duel" ? "Mode 2 joueurs" : contractLabels[result.contract]}</span>
        </div>
      </div>
      {result.mode === "duel" ? (
        <div className="result-metrics">
          {room.players.map((player) => (
            <div key={player.id}>
              <span>{player.name}</span>
              <strong>{formatPoints(result.pointsByPlayer[player.id] ?? 0)}</strong>
            </div>
          ))}
          <div>
            <span>Total</span>
            <strong>{formatPoints(result.totalPoints)}</strong>
          </div>
          <div>
            <span>Écart</span>
            <strong>{formatPoints(result.margin)}</strong>
          </div>
        </div>
      ) : (
        <div className="result-metrics">
          <div>
            <span>Points</span>
            <strong>{formatPoints(result.takerPoints)}</strong>
          </div>
          <div>
            <span>Seuil</span>
            <strong>{result.threshold}</strong>
          </div>
          <div>
            <span>Écart</span>
            <strong>{formatPoints(result.margin)}</strong>
          </div>
          <div>
            <span>Multiplicateur</span>
            <strong>x{result.multiplier}</strong>
          </div>
        </div>
      )}
      <div className="final-scores">
        {scoreRows.map((row) => (
          <div key={row.playerId} className={row.delta >= 0 ? "positive" : "negative"}>
            <span>{row.name}</span>
            <strong>
              {row.delta >= 0 ? "+" : ""}
              {formatPoints(row.delta)}
            </strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function TwoPlayerPiles({
  room,
  setNotice
}: {
  room: PublicRoomState;
  setNotice: (message: string) => void;
}) {
  const me = room.you?.playerId;
  const opponent = room.players.find((player) => player.id !== me);
  const playable = new Set(room.you?.playableCardIds ?? []);

  async function play(cardId: string) {
    const response = await emitAck("playCard", { cardId });
    if (!response.ok) {
      setNotice(response.error ?? "Carte refusée.");
    }
  }

  return (
    <>
      {opponent ? (
        <PileRow
          className="opponent-piles"
          piles={room.piles[opponent.id] ?? []}
          playable={new Set<string>()}
          onPlay={play}
          label={opponent.name}
        />
      ) : null}
      {me ? (
        <PileRow
          className="self-piles"
          piles={room.you?.piles ?? room.piles[me] ?? []}
          playable={playable}
          onPlay={play}
          label="Vos tas"
        />
      ) : null}
    </>
  );
}

function PileRow({
  piles,
  playable,
  onPlay,
  className,
  label
}: {
  piles: PublicPile[];
  playable: Set<string>;
  onPlay: (cardId: string) => void;
  className: string;
  label: string;
}) {
  return (
    <div className={`pile-row ${className}`}>
      <span className="pile-row-label">{label}</span>
      <div className="pile-list">
        {piles.map((pile, index) => {
          const cardId = pile.visibleCard?.id;
          const canPlay = Boolean(cardId && playable.has(cardId));
          return (
            <button
              key={`${className}-${index}`}
              className={`pile-card ${canPlay ? "playable" : ""}`}
              disabled={!canPlay}
              onClick={() => cardId && onPlay(cardId)}
              title={pile.visibleCard?.name ?? "Tas vide"}
            >
              {pile.visibleCard ? <CardImage card={pile.visibleCard} small /> : <CardBack />}
              <span>{pile.remaining}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CardBack() {
  return <div className="card-back" aria-label="Carte cachée" />;
}

function TrickCenter({ room }: { room: PublicRoomState }) {
  return (
    <div className="trick-center">
      <div className="trick-title">
        <Users size={16} />
        Pli en cours
      </div>
      <div className="trick-cards">
        {room.currentTrick.length === 0 ? (
          <span className="muted">—</span>
        ) : (
          room.currentTrick.map((played) => (
            <div key={`${played.playerId}-${played.card.id}`} className="played-card">
              <CardImage card={played.card} />
              <span>{playerName(room, played.playerId)}</span>
            </div>
          ))
        )}
      </div>
      {room.dog?.length && (room.phase === "dog_reveal" || room.phase === "discard") ? (
        <div className="dog-block">
          <span className="dog-label">Chien révélé</span>
          <div className="dog-row">
            {room.dog.map((card) => (
              <CardImage key={card.id} card={card} small />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ActionPanel({
  room,
  setNotice
}: {
  room: PublicRoomState;
  setNotice: (message: string) => void;
}) {
  if (room.phase === "lobby") {
    return <LobbyPlayers room={room} />;
  }
  if (room.phase === "bidding") {
    return <BiddingPanel room={room} setNotice={setNotice} />;
  }
  if (room.phase === "king_call") {
    return <CallingPanel room={room} setNotice={setNotice} />;
  }
  if (room.phase === "passed-out") {
    return <div className="action-strip">Tous les joueurs ont passé.</div>;
  }
  if (room.phase === "dog_reveal" || room.phase === "discard") {
    const isMyDog = room.currentTurnId === room.you?.playerId;
    return (
      <div className="action-strip dog-action">
        <Crown size={17} />
        {isMyDog
          ? `Le chien est dans votre main. Écart à faire : ${room.discardSize} cartes.`
          : `${playerName(room, room.currentTurnId)} fait son écart de ${room.discardSize} cartes.`}
      </div>
    );
  }
  return (
    <div className="action-strip">
      Dernier pli :{" "}
      {room.tricks.at(-1)?.winnerId ? playerName(room, room.tricks.at(-1)?.winnerId) : "—"}
    </div>
  );
}

function LobbyPlayers({ room }: { room: PublicRoomState }) {
  return (
    <div className="action-strip">
      <Users size={17} />
      {room.players.length}/{room.playerCount} joueurs
    </div>
  );
}

function BiddingPanel({
  room,
  setNotice
}: {
  room: PublicRoomState;
  setNotice: (message: string) => void;
}) {
  const me = room.you?.playerId;
  const isMyTurn = room.currentTurnId === me;
  const currentStrength = CONTRACT_STRENGTH[room.winningBid?.contract ?? "pass"];

  async function bid(contract: Contract) {
    const response = await emitAck("placeBid", { contract });
    if (!response.ok) {
      setNotice(response.error ?? "Enchère refusée.");
    }
  }

  return (
    <div className="action-strip bidding">
      {CONTRACTS.map((contract) => {
        const disabled =
          !isMyTurn || (contract !== "pass" && CONTRACT_STRENGTH[contract] <= currentStrength);
        return (
          <button key={contract} disabled={disabled} onClick={() => bid(contract)}>
            {contract === "pass" ? <Ban size={16} /> : <Send size={16} />}
            {contractLabels[contract]}
          </button>
        );
      })}
    </div>
  );
}

function CallingPanel({
  room,
  setNotice
}: {
  room: PublicRoomState;
  setNotice: (message: string) => void;
}) {
  const allowedRanks: CalledRank[] = room.you?.allowedCalledRanks.length
    ? room.you.allowedCalledRanks
    : ["R"];
  const [rank, setRank] = useState<CalledRank>(allowedRanks[0] ?? "R");
  const [suit, setSuit] = useState<Suit>("heart");
  const isMyTurn = room.currentTurnId === room.you?.playerId;

  async function call() {
    const response = await emitAck("callCard", { suit, rank });
    if (!response.ok) {
      setNotice(response.error ?? "Appel refusé.");
    }
  }

  return (
    <div className="action-strip call-panel">
      <div className="segmented compact-segmented">
        {allowedRanks.map((candidate) => (
          <button
            key={candidate}
            className={rank === candidate ? "active" : ""}
            onClick={() => setRank(candidate)}
          >
            {rankLabels[candidate]}
          </button>
        ))}
      </div>
      <div className="segmented compact-segmented">
        {SUITS.map((candidate) => (
          <button
            key={candidate}
            className={suit === candidate ? "active" : ""}
            onClick={() => setSuit(candidate)}
          >
            {suitLabels[candidate]}
          </button>
        ))}
      </div>
      <button className="primary compact" disabled={!isMyTurn} onClick={call}>
        <Crown size={16} />
        Appeler
      </button>
    </div>
  );
}

function HandPanel({
  room,
  setNotice
}: {
  room: PublicRoomState;
  setNotice: (message: string) => void;
}) {
  const [selectedDiscard, setSelectedDiscard] = useState<string[]>([]);
  const hand = room.you?.hand ?? [];
  const playable = new Set(room.you?.playableCardIds ?? []);
  const dogCardIds = new Set((room.dog ?? []).map((card) => card.id));
  const isDiscardTurn = room.phase === "discard" && room.currentTurnId === room.you?.playerId;

  useEffect(() => {
    setSelectedDiscard([]);
  }, [room.phase, room.discardSize]);

  async function play(cardId: string) {
    const response = await emitAck("playCard", { cardId });
    if (!response.ok) {
      setNotice(response.error ?? "Carte refusée.");
    }
  }

  function toggleDiscard(cardId: string) {
    setSelectedDiscard((current) => {
      if (current.includes(cardId)) {
        return current.filter((selected) => selected !== cardId);
      }
      if (current.length >= room.discardSize) {
        return current;
      }
      return [...current, cardId];
    });
  }

  async function submitDiscard() {
    const response = await emitAck("discardDog", { cardIds: selectedDiscard });
    if (!response.ok) {
      setNotice(response.error ?? "Écart refusé.");
    }
  }

  const groupedHand = useMemo(() => hand, [hand]);

  return (
    <div className="hand-wrap">
      {isDiscardTurn ? (
        <div className="discard-status">
          <span>Chien ajouté</span>
          <strong>
            {selectedDiscard.length}/{room.discardSize}
          </strong>
        </div>
      ) : null}
      <div className="hand">
        {groupedHand.map((card) => {
          const canPlay = playable.has(card.id);
          const selected = selectedDiscard.includes(card.id);
          return (
            <button
              key={card.id}
              className={`card-button ${canPlay ? "playable" : ""} ${selected ? "selected" : ""} ${
                dogCardIds.has(card.id) ? "from-dog" : ""
              }`}
              disabled={!isDiscardTurn && !canPlay}
              onClick={() => (isDiscardTurn ? toggleDiscard(card.id) : play(card.id))}
              title={card.name}
            >
              <CardImage card={card} />
            </button>
          );
        })}
      </div>
      {isDiscardTurn ? (
        <button
          className="primary discard-button"
          disabled={selectedDiscard.length !== room.discardSize}
          onClick={submitDiscard}
        >
          <Send size={17} />
          Écarter {selectedDiscard.length}/{room.discardSize}
        </button>
      ) : null}
    </div>
  );
}

function CardImage({ card, small = false }: { card: Card; small?: boolean }) {
  return (
    <img
      className={small ? "card-img small" : "card-img"}
      src={card.imagePath}
      alt={card.name}
      draggable={false}
    />
  );
}

function phaseLabel(phase: PublicRoomState["phase"]): string {
  const labels: Record<PublicRoomState["phase"], string> = {
    lobby: "Salon",
    bidding: "Enchères",
    dealing: "Distribution",
    king_call: "Appel",
    dog_reveal: "Chien",
    discard: "Écart",
    playing: "Plis",
    trick_resolution: "Résolution",
    round_scoring: "Comptage",
    "passed-out": "Passe générale",
    round_finished: "Manche terminée",
    blocked: "Bloquée"
  };
  return labels[phase];
}
