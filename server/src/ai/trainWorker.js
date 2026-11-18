// Plays complete games off the main thread, reporting every move as it happens so the Lab view can
// show them live: training games between two evaluation "genomes", or tournament games between two
// real bots (whiteBot/blackBot ids).
const { parentPort } = require('worker_threads')
const { GameState } = require('../game/rules')
const { searchBot, evaluateWeighted } = require('./engine')
const botManager = require('./botManager')
const { readEvolvedBot } = require('./evolve')

const other = c => c == 'white' ? 'black' : 'white'

// Sleeps this worker thread (it has nothing else to do) - used for the lab's "watchable" pace.
const pause = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

parentPort.on('message', ({ jobId, white, black, whiteBot, blackBot, depth, timeMs, quiescence = false, maxPlies, noProgressLimit, paceMs = 0, botTimeMs }) => {
    try {
        const game = new GameState()
        const player = genome => state => searchBot({
            ...state, maxDepth: depth, timeLimitMs: timeMs, quiescence, checkBonus: genome.checkBonus,
            evaluate: (board, color, ep, toMove) => evaluateWeighted(board, color, ep, genome, toMove)
        })
        // botTimeMs: play an evolved bot with its own weights and depth but a different time per move
        // (faster A/B matches).
        const bot = id => {
            const evolved = botTimeMs && readEvolvedBot(id)
            if(evolved) return state => searchBot({
                ...state, maxDepth: evolved.playDepth || 8, timeLimitMs: botTimeMs, quiescence: true, checkBonus: evolved.genome.checkBonus,
                evaluate: (board, color, ep, toMove) => evaluateWeighted(board, color, ep, evolved.genome, toMove)
            })
            // Rescan once for bots added since this thread started (e.g. freshly trained ones).
            if(!botManager.getBotByName(id)) botManager.reload()
            const play = botManager.getBotByName(id)
            if(!play) throw new Error(`Unknown bot: ${id}`)
            return play
        }
        const players = whiteBot
            ? { white: bot(whiteBot), black: bot(blackBot) }
            : { white: player(white), black: player(black) }
        let result = null

        while(game.history.length < maxPlies){
            const turn = game.turn
            const move = players[turn]({ fen: game.fen, turn, enPassant: game.enPassant, seen: game.seenPositions(), recentOwnMoves: game.recentMovesBy(turn), ply: game.history.length })
            const res = move ? game.play(turn, move.from, move.to, move.promotion || 'q') : { ok: false }
            if(!res.ok){ result = { winner: other(turn), reason: 'forfeit' }; break }

            parentPort.postMessage({ jobId, type: 'move', fen: game.fen, from: res.move.from, to: res.move.to, ply: game.history.length })
            if(paceMs) pause(paceMs)

            if(game.result){ result = game.result; break }
            if(game.halfmoveClock >= noProgressLimit){ result = { winner: null, reason: 'no progress' }; break }
        }

        parentPort.postMessage({ jobId, type: 'done', result: result || { winner: null, reason: 'move limit' }, plies: game.history.length })
    }
    catch(e){
        parentPort.postMessage({ jobId, type: 'error', error: e.message })
    }
})
