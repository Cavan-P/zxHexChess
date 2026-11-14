const fs = require('fs')
const path = require('path')
const { evaluateWeighted, DEFAULT_WEIGHTS, searchBot } = require('./engine')
const { playTrainingGame } = require('./trainPool')
const botManager = require('./botManager')

// Training games run shallow/fast - the goal here is discovering good weights quickly via many
// games, not final playing strength (the bot we eventually write out searches much deeper).
const TRAIN_DEPTH = 3
const TRAIN_TIME_MS = 250
const TRAIN_MAX_PLIES = 120
const TRAIN_NO_PROGRESS_LIMIT = 50

// How the finished bot plays (overridable per training run): it stops at whichever comes first,
// the depth or the time limit, and always follows capture sequences to the end.
const PLAY_DEPTH = 6
const PLAY_TIME_MS = 5000

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

// Runs `generations` rounds of a population of mutated evaluation-weight genomes playing each
// other; the fittest (by points within the generation) survive and reseed the next generation.
// Every game of a generation is played at once across the training worker pool.
//
// Callbacks (all optional): onGeneration({ generation, generations, games }) when a generation
// starts; onGameMove(id, { fen, from, to, ply }); onGameEnd(id, { result, plies });
// onProgress({ generation, generations, bestFitnessThisGen, bestFitnessEver, standings }).
// Returns the best genome found across the whole run.
// paceMs: pause after each move so the games can be followed live (0 = full speed).
const runEvolution = async ({ generations = 6, populationSize = 8, gamesPerMatch = 1, baseGenome = DEFAULT_WEIGHTS, paceMs = 0, onGeneration, onGameMove, onGameEnd, onProgress } = {}) => {
    let population = [
        { ...baseGenome, pieceValues: { ...baseGenome.pieceValues } },
        ...Array.from({ length: Math.max(0, populationSize - 1) }, _ => mutate(baseGenome))
    ]

    let best = { genome: population[0], fitness: -Infinity }

    for(let gen = 0; gen < generations; gen++){
        const points = population.map(_ => 0)

        // Every pairing, colours alternating between repeat games.
        const games = []
        for(let i = 0; i < population.length; i++){
            for(let j = i + 1; j < population.length; j++){
                for(let g = 0; g < gamesPerMatch; g++){
                    const [white, black] = g % 2 == 0 ? [i, j] : [j, i]
                    games.push({ id: `${gen + 1}-${white}-${black}-${g}`, white, black })
                }
            }
        }
        onGeneration?.({ generation: gen + 1, generations, populationSize, games })

        await Promise.all(games.map(async game => {
            const { result, plies } = await playTrainingGame({
                white: population[game.white],
                black: population[game.black],
                depth: TRAIN_DEPTH,
                timeMs: TRAIN_TIME_MS,
                maxPlies: TRAIN_MAX_PLIES,
                noProgressLimit: TRAIN_NO_PROGRESS_LIMIT,
                paceMs
            }, move => onGameMove?.(game.id, move))

            if(!result.winner){ points[game.white] += 0.5; points[game.black] += 0.5 }
            else points[result.winner == 'white' ? game.white : game.black] += 1
            onGameEnd?.(game.id, { result, plies })
        }))

        const ranked = population
            .map((genome, idx) => ({ genome, idx, fitness: points[idx] }))
            .sort((a, b) => b.fitness - a.fitness)

        if(ranked[0].fitness > best.fitness){
            best = { genome: ranked[0].genome, fitness: ranked[0].fitness }
        }

        onProgress?.({
            generation: gen + 1,
            generations,
            bestFitnessThisGen: ranked[0].fitness,
            bestFitnessEver: best.fitness,
            standings: ranked.map(r => ({ variant: r.idx + 1, points: r.fitness }))
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

function strategy(state) {
    return searchBot({
        ...state,
        maxDepth: ${meta.playDepth ?? PLAY_DEPTH},
        timeLimitMs: ${meta.playMs ?? PLAY_TIME_MS},
        quiescence: true,
        evaluate: (board, color, ep, toMove) => evaluateWeighted(board, color, ep, weights, toMove)
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
