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
    id: 'sarahMitchell',
    name: 'Sarah Mitchell',
    description: '"It\'s good to move the chair before the floor notices, because momentum remembers what the pieces forgot and the clock was never the point anyway." - Sarah, probably',
    category: 'Beginner',
    icon: 'fa-chess-knight',
    elo: 207,
    play: strategy
}