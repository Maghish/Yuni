/**
 * @file Event participants role reset command.
 * @author Maghish
 * @since 3.1.0
 * @version 3.1.0
 */

const { SlashCommandBuilder } = require('discord.js');
const config = require('../../../config.json');

/**
 * @type {import('../../../typings').SlashInteractionCommand}
 */
module.exports = {
	data: new SlashCommandBuilder()
		.setName('event_reset')
		.setDescription('Reset the event participants role')
		.addRoleOption((option) =>
			option
				.setName('role')
				.setDescription('The role to reset')
				.setRequired(true),
		),
	cooldown: 0,

	async execute(interaction) {
		if (config.internal.owner_id !== interaction.user.id) {
			await interaction.reply({
				content: '-# Access Denied',
				ephemeral: true,
			});
		}

		/** @type {import('discord.js').Role} */
		const role = interaction.options.getRole('role', true);

		// Successful role removal counter
		let r = 0;

		role.members.forEach((member) => {
			member.roles.remove(role);
			r++;
		});

		await interaction.reply({
			content: `-# Removed <@&${role.id}> from **${r}** members`,
		});
	},
};
