const { searchBot, evaluateCentral } = require('../../engine')

function strategy({ fen, turn, enPassant, seen }) {
    return searchBot({
        fen, turn, enPassant, seen,
        maxDepth: 3,
        timeLimitMs: 1500,
        evaluate: evaluateCentral
    })
}

module.exports = {
    id: 'marcusWebb',
    name: 'Marcus Webb',
    description: "The middle of the board belongs to Marcus. Thinks a few moves deep to keep it that way.",
    category: 'Advanced',
    icon: 'fa-chess-knight',
    elo: 850,
    play: strategy
}
