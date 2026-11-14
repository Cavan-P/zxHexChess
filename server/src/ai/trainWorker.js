// Plays complete training games between two evaluation "genomes", reporting every move as it
// happens so the Lab view can show the games live.
const { parentPort } = require('worker_threads')
const { GameState } = require('../game/rules')
const { searchBot, evaluateWeighted } = require('./engine')

const other = c => c == 'white' ? 'black' : 'white'

// Sleeps this worker thread (it has nothing else to do) - used for the lab's "watchable" pace.
const pause = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

parentPort.on('message', ({ jobId, white, black, depth, timeMs, maxPlies, noProgressLimit, paceMs = 0 }) => {
    try {
        const game = new GameState()
        const player = genome => state => searchBot({
            ...state, maxDepth: depth, timeLimitMs: timeMs,
            evaluate: (board, color, ep, toMove) => evaluateWeighted(board, color, ep, genome, toMove)
        })
        const players = { white: player(white), black: player(black) }
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
