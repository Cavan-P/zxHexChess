const { makeEngineBot } = require('../../engine')

module.exports = makeEngineBot({
    id: "corneliusAshby",
    name: "Cornelius Ashby",
    description: "Former club champion, and still a bit sore about Henrik. Thinks longer than anyone, so do bring a cup of tea.",
    category: 'Master',
    icon: "fa-chess-king",
    elo: 1905
}, {
    maxDepth: 6, timeLimitMs: 7000, eval: 'master', quiescence: true
})
