const { makeEngineBot } = require('../../engine')

module.exports = makeEngineBot({
    id: "yukiTanaka",
    name: "Yuki Tanaka",
    description: "Yuki is patient and solid. She keeps her king safe and her pieces coordinated, and lets you overreach.",
    category: "Expert",
    icon: "fa-chess-rook",
    elo: 1150
}, {
    maxDepth: 3, timeLimitMs: 2500, eval: 'master'
})
