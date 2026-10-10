const { searchBot, evaluateMaterial } = require('../../engine')

function strategy({ fen, turn, enPassant }) {
    return searchBot({
        fen, turn, enPassant,
        maxDepth: 1,
        timeLimitMs: 1200,
        evaluate: evaluateMaterial
    })
}

module.exports = {
    id: 'derekSanders',
    name: 'Derek Sanders',
    description: 'Derek stopped guessing. He actually looks at the board before he moves - just not very far ahead.',
    category: 'Apprentice',
    icon: 'fa-chess-bishop',
    elo: 380,
    play: strategy
}
