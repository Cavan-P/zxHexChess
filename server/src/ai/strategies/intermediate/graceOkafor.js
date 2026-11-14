const { makeEngineBot } = require('../../engine')

module.exports = makeEngineBot({
    id: "graceOkafor",
    name: "Grace Okafor",
    description: "Three bishops each?? Best variant ever. Gets a little lost when the position goes quiet, though.",
    category: 'Intermediate',
    icon: "fa-chess-bishop",
    elo: 655
}, {
    maxDepth: 2, timeLimitMs: 900, eval: 'central', noise: 0.4
})
