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
    description: 'Victor sees further than anyone else at the table and keeps his king well defended. Bring your best game.',
    category: 'Master',
    icon: 'fa-chess-king',
    elo: 1900,
    play: strategy
}
