/**
 * @file Event History Command.
 * @author Maghish
 * @since 3.2.0
 * @version 3.2.0
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const {
	getEventsDB,
	formatUserList,
} = require('../../../functions/database/events');

/**
 * @type {import('../../../typings').SlashInteractionCommand}
 */
module.exports = {
	data: new SlashCommandBuilder()
		.setName('event_history')
		.setDescription(
			'View recent logged events or inspect details of a specific event',
		)
		.addStringOption((option) =>
			option
				.setName('event_id')
				.setDescription(
					'Specific Event ID to inspect (e.g. "EVT-0001")',
				)
				.setRequired(false),
		),
	cooldown: 3,

	async execute(interaction) {
		const eventIdInput = interaction.options.getString('event_id');
		const db = getEventsDB();

		if (db.events.length === 0) {
			return await interaction.reply({
				content:
					'-# No events have been logged yet! Use `/event_log` to record your first event.',
				ephemeral: true,
			});
		}

		// Inspect a specific event by ID.
		if (eventIdInput) {
			const targetId = eventIdInput.trim().toUpperCase();
			const event = db.events.find(
				(e) => e.id.toUpperCase() === targetId,
			);

			if (!event) {
				return await interaction.reply({
					content: `-# No event found with ID \`${targetId}\`.`,
					ephemeral: true,
				});
			}

			const ts = Math.floor(event.timestamp / 1000);
			const embed = new EmbedBuilder()
				.setTitle(`Event Record: ${event.name}`)
				.setDescription(
					`**Event ID:** \`${event.id}\`\n**Host:** <@${event.host_id}>\n**Date:** <t:${ts}:F> (<t:${ts}:R>)${event.role_id ? `\n**Role:** <@&${event.role_id}>` : ''}`,
				)
				.setColor('Gold')
				.addFields(
					{
						name: `Winners (${event.winners.length})`,
						value: formatUserList(event.winners),
						inline: false,
					},
					{
						name: `Participants (${event.participants.length})`,
						value: formatUserList(event.participants),
						inline: false,
					},
					{
						name: 'Pity Config',
						value: `+${event.pity_awarded} per loser (${event.losers.length} loser(s)) • Winner pity reset: ${event.pity_reset_on_win ? 'Yes' : 'No'}`,
						inline: false,
					},
				)
				.setTimestamp(event.timestamp);

			if (event.notes) {
				embed.addFields({
					name: 'Notes',
					value: event.notes.slice(0, 1024),
					inline: false,
				});
			}

			return await interaction.reply({ embeds: [embed] });
		}

		// List the 10 most recent events.
		const recentEvents = [...db.events].reverse().slice(0, 10);
		const lines = recentEvents.map((event) => {
			const ts = Math.floor(event.timestamp / 1000);
			const winnersText =
				event.winners.length > 0
					? formatUserList(event.winners, { maxChars: 120 })
					: 'None';
			return `**\`${event.id}\`** • **${event.name}** (<t:${ts}:R>)\n> 👥 ${event.participants.length} participant(s) • 🏆 ${winnersText} • +${event.pity_awarded} pity`;
		});

		const embed = new EmbedBuilder()
			.setTitle(`${interaction.guild.name} — Event History`)
			.setDescription(lines.join('\n\n'))
			.setColor('Blurple')
			.setFooter({
				text: `Showing latest ${recentEvents.length} of ${db.events.length} logged event(s) • Use /event_history event_id:<ID> for details`,
			})
			.setTimestamp();

		await interaction.reply({ embeds: [embed] });
	},
};
