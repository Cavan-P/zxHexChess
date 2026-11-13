const { makeEngineBot } = require('../../engine')

module.exports = makeEngineBot({
    id: "rafaelCosta",
    name: "Rafael Costa",
    description: "Rafael squeezes. He takes space, restricts your pieces, and waits for you to crack.",
    category: "Advanced",
    icon: "fa-chess-knight",
    elo: 950
}, {
    maxDepth: 3, timeLimitMs: 2000, eval: 'positional'
})
