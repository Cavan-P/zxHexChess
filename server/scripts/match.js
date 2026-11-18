// A/B match between two bots, for measuring whether a newly trained version is really stronger.
// Colours alternate every game; results do NOT touch the Elo ratings (eloRatings.json).
//
//   npm run match -- adaKessler adaKesslerV1 100 [--seconds 1]
//
// --seconds plays trained bots at that time per move instead of their own (5 s for Ada). Which one
// is stronger mostly holds at faster speeds, so this gets a reliable answer in far less time.
//
// Prints the score, the Elo difference it implies with a rough 95% interval, and a verdict.
// Games run on the training worker threads, several at a time.
const botManager = require('../src/ai/botManager')
const { playTrainingGame, shutdown, POOL_SIZE } = require('../src/ai/trainPool')

const argv = process.argv.slice(2)
const secIdx = argv.indexOf('--seconds')
const botTimeMs = secIdx >= 0 ? Math.round(Math.min(60, Math.max(0.1, +argv[secIdx + 1] || 1)) * 1000) : undefined
if(secIdx >= 0) argv.splice(secIdx, 2)
const [idA, idB, gamesArg = '100'] = argv
const games = Math.max(2, Math.floor(+gamesArg) || 100)
if(!idA || !idB) { console.error('Usage: npm run match -- <botA> <botB> [games=100]'); process.exit(1) }
for(const id of [idA, idB]) if(!botManager.hasBot(id)) { console.error(`Unknown bot: ${id}`); process.exit(1) }

const name = id => botManager.getBotList().find(b => b.id == id)?.name || id
const eloFromScore = s => s <= 0 ? -Infinity : s >= 1 ? Infinity : -400 * Math.log10(1 / s - 1)
const fmt = e => !isFinite(e) ? (e > 0 ? '+inf' : '-inf') : `${e >= 0 ? '+' : ''}${Math.round(e)}`

const tally = { win: 0, draw: 0, loss: 0 }
const reasons = {}
let played = 0
const started = Date.now()

const main = async _ => {
    console.log(`${name(idA)} vs ${name(idB)}: ${games} games, colours alternating, ${POOL_SIZE} at a time${botTimeMs ? `, ${botTimeMs / 1000} s per move` : ''}\n`)

    await Promise.all(Array.from({ length: games }, async (_, g) => {
        const [white, black] = g % 2 == 0 ? [idA, idB] : [idB, idA]
        const { result } = await playTrainingGame({ whiteBot: white, blackBot: black, maxPlies: 300, noProgressLimit: 100, botTimeMs })
        const winner = result.winner && (result.winner == 'white' ? white : black)
        if(!winner) tally.draw++
        else if(winner == idA) tally.win++
        else tally.loss++
        reasons[result.reason] = (reasons[result.reason] || 0) + 1
        played++
        const score = (tally.win + tally.draw / 2) / played
        console.log(`[${played}/${games}] ${name(white)} (W) vs ${name(black)} (B): ${winner ? `${name(winner)} wins` : 'draw'} (${result.reason})   running: +${tally.win} =${tally.draw} -${tally.loss} (${(score * 100).toFixed(1)}%)`)
    }))

    const n = played
    const score = (tally.win + tally.draw / 2) / n
    // Standard error of the per-game score (1 / ½ / 0), then a 95% interval mapped to Elo.
    const variance = (tally.win * (1 - score) ** 2 + tally.draw * (0.5 - score) ** 2 + tally.loss * score ** 2) / n
    const se = Math.sqrt(variance / n)
    const lo = eloFromScore(Math.max(0, score - 1.96 * se)), hi = eloFromScore(Math.min(1, score + 1.96 * se))

    console.log(`\n${name(idA)}: +${tally.win} =${tally.draw} -${tally.loss}  score ${(score * 100).toFixed(1)}%`)
    console.log(`Elo difference: ${fmt(eloFromScore(score))}  (95%: ${fmt(lo)} to ${fmt(hi)})`)
    console.log(`Endings: ${Object.entries(reasons).map(([r, c]) => `${r} ${c}`).join(', ')}`)
    console.log(`Took ${Math.round((Date.now() - started) / 1000)}s`)
    console.log(lo > 0 ? `Verdict: ${name(idA)} is stronger.`
        : hi < 0 ? `Verdict: ${name(idB)} is stronger.`
        : 'Verdict: not conclusive yet - play more games to tell them apart.')
    // When run by scripts/overnight.js, hand it the numbers.
    process.send?.({ ...tally, score, elo: eloFromScore(score), lo, hi })
}

main().catch(e => { console.error(e); process.exitCode = 1 }).finally(shutdown)
