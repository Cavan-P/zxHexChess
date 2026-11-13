const { makeEngineBot } = require('../../engine')

module.exports = makeEngineBot({
    id: "owenFairbanks",
    name: "Owen Fairbanks",
    description: "Owen plays fast and trusts his gut. His gut is right about half the time.",
    category: "Novice",
    icon: "fa-bolt",
    elo: 380
}, {
    maxDepth: 1, timeLimitMs: 600, eval: 'material', noise: 1.5
})
