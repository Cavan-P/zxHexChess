const { makeEngineBot } = require('../../engine')

module.exports = makeEngineBot({
    id: "theoLindqvist",
    name: "Theo Lindqvist",
    description: "Theo checks your reply before he moves. Most of the time. When he's not distracted.",
    category: "Apprentice",
    icon: "fa-chess-bishop",
    elo: 395
}, {
    maxDepth: 2, timeLimitMs: 600, eval: 'material', blunderChance: 0.25
})
