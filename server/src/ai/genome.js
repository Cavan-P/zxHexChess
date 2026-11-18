// The "genome" of an evolved bot: the weights object evaluateWeighted reads, described once here so
// evolution (evolve.js) and Texel tuning (scripts/texelTune.js) agree on every knob, its sensible
// range, and how far one mutation may move it.
//
// `neutral` is the value that leaves the evaluation exactly as it was before the knob existed, so
// an older genome (like Ada v1's) can be filled out with every new knob and still play the same:
//   number  - that value
//   'mid'   - copy the midgame value of the same key (endgame knobs start untapered)
//
// Weights objects are treated as immutable: engine.js caches a compiled form of each one.
const { DEFAULT_WEIGHTS } = require('./engine')

const PIECES = ['n', 'b', 'r', 'q']

const SPEC = [
    // Material (midgame values; `end.*` below are the endgame ones).
    { key: 'pieceValues.p', min: 0.5, max: 2, spread: 0.3, neutral: DEFAULT_WEIGHTS.pieceValues.p },
    { key: 'pieceValues.n', min: 2, max: 5, spread: 0.6, neutral: DEFAULT_WEIGHTS.pieceValues.n },
    { key: 'pieceValues.b', min: 2, max: 5, spread: 0.6, neutral: DEFAULT_WEIGHTS.pieceValues.b },
    { key: 'pieceValues.r', min: 3, max: 8, spread: 0.8, neutral: DEFAULT_WEIGHTS.pieceValues.r },
    { key: 'pieceValues.q', min: 6, max: 13, spread: 1.2, neutral: DEFAULT_WEIGHTS.pieceValues.q },

    // The original knobs.
    { key: 'hangingPenaltyMult', min: 0.5, max: 2.5, spread: 0.3, neutral: DEFAULT_WEIGHTS.hangingPenaltyMult },
    { key: 'centralityWeight', min: 0, max: 0.2, spread: 0.03, neutral: DEFAULT_WEIGHTS.centralityWeight },
    { key: 'mobilityWeight', min: 0, max: 0.1, spread: 0.015, neutral: DEFAULT_WEIGHTS.mobilityWeight },
    { key: 'kingSafetyWeight', min: 0, max: 0.4, spread: 0.05, neutral: DEFAULT_WEIGHTS.kingSafetyWeight },

    // Constants that used to be fixed.
    { key: 'pawnAdvanceWeight', min: 0, max: 0.15, spread: 0.015, neutral: 0.03 },
    { key: 'mopUpWeight', min: 0, max: 3, spread: 0.3, neutral: 1 },
    { key: 'checkBonus', min: 0, max: 4, spread: 0.4, neutral: 2 },

    // Per-piece centrality and mobility, on top of the shared weights above (can go slightly negative,
    // so one piece type can end up caring less than the shared weight says).
    ...PIECES.map(p => ({ key: `centralityBonus.${p}`, min: -0.05, max: 0.15, spread: 0.02, neutral: 0 })),
    ...PIECES.map(p => ({ key: `mobilityBonus.${p}`, min: -0.02, max: 0.08, spread: 0.01, neutral: 0 })),

    // Pawns.
    { key: 'passedPawnWeight', min: 0, max: 0.05, spread: 0.005, neutral: 0 },
    { key: 'isolatedPawnWeight', min: 0, max: 0.5, spread: 0.05, neutral: 0 },
    { key: 'doubledPawnWeight', min: 0, max: 0.5, spread: 0.05, neutral: 0 },
    { key: 'protectedPawnWeight', min: 0, max: 0.3, spread: 0.04, neutral: 0 },

    // Kings.
    { key: 'kingDangerWeight', min: 0, max: 0.05, spread: 0.005, neutral: 0 },
    { key: 'kingShieldWeight', min: 0, max: 0.4, spread: 0.05, neutral: 0 },
    { key: 'kingCentralityEnd', min: 0, max: 0.3, spread: 0.04, neutral: 0 },

    // Pieces.
    { key: 'bishopSetWeight', min: 0, max: 1, spread: 0.1, neutral: 0 },
    { key: 'rookOpenWeight', min: 0, max: 0.15, spread: 0.02, neutral: 0 },
    { key: 'rookHalfOpenWeight', min: 0, max: 0.1, spread: 0.015, neutral: 0 },
    { key: 'knightOutpostWeight', min: 0, max: 0.6, spread: 0.08, neutral: 0 },

    // Dynamics.
    { key: 'threatWeight', min: 0, max: 0.5, spread: 0.05, neutral: 0 },
    { key: 'tempoWeight', min: 0, max: 0.3, spread: 0.04, neutral: 0 },
    { key: 'tradeDownWeight', min: 0, max: 1, spread: 0.1, neutral: 0 },

    // Endgame values, blended in as material comes off ("tapered" evaluation).
    { key: 'end.pieceValues.p', min: 0.5, max: 3, spread: 0.3, neutral: 'mid' },
    { key: 'end.pieceValues.n', min: 2, max: 5, spread: 0.6, neutral: 'mid' },
    { key: 'end.pieceValues.b', min: 2, max: 5, spread: 0.6, neutral: 'mid' },
    { key: 'end.pieceValues.r', min: 3, max: 8, spread: 0.8, neutral: 'mid' },
    { key: 'end.pieceValues.q', min: 6, max: 13, spread: 1.2, neutral: 'mid' },
    { key: 'end.pawnAdvanceWeight', min: 0, max: 0.2, spread: 0.02, neutral: 'mid' },
    { key: 'end.passedPawnWeight', min: 0, max: 0.08, spread: 0.008, neutral: 'mid' }
]

const get = (obj, key) => key.split('.').reduce((o, k) => o?.[k], obj)
const set = (obj, key, value) => {
    const parts = key.split('.')
    let o = obj
    for(const k of parts.slice(0, -1)) o = o[k] ??= {}
    o[parts.at(-1)] = value
}
const midKey = key => key.replace(/^end\./, '')
const clamp = (v, { min, max }) => Math.min(max, Math.max(min, v))

// A complete genome: every knob in SPEC, taken from `genome` where present, otherwise neutral.
const withNeutrals = (genome = DEFAULT_WEIGHTS) => {
    const out = {}
    for(const s of SPEC){
        let v = get(genome, s.key)
        if(v == null) v = s.neutral == 'mid' ? get(out, midKey(s.key)) : s.neutral
        set(out, s.key, v)
    }
    return out
}

// Genome <-> flat array of numbers, in SPEC order.
const flatten = genome => SPEC.map(s => get(genome, s.key))
const unflatten = values => {
    const out = {}
    SPEC.forEach((s, i) => set(out, s.key, clamp(values[i], s)))
    return out
}

// A child genome: each knob has a `rate` chance of moving by up to ±spread (at least one always
// moves), so dozens of knobs don't all drift at once and good values aren't lost to noise.
const mutate = (genome, rate = 0.3) => {
    const values = flatten(withNeutrals(genome))
    const pick = Math.floor(Math.random() * SPEC.length)
    return unflatten(values.map((v, i) =>
        i == pick || Math.random() < rate ? v + (Math.random() * 2 - 1) * SPEC[i].spread : v))
}

module.exports = { SPEC, withNeutrals, flatten, unflatten, mutate, get }
