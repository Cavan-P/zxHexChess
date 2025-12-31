const { parseFen, generateFilteredLegals } = require('../../../game/moves')

const promotionCells = {
    white: [0,  1,  2,  3,  5,  6,  9,  10, 14],
    black: [76, 80, 81, 84, 85, 87, 88, 89, 90]
}

function strategy({ fen, turn, enPassant }) {
    const board = parseFen(fen)
    const candidates = []

    for (let i = 0; i < board.length; i++) {
        const piece = board[i]
        if (!piece || piece.color != turn) continue

        const legals = generateFilteredLegals(board, i, turn, enPassant)
        for (const to of legals) {
            const isPawn = piece.piece.toLowerCase() == 'p'
            const isPromotion = isPawn && promotionCells[turn].includes(to)

            candidates.push({ from: i, to, promotion: isPromotion ? 'q' : undefined })
        }
    }

    if (!candidates.length) return null
    return candidates[Math.floor(Math.random() * candidates.length)]
}

module.exports = {
    id: 'timothyWells',
    name: 'Timothy Wells',
    description: 'Timothy is learning how the pieces move!  He practices by just playing randomly.',
    category: 'Beginner',
    icon: 'fa-chess-pawn',
    elo: 100,
    play: strategy
}