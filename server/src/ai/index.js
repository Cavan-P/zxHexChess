const random = require('./strategies/beginner/timothyWells')
const heuristic = require('./strategies/heuristic')
const minimax = require('./strategies/minimax')
//const neural = require('./strategies/neural')

const bots = {
    'Rando-Bot': random,
    'Learner': heuristic,
    'Competitive': minimax,
    'Expert': minimax //change eventually
}

const getBotStrategy = name => {
    return bots[name] || random
}

module.exports = {
    getBotStrategy
}