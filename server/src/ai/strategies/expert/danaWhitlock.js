const { makeEngineBot } = require('../../engine')

module.exports = makeEngineBot({
    id: "danaWhitlock",
    name: "Dana Whitlock",
    description: "Loves a messy trade. Will happily swap everything off the board as long as she comes out a pawn ahead.",
    category: 'Expert',
    icon: "fa-chess-knight",
    elo: 1230
}, {
    maxDepth: 3, timeLimitMs: 2000, eval: 'central', quiescence: true
})
