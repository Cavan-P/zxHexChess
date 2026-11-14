const { makeEngineBot } = require('../../engine')

module.exports = makeEngineBot({
    id: "luciaMoreno",
    name: "Lucia Moreno",
    description: "Knights go in the middle. Always. Will remind you of this every single game.",
    category: 'Novice',
    icon: "fa-chess-knight",
    elo: 580,
    titles: 'women',
}, {
    maxDepth: 2, timeLimitMs: 800, eval: 'central', oversight: 0.55
})
