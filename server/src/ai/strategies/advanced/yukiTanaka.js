const { makeEngineBot } = require('../../engine')

module.exports = makeEngineBot({
    id: "yukiTanaka",
    name: "Yuki Tanaka",
    description: "Patient, tidy, king tucked safely away. Happy to wait for you to overreach. You will overreach.",
    category: 'Advanced',
    icon: "fa-chess-rook",
    elo: 1130
}, {
    maxDepth: 3, timeLimitMs: 2500, eval: 'master', quiescence: true, oversight: 0.06
})
