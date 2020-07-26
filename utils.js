require('dotenv').config()

const { WebClient } = require('@slack/web-api')
const fetch = require('node-fetch')
const wc = new WebClient(process.env.SLACK_OAUTH_TOKEN)

//to verify secrets from slack
const crypto = require('crypto')
const tsscmp = require('tsscmp')
const { verifyRequestSignature } = require('@slack/events-api')

const blocks = require('./blocks.js')

/**
 * Verifies whether or not a request from slack is legitimate
 * @param {Object} req | the express request object
 */
const checkSigningSecret = req => {
  const reqSignature = req.headers['x-slack-signature']
  const reqTs = req.headers['x-slack-request-timestamp']

  //create HMAC
  const hmac = crypto.createHmac('sha256', process.env.SLACK_SIGNING_SECRET)

  //update HMAC from slack
  const [version, hash] = reqSignature.split('=')
  hmac.update(`${version}:${reqTs}:${JSON.stringify(req.body)}`)

  //returns boolean value of true or false
  return tsscmp(hash, hmac.digest('hex'))
}

const unarchiveChannel = async channelId => {
  return await wc.conversations.unarchive({
    token: process.env.SLACK_XOXS_TOKEN,
    channel: channelId
  })
}

const postChannelPoll = async (channelId, user) => {
  //do stuff
}

const renameChannel = async (channelId, newName) => {
  return await wc.conversations.rename({
    channel: channelId,
    name: newName
  })
}

const getChannelId = async channelName => {
  const res = await fetch(
    `https://edgeapi.slack.com/cache/${process.env.SLACK_TEAM_ID}/channels/search`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        token: process.env.SLACK_XOXS_TOKEN,
        query: channelName,
        count: 1,
        filter: 'archived'
      })
    }
  )
  const response = await res.json()
  if (!(await response.results[0].name) === channelName) {
    throw 'NotSameChannelError'
  }
  if (!(await response.results.length) === 0) {
    return null
  }
  return await response.results[0].id
}

const chat = async (channelId, text) => {
  return await wc.chat.postMessage({
    token: process.env.SLACK_OAUTH_TOKEN,
    channel: channelId,
    text: text
  })
}

const react = async (channelId, reaction, ts) => {
  return await wc.reactions.add({
    token: process.env.SLACK_OAUTH_TOKEN,
    channel: channelId,
    timestamp: ts,
    reaction: reaction
  })
}

const joinChannel = async channelId => {
  await wc.conversations.join({
    channel: channelId
  })
}

/**
 * @param {Date} date | a JavaScript "date" object
 */
const getSeconds = date => {
  return date.getTime() / 1000
}

/**
 * Gets a list of all channels without activity in the last 6 months
 * Warning - this is going to take a long time to complete. Don't make it contingent on the 200ms.
 * (this also means it can't run serverless, as those shut down quickly after returning a response)
 * @param {int} age - the time in seconds that the channel should be older than to be considered "old"
 */
const getOldChannels = async age => {
  let deadChannels = []
  let currentDate = getSeconds(new Date())

  try {
    let channels = await wc.conversations.list({
      token: process.env.SLACK_OAUTH_TOKEN,
      exclude_archived: true, //don't show already-archived channels
      limit: 1000 //1000 is max count of channels - can get around this if necessary but it's annoying so not going to bother yet
    })

    channels = channels.channels

    for (let channel of channels) {
      if (!channel.is_member) {
        await joinChannel(channel.id)
      }
      const lastMessage = await wc.conversations.history({
        token: process.env.SLACK_OAUTH_TOKEN, //NOTE: This is a tier 3 rate limit. Make sure it doesn't execed or there is a catch in place
        channel: channel.id,
        limit: 1 //limits to only the last sent message
      })
      if (!(await lastMessage.ok)) {
        // check if it wasn't able to successfully get the message
        await chat(
          process.env.SLACK_ADMIN_CHANNEL,
          `Experienced an error when getting messages for <#${channel.id}>!`
        )
        console.log(`Failed to get messages for #${channel.name}!`)
        continue
      }
      if ((await lastMessage.messages.length) === 0) {
        console.log(
          `Couldn't calculate age of #${channel.name} (no messages), ignoring!`
        )
        continue
      }
      const lastMessageTs = await lastMessage.messages[0].ts //gets the unix timestamp of the last message, in seconds

      if (
        currentDate - (await lastMessageTs) >
        age // &&
        //				!clubChannels.includes(channel.id)
      ) {
        console.log(`Dead channel found: ${channel.id}!`)
        deadChannels.push(channel.id)
      }
    }

    return await deadChannels
  } catch (err) {
    console.log(`Error while looking for dead channels! ${err}`)
    await chat(
      process.env.SLACK_ADMIN_CHANNEL,
      `Error while looking for dead channels! Trace: \`\`\`${err}\`\`\``
    )
  }
}

const renameDeadChannel = async channelId => {
  try {
    const channelInfo = await wc.conversations.info({
      token: process.env.SLACK_OAUTH_TOKEN,
      channel: channelId
    })

    if (!(await channelInfo.ok)) {
      //check for an error in getting channel info
      chat(
        process.env.SLACK_ADMIN_CHANNEL,
        `Failed to get info for rename on <#${channelId}> :(`
      )
      console.log(`Couldn't get info on ${channelId}!`)
      throw 'channelInfoNotGathered'
    }

    const chnanelName = await channelInfo.channel.name
    if ((await getChannelId(`zzz-${channelName}`)) != null) {
      //this means the zzz- channel already exists! that's bad.
      console.log(
        `An archived channel with this name already exists! We can't archive it.`
      )
      chat(
        process.env.SLACK_ADMIN_CHANNEL,
        `An archived copy of <#${channelId}> already exists, we couldn't archive it.`
      )
      throw 'ArchiveAlreadyExists'
    }

    renameChannel(channelId, `zzz-${channelName}`)
  } catch (err) {
    console.log(`Failed to rename dead channel ${channelId}!`)
    chat(
      process.env.SLACK_ADMIN_CHANNEL,
      `Failed to rename dead channel <#${channelId}>!`
    )
  }
}

module.exports = {
  checkSigningSecret,
  unarchiveChannel,
  postChannelPoll,
  renameChannel,
  getChannelId,
  chat,
  react,
  joinChannel,
  getOldChannels,
  renameDeadChannel
}
