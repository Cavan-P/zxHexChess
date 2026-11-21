const { searchBot, evaluateWeighted } = require('../../engine')

// Weights discovered via self-play evolutionary training (generations=300, population=16).
const weights = {
    "pieceValues": {
        "p": 0.673707622325641,
        "n": 3.09234603075539,
        "b": 3.0422071668665884,
        "r": 5.2812539229028115,
        "q": 11.24022188894761
    },
    "hangingPenaltyMult": 0.6162123841014702,
    "centralityWeight": 0.0654173249821141,
    "mobilityWeight": 0,
    "kingSafetyWeight": 0.007559259786335715,
    "pawnAdvanceWeight": 0.056574826701136546,
    "mopUpWeight": 0.48879610313840904,
    "checkBonus": 3.8789000379977465,
    "centralityBonus": {
        "n": 0.07563848831873099,
        "b": 0.01942541172054535,
        "r": 0.011998950100537002,
        "q": -0.0457207999729487
    },
    "mobilityBonus": {
        "n": -0.02,
        "b": 0.011528984362953675,
        "r": -0.003227145575433874,
        "q": -0.011672288816045403
    },
    "passedPawnWeight": 0.014577949865196197,
    "isolatedPawnWeight": 0,
    "doubledPawnWeight": 0.25625783030487387,
    "protectedPawnWeight": 0,
    "kingDangerWeight": 0.002760666955622633,
    "kingShieldWeight": 0,
    "kingCentralityEnd": 0.09944857355271954,
    "bishopSetWeight": 0.2889407287298482,
    "rookOpenWeight": 0.007404648941725789,
    "rookHalfOpenWeight": 0,
    "knightOutpostWeight": 0.07826285095399468,
    "threatWeight": 0.11122450940282613,
    "tempoWeight": 0.027948027272290638,
    "tradeDownWeight": 0.12151627696819318,
    "end": {
        "pieceValues": {
            "p": 1.4054259536086093,
            "n": 3.052546415421925,
            "b": 2.7884667146509345,
            "r": 7.207631805619885,
            "q": 9.55065313636394
        },
        "pawnAdvanceWeight": 0.03192753189689943,
        "passedPawnWeight": 0.039413616034705515
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
