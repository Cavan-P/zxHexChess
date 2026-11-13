const { makeEngineBot } = require('../../engine')

module.exports = makeEngineBot({
    id: "samuelReyes",
    name: "Samuel Reyes",
    description: "Samuel keeps his pieces active and rarely gives anything away for free. Rarely.",
    category: "Intermediate",
    icon: "fa-chess-rook",
    elo: 630
}, {
    maxDepth: 2, timeLimitMs: 1000, eval: 'positional', blunderChance: 0.05
})
