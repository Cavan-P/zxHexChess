const { makeEngineBot } = require('../../engine')

module.exports = makeEngineBot({
    id: "ingridHalvorsen",
    name: "Ingrid Halvorsen",
    description: "Counts every pawn. Twice. Leave anything loose and it's going straight into the collection.",
    category: 'Advanced',
    icon: "fa-chess-queen",
    elo: 920
}, {
    maxDepth: 3, timeLimitMs: 1500, eval: 'material'
})
