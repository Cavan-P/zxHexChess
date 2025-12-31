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
    id: 'kyleMorton',
    name: 'Kyle Morton',
    description: 'Loves to capture pieces!  Problem is, he misses a lot of the board...',
    category: 'Beginner',
    icon: 'fa-chess-pawn',
    elo: 130,
    play: strategy
}