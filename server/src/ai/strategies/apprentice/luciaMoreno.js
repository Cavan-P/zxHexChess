const { makeEngineBot } = require('../../engine')

module.exports = makeEngineBot({
    id: "luciaMoreno",
    name: "Lucia Moreno",
    description: "Lucia has learned that knights belong in the middle of the board, and she'll tell you so.",
    category: "Apprentice",
    icon: "fa-chess-knight",
    elo: 410
}, {
    maxDepth: 1, timeLimitMs: 800, eval: 'central', blunderChance: 0.1
})
