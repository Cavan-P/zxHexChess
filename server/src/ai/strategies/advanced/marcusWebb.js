const { searchBot, evaluateCentral } = require('../../engine')

function strategy(state) {
    return searchBot({
        ...state,
        maxDepth: 3,
        timeLimitMs: 1500,
        evaluate: evaluateCentral,
        oversight: 0.15
    })
}

module.exports = {
    id: 'marcusWebb',
    name: 'Marcus Webb',
    description: "The middle of the board belongs to Marcus. Thinks a few moves deep to keep it that way.",
    category: 'Advanced',
    icon: 'fa-chess-knight',
    elo: 1040,
    play: strategy
}
