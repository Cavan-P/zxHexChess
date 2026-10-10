const { searchBot, evaluateMaterial } = require('../../engine')

function strategy({ fen, turn, enPassant }) {
    return searchBot({
        fen, turn, enPassant,
        maxDepth: 2,
        timeLimitMs: 800,
        evaluate: evaluateMaterial
    })
}

module.exports = {
    id: 'ninaWhitfield',
    name: 'Nina Whitfield',
    description: 'Nina thinks two moves ahead now, and she won\'t hang a piece for no reason anymore.',
    category: 'Intermediate',
    icon: 'fa-chess-rook',
    elo: 550,
    play: strategy
}
