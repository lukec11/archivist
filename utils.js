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

/**
 * Unarchives a channel based
 * @param {String} channelId - ID of channel to be archived
 */
const unarchiveChannel = async channelId => {
  return await wc.conversations.unarchive({
    token: process.env.SLACK_OAUTH_TOKEN,
    channel: channelId
  })
}

/**
 * Not implemented yet - need an implementation for archive requests
 */
const postChannelPoll = async (channelId, user) => {
  //do stuff
}

/**
 * Renames a channel
 * @param {String} channelId - ID of channel to be archived
 * @param {String} newName - new name of the channel
 */
const renameChannel = async (channelId, newName) => {
  return await wc.conversations.rename({
    token: process.env.SLACK_ADMIN_TOKEN,
    channel: channelId,
    name: newName
  })
}

/**
 * Uses slack edgeapis to get channel name.
 * The only other method of doing this is collecting every channel and its info whenever someone requests an archive - possible, but slow. This works better but is undocumented.
 * I could also collect & cache at startup - but if someone tries to archive a newly created channel this wouldn't work well.
 * @param {String} channelName - channel name
 */
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
  if (
    response.results.length === 0 ||
    response.results[0].name !== channelName
  ) {
    return null //null return if nothing matches
  }
  /*
   * returns null if:
   * There are no results in the response array
   * The first name isn't a match for the inputted channel
   */

  return await response.results[0].id
}

/**
 * Sends a public message to a channel
 * @param {String} channelId - ID of channel to send to
 * @param {String} text - text of the message to send. does NOT support JSON blocks.
 */
const chat = async (channelId, text) => {
  return await wc.chat.postMessage({
    token: process.env.SLACK_OAUTH_TOKEN,
    channel: channelId,
    text: text
  })
}

/**
 * React to a message
 * @param {String} channelId - channel to react in
 * @param {string} reaction - the name of the reaction to send
 * @param {float} ts - a decimal number representing the timestamp of the message to react to
 */
const react = async (channelId, reaction, ts) => {
  return await wc.reactions.add({
    token: process.env.SLACK_OAUTH_TOKEN,
    channel: channelId,
    timestamp: ts,
    name: reaction
  })
}

//literally the opposite of the above
const unreact = async (channelId, reaction, ts) => {
  return await wc.reactions.remove({
    token: process.env.SLACK_OAUTH_TOKEN,
    channel: channelId,
    timestamp: ts,
    name: reaction
  })
}
/**
 * Join a channel
 * @param {String} channelId - channel to join
 */
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

/*
 * Get a list of club channel IDs
 */
const getClubChannels = async () => {
  let clubChannels = []
  const clubs = await fetch(
    'https://api2.hackclub.com/v0.1/Operations/Clubs?select=%7B%22fields%22:[%22Name%22,%22Slack%20Channel%20ID%22]%7D'
  )
  const clubJson = await clubs.json()

  for (const i of clubJson) {
    clubChannels.push(await i.fields['Slack Channel ID'])
  }

  return await clubChannels
}

/**
 * Gets a list of all channels without activity in the last {age} seconds
 * Warning - this is going to take a long time to complete. Don't make it contingent on the 200ms slack default response time..
 * (this also means avoid serverless - many of those shut down quickly after returning a response)
 * @param {int} age - the time in seconds that the channel should be older than to be considered "old"
 */
const getOldChannels = async age => {
  let deadChannels = []
  let currentDate = getSeconds(new Date())
  try {
    const clubChannels = await getClubChannels()
    for await (let page of wc.paginate('conversations.list', {
      token: process.env.SLACK_OAUTH_TOKEN,
      exclude_archived: true,
      types: 'public_channel'
    })) {
      for (let channel of page.channels) {
        if (!channel.is_member) {
          await joinChannel(channel.id)
        }
        const lastMessage = await wc.conversations.history({
          token: process.env.SLACK_OAUTH_TOKEN, //NOTE: This method has a tier 3 rate limit. Make sure it doesn't execed or there is a catch in place
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
          currentDate - (await lastMessageTs) > age &&
          !clubChannels.includes(channel.id)
        ) {
          console.log(`Dead channel found: ${channel.id}!`)
          deadChannels.push(channel.id)
        }
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
      await chat(
        process.env.SLACK_ADMIN_CHANNEL,
        `Failed to get info for rename on <#${channelId}> :(`
      )
      console.log(`Couldn't get info on ${channelId}!`)
      throw 'channelInfoNotGathered'
    }

    const channelName = channelInfo.channel.name_normalized
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
    console.error(err)
    console.log(`Failed to rename dead channel ${channelId}!`)
    chat(
      process.env.SLACK_ADMIN_CHANNEL,
      `Failed to rename dead channel <#${channelId}>!`
    )
  }
}

const archiveChannel = async channelId => {
  return await wc.conversations.archive({
    token: process.env.SLACK_ADMIN_TOKEN,
    channel: channelId
  })
}

module.exports = {
  checkSigningSecret,
  unarchiveChannel,
  postChannelPoll,
  renameChannel,
  getChannelId,
  chat,
  react,
  unreact,
  joinChannel,
  getClubChannels,
  getOldChannels,
  renameDeadChannel,
  archiveChannel
}
