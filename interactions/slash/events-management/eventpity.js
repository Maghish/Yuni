/**
 * @file Event Pity Leaderboard & Management Command.
 * @author Maghish
 * @since 3.2.0
 * @version 3.2.0
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../../config.json');
const {
	getEventsDB,
	adjustUserPity,
} = require('../../../functions/database/events');

const SORT_LABELS = {
	pity_points: 'Pity Points',
	participated: 'Events Participated',
	won: 'Events Won',
	loss_streak: 'Current Loss Streak',
};

/**
 * @type {import('../../../typings').SlashInteractionCommand}
 */
module.exports = {
	data: new SlashCommandBuilder()
		.setName('event_pity')
		.setDescription(
			'View the event pity leaderboard or manage user pity points',
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName('leaderboard')
				.setDescription(
					'View the top members by pity points, participation, wins, or loss streak',
				)
				.addStringOption((option) =>
					option
						.setName('sort')
						.setDescription('Stat to rank by (default: Pity Points)')
						.addChoices(
							{ name: 'Pity Points', value: 'pity_points' },
							{
								name: 'Events Participated',
								value: 'participated',
							},
							{ name: 'Events Won', value: 'won' },
							{
								name: 'Current Loss Streak',
								value: 'loss_streak',
							},
						)
						.setRequired(false),
				),
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName('manage')
				.setDescription(
					'Add, remove, set, or reset a user\'s pity points (Owner only)',
				)
				.addUserOption((option) =>
					option
						.setName('user')
						.setDescription('Target user')
						.setRequired(true),
				)
				.addStringOption((option) =>
					option
						.setName('action')
						.setDescription('Action to perform')
						.addChoices(
							{ name: 'Add', value: 'add' },
							{ name: 'Remove', value: 'remove' },
							{ name: 'Set', value: 'set' },
							{ name: 'Reset to 0', value: 'reset' },
						)
						.setRequired(true),
				)
				.addIntegerOption((option) =>
					option
						.setName('amount')
						.setDescription(
							'Amount of pity points (required for add/remove/set)',
						)
						.setMinValue(0)
						.setRequired(false),
				)
				.addStringOption((option) =>
					option
						.setName('reason')
						.setDescription(
							'Optional reason (e.g. "Redeemed pity reward")',
						)
						.setRequired(false),
				),
		),
	cooldown: 3,

	async execute(interaction) {
		const subcommand = interaction.options.getSubcommand();

		if (subcommand === 'leaderboard') {
			const sortBy =
				interaction.options.getString('sort') || 'pity_points';
			const db = getEventsDB();
			const allUsers = Object.values(db.users);

			const ranked = allUsers
				.filter((u) => u[sortBy] > 0 || u.participated > 0)
				.sort((a, b) => {
					if (b[sortBy] !== a[sortBy]) return b[sortBy] - a[sortBy];
					if (b.pity_points !== a.pity_points)
						return b.pity_points - a.pity_points;
					return b.participated - a.participated;
				})
				.slice(0, 10);

			if (ranked.length === 0) {
				return await interaction.reply({
					content:
						'-# No event stats recorded yet! Log an event with `/event_log` first.',
					ephemeral: true,
				});
			}

			const description = ranked
				.map(
					(u, index) =>
						`**${index + 1}.** <@${u.user_id}> — **${u.pity_points}** pity • ${u.participated} played • ${u.won}W/${u.lost}L (${u.loss_streak} streak)`,
				)
				.join('\n');

			const embed = new EmbedBuilder()
				.setTitle(
					`${interaction.guild.name} — Event Leaderboard (${SORT_LABELS[sortBy]})`,
				)
				.setDescription(description)
				.setColor('Gold')
				.setFooter({
					text: `Total logged events: ${db.events.length}`,
				})
				.setTimestamp();

			return await interaction.reply({ embeds: [embed] });
		}

		if (subcommand === 'manage') {
			if (config.internal.owner_id !== interaction.user.id) {
				return await interaction.reply({
					content: '-# Access Denied',
					ephemeral: true,
				});
			}

			const targetUser = interaction.options.getUser('user', true);
			const action = interaction.options.getString('action', true);
			const amount = interaction.options.getInteger('amount');
			const reason = interaction.options.getString('reason');

			if (action !== 'reset' && amount === null) {
				return await interaction.reply({
					content: `-# Please specify an \`amount\` when using the \`${action}\` action.`,
					ephemeral: true,
				});
			}

			const result = adjustUserPity(targetUser.id, action, amount ?? 0);

			const embed = new EmbedBuilder()
				.setTitle('Pity Points Updated')
				.setColor('Green')
				.addFields(
					{
						name: 'User',
						value: `<@${targetUser.id}>`,
						inline: true,
					},
					{
						name: 'Action',
						value:
							action === 'reset'
								? 'Reset to 0'
								: `${action.toUpperCase()} (${amount})`,
						inline: true,
					},
					{
						name: 'Pity Points',
						value: `${result.previous} → **${result.current}**`,
						inline: true,
					},
				)
				.setTimestamp();

			if (reason) {
				embed.addFields({
					name: 'Reason',
					value: reason.slice(0, 1024),
					inline: false,
				});
			}

			return await interaction.reply({ embeds: [embed] });
		}
	},
};
