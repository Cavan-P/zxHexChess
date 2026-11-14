const { makeEngineBot } = require('../../engine')

module.exports = makeEngineBot({
    id: "rafaelCosta",
    name: "Rafael Costa",
    description: "Takes your space, then a little more, then waits. Very comfortable. You won't be.",
    category: 'Intermediate',
    icon: "fa-chess-knight",
    elo: 940
}, {
    maxDepth: 3, timeLimitMs: 2000, eval: 'positional', oversight: 0.2
})
