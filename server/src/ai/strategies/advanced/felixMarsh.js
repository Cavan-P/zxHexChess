const { makeEngineBot } = require('../../engine')

module.exports = makeEngineBot({
    id: "felixMarsh",
    name: "Felix Marsh",
    description: "Plays it safe, plays it sound, plays it the same way every time. Somehow that keeps working.",
    category: 'Advanced',
    icon: "fa-chess-bishop",
    elo: 1055
}, {
    maxDepth: 3, timeLimitMs: 2000, eval: 'master', oversight: 0.12
})
