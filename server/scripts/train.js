// Trains an evolved bot from the command line, the same as "Keep training" in the Lab, without the
// server running. The result is saved into the bot's file (its id, Elo record and play settings
// are kept).
//
//   npm run train -- [--bot adaKessler] [--gens 30] [--pop 16] [--games 2] [--depth 3] [--seconds 0.25]
//
// scripts/overnight.js runs this and then a match, unattended.
const { runEvolution, materializeGenome, readEvolvedBot } = require('../src/ai/evolve')
const { shutdown } = require('../src/ai/trainPool')

const args = process.argv.slice(2)
const flag = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback }
const id = flag('bot', 'adaKessler')
const generations = Math.min(200, Math.max(1, Math.round(+flag('gens', 30))))
const populationSize = Math.min(32, Math.max(2, Math.round(+flag('pop', 16))))
const gamesPerMatch = Math.min(4, Math.max(1, Math.round(+flag('games', 2))))
const trainDepth = Math.min(6, Math.max(1, Math.round(+flag('depth', 3))))
const trainMs = Math.round(Math.min(5, Math.max(0.05, +flag('seconds', 0.25))) * 1000)

const bot = readEvolvedBot(id)
if(!bot) { console.error(`${id} isn't a trained bot`); process.exit(1) }
if(bot.labOnly) { console.error(`${id} is a frozen snapshot - train the original bot instead`); process.exit(1) }

const started = Date.now()
const mins = ms => `${Math.round(ms / 60000)} min`

const main = async _ => {
    console.log(`Training ${bot.name} (${bot.generations} generations so far): ${generations} generations, population ${populationSize}, ${gamesPerMatch} games per pairing, depth ${trainDepth} / ${trainMs} ms\n`)
    const best = await runEvolution({
        generations, populationSize, gamesPerMatch, trainDepth, trainMs,
        baseGenome: bot.genome,
        onProgress: p => {
            const elapsed = Date.now() - started
            if(p.playoff) return console.log(`Playoff: ${p.standings.map(s => `#${s.variant} ${s.points}`).join(', ')}`)
            const eta = elapsed / p.generation * (p.generations - p.generation)
            console.log(`Generation ${p.generation}/${p.generations}: best ${p.bestFitnessThisGen} points   (${mins(elapsed)} so far, ~${mins(eta)} left)`)
        }
    })
    const created = materializeGenome(best.genome, { generations, populationSize, continueFrom: bot })
    console.log(`\nSaved ${created.name ?? bot.name} (${bot.generations + generations} generations). Took ${mins(Date.now() - started)}.`)
    process.send?.({ ok: true })
}

main().catch(e => { console.error(e); process.exitCode = 1 }).finally(shutdown)
