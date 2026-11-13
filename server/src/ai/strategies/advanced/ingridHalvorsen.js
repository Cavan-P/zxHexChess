const { makeEngineBot } = require('../../engine')

module.exports = makeEngineBot({
    id: "ingridHalvorsen",
    name: "Ingrid Halvorsen",
    description: "Ingrid counts material three moves ahead and will happily grab anything you leave loose.",
    category: "Advanced",
    icon: "fa-chess-queen",
    elo: 760
}, {
    maxDepth: 3, timeLimitMs: 1500, eval: 'material'
})
