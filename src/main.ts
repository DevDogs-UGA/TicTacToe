import { encodeBase64Url } from "@std/encoding";

interface Connection {
  socket: WebSocket;
  heartbeat: number;
  timeout?: number;
}

interface Player {
  name: "X" | "O";
  password: string;
  connection: Connection | null;
}

type State = "X" | "O" | null;

interface GameState {
  turn: NonNullable<State>;
  connected: {
    playerX: boolean;
    playerO: boolean;
  };
  rematch: {
    playerX: boolean;
    playerO: boolean;
  };
  board: [State, State, State, State, State, State, State, State, State];
}

interface Game {
  id: string;
  lastUpdated: number;
  playerX: Player | null;
  playerO: Player | null;
  state: GameState;
}

const games = new Map<string, Game>();

function generatePlayerPassword() {
  return encodeBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

function createGame() {
  const gameCode = Math.random().toFixed(6).substring(2);
  const playerId = generatePlayerPassword();

  if (games.has(gameCode)) {
    return createGame();
  }

  games.set(gameCode, {
    id: gameCode,
    lastUpdated: Date.now(),
    playerX: {
      name: "X",
      password: playerId,
      connection: null,
    },
    playerO: null,
    state: {
      turn: "X",
      connected: {
        playerX: false,
        playerO: false,
      },
      rematch: {
        playerX: false,
        playerO: false,
      },
      board: [null, null, null, null, null, null, null, null, null],
    },
  });

  return new Response(JSON.stringify({ gameCode, playerId }), {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function pushGameUpdates(game: Game) {
  if (!game.playerX?.connection && !game.playerO?.connection) {
    games.delete(game.id);
    return;
  }

  game.lastUpdated = Date.now();
  game.state.connected.playerX = !!game.playerX?.connection;
  game.state.connected.playerO = !!game.playerO?.connection;

  if (game.state.rematch.playerX && game.state.rematch.playerO) {
    game.state.board = [null, null, null, null, null, null, null, null, null];
  }

  game.playerX?.connection?.socket.send(
    JSON.stringify({ type: "state", data: game.state }),
  );
  game.playerO?.connection?.socket.send(
    JSON.stringify({ type: "state", data: game.state }),
  );
}

function createConnection(request: Request, game: Game, player: Player) {
  const { socket, response } = Deno.upgradeWebSocket(request);

  player.connection = {
    socket,
    heartbeat: setInterval(() => {
      if (player.connection) {
        socket.send(JSON.stringify({ type: "ping", data: Date.now() }));

        player.connection.timeout = setTimeout(() => {
          socket.close();
        }, 10_000);
      }
    }, 30_000),
  };

  socket.onopen = () => {
    pushGameUpdates(game);
  };

  socket.onmessage = (event) => {
    try {
      const message: unknown = JSON.parse(event.data);

      if (
        typeof message !== "object" ||
        message === null ||
        !("type" in message) ||
        typeof message.type !== "string"
      ) {
        socket.send(
          JSON.stringify({ type: "error", message: "Invalid message" }),
        );
        return;
      }

      if (message.type.toLowerCase() === "pong") {
        clearTimeout(player.connection?.timeout);
        return;
      }

      if (
        message.type.toLowerCase() === "rematch" &&
        "data" in message &&
        typeof message.data === "boolean"
      ) {
        game.state.rematch[`player${player.name}`] = message.data;
        clearTimeout(player.connection?.timeout);
        pushGameUpdates(game);
        return;
      }

      if (
        message.type.toLowerCase() === "move" &&
        "data" in message &&
        typeof message.data === "number"
      ) {
        if (
          message.data < 0 ||
          message.data >= 9 ||
          game.state.board[message.data] !== null
        ) {
          socket.send(
            JSON.stringify({ type: "error", message: "Invalid message" }),
          );
          return;
        }

        game.state.board[message.data] = player.name;
        game.state.turn = player.name === "X" ? "O" : "X";
        console.log(game.state);

        clearTimeout(player.connection?.timeout);
        pushGameUpdates(game);
        return;
      }

      socket.send(
        JSON.stringify({ type: "error", message: "Invalid message" }),
      );
    } catch (error) {
      console.error(error);
      socket.send(
        JSON.stringify({ type: "error", message: "Invalid message" }),
      );
    }
  };

  socket.onclose = () => {
    clearInterval(player.connection?.heartbeat);
    clearTimeout(player.connection?.timeout);
    player.connection = null;
    pushGameUpdates(game);
  };

  socket.onerror = (error) => {
    console.error(error);
    socket.close();
  };

  return response;
}

function connectPlayer(request: Request, game: Game, player?: string | null) {
  if (player && game.playerX?.password === player) {
    return createConnection(request, game, game.playerX);
  }

  if (player && game.playerO?.password === player) {
    return createConnection(request, game, game.playerO);
  }

  return new Response("Unauthorized", { status: 401 });
}

function createPlayer(game: Game) {
  if (game.playerO === null) {
    const playerId = generatePlayerPassword();

    game.playerO = {
      name: "O",
      password: playerId,
      connection: null,
    };

    return new Response(JSON.stringify({ playerId }), {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  return new Response("Too many players", { status: 400 });
}

Deno.serve({ port: parseInt(Deno.env.get("PORT") ?? "8080") }, (request) => {
  const url = URL.parse(request.url);
  const pathname = url?.pathname ?? "";

  if (request.method === "POST" && pathname === "/") {
    return createGame();
  }

  if (request.method === "GET") {
    const game = games.get(pathname.substring(1));

    if (game) {
      if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
        return connectPlayer(request, game, url?.searchParams.get("player"));
      }

      return createPlayer(game);
    }
  }

  return new Response("Not found", { status: 404 });
});
