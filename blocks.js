const requestArchive = channel => {
	return {
		title: {
			type: 'plain_text',
			text: 'Archivist',
			emoji: true,
		},
		type: 'modal',
		close: {
			type: 'plain_text',
			text: 'Close',
			emoji: true,
		},
		blocks: [
			{
				type: 'section',
				text: {
					type: 'mrkdwn',
					text:
						"Sorry, we don't support requesting archives right now :disappointed: Check back later for more info.",
				},
			},
			{
				type: 'context',
				elements: [
					{
						type: 'plain_text',
						text:
							'Note: Channels will still be auto-archived after 6 months of inactivity!',
						emoji: true,
					},
				],
			},
			{
				type: 'divider',
			},
			{
				type: 'section',
				text: {
					type: 'mrkdwn',
					text:
						'In the meantime, if you need a channel archived, head over to <#C0C78SG9L|hq> or message someone in <!subteam^S0DJXPY14|staff>.',
				},
			},
		],
	};
};
const requestUnarchive = () => {
	return {
		title: {
			type: 'plain_text',
			text: 'Unarchive channel',
			emoji: true,
		},
		submit: {
			type: 'plain_text',
			text: 'Submit',
			emoji: true,
		},
		type: 'modal',
		close: {
			type: 'plain_text',
			text: 'Cancel',
			emoji: true,
		},
		blocks: [
			{
				type: 'section',
				text: {
					type: 'mrkdwn',
					text:
						'Awesome! What channel would you like to :unlock: unarchive?',
				},
			},
			{
				type: 'divider',
			},
			{
				type: 'input',
				block_id: 'unarchive_channel_input_block',
				element: {
					type: 'plain_text_input',
					action_id: 'unarchive_channel_input_action',
				},
				label: {
					type: 'plain_text',
					text: 'Select a channel (eg. #lounge)',
					emoji: true,
				},
			},
		],
	};
};
const requestInit = () => {
	return {
		title: {
			type: 'plain_text',
			text: 'Archivist',
			emoji: true,
		},
		type: 'modal',
		close: {
			type: 'plain_text',
			text: 'Close',
			emoji: true,
		},
		blocks: [
			{
				type: 'section',
				text: {
					type: 'mrkdwn',
					text:
						"Hi there <@U012JBKFLUF>, I'm <@A017AQA46BF|Archivist>! I can help you out with all of your channel archiving needs.",
				},
			},
			{
				type: 'divider',
			},
			{
				type: 'section',
				text: {
					type: 'plain_text',
					text:
						'Would you like to request an archive or unarchive today?',
					emoji: true,
				},
			},
			{
				type: 'actions',
				elements: [
					{
						type: 'button',
						text: {
							type: 'plain_text',
							text: 'Archive (WIP)',
							emoji: true,
						},
						value: 'request_archive',
						action_id: 'request_archive',
						style: 'danger',
					},
					{
						type: 'button',
						text: {
							type: 'plain_text',
							text: 'Unarchive',
							emoji: true,
						},
						value: 'request_unarchive',
						action_id: 'request_unarchive',
						style: 'primary',
					},
				],
			},
		],
	};
};

module.exports = {
	requestInit,
	requestUnarchive,
	requestArchive,
};
