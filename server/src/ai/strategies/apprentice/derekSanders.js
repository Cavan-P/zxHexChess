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
    description: "Finally stopped guessing! Actually looks at the board now. Just... not very far into it.",
    category: 'Apprentice',
    icon: 'fa-chess-bishop',
    elo: 380,
    play: strategy
}
