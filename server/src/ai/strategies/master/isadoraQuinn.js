const { makeEngineBot } = require('../../engine')

module.exports = makeEngineBot({
    id: "isadoraQuinn",
    name: "Isadora Quinn",
    description: "Reads the whole board at once. Every piece has a job, and every job gets done. Yours too, eventually.",
    category: 'Master',
    icon: "fa-crown",
    elo: 1775
}, {
    maxDepth: 5, timeLimitMs: 4000, eval: 'positional', quiescence: true
})
