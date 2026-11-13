const { makeEngineBot } = require('../../engine')

module.exports = makeEngineBot({
    id: "graceOkafor",
    name: "Grace Okafor",
    description: "Grace sees two moves deep and loves a well-placed bishop, though she sometimes misjudges a quiet position.",
    category: "Intermediate",
    icon: "fa-chess-bishop",
    elo: 610
}, {
    maxDepth: 2, timeLimitMs: 900, eval: 'central', noise: 0.4
})
