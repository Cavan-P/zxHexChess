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
    description: "Thinks two whole moves ahead now! Hasn't hung a piece for no reason in weeks. Mostly.",
    category: 'Intermediate',
    icon: 'fa-chess-rook',
    elo: 550,
    play: strategy
}
