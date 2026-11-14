const { makeEngineBot } = require('../../engine')

module.exports = makeEngineBot({
    id: "henrikSolberg",
    name: "Henrik Solberg",
    description: "Retired engineer. Treats every position like a load calculation, and he's never had a bridge fall down.",
    category: 'Master',
    icon: "fa-chess-rook",
    elo: 2100
}, {
    maxDepth: 5, timeLimitMs: 3500, eval: 'master', quiescence: true
})
