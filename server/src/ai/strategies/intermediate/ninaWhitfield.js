const { searchBot, evaluateMaterial } = require('../../engine')

function strategy(state) {
    return searchBot({
        ...state,
        maxDepth: 2,
        timeLimitMs: 800,
        evaluate: evaluateMaterial,
        oversight: 0.2
    })
}

module.exports = {
    id: 'ninaWhitfield',
    name: 'Nina Whitfield',
    description: "Thinks two whole moves ahead now! Hasn't hung a piece for no reason in weeks. Mostly.",
    category: 'Intermediate',
    icon: 'fa-chess-rook',
    elo: 870,
    titles: 'women',
    play: strategy
}
