const heuristics = require('../../heuristics')
const { applyMove, parseFen, generateFilteredLegals } = require('../../../game/moves')


const weights = {
    capture: 0.0,
    check: 10.0,
    material: 0.0,
    hanging: 0.0
}

// Big enough to outweigh any single preference, so a bot only loops a piece if it truly must.
const SHUFFLE_PENALTY = 5

const pickMove = ({ board, moves, color, enPassant, recentOwnMoves }) => {
    const scored = []

    for(const move of moves){
        let score = 0

        const captureScore = heuristics.isCapture(board, move) * weights.capture
        const checkScore = heuristics.givesCheck(board, move, color, enPassant) * weights.check
        const materialScore = heuristics.materialDelta(board, move) * weights.material

        const newBoard = applyMove(board, move.from, move.to)
        const hangingScore = heuristics.hangingPenalty(newBoard, color, move.to, enPassant) * weights.hanging
    
        score = captureScore + checkScore + materialScore + hangingScore
        score -= heuristics.revisitsCell(board, move, recentOwnMoves) * SHUFFLE_PENALTY

        //if(heuristics.givesCheck(board, move, color, enPassant)) console.log(`FOUND CHECK`, move.from, '->', move.to)
/*
        console.log(`[EVAN BROOKS] ${move.from} -> ${move.to}`,
            {
                captureScore,
                checkScore,
                materialScore,
                hangingScore,
                total: score
            }
        )
*/
        scored.push({ move, score })
    }

    // Shuffle first so tied moves are broken at random. Without this, ties keep their board order
    // and the bot keeps picking the same piece (e.g. shuffling one rook back and forth forever).
    heuristics.shuffle(scored)
    scored.sort((a, b) => b.score - a.score)

    const cutoff = Math.min(3, scored.length)
    const candidates = scored.slice(0, cutoff)

    return candidates[Math.floor(Math.random() * candidates.length)].move
}

const { promotionCells } = require('../../../game/moves')

function strategy({ fen, turn, enPassant, recentOwnMoves = [] }) {
    const board = parseFen(fen)
    const moves = []

    board.forEach(p => {
        if(p.color != turn) return

        const legals = generateFilteredLegals(board, p.cell, turn, enPassant)
        legals.forEach(to => {
            moves.push({ from: p.cell, to })
        })
    })

    const chosen = pickMove({ board, moves, color: turn, enPassant, recentOwnMoves })

    if(promotionCells[turn].includes(chosen.to)){
        return {...chosen, promotion: 'q'}
    }

    return chosen
}

module.exports = {
    id: 'evanBrooks',
    name: 'Evan Brooks',
    description: 'Is just glad to be here.  But he beat Timothy!',
    category: 'Beginner',
    icon: 'fa-chess-knight',
    elo: 70,
    play: strategy
}