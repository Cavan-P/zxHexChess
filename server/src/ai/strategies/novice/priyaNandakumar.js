const { makeEngineBot } = require('../../engine')

module.exports = makeEngineBot({
    id: "priyaNandakumar",
    name: "Priya Nandakumar",
    description: "Can spot a free piece from across the room! Her own pieces, though? Different story.",
    category: 'Novice',
    icon: "fa-chess-pawn",
    elo: 300
}, {
    maxDepth: 1, timeLimitMs: 600, eval: 'material', blunderChance: 0.35
})
