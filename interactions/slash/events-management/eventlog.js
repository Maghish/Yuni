/**
 * @file Event Log & Pity Award Command.
 * @author Maghish
 * @since 3.2.0
 * @version 3.2.0
 */

const {
	SlashCommandBuilder,
	EmbedBuilder,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	UserSelectMenuBuilder,
} = require('discord.js');
const config = require('../../../config.json');
const {
	recordEvent,
	formatUserList,
} = require('../../../functions/database/events');

/**
 * Builds the public summary embed after an event is logged.
 * @param {import('../../../typings').EventLogEntry} event
 * @returns {EmbedBuilder}
 */
function buildLoggedEventEmbed(event) {
	const ts = Math.floor(event.timestamp / 1000);
	const pityText =
		event.losers.length > 0 && event.pity_awarded > 0
			? `+${event.pity_awarded} pity point(s) awarded to ${event.losers.length} participant(s)`
			: 'No pity points awarded';

	const winnerResetText = event.pity_reset_on_win
		? 'Winner pity reset to 0'
		: 'Winner pity kept';

	const embed = new EmbedBuilder()
		.setTitle(`Event Logged: ${event.name}`)
		.setDescription(
			`**Event ID:** \`${event.id}\`\n**Host:** <@${event.host_id}>\n**Recorded:** <t:${ts}:F> (<t:${ts}:R>)`,
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
				name: 'Pity Summary',
				value: `${pityText}\n${winnerResetText}`,
				inline: false,
			},
		)
		.setFooter({
			text: 'Run /event_reset when you are ready to clear the participant role.',
		})
		.setTimestamp(event.timestamp);

	if (event.notes) {
		embed.addFields({
			name: 'Notes',
			value: event.notes.slice(0, 1024),
			inline: false,
		});
	}

	return embed;
}

/**
 * @type {import('../../../typings').SlashInteractionCommand}
 */
