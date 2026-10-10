const fs = require('fs')
const path = require('path')
const { evaluateWeighted, DEFAULT_WEIGHTS, searchBot } = require('./engine')
const { playGame } = require('./selfPlay')
const botManager = require('./botManager')

// Training games run shallow/fast - the goal here is discovering good weights quickly via many
// games, not final playing strength (the bot we eventually write out searches much deeper).
const TRAIN_DEPTH = 2
const TRAIN_TIME_MS = 250
const TRAIN_MAX_PLIES = 120
const TRAIN_NO_PROGRESS_LIMIT = 50

const PLAY_DEPTH = 4
const PLAY_TIME_MS = 3000

const clamp = (v, min, max) => Math.min(max, Math.max(min, v))
const jitter = (value, min, max, spread) => clamp(value + (Math.random() * 2 - 1) * spread, min, max)

const mutate = genome => ({
    pieceValues: {
        p: jitter(genome.pieceValues.p, 0.5, 2, 0.3),
        n: jitter(genome.pieceValues.n, 2, 5, 0.6),
        b: jitter(genome.pieceValues.b, 2, 5, 0.6),
        r: jitter(genome.pieceValues.r, 3, 8, 0.8),
        q: jitter(genome.pieceValues.q, 6, 13, 1.2)
    },
    hangingPenaltyMult: jitter(genome.hangingPenaltyMult, 0.5, 2.5, 0.3),
    centralityWeight: jitter(genome.centralityWeight, 0, 0.2, 0.03),
    mobilityWeight: jitter(genome.mobilityWeight, 0, 0.1, 0.015),
    kingSafetyWeight: jitter(genome.kingSafetyWeight, 0, 0.4, 0.05)
})

const genomeToTrainingPlay = genome => ({ fen, turn, enPassant }) => searchBot({
    fen, turn, enPassant,
    maxDepth: TRAIN_DEPTH,
    timeLimitMs: TRAIN_TIME_MS,
    evaluate: (board, color, ep) => evaluateWeighted(board, color, ep, genome)
})

const yieldToEventLoop = _ => new Promise(resolve => setImmediate(resolve))

// Runs `generations` rounds of a population of mutated evaluation-weight genomes playing each
// other headlessly; the fittest (by win rate within the generation) survive and reseed the next
// generation. Returns the best genome found across the whole run.
const runEvolution = async ({ generations = 6, populationSize = 8, gamesPerMatch = 1, baseGenome = DEFAULT_WEIGHTS, onProgress } = {}) => {
    let population = [
        { ...baseGenome, pieceValues: { ...baseGenome.pieceValues } },
        ...Array.from({ length: Math.max(0, populationSize - 1) }, _ => mutate(baseGenome))
    ]

    let best = { genome: population[0], fitness: -Infinity }

    for(let gen = 0; gen < generations; gen++){
        const wins = population.map(_ => 0)
        const plays = population.map(genomeToTrainingPlay)

        for(let i = 0; i < population.length; i++){
            for(let j = i + 1; j < population.length; j++){
                for(let g = 0; g < gamesPerMatch; g++){
                    const iIsWhite = g % 2 == 0
                    const playWhite = iIsWhite ? plays[i] : plays[j]
                    const playBlack = iIsWhite ? plays[j] : plays[i]

                    const result = await playGame({
                        playA: playWhite,
                        playB: playBlack,
                        maxPlies: TRAIN_MAX_PLIES,
                        noProgressLimit: TRAIN_NO_PROGRESS_LIMIT
                    })

                    const winnerIdx = result.result == 'draw' ? null : (result.result == 'white') == iIsWhite ? i : j

                    if(winnerIdx == null){ wins[i] += 0.5; wins[j] += 0.5 }
                    else wins[winnerIdx]++

                    await yieldToEventLoop()
                }
            }
        }

        const ranked = population
            .map((genome, idx) => ({ genome, fitness: wins[idx] }))
            .sort((a, b) => b.fitness - a.fitness)

        if(ranked[0].fitness > best.fitness){
            best = { genome: ranked[0].genome, fitness: ranked[0].fitness }
        }

        onProgress?.({
            generation: gen + 1,
            generations,
            bestFitnessThisGen: ranked[0].fitness,
            bestFitnessEver: best.fitness
        })

        const survivorCount = Math.max(2, Math.floor(populationSize / 2))
        const survivors = ranked.slice(0, survivorCount).map(r => r.genome)

        const nextPopulation = [...survivors]
        while(nextPopulation.length < populationSize){
            const parent = survivors[Math.floor(Math.random() * survivors.length)]
            nextPopulation.push(mutate(parent))
        }
        population = nextPopulation
    }

    return best
}

const NAME_POOL = [
    'Ada Kessler', 'Milo Voss', 'Rin Okafor', 'Theo Lindqvist', 'Sage Whitmore',
    'Kai Sorensen', 'Nova Petrenko', 'Finn Abara', 'Iris Halvorsen', 'Zara Delacroix'
]

const toId = name => {
    const [first, ...rest] = name.split(' ')
    return first.toLowerCase() + rest.join('')
}

// Writes the winning genome out as a real persona bot file (auto-registered by botManager's
// directory scan on future restarts) and registers it immediately in the live process too.
const materializeGenome = (genome, meta = {}) => {
    const existingIds = new Set(botManager.getBotList().map(b => b.id))

    let name = NAME_POOL.find(n => !existingIds.has(toId(n)))
    if(!name){
        let suffix = 2
        do { name = `${NAME_POOL[0]} ${suffix++}` } while(existingIds.has(toId(name)))
    }

    const id = toId(name)
    const dir = path.join(__dirname, 'strategies', 'evolved')
    fs.mkdirSync(dir, { recursive: true })

    const weightsLiteral = JSON.stringify(genome, null, 4).split('\n').join('\n')

    const fileContents = `const { searchBot, evaluateWeighted } = require('../../engine')

// Weights discovered via self-play evolutionary training (generations=${meta.generations ?? '?'}, population=${meta.populationSize ?? '?'}).
const weights = ${weightsLiteral}

function strategy({ fen, turn, enPassant }) {
    return searchBot({
        fen, turn, enPassant,
        maxDepth: ${PLAY_DEPTH},
        timeLimitMs: ${PLAY_TIME_MS},
        evaluate: (board, color, ep) => evaluateWeighted(board, color, ep, weights)
    })
}

module.exports = {
    id: '${id}',
    name: '${name}',
    description: 'Discovered through self-play evolutionary training, not hand-tuned - its weights were earned by beating other variants of itself.',
    category: 'Evolved',
    icon: 'fa-dna',
    elo: 1000,
    play: strategy
}
`

    const filePath = path.join(dir, `${id}.js`)
    fs.writeFileSync(filePath, fileContents)

    delete require.cache[require.resolve(filePath)]
    botManager.registerBot(require(filePath), 'evolved')

    return { id, name, filePath }
}

module.exports = { runEvolution, mutate, materializeGenome }
