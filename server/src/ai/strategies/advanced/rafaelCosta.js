const { makeEngineBot } = require('../../engine')

module.exports = makeEngineBot({
    id: "rafaelCosta",
    name: "Rafael Costa",
    description: "Takes your space, then a little more, then waits. Very comfortable. You won't be.",
    category: "Advanced",
    icon: "fa-chess-knight",
    elo: 950
}, {
    maxDepth: 3, timeLimitMs: 2000, eval: 'positional'
})
