const { makeEngineBot } = require('../../engine')

module.exports = makeEngineBot({
    id: "corneliusAshby",
    name: "Cornelius Ashby",
    description: "The club's undefeated champion. Cornelius thinks longer than anyone, so bring a cup of tea.",
    category: "Master",
    icon: "fa-chess-king",
    elo: 2000
}, {
    maxDepth: 6, timeLimitMs: 7000, eval: 'master'
})
