const { searchBot, evaluateWeighted } = require('../../engine')

// Weights discovered via self-play evolutionary training (generations=90, population=16).
const weights = {
    "pieceValues": {
        "p": 0.5,
        "n": 2.800852336727976,
        "b": 3.4252146840406517,
        "r": 5.395930618704897,
        "q": 12.26006365323836
    },
    "hangingPenaltyMult": 1.955384733080831,
    "centralityWeight": 0.01017586312230686,
    "mobilityWeight": 0,
    "kingSafetyWeight": 0
}

function strategy(state) {
    return searchBot({
        ...state,
        maxDepth: 8,
        timeLimitMs: 5000,
        quiescence: true,
        evaluate: (board, color, ep, toMove) => evaluateWeighted(board, color, ep, weights, toMove)
    })
}

module.exports = {
    id: 'adaKesslerV1',
    name: 'Ada Kessler v1',
    description: 'A frozen snapshot of Ada Kessler (90 generations), kept as a fixed sparring partner for measuring newer versions.',
    category: 'Evolved',
    labOnly: true,
    icon: 'fa-dna',
    elo: 1421,
    play: strategy
}
