/**
 * @file Event Stats & Pity Lookup Command.
 * @author Maghish
 * @since 3.2.0
 * @version 3.2.0
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getEventsDB } = require('../../../functions/database/events');

/**
 * @type {import('../../../typings').SlashInteractionCommand}
 */
module.exports = {
	data: new SlashCommandBuilder()
		.setName('event_stats')
		.setDescription(
			'View event participation, wins, loss streak, and pity points for a user',
		)
		.addUserOption((option) =>
			option
				.setName('user')
				.setDescription(
					'User to check event stats for (defaults to yourself)',
				)
				.setRequired(false),
		),
	cooldown: 3,

	async execute(interaction) {
		const targetUser =
			interaction.options.getUser('user') || interaction.user;

		const db = getEventsDB();
		const stats = db.users[targetUser.id] || {
			user_id: targetUser.id,
			participated: 0,
			won: 0,
			lost: 0,
			pity_points: 0,
			loss_streak: 0,
			best_loss_streak: 0,
			last_event_id: null,
			last_event_at: null,
		};

		const winRate =
			stats.participated > 0
				? `${((stats.won / stats.participated) * 100).toFixed(1)}%`
				: '0.0%';

		let lastEventText = 'None yet';
		if (stats.last_event_id) {
			const lastEvent = db.events.find(
				(e) => e.id === stats.last_event_id,
			);
			const ts = stats.last_event_at
				? `<t:${Math.floor(stats.last_event_at / 1000)}:R>`
				: '';
			lastEventText = lastEvent
				? `\`${lastEvent.id}\` — **${lastEvent.name}** ${ts}`.trim()
				: `\`${stats.last_event_id}\` ${ts}`.trim();
		}

		const embed = new EmbedBuilder()
			.setAuthor({
				name: `${targetUser.username}'s Event Stats`,
				iconURL: targetUser.displayAvatarURL(),
			})
			.setColor('Blurple')
			.addFields(
				{
					name: 'Pity Points',
					value: `**${stats.pity_points}**`,
					inline: true,
				},
				{
					name: 'Participated',
					value: `**${stats.participated}**`,
					inline: true,
				},
				{
					name: 'Win Rate',
					value: `**${winRate}**`,
					inline: true,
				},
				{
					name: 'Wins / Losses',
					value: `**${stats.won}** W / **${stats.lost}** L`,
					inline: true,
				},
				{
					name: 'Loss Streak',
					value: `Current: **${stats.loss_streak}**\nBest: **${stats.best_loss_streak}**`,
					inline: true,
				},
				{
					name: 'Last Event',
					value: lastEventText,
					inline: false,
				},
			)
			.setTimestamp();

		await interaction.reply({ embeds: [embed] });
	},
};
