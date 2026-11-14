const { makeEngineBot } = require('../../engine')

module.exports = makeEngineBot({
    id: "miraCastellanos",
    name: "Mira Castellanos",
    description: "Quiet, careful, four moves deep. You won't see her plan coming until it's already finished.",
    category: 'Advanced',
    icon: "fa-chess-bishop",
    elo: 1125,
    titles: 'women',
}, {
    maxDepth: 4, timeLimitMs: 2500, eval: 'master', quiescence: true, oversight: 0.05
})
