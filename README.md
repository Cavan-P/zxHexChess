# QRSChess

QRSChess is my third, and probably final, attempt at a Hexagonal chess engine.
It's a web-based implementation of Gliński's variant of hexagonal chess. You can play a friend online, join someone's open game, or play one of 27 bots.

Play it at qrschess.itscavanp.dev.

## What's in it

- Online games with a room code, or post an open game that anyone can join from the home page
- Clocks (bullet up to classical, with or without increment), rematches, draw offers, resigning
- 27 bots from "plays randomly" up to a few that'll actually beat you. They also talk a bit of trash in chat
- Elo ratings and a leaderboard. You just pick a name, no accounts or passwords
- Drag or tap to move, premoves, step back through the moves, board coordinates
- A few color themes (light and dark), a wood board, and sound effects

## How it works

The server is Node with Express and WebSockets. It runs the actual game: every move gets checked there, and the browser just says "move this piece from here to there." Clocks are kept on the server too.

The front end is plain JavaScript drawing the board on a canvas, with Tailwind for the rest of the page.

Most bots use one alpha-beta search engine (`server/src/ai/engine.js`) with different settings: how deep they look, how long they think, what they care about, and how often they just mess up on purpose. A few of the beginner bots are simpler and just follow a couple of rules. Bot moves run on worker threads so a slow bot doesn't freeze everyone else's games.

The rules are full Gliński: en passant, promotion on the far edge, and stalemate counts as ¾ of a point for whoever gave it. Insufficient material is a bit different from normal chess. I brute-forced every position and it turns out a king and knight (or a king and a light or dark bishop) can checkmate a lone king in a corner here. So the only dead draws are when there's nothing left but kings and bishops on the middle shade.

Player profiles and ratings live in `server/data/players.json`, which isn't in git. Back it up if you care about the ratings.

## Running it locally

```bash
cd server && npm install && npm start
```

Then open http://localhost:8000.

- `npm test` runs the tests
- `npm run lab` turns on bot tournaments and training (off by default since they're CPU-heavy and write files). "Train a bot" evolves a new bot by having slightly different versions of the engine play each other, and "Open live view" shows every game of the current generation as a grid you can click into. Do this on your own machine, then commit the new bot file in `server/src/ai/strategies/evolved/`
- If you change Tailwind classes, rebuild the CSS with `cd client && npx tailwindcss -i css/style.css -o css/output.css`
