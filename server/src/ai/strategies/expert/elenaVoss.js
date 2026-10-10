const { searchBot, evaluatePositional } = require('../../engine')

function strategy({ fen, turn, enPassant }) {
    return searchBot({
        fen, turn, enPassant,
        maxDepth: 4,
        timeLimitMs: 3000,
        evaluate: evaluatePositional
    })
}

module.exports = {
    id: 'elenaVoss',
    name: 'Elena Voss',
    description: 'Elena calculates deep lines, weighs mobility and center control, and punishes anything you leave undefended.',
    category: 'Expert',
    icon: 'fa-chess-queen',
    elo: 1300,
    play: strategy
}
