// Re-fits every bot's rating from the full tournament game log (data/botGames.jsonl), with Milo
// Pruitt pinned at 400, and prints old vs new. Nothing is written unless you pass --write.
//
//   npm run rate                    # preview
//   npm run rate -- --write         # save to data/eloRatings.json
//   npm run rate -- --all-versions  # also count games from older versions of reworked bots
//
// "±" is one standard error: the true rating is within about twice that of the number shown, 95% of
// the time. Bots marked "no games" haven't played in their current version and keep their old rating.
const { computeRatings, saveRatings, FLOOR } = require('../src/ai/botRatings')

const args = process.argv.slice(2)
const write = args.includes('--write')
const allVersions = args.includes('--all-versions')

const result = computeRatings({ allVersions })
console.log(`Games used: ${result.gamesUsed}${result.gamesSkipped ? `  (skipped ${result.gamesSkipped} from older bot versions or removed bots${allVersions ? '' : ' - see --all-versions'})` : ''}`)

if(!result.ok){
    console.error(result.reason)
    process.exit(1)
}

const pad = (s, n) => String(s).padEnd(n)
const lpad = (s, n) => String(s).padStart(n)
const sign = n => `${n >= 0 ? '+' : ''}${n}`

console.log(`Anchor: ${result.anchor.id} = ${result.anchor.elo}.  Moving first is worth ${sign(Math.round(result.whiteAdvantage.elo))} ± ${Math.round(result.whiteAdvantage.se)}.\n`)
console.log(`${pad('Bot', 24)}${lpad('Old', 6)}${lpad('New', 7)}${lpad('±', 6)}${lpad('Change', 8)}   W-L-D`)
for(const r of result.rows){
    const name = `${r.name}${r.labOnly ? ' (lab)' : ''}`
    if(r.status != 'rated'){
        console.log(`${pad(name, 24)}${lpad(r.oldElo ?? '-', 6)}${lpad('-', 7)}${lpad('', 6)}${lpad('', 8)}   ${r.status}`)
        continue
    }
    const floored = r.rawElo < FLOOR ? '*' : ' '
    const change = r.oldElo == null ? '' : sign(r.elo - r.oldElo)
    console.log(`${pad(name, 24)}${lpad(r.oldElo ?? '-', 6)}${lpad(r.elo, 6)}${floored}${lpad(Math.round(r.se), 6)}${lpad(change, 8)}   ${r.wins}-${r.losses}-${r.draws}`)
}
if(result.rows.some(r => r.rawElo < FLOOR)) console.log(`\n* below the ${FLOOR} floor; shown as ${FLOOR}`)

if(write){
    saveRatings(result)
    console.log('\nSaved to data/eloRatings.json')
}
else console.log('\nPreview only - run with --write to save.')
