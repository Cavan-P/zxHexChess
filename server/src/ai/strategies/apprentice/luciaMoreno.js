const { makeEngineBot } = require('../../engine')

module.exports = makeEngineBot({
    id: "luciaMoreno",
    name: "Lucia Moreno",
    description: "Knights go in the middle. Always. Will remind you of this every single game.",
    category: "Apprentice",
    icon: "fa-chess-knight",
    elo: 420
}, {
    maxDepth: 1, timeLimitMs: 800, eval: 'central', blunderChance: 0.1
})
