const fs = require('fs')
const path = require('path')
const { DEFAULT_WEIGHTS } = require('./engine')
const { playTrainingGame } = require('./trainPool')
const botManager = require('./botManager')
const eloStore = require('./eloStore')
const { withNeutrals, mutate } = require('./genome')

// Training games run shallow/fast - the goal here is discovering good weights quickly via many
// games, not final playing strength (the bot we eventually write out searches much deeper). They
// do use quiescence, like the finished bot, so weights aren't tuned to cover for a search that
// stops halfway through a trade. Depth and time are overridable per run (depth 4+ also switches on
// the strong-search features, including opening variety, so repeat games differ).
const TRAIN_DEPTH = 3
const TRAIN_TIME_MS = 250
// Long enough for most games to be decided in the endgame, so endgame skill counts in training.
const TRAIN_MAX_PLIES = 250
const TRAIN_NO_PROGRESS_LIMIT = 100  // the real 50-move rule (50 moves each = 100 plies)

// How the finished bot plays (overridable per training run): it stops at whichever comes first,
// the depth or the time limit, and always follows capture sequences to the end.
const PLAY_DEPTH = 6
const PLAY_TIME_MS = 5000

// The final playoff: the most recent generation winners, every pairing at least twice.
const PLAYOFF_SIZE = 6

// Every pairing among `players` (indices), colours alternating between repeat games.
const roundRobin = (count, gamesPerMatch, prefix) => {
    const games = []
    for(let i = 0; i < count; i++){
        for(let j = i + 1; j < count; j++){
            for(let g = 0; g < gamesPerMatch; g++){
                const [white, black] = g % 2 == 0 ? [i, j] : [j, i]
                games.push({ id: `${prefix}-${white}-${black}-${g}`, white, black })
            }
        }
    }
    return games
}

// Plays every game at once across the training worker pool; returns points per player.
const playAll = async (players, games, settings, { onGameMove, onGameEnd }) => {
    const points = players.map(_ => 0)
    await Promise.all(games.map(async game => {
        const { result, plies } = await playTrainingGame({
            white: players[game.white],
            black: players[game.black],
            ...settings
        }, move => onGameMove?.(game.id, move))

        if(!result.winner){ points[game.white] += 0.5; points[game.black] += 0.5 }
        else points[result.winner == 'white' ? game.white : game.black] += 1
        onGameEnd?.(game.id, { result, plies })
    }))
    return points
}

