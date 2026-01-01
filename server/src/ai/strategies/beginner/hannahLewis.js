const heuristics = require('../../heuristics')
const { applyMove, parseFen, generateFilteredLegals } = require('../../../game/moves')


const weights = {
    queen: 2.0,
    capture: 1.2,
    check: 0.6,
    material: 0.3,
    hanging: 0.2
}

const pickMove = ({ board, moves, color, enPassant }) => {
    const scored = []

    for(const move of moves){
        let score = 0

        const captureScore = heuristics.isCapture(board, move) * weights.capture
        const checkScore = heuristics.givesCheck(board, move, color, enPassant) * weights.check
        const materialScore = heuristics.materialDelta(board, move) * weights.material
        const queenScore = heuristics.movesQueen(board, move) * weights.queen

        const newBoard = applyMove(board, move.from, move.to)
        const hangingScore = heuristics.hangingPenalty(newBoard, color, move.to, enPassant) * weights.hanging
    
        score = captureScore + checkScore + materialScore + hangingScore + queenScore

        scored.push({ move, score })
    }

    scored.sort((a, b) => b.score - a.score)

    const cutoff = Math.min(3, scored.length)
    const candidates = scored.slice(0, cutoff)

    return candidates[Math.floor(Math.random() * candidates.length)].move
}

const promotionCells = {
    white: [0,  1,  2,  3,  5,  6,  9,  10, 14],
    black: [76, 80, 81, 84, 85, 87, 88, 89, 90]
}

function strategy({ fen, turn, enPassant }) {
    const board = parseFen(fen)
    const moves = []

    board.forEach(p => {
        if(p.color != turn) return

        const legals = generateFilteredLegals(board, p.cell, turn, enPassant)
        legals.forEach(to => {
            moves.push({ from: p.cell, to })
        })
    })

    const chosen = pickMove({ board, moves, color: turn, enPassant })

    if(promotionCells[turn].includes(chosen.to)){
        return {...chosen, promotion: 'q'}
    }

    return chosen
}

module.exports = {
    id: 'hannahLewis',
    name: 'Hannah Lewis',
    description: 'She loves moving her queen!  It usually gets stuck very quickly.',
    category: 'Beginner',
    icon: 'fa-chess-pawn',
    elo: 170,
    play: strategy
}