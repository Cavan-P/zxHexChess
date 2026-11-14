const { searchBot, evaluatePositional } = require('../../engine')

function strategy(state) {
    return searchBot({
        ...state,
        maxDepth: 4,
        timeLimitMs: 3000,
        evaluate: evaluatePositional,
        quiescence: true
    })
}

module.exports = {
    id: 'elenaVoss',
    name: 'Elena Voss',
    description: "Calculates the long lines so you don't have to. An undefended piece is basically an invitation.",
    category: 'Expert',
    icon: 'fa-chess-queen',
    elo: 1505,
    play: strategy
}
