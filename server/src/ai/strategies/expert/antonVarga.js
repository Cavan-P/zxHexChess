const { makeEngineBot } = require('../../engine')

module.exports = makeEngineBot({
    id: "antonVarga",
    name: "Anton Varga",
    description: "Anton calculates sharp lines four moves deep and loves an attack on the wing.",
    category: "Expert",
    icon: "fa-chess-queen",
    elo: 1400
}, {
    maxDepth: 4, timeLimitMs: 3500, eval: 'central'
})
