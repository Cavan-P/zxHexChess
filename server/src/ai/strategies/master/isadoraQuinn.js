const { makeEngineBot } = require('../../engine')

module.exports = makeEngineBot({
    id: "isadoraQuinn",
    name: "Isadora Quinn",
    description: "Isadora reads the whole board at once. Every piece has a job, and every job gets done.",
    category: "Master",
    icon: "fa-crown",
    elo: 1750
}, {
    maxDepth: 5, timeLimitMs: 4000, eval: 'positional'
})
