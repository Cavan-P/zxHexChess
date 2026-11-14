const { searchBot, evaluateMaterial } = require('../../engine')

function strategy(state) {
    return searchBot({
        ...state,
        maxDepth: 1,
        timeLimitMs: 1200,
        evaluate: evaluateMaterial
    })
}

module.exports = {
    id: 'derekSanders',
    name: 'Derek Sanders',
    description: "Finally stopped guessing! Actually looks at the board now. Just... not very far into it.",
    category: 'Intermediate',
    icon: 'fa-chess-bishop',
    elo: 590,
    play: strategy
}
