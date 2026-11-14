const { makeEngineBot } = require('../../engine')

module.exports = makeEngineBot({
    id: "corneliusAshby",
    name: "Cornelius Ashby",
    description: "The club's undefeated champion, thank you very much. Thinks longer than anyone, so do bring a cup of tea.",
    category: "Master",
    icon: "fa-chess-king",
    elo: 2000
}, {
    maxDepth: 6, timeLimitMs: 7000, eval: 'master', quiescence: true
})
