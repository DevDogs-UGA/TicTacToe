# TicTacToe Server API

The first player to join will be `X`; the second player to join will be `O`.

Live Endpoint: `http://tictactoe.devdogsuga.org/`

## Create Game

### `POST` `/`

Creates a new TicTacToe game.

- Returns a JSON response on `200 Success`

**Successful Response Shape:**

```ts
{
  "gameCode": string,
  "playerId": string
}
```

## Get Player Id for Game

### `GET` `/[gameCode]`

Gets a new player id for a TicTacToe game with game code `[gameCode]`.

- Returns a JSON response on `200 Success`
- Returns `400 Bad Request` if game already has two players
- Returns `404 Not Found` if game doesn't exist

**Successful Response Shape:**

```ts
{
  "playerId": string
}
```

## Join Game

### `GET` `/[gameCode]?playerId=[playerId]`

Join a new game via a **WebSocket connection**.

- Returns `101 Switching Protocols` on success
- Returns `401 Unauthorized` if player id is incorrect
- Returns `404 Not Found` if game doesn't exist

After joining the game, the following JSON messages are supported to be recieved by the server:

### Client Messages

#### Pong

_Required to be sent upon recieving a [ping](#ping)_

```json
{
  "type": "pong"
}
```

#### Move

_Play a move a the provided index (0-8) for the connected player_

```ts
{
  "type": "move",
  "data": number
}
```

#### Rematch

_Set the rematch flag for the currently connected player._

```ts
{
  "type": "move",
  "data": number
}
```

### Server Messages

#### Ping

_Sent every 30 seconds to check if the connection is still alive_

```ts
{
  "type": "ping",
  "data": number
}
```

#### State

_Sent every time the game state changes (i.e., a player connections/disconnects, a player commits a move, or a player requests a rematch)_

```ts
{
  "type": "state",
  "data": {
    "turn": "X" | "O",
    "connected": {
      "playerX": boolean,
      "playerO": boolean
    },
    "rematch": {
      "playerX": boolean,
      "playerO": boolean
    },
    "board": [
      "X" | "O" | null,
      "X" | "O" | null,
      "X" | "O" | null,
      "X" | "O" | null,
      "X" | "O" | null,
      "X" | "O" | null,
      "X" | "O" | null,
      "X" | "O" | null,
      "X" | "O" | null
    ]
  }
}
```
