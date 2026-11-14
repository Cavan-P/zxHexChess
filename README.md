# QRSChess

QRSChess is my third, and probably final, attempt at a Hexagonal chess engine.
It's a web-based implementation of Gliński's variant of hexagonal chess, allowing one to play both online against a friend or against one of several bot opponents.

## Rules implemented
- Full Gliński movement, including pawn double-steps, en passant, and promotion anywhere on the far edge
- Checkmate, and Gliński's stalemate rule (the stalemating side wins ¾ of a point)
- Draws by agreement, threefold repetition, the 50-move rule, and dead positions where checkmate is impossible
- Insufficient material is worked out for Gliński's geometry rather than borrowed from square-board chess. Exhaustive searches over every piece placement show a lone king *can* be checkmated by king + knight, or king + a light- or dark-shade bishop (a corner king has only five moves), so those games play on, although the mate can never be forced. A middle-shade bishop (the shade of the centre cell f6) can never give mate, even two of them or against a defending middle-shade bishop. So a position is dead exactly when every piece besides the kings is a middle-shade bishop.
- Resignation, and a win by abandonment if your opponent disconnects for more than 60 seconds

All moves are validated on the server; the browser only ever sends "move from A to B".

## Ratings
Players pick a display name on their first visit (no email or password). The browser keeps a private token that ties it to that profile, so a rating lives on the device it was created on.

- Everyone starts at 800. Ratings use standard Elo with K=40 for the first 20 games (provisional, shown with a `?`) and K=20 after that.
- Games against people and against bots both count. Bots' ratings stay fixed when they play people, so they act as stable reference points on the ladder.
- A Gliński stalemate scores ¾–¼. Games that end before both sides have moved are unrated.
- Closing the tab mid-game against a bot counts as a loss; against a person, the 60-second abandonment rule applies.
- Profiles are stored in `server/data/players.json` (not committed). Set `PLAYERS_FILE` to store them elsewhere.

## Bots
23 computer opponents across seven tiers, from Beginner to Master. Bots in `server/src/ai/strategies/<tier>/` are picked up automatically; most are built with `makeEngineBot` in `server/src/ai/engine.js`, which takes a search depth, time limit, evaluation style, and two "personality" settings (`noise` for misjudging positions, `blunderChance` for occasional random moves).

## Tech Stack
Frontend: Vanilla JS, HTML5 canvas, Tailwind CSS
Backend: Node.js, Express, WebSocket server; bot moves are computed on worker threads

## Running the project
Visit qrschess.itscavanp.dev to play online.

To run it locally:

```bash
cd server && npm install && npm start
```

Then open http://localhost:8000.

### Bot lab
Tournaments and bot training are CPU-heavy and write new bot files to disk, so they're disabled by default. To enable them locally:

```bash
cd server && npm run lab
```

### Tests

```bash
cd server && npm test
```

### Rebuilding the CSS
After changing Tailwind classes in `client/`:

```bash
cd client && npx tailwindcss -i css/style.css -o css/output.css
```
