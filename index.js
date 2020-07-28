require('dotenv').config()

const { WebClient } = require('@slack/web-api')
const { createEventAdapter } = require('@slack/events-api')
const { createMessageAdapter } = require('@slack/interactive-messages')
const express = require('express')
const bodyParser = require('body-parser')

const wc = new WebClient(process.env.SLACK_OAUTH_TOKEN)
const slackEvents = createEventAdapter(process.env.SLACK_SIGNING_SECRET)
const slackInteractions = createMessageAdapter(process.env.SLACK_SIGNING_SECRET)

const app = express()

app.use('/slack/events', slackEvents.expressMiddleware())
app.use('/slack/interactions', slackInteractions.expressMiddleware())
app.use(bodyParser.urlencoded({ extended: true }))

//pull in blocks from blocks files
const blocks = require('./blocks.js')
const utils = require('./utils.js')

//regexes
const checkChannelsRegex = /checkOldChannels/
const checkOnlineRegex = /checkIfOnline/

app.post('/slack/archive-init', async (req, res) => {
  //use body-parser to combat slack urlencoded weirdness
  let { user_id, trigger_id } = req.body

  console.log(`User ${user} opened the modal with trigger ID ${trigger_id}`)
  if (!utils.checkSigningSecret(req)) {
    res.status(401).send('Unauthorized')
    throw 'UnauthedAttempt'
  }

  //send an immediate 200 to slack so they don't complain
  res.status(200).send('')

  await wc.views.open({
    token: process.env.SLACK_OAUTH_TOKEN,
    trigger_id: trigger_id,
    view: blocks.requestInit()
  })
})

slackEvents.on('message', async event => {
  if (event.text.match(checkOnlineRegex)) {
    await react(event.channel, 'heavy_check_mark', event.ts)
  } else if (event.text.match(checkChannelsRegex)) {
    console.log('Checking for outdated channels!')
    const outdatedChannels = utils.getOldChannels
    for (i of outdatedChannels) {
      utils.renameDeadChannel(i)
      chat(
        process.env.SLACK_ADMIN_CHANNEL,
        `Archived <#${i}> due to inactivity`
      )
    }
  }
})

slackInteractions.action({ actionId: 'request_archive' }, async payload => {
  console.log(payload)
  console.log('user requested archive of a channel, sending to new payload')
  await wc.views.push({
    trigger_id: payload.trigger_id,
    view: blocks.requestArchive()
  })
})

slackInteractions.action({ actionId: 'request_unarchive' }, async payload => {
  console.log('user requested a channel unarchive')

  //unarchive channel & do things
  await wc.views.push({
    trigger_id: payload.trigger_id,
    view: blocks.requestUnarchive()
  })
})

slackInteractions.viewSubmission(
  { type: 'view_submission' }, //this is dumb and i know it's dumb, but it's required
  async (payload, respond) => {
    const block_id = await Object.keys(payload.view.state.values)[0] //dumb code for dumb api

    switch (block_id) {
      case 'archive_channel_select_block': {
        //do stuff - we have to figure out implemetation here
        throw 'NotYetImplemented'
      }
      case 'unarchive_channel_input_block': {
        const inputChannel = await payload.view.state.values[
          block_id
        ].unarchive_channel_input_action.value.replace('#', '')
        const channelId = await utils.getChannelId(inputChannel)
        await utils.unarchiveChannel(await channelId) //TODO - check if channel exists before unarchiving
        await utils.chat(
          channelId,
          `<@${payload.user.id}> unarchived this channel! Welcome back, everyone :wave:`
        )
        return {
          response_action: 'clear' //after unarchiving it will close the modal
        }
      }
      default: {
        return { response_action: 'clear' } //if the user does nothing it will close the modal
      }
    }
  }
)

app.listen(process.env.PORT || 3000, () => {
  console.log('listening')
})
