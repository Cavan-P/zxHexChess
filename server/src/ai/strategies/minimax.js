const { searchBot, evaluateMaterial } = require('../engine')

module.exports = function competitiveBot({ fen, turn, enPassant }) {
    const start = Date.now()

    const move = searchBot({
        fen, turn, enPassant,
        maxDepth: 4,
        timeLimitMs: 3000,
        evaluate: evaluateMaterial
    })

    console.log(`Thought for ${Date.now() - start}ms (maxDepth=4)`)

    return move
}