// Runs `generations` rounds of a population of mutated evaluation-weight genomes playing each
// other; the top half (by points within the generation) survive and reseed the next generation.
// Every game of a generation is played at once across the training worker pool.
//
// Points only mean something within one generation (they depend on who else was in it), so the
// result isn't "most points ever": each generation's winner joins a hall of fame, and the last few
// play a final playoff against each other. The playoff winner is returned.
//
// Callbacks (all optional): onGeneration({ generation, generations, games, playoff }) when a
// generation (or the playoff) starts; onGameMove(id, { fen, from, to, ply }); onGameEnd(id, { result,
// plies }); onProgress({ generation, generations, bestFitnessThisGen, bestFitnessEver, standings }).
// paceMs: pause after each move so the games can be followed live (0 = full speed).
const runEvolution = async ({ generations = 6, populationSize = 8, gamesPerMatch = 2, baseGenome = DEFAULT_WEIGHTS, trainDepth = TRAIN_DEPTH, trainMs = TRAIN_TIME_MS, mutationRate = 0.3, paceMs = 0, onGeneration, onGameMove, onGameEnd, onProgress } = {}) => {
    const base = withNeutrals(baseGenome)
    let population = [base, ...Array.from({ length: Math.max(0, populationSize - 1) }, _ => mutate(base, mutationRate))]
    const settings = { depth: trainDepth, timeMs: trainMs, quiescence: true, maxPlies: TRAIN_MAX_PLIES, noProgressLimit: TRAIN_NO_PROGRESS_LIMIT, paceMs }
    const hallOfFame = []
    let bestFitnessEver = -Infinity

    for(let gen = 0; gen < generations; gen++){
        const games = roundRobin(population.length, gamesPerMatch, gen + 1)
        onGeneration?.({ generation: gen + 1, generations, populationSize, games, playoff: false })

        const points = await playAll(population, games, settings, { onGameMove, onGameEnd })
        const ranked = population
            .map((genome, idx) => ({ genome, idx, fitness: points[idx] }))
            .sort((a, b) => b.fitness - a.fitness)

        bestFitnessEver = Math.max(bestFitnessEver, ranked[0].fitness)
        if(!hallOfFame.includes(ranked[0].genome)) hallOfFame.push(ranked[0].genome)
        else { hallOfFame.splice(hallOfFame.indexOf(ranked[0].genome), 1); hallOfFame.push(ranked[0].genome) }

        onProgress?.({
            generation: gen + 1,
            generations,
            bestFitnessThisGen: ranked[0].fitness,
            bestFitnessEver,
            standings: ranked.map(r => ({ variant: r.idx + 1, points: r.fitness }))
        })

        const survivorCount = Math.max(2, Math.floor(populationSize / 2))
        const survivors = ranked.slice(0, survivorCount).map(r => r.genome)

        const nextPopulation = [...survivors]
        while(nextPopulation.length < populationSize){
            const parent = survivors[Math.floor(Math.random() * survivors.length)]
            nextPopulation.push(mutate(parent, mutationRate))
        }
        population = nextPopulation
    }

    // Final playoff among the most recent generation winners (most recent last).
    const finalists = hallOfFame.slice(-PLAYOFF_SIZE)
    if(finalists.length < 2) return { genome: finalists[0], fitness: bestFitnessEver, playoff: null }

    const games = roundRobin(finalists.length, Math.max(2, gamesPerMatch), 'playoff')
    onGeneration?.({ generation: generations, generations, populationSize: finalists.length, games, playoff: true })
    const points = await playAll(finalists, games, settings, { onGameMove, onGameEnd })

    // Ties go to the more recent winner (it survived more generations of competition).
    let winner = finalists.length - 1
    points.forEach((p, i) => { if(p > points[winner]) winner = i })
    const standings = finalists.map((_, i) => ({ variant: i + 1, points: points[i] })).sort((a, b) => b.points - a.points)
    onProgress?.({ generation: generations, generations, playoff: true, bestFitnessThisGen: points[winner], bestFitnessEver, standings })

    return { genome: finalists[winner], fitness: points[winner], playoff: standings }
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
const EVOLVED_DIR = path.join(__dirname, 'strategies', 'evolved')
const evolvedFile = id => path.join(EVOLVED_DIR, `${id}.js`)

// Reads a previously trained bot's weights and training history back out of its file, so a new
// run can carry on evolving it. Returns null if `id` isn't an evolved bot.
const readEvolvedBot = id => {
    if(typeof id != 'string' || !/^[a-zA-Z0-9]+$/.test(id)) return null
    let source
    try { source = fs.readFileSync(evolvedFile(id), 'utf8') }
    catch(e){ return null }

    const weights = source.match(/const weights = (\{[\s\S]*?\n\})/)
    const name = source.match(/name: '([^']+)'/)
    if(!weights || !name) return null

    return {
        id,
        name: name[1],
        genome: JSON.parse(weights[1]),
        generations: +(source.match(/generations=(\d+)/)?.[1] || 0),
        labOnly: /\n\s*labOnly: true,/.test(source),
        populationSize: +(source.match(/population=(\d+)/)?.[1] || 0) || undefined,
        playDepth: +(source.match(/maxDepth: (\d+)/)?.[1] || 0) || undefined,
        playMs: +(source.match(/timeLimitMs: (\d+)/)?.[1] || 0) || undefined
    }
}

