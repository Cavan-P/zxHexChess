const { searchBot, evaluateMaster } = require('../../engine')

function strategy(state) {
    return searchBot({
        ...state,
        maxDepth: 6,
        timeLimitMs: 5000,
        evaluate: evaluateMaster,
        quiescence: true
    })
}

module.exports = {
    id: 'victorKane',
    name: 'Victor Kane',
    description: "Keeps his king locked down tight and waits for you to slip. Bring your best game. Seriously.",
    category: 'Master',
    icon: 'fa-chess-king',
    elo: 1725,
    play: strategy
}
