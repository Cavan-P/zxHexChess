const { makeEngineBot } = require('../../engine')

module.exports = makeEngineBot({
    id: "priyaNandakumar",
    name: "Priya Nandakumar",
    description: "Can spot a free piece from across the room! Her own pieces, though? Different story.",
    category: 'Apprentice',
    icon: "fa-chess-pawn",
    elo: 710,
    titles: 'women',
}, {
    maxDepth: 1, timeLimitMs: 600, eval: 'material', oversight: 0.45, blunderChance: 0.1
})
