const { makeEngineBot } = require('../../engine')

module.exports = makeEngineBot({
    id: "theoLindqvist",
    name: "Theo Lindqvist",
    description: "Definitely checks every reply before moving. Unless there's a bird outside. There's usually a bird outside.",
    category: 'Intermediate',
    icon: "fa-chess-bishop",
    elo: 835
}, {
    maxDepth: 2, timeLimitMs: 700, eval: 'material', oversight: 0.3
})
