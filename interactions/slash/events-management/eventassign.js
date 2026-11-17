/**
 * @file Event participants role assign command.
 * @auther Maghish
 * @since 3.1.0
 * @version 3.1.0
 */

const { VoiceChannel, StageChannel } = require('discord.js');
const { SlashCommandBuilder } = require('discord.js');
const config = require('../../../config.json');

/**
 * @type {import('../../../typings').SlashInteractionCommand}
 */
module.exports = {
	data: new SlashCommandBuilder()
		.setName('event_assign')
		.setDescription(
			'Assign people on certain voice channel or stage channel the event participants role',
		)
		.addChannelOption((option) =>
			option
				.setName('channel')
				.setDescription(
					'Stage or voice channel whose participants are to be assigned',
				)
				.setRequired(true),
		)
		.addRoleOption((option) =>
			option
				.setName('role')
				.setDescription('The role to assign')
				.setRequired(true),
		),
	cooldown: 0,

	async execute(interaction) {
		if (config.internal.owner_id !== interaction.user.id) {
			await interaction.reply({
				content: '-# Access Denied',
			});
		}

		/** @type {import('discord.js').Channel} */
		const channel = interaction.options.getChannel('channel', true);
		if (
			!(channel instanceof VoiceChannel) &&
			!(channel instanceof StageChannel)
		) {
			await interaction.reply({
				content:
					'-# Invalid channel, only stage & voice channels are accepted',
			});
		}

		// Fetch the role
		/** @type {import('discord.js').Role} */
		const role = interaction.options.getRole('role', true);

		// Re-declare the channel variable for type safety
		/** @type {import('discord.js').VoiceChannel | import('discord.js').StageChannel} */
		const c = channel;

		// Successful role addition operation counter
		let s = 0;

		c.members.forEach((member) => {
			member.roles.add(role);
			s++;
		});

		await interaction.reply({
			content: `-# Added <@&${role.id}> to **${s}** members`,
		});
	},
};
