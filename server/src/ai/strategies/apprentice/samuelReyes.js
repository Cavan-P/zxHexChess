const { makeEngineBot } = require('../../engine')

module.exports = makeEngineBot({
    id: "samuelReyes",
    name: "Samuel Reyes",
    description: "Every piece needs a job. Never gives anything away for free. Rarely. Okay, sometimes.",
    category: 'Apprentice',
    icon: "fa-chess-rook",
    elo: 471
}, {
    maxDepth: 2, timeLimitMs: 1000, eval: 'positional', blunderChance: 0.05
})
