const { GameState, START_FEN } = require('../game/rules')

const yieldToEventLoop = _ => new Promise(resolve => setImmediate(resolve))

// Plays one full headless game between two bot play functions using the same rules as live rooms.
// Returns { result: 'white'|'black'|'draw', reason, plies }. A Gliński stalemate counts as a win
// for the stalemating side (it's worth ¾ of a point, but Elo here only tracks win/loss/draw).
// `noProgressLimit` lets training cut dull games short of the full 50-move rule.
const playGame = async ({ playA, playB, maxPlies = 300, noProgressLimit = 100, fen = START_FEN } = {}) => {
    const game = new GameState({ fen })

    for(let ply = 0; ply < maxPlies; ply++){
        const turn = game.turn
        const play = turn == 'white' ? playA : playB
        const move = play({ fen: game.fen, turn, enPassant: game.enPassant, seen: game.seenPositions(), lastOwnMove: game.lastMoveBy(turn) })

        const res = move ? game.play(turn, move.from, move.to, move.promotion || 'q') : { ok: false }
        if(!res.ok){
            return { result: turn == 'white' ? 'black' : 'white', reason: move ? 'forfeit-illegal-move' : 'forfeit-no-move', plies: ply }
        }

        if(game.result){
            return { result: game.result.winner || 'draw', reason: game.result.reason, plies: ply + 1 }
        }

        if(game.halfmoveClock >= noProgressLimit){
            return { result: 'draw', reason: 'no-progress', plies: ply + 1 }
        }

        await yieldToEventLoop()
    }

    return { result: 'draw', reason: 'ply-limit', plies: maxPlies }
}

module.exports = { playGame, START_FEN }
