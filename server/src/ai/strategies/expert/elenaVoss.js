const { searchBot, evaluatePositional } = require('../../engine')

function strategy({ fen, turn, enPassant, seen }) {
    return searchBot({
        fen, turn, enPassant, seen,
        maxDepth: 4,
        timeLimitMs: 3000,
        evaluate: evaluatePositional
    })
}

module.exports = {
    id: 'elenaVoss',
    name: 'Elena Voss',
    description: "Calculates the long lines so you don't have to. An undefended piece is basically an invitation.",
    category: 'Expert',
    icon: 'fa-chess-queen',
    elo: 1300,
    play: strategy
}
