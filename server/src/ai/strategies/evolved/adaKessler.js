const { searchBot, evaluateWeighted } = require('../../engine')

// Weights discovered via self-play evolutionary training (generations=210, population=16).
const weights = {
    "pieceValues": {
        "p": 0.5,
        "n": 3.5004622791007898,
        "b": 4.306592151975555,
        "r": 5.678345576691983,
        "q": 12.7776075806359
    },
    "hangingPenaltyMult": 0.5,
    "centralityWeight": 0.03737198243922924,
    "mobilityWeight": 0,
    "kingSafetyWeight": 0,
    "pawnAdvanceWeight": 0.07491026165752479,
    "mopUpWeight": 0.235049028136015,
    "checkBonus": 3.673291693981894,
    "centralityBonus": {
        "n": 0.060774676911427516,
        "b": -0.010056493758833569,
        "r": -0.04324492589286278,
        "q": -0.03496042903811289
    },
    "mobilityBonus": {
        "n": -0.015522706924026589,
        "b": 0.005000554851016628,
        "r": 0.006821802597724699,
        "q": -0.0069551850432102115
    },
    "passedPawnWeight": 0.011616170166188421,
    "isolatedPawnWeight": 0.03449436447022261,
    "doubledPawnWeight": 0.15522879328294756,
    "protectedPawnWeight": 0.04329282497378977,
    "kingDangerWeight": 0.0008443267929588534,
    "kingShieldWeight": 0.09461260716491157,
    "kingCentralityEnd": 0.12197583006211765,
    "bishopSetWeight": 0.17661577900580083,
    "rookOpenWeight": 0.04151963806213956,
    "rookHalfOpenWeight": 0,
    "knightOutpostWeight": 0.02546049553289011,
    "threatWeight": 0.18600131007443557,
    "tempoWeight": 0.06529829128389514,
    "tradeDownWeight": 0.04220776127138366,
    "end": {
        "pieceValues": {
            "p": 1.838508332472622,
            "n": 2.9560939623384352,
            "b": 2.3367354131825318,
            "r": 6.048527030974393,
            "q": 10.069612605298492
        },
        "pawnAdvanceWeight": 0.04666876852763979,
        "passedPawnWeight": 0.01952986370903679
    }
}

function strategy(state) {
    return searchBot({
        ...state,
        maxDepth: 8,
        timeLimitMs: 5000,
        quiescence: true,
        checkBonus: weights.checkBonus,
        evaluate: (board, color, ep, toMove) => evaluateWeighted(board, color, ep, weights, toMove)
    })
}

module.exports = {
    id: 'adaKessler',
    name: 'Ada Kessler',
    description: 'Discovered through self-play evolutionary training, not hand-tuned - its weights were earned by beating other variants of itself.',
    category: 'Evolved',
    icon: 'fa-dna',
    elo: 1000,
    play: strategy
}
