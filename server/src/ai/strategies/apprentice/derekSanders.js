const { searchBot, evaluateMaterial } = require('../../engine')

function strategy(state) {
    return searchBot({
        ...state,
        maxDepth: 2,
        timeLimitMs: 1200,
        evaluate: evaluateMaterial,
        oversight: 0.35
    })
}

module.exports = {
    id: 'derekSanders',
    name: 'Derek Sanders',
    description: "Finally stopped guessing! Actually looks at the board now. Just... not very far into it.",
    category: 'Apprentice',
    icon: 'fa-chess-bishop',
    elo: 790,
    play: strategy
}
