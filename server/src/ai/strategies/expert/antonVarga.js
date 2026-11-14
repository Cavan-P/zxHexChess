const { makeEngineBot } = require('../../engine')

module.exports = makeEngineBot({
    id: "antonVarga",
    name: "Anton Varga",
    description: "ATTACK! Sharp lines, four moves deep, straight at your king. Defending is someone else's hobby.",
    category: "Expert",
    icon: "fa-chess-queen",
    elo: 1300
}, {
    maxDepth: 4, timeLimitMs: 3500, eval: 'central', quiescence: true
})