const materializeGenome = (genome, meta = {}) => {
    let id, name
    if(meta.continueFrom){
        // Continuing an existing bot: keep its id (and with it its Elo record) and overwrite its file.
        ({ id, name } = meta.continueFrom)
    }
    else {
        const existingIds = new Set(botManager.getBotList().map(b => b.id))

        name = NAME_POOL.find(n => !existingIds.has(toId(n)))
        if(!name){
            let suffix = 2
            do { name = `${NAME_POOL[0]} ${suffix++}` } while(existingIds.has(toId(name)))
        }
        id = toId(name)
    }

    const totalGenerations = (meta.continueFrom?.generations || 0) + (meta.generations || 0)
    fs.mkdirSync(EVOLVED_DIR, { recursive: true })

    const weightsLiteral = JSON.stringify(genome, null, 4).split('\n').join('\n')

    const fileContents = `const { searchBot, evaluateWeighted } = require('../../engine')

// Weights discovered via self-play evolutionary training (generations=${totalGenerations}, population=${meta.populationSize ?? meta.continueFrom?.populationSize ?? '?'}).
const weights = ${weightsLiteral}

function strategy(state) {
    return searchBot({
        ...state,
        maxDepth: ${meta.playDepth ?? meta.continueFrom?.playDepth ?? PLAY_DEPTH},
        timeLimitMs: ${meta.playMs ?? meta.continueFrom?.playMs ?? PLAY_TIME_MS},
        quiescence: true,
        checkBonus: weights.checkBonus,
        evaluate: (board, color, ep, toMove) => evaluateWeighted(board, color, ep, weights, toMove)
    })
}

module.exports = {
    id: '${id}',
    name: '${name}',
    description: 'Discovered through self-play evolutionary training, not hand-tuned - its weights were earned by beating other variants of itself.',
    category: 'Evolved',${meta.continueFrom?.labOnly ? "\n    labOnly: true," : ''}
    icon: 'fa-dna',
    elo: 1000,
    play: strategy
}
`

    const filePath = evolvedFile(id)
    fs.writeFileSync(filePath, fileContents)

    delete require.cache[require.resolve(filePath)]
    botManager.registerBot(require(filePath), 'evolved', filePath)

    return { id, name, filePath, generations: totalGenerations, updated: Boolean(meta.continueFrom) }
}

// Freezes an evolved bot as it is right now: a lab-only copy (`<id>V<n>`, "<name> v<n>") that never
// changes again, so later versions can be measured against it and the pool keeps strong opponents.
// The copy's starting Elo (written into its file) is the original's current rating.
const snapshotEvolvedBot = id => {
    const original = readEvolvedBot(id)
    if(!original) throw new Error('Only bots made by training can be frozen')

    let n = 1
    while(fs.existsSync(evolvedFile(`${id}V${n}`))) n++
    const snapId = `${id}V${n}`
    const snapName = `${original.name} v${n}`

    const source = fs.readFileSync(evolvedFile(id), 'utf8')
        .replace(`id: '${id}'`, `id: '${snapId}'`)
        .replace(`name: '${original.name}'`, `name: '${snapName}'`)
        .replace(/\n\s*labOnly: true,/, '')
        .replace(/(category: '[^']*',)/, `$1\n    labOnly: true,`)
        .replace(/elo: \d+/, `elo: ${eloStore.getElo(id, 1000)}`)
        .replace(/description: '[^']*'/, `description: 'A frozen snapshot of ${original.name} (${original.generations} generations), kept as a fixed sparring partner for measuring newer versions.'`)

    const filePath = evolvedFile(snapId)
    fs.writeFileSync(filePath, source)

    delete require.cache[require.resolve(filePath)]
    botManager.registerBot(require(filePath), 'evolved', filePath)
    return { id: snapId, name: snapName, filePath }
}

module.exports = { runEvolution, materializeGenome, readEvolvedBot, snapshotEvolvedBot }