module.exports = {
	data: new SlashCommandBuilder()
		.setName('event_log')
		.setDescription(
			'Log an event from a participant role, record winners, and award pity points to losers',
		)
		.addStringOption((option) =>
			option
				.setName('name')
				.setDescription(
					'Event name (e.g. "Valorant 5v5", "Simon Says")',
				)
				.setRequired(true),
		)
		.addRoleOption((option) =>
			option
				.setName('role')
				.setDescription(
					'Participant role currently held by everyone who participated',
				)
				.setRequired(true),
		)
		.addUserOption((option) =>
			option
				.setName('winner')
				.setDescription(
					'Quick-pick a single winner (leave empty for multi-winner / team / no-winner picker)',
				)
				.setRequired(false),
		)
		.addIntegerOption((option) =>
			option
				.setName('pity_points')
				.setDescription(
					'Pity points awarded to each non-winning participant (default: 1)',
				)
				.setMinValue(0)
				.setRequired(false),
		)
		.addBooleanOption((option) =>
			option
				.setName('reset_winner_pity')
				.setDescription(
					'Whether winning resets the winner(s) pity points to 0 (default: true)',
				)
				.setRequired(false),
		)
		.addStringOption((option) =>
			option
				.setName('notes')
				.setDescription(
					'Optional notes (e.g. prize details, bracket info)',
				)
				.setRequired(false),
		),
	cooldown: 0,

	async execute(interaction) {
		if (config.internal.owner_id !== interaction.user.id) {
			return await interaction.reply({
				content: '-# Access Denied',
				ephemeral: true,
			});
		}

		const name = interaction.options.getString('name', true).trim();
		/** @type {import('discord.js').Role} */
		const role = interaction.options.getRole('role', true);
		const quickWinner = interaction.options.getUser('winner');

		// Default 50 Pity Points per defeat. (1 pity point = 24 Nyaru Coins)

		const pityPoints = interaction.options.getInteger('pity_points') ?? 50;
		const resetWinnerPity =
			interaction.options.getBoolean('reset_winner_pity') ?? true;
		const notes = interaction.options.getString('notes');

		const getRoleParticipantIds = () =>
			role.members
				.filter((member) => !member.user.bot)
				.map((member) => member.id);

		// Fast path: single winner supplied directly in the slash command.
		if (quickWinner) {
			if (quickWinner.bot) {
				return await interaction.reply({
					content: '-# Bots cannot be logged as event winners.',
					ephemeral: true,
				});
			}

			const participantIds = getRoleParticipantIds();
			const { event } = recordEvent({
				name,
				hostId: interaction.user.id,
				roleId: role.id,
				participantIds,
				winnerIds: [quickWinner.id],
				pityPerLoss: pityPoints,
				resetPityOnWin: resetWinnerPity,
				notes,
			});

			return await interaction.reply({
				embeds: [buildLoggedEventEmbed(event)],
			});
		}

		// Interactive path: multi-winner / team / draw picker.
		const initialParticipants = getRoleParticipantIds();
		/** @type {string[]} */
		let selectedWinnerIds = [];

		const buildPreviewEmbed = (statusNote = null) => {
			const liveParticipants = getRoleParticipantIds();
			const totalCount = new Set([
				...liveParticipants,
				...selectedWinnerIds,
			]).size;

			const embed = new EmbedBuilder()
				.setTitle(`Log Event Setup: ${name}`)
				.setDescription(
					`Select the winner(s) below (supports solo, teams up to 25, or leave empty for 0 winners / draw), then click **Confirm & Log Event**.${statusNote ? `\n\n${statusNote}` : ''}`,
				)
				.setColor('Blurple')
				.addFields(
					{
						name: 'Participant Role',
						value: `<@&${role.id}> (${liveParticipants.length} member(s))`,
						inline: true,
					},
					{
						name: 'Pity Settings',
						value: `+${pityPoints} per loser • Winner reset: ${resetWinnerPity ? 'Yes' : 'No'}`,
						inline: true,
					},
					{
						name: `Selected Winners (${selectedWinnerIds.length})`,
						value: formatUserList(selectedWinnerIds),
						inline: false,
					},
					{
						name: `Total Participants to Log (${totalCount})`,
						value: formatUserList(
							Array.from(
								new Set([
									...liveParticipants,
									...selectedWinnerIds,
								]),
							),
						),
						inline: false,
					},
				)
				.setTimestamp();

			if (notes) {
				embed.addFields({
					name: 'Notes',
					value: notes.slice(0, 1024),
					inline: false,
				});
			}

			return embed;
		};

		const winnerSelect = new UserSelectMenuBuilder()
			.setCustomId('event_log_winners')
			.setPlaceholder(
				'Select winner(s) — optional (leave empty for no winners)',
			)
			.setMinValues(0)
			.setMaxValues(25);

		const confirmButton = new ButtonBuilder()
			.setCustomId('event_log_confirm')
			.setLabel('Confirm & Log Event')
			.setEmoji('✅')
			.setStyle(ButtonStyle.Success);

		const cancelButton = new ButtonBuilder()
			.setCustomId('event_log_cancel')
			.setLabel('Cancel')
			.setEmoji('❌')
			.setStyle(ButtonStyle.Danger);

		const selectRow = new ActionRowBuilder().addComponents(winnerSelect);
		const buttonRow = new ActionRowBuilder().addComponents(
			confirmButton,
			cancelButton,
		);

		const response = await interaction.reply({
			embeds: [
				buildPreviewEmbed(
					initialParticipants.length === 0
						? '⚠️ No members currently have this role. Assign participants or select winners before confirming.'
						: null,
				),
			],
			components: [selectRow, buttonRow],
			ephemeral: true,
			fetchReply: true,
		});

		const collector = response.createMessageComponentCollector({
			filter: (i) => i.user.id === interaction.user.id,
			time: 5 * 60 * 1000,
		});

		let finished = false;

		collector.on('collect', async (componentInteraction) => {
			if (componentInteraction.customId === 'event_log_winners') {
				selectedWinnerIds = componentInteraction.users
					.filter((u) => !u.bot)
					.map((u) => u.id);

				return await componentInteraction.update({
					embeds: [buildPreviewEmbed()],
					components: [selectRow, buttonRow],
				});
			}

			if (componentInteraction.customId === 'event_log_cancel') {
				finished = true;
				collector.stop('cancelled');
				return await componentInteraction.update({
					content: '-# Event logging cancelled. Nothing was saved.',
					embeds: [],
					components: [],
				});
			}

			if (componentInteraction.customId === 'event_log_confirm') {
				const liveParticipants = getRoleParticipantIds();
				const combinedCount = new Set([
					...liveParticipants,
					...selectedWinnerIds,
				]).size;

				if (combinedCount === 0) {
					return await componentInteraction.reply({
						content:
							'-# Cannot log an event with 0 participants. Make sure members have the participant role or select at least one winner.',
						ephemeral: true,
					});
				}

				finished = true;
				collector.stop('confirmed');

				const { event } = recordEvent({
					name,
					hostId: interaction.user.id,
					roleId: role.id,
					participantIds: liveParticipants,
					winnerIds: selectedWinnerIds,
					pityPerLoss: pityPoints,
					resetPityOnWin: resetWinnerPity,
					notes,
				});

				await componentInteraction.update({
					content: `-# ✅ Logged event **${event.name}** (\`${event.id}\`) with **${event.participants.length}** participant(s) and **${event.winners.length}** winner(s).`,
					embeds: [],
					components: [],
				});

				const summaryEmbed = buildLoggedEventEmbed(event);
				if (interaction.channel) {
					await interaction.channel
						.send({ embeds: [summaryEmbed] })
						.catch(async () => {
							await interaction.followUp({
								embeds: [summaryEmbed],
							});
						});
				} else {
					await interaction.followUp({ embeds: [summaryEmbed] });
				}
			}
		});

		collector.on('end', async () => {
			if (!finished) {
				await interaction
					.editReply({
						content:
							'-# Event log setup timed out. Nothing was saved.',
						embeds: [],
						components: [],
					})
					.catch(() => null);
			}
		});
	},
};
