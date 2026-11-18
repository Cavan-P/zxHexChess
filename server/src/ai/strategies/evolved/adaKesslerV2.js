const { searchBot, evaluateWeighted } = require('../../engine')

// Weights discovered via self-play evolutionary training (generations=120, population=16).
const weights = {
    "pieceValues": {
        "p": 0.5,
        "n": 3.3039035818805753,
        "b": 4.165161540074697,
        "r": 5.452340992001491,
        "q": 12.64259236929446
    },
    "hangingPenaltyMult": 0.9174258415220897,
    "centralityWeight": 0.040117018224939405,
    "mobilityWeight": 0,
    "kingSafetyWeight": 0,
    "pawnAdvanceWeight": 0.02851037248159877,
    "mopUpWeight": 0.350368227615873,
    "checkBonus": 3.140026789977763,
    "centralityBonus": {
        "n": 0.005980498243600048,
        "b": -0.011720938952594483,
        "r": 0.018584203987781343,
        "q": -0.02275763657935265
    },
    "mobilityBonus": {
        "n": -0.00340140670781911,
        "b": -0.0013083901833433418,
        "r": 0.00380518578971804,
        "q": -0.010199926422556304
    },
    "passedPawnWeight": 0.01835219106855818,
    "isolatedPawnWeight": 0.036422463707555745,
    "doubledPawnWeight": 0.041507901762399074,
    "protectedPawnWeight": 0,
    "kingDangerWeight": 0.003911360979791241,
    "kingShieldWeight": 0,
    "kingCentralityEnd": 0.06295441557705628,
    "bishopSetWeight": 0,
    "rookOpenWeight": 0.013309798300487131,
    "rookHalfOpenWeight": 0,
    "knightOutpostWeight": 0.07782072367333866,
    "threatWeight": 0,
    "tempoWeight": 0.028139770183234117,
    "tradeDownWeight": 0,
    "end": {
        "pieceValues": {
            "p": 1.473742586346949,
            "n": 2.8117684313200324,
            "b": 3.0085730413622263,
            "r": 5.047454405075408,
            "q": 11.516690169652136
        },
        "pawnAdvanceWeight": 0.012020861102006421,
        "passedPawnWeight": 0.012609067691629358
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
    id: 'adaKesslerV2',
    name: 'Ada Kessler v2',
    description: 'A frozen snapshot of Ada Kessler (120 generations), kept as a fixed sparring partner for measuring newer versions.',
    category: 'Evolved',
    labOnly: true,
    icon: 'fa-dna',
    elo: 1421,
    play: strategy
}
