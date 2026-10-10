const { searchBot, evaluateCentral } = require('../../engine')

function strategy({ fen, turn, enPassant }) {
    return searchBot({
        fen, turn, enPassant,
        maxDepth: 3,
        timeLimitMs: 1500,
        evaluate: evaluateCentral
    })
}

module.exports = {
    id: 'marcusWebb',
    name: 'Marcus Webb',
    description: 'Marcus searches several moves deep and fights for the center of the board.',
    category: 'Advanced',
    icon: 'fa-chess-knight',
    elo: 850,
    play: strategy
}
