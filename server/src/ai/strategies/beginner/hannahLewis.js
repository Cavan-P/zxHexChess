const { parseFen, generateFilteredLegals } = require('../../../game/moves')

const promotionCells = {
    white: [0,  1,  2,  3,  5,  6,  9,  10, 14],
    black: [76, 80, 81, 84, 85, 87, 88, 89, 90]
}

function strategy({ fen, turn, enPassant }) {
    const board = parseFen(fen)
    return { from: 0, to: 0, promotion: 'q'}
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