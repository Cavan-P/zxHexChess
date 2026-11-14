const { makeEngineBot } = require('../../engine')

module.exports = makeEngineBot({
    id: "miraCastellanos",
    name: "Mira Castellanos",
    description: "Quiet, careful, four moves deep. You won't see her plan coming until it's already finished.",
    category: 'Expert',
    icon: "fa-chess-bishop",
    elo: 1240
}, {
    maxDepth: 4, timeLimitMs: 2500, eval: 'master', quiescence: true
})
