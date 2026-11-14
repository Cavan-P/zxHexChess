const { makeEngineBot } = require('../../engine')

module.exports = makeEngineBot({
    id: "owenFairbanks",
    name: "Owen Fairbanks",
    description: "Plays fast and goes with his gut. His gut is right about half the time, which he considers a great record.",
    category: 'Apprentice',
    icon: "fa-bolt",
    elo: 425
}, {
    maxDepth: 1, timeLimitMs: 600, eval: 'material', noise: 1.5
})
