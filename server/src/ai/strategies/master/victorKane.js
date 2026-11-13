const { searchBot, evaluateMaster } = require('../../engine')

function strategy({ fen, turn, enPassant }) {
    return searchBot({
        fen, turn, enPassant,
        maxDepth: 6,
        timeLimitMs: 5000,
        evaluate: evaluateMaster
    })
}

module.exports = {
    id: 'victorKane',
    name: 'Victor Kane',
    description: "Sees further than everyone else and keeps his king locked down tight. Bring your best game. Seriously.",
    category: 'Master',
    icon: 'fa-chess-king',
    elo: 1900,
    play: strategy
}
