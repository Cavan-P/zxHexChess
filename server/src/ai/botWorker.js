
const { parentPort } = require('worker_threads')
const botManager = require('./botManager')

parentPort.on('message', ({ type, jobId, botId, state }) => {
    // Sent when a bot's file is rewritten (e.g. further training), so this thread stops using the old copy.
    if(type == 'reload') return botManager.reload()

    try {
        let play = botManager.getBotByName(botId)

        if(!play){
            botManager.reload()
            play = botManager.getBotByName(botId)
        }

        if(!play) throw new Error(`Unknown bot: ${botId}`)

        parentPort.postMessage({ jobId, move: play(state) || null })
    }
    catch(e){
        parentPort.postMessage({ jobId, error: e.message })
    }
})
