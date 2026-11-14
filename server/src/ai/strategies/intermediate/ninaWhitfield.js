const { searchBot, evaluateMaterial } = require('../../engine')

function strategy(state) {
    return searchBot({
        ...state,
        maxDepth: 2,
        timeLimitMs: 800,
        evaluate: evaluateMaterial
    })
}

module.exports = {
    id: 'ninaWhitfield',
    name: 'Nina Whitfield',
    description: "Thinks two whole moves ahead now! Hasn't hung a piece for no reason in weeks. Mostly.",
    category: 'Intermediate',
    icon: 'fa-chess-rook',
    elo: 730,
    play: strategy
}
