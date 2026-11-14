const { makeEngineBot } = require('../../engine')

module.exports = makeEngineBot({
    id: "ingridHalvorsen",
    name: "Ingrid Halvorsen",
    description: "Counts every pawn. Twice. Leave anything loose and it's going straight into the collection.",
    category: 'Advanced',
    icon: "fa-chess-queen",
    elo: 1030,
    titles: 'women',
}, {
    maxDepth: 3, timeLimitMs: 1500, eval: 'material', oversight: 0.15
})
