const { makeEngineBot } = require('../../engine')

module.exports = makeEngineBot({
    id: "priyaNandakumar",
    name: "Priya Nandakumar",
    description: "Priya can spot a free piece from across the room. Whether she notices hers is under attack is another matter.",
    category: "Novice",
    icon: "fa-chess-pawn",
    elo: 340
}, {
    maxDepth: 1, timeLimitMs: 600, eval: 'material', blunderChance: 0.35
})
