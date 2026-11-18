const { searchBot, evaluateWeighted } = require('../../engine')

// Weights discovered via self-play evolutionary training (generations=180, population=16).
const weights = {
    "pieceValues": {
        "p": 0.5,
        "n": 3.5004622791007898,
        "b": 4.8037475936656735,
        "r": 5.592513996511593,
        "q": 11.285248978156723
    },
    "hangingPenaltyMult": 0.5,
    "centralityWeight": 0.05327405967954325,
    "mobilityWeight": 0.005821869733771227,
    "kingSafetyWeight": 0,
    "pawnAdvanceWeight": 0.05147821965481004,
    "mopUpWeight": 0.30465627222642533,
    "checkBonus": 3.659902051875953,
    "centralityBonus": {
        "n": 0.04315377873642263,
        "b": -0.022970575336020174,
        "r": -0.028764926250706126,
        "q": -0.05
    },
    "mobilityBonus": {
        "n": -0.018630589735248382,
        "b": -0.016309305696044423,
        "r": 0.00024368253860052383,
        "q": -0.0069551850432102115
    },
    "passedPawnWeight": 0.0161986997313206,
    "isolatedPawnWeight": 0.03449436447022261,
    "doubledPawnWeight": 0.14239813513775934,
    "protectedPawnWeight": 0.029688495301017293,
    "kingDangerWeight": 0.0031329606228610732,
    "kingShieldWeight": 0.06266467152942234,
    "kingCentralityEnd": 0.1551407131191094,
    "bishopSetWeight": 0.17661577900580083,
    "rookOpenWeight": 0.03120605689812476,
    "rookHalfOpenWeight": 0.0011340478145171837,
    "knightOutpostWeight": 0,
    "threatWeight": 0.12932960063648705,
    "tempoWeight": 0.06529829128389514,
    "tradeDownWeight": 0.0964123461116318,
    "end": {
        "pieceValues": {
            "p": 1.4337305289695192,
            "n": 3.381698034996986,
            "b": 2.713822315190442,
            "r": 5.479662915564734,
            "q": 11.838959009743999
        },
        "pawnAdvanceWeight": 0.03901577721172212,
        "passedPawnWeight": 0.01304643037497145
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
    id: 'adaKesslerV3',
    name: 'Ada Kessler v3',
    description: 'A frozen snapshot of Ada Kessler (180 generations), kept as a fixed sparring partner for measuring newer versions.',
    category: 'Evolved',
    labOnly: true,
    icon: 'fa-dna',
    elo: 1421,
    play: strategy
}
