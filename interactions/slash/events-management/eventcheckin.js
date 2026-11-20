/**
 * @file Event Check-in Panel Command (for non-VC / tournament events).
 * @author Maghish
 * @since 3.2.0
 * @version 3.2.0
 */

const {
	SlashCommandBuilder,
	ButtonBuilder,
	ButtonStyle,
	ActionRowBuilder,
	EmbedBuilder,
	ComponentType,
} = require('discord.js');
const config = require('../../../config.json');
const parseDuration = require('../../../functions/parseDuration');
const { formatUserList } = require('../../../functions/database/events');

/**
 * @type {import('../../../typings').SlashInteractionCommand}
 */
module.exports = {
	data: new SlashCommandBuilder()
		.setName('event_checkin')
		.setDescription(
			'Open a check-in button panel to assign a participant role (great for non-VC / tournament events)',
		)
		.addStringOption((option) =>
			option
				.setName('title')
				.setDescription('Event title (e.g. "Valorant 5v5 Tournament")')
				.setRequired(true),
		)
		.addRoleOption((option) =>
			option
				.setName('role')
				.setDescription('Participant role to assign on check-in')
				.setRequired(true),
		)
		.addStringOption((option) =>
			option
				.setName('duration')
				.setDescription(
					'How long check-in stays open (e.g. "15m", "1h", "30s")',
				)
				.setRequired(true),
		)
		.addIntegerOption((option) =>
			option
				.setName('max_participants')
				.setDescription('Optional player cap (e.g. 10 for 5v5)')
				.setMinValue(1)
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

		const title = interaction.options.getString('title', true).trim();
		/** @type {import('discord.js').Role} */
		const role = interaction.options.getRole('role', true);
		const durationInput = interaction.options.getString('duration', true);
		const maxParticipants =
			interaction.options.getInteger('max_participants');

		const durationMs = parseDuration(durationInput);
		if (!durationMs || durationMs <= 0) {
			return await interaction.reply({
				content:
					'-# Invalid duration! Use formats like `2h 1m`, `15m`, or `30s`.',
				ephemeral: true,
			});
		}

		const endTimestamp = Math.floor((Date.now() + durationMs) / 1000);

		/** @type {Set<string>} */
		const participants = new Set(
			role.members
				.filter((member) => !member.user.bot)
				.map((member) => member.id),
		);

		const buildEmbed = (closed = false) => {
			const countLabel = maxParticipants
				? `${participants.size}/${maxParticipants}`
				: `${participants.size}`;

			const statusLine = closed
				? '**Status:** Check-in Closed'
				: `**Closes:** <t:${endTimestamp}:R> (<t:${endTimestamp}:T>)`;

			const listText = formatUserList(Array.from(participants), {
				separator: '\n',
				maxChars: 950,
			});

			return new EmbedBuilder()
				.setTitle(`Event Check-in: ${title}`)
				.setDescription(
					`Click **Join Event** to receive <@&${role.id}> and be counted as a participant.\n\n**Host:** <@${interaction.user.id}>\n${statusLine}`,
				)
				.setColor(closed ? 'Grey' : 'Green')
				.addFields({
					name: `Participants (${countLabel})`,
					value: listText,
				})
				.setFooter({
					text: closed
						? 'Use /event_log to record results and award pity points.'
						: 'Use /event_log after the event finishes to record results.',
				})
				.setTimestamp();
		};

		const joinButton = new ButtonBuilder()
			.setCustomId('event_checkin_join')
			.setLabel('Join Event')
			.setEmoji('✅')
			.setStyle(ButtonStyle.Success);

		const leaveButton = new ButtonBuilder()
			.setCustomId('event_checkin_leave')
			.setLabel('Leave')
			.setEmoji('❌')
			.setStyle(ButtonStyle.Secondary);

		const closeButton = new ButtonBuilder()
			.setCustomId('event_checkin_close')
			.setLabel('Close Check-in')
			.setEmoji('🔒')
			.setStyle(ButtonStyle.Danger);

		const row = new ActionRowBuilder().addComponents(
			joinButton,
			leaveButton,
			closeButton,
		);

		const response = await interaction.reply({
			embeds: [buildEmbed(false)],
			components: [row],
			fetchReply: true,
		});

		const collector = response.createMessageComponentCollector({
			componentType: ComponentType.Button,
			time: durationMs,
		});

		collector.on('collect', async (buttonInteraction) => {
			const userId = buttonInteraction.user.id;

			if (buttonInteraction.customId === 'event_checkin_close') {
				if (config.internal.owner_id !== userId) {
					return await buttonInteraction.reply({
						content: '-# Only the event host can close check-in.',
						ephemeral: true,
					});
				}

				await buttonInteraction.deferUpdate();
				collector.stop('closed');
				return;
			}

			/** @type {import('discord.js').GuildMember} */
			const member = buttonInteraction.member;

			if (buttonInteraction.customId === 'event_checkin_join') {
				if (participants.has(userId)) {
					return await buttonInteraction.reply({
						content: '-# You are already checked in for this event!',
						ephemeral: true,
					});
				}

				if (maxParticipants && participants.size >= maxParticipants) {
					return await buttonInteraction.reply({
						content: `-# This event is full (**${maxParticipants}/${maxParticipants}** participants).`,
						ephemeral: true,
					});
				}

				try {
					await member.roles.add(role);
				} catch {
					return await buttonInteraction.reply({
						content: `-# Failed to assign <@&${role.id}>. Please check the bot's role permissions and hierarchy.`,
						ephemeral: true,
					});
				}

				participants.add(userId);
				return await buttonInteraction.update({
					embeds: [buildEmbed(false)],
					components: [row],
				});
			}

			if (buttonInteraction.customId === 'event_checkin_leave') {
				if (!participants.has(userId)) {
					return await buttonInteraction.reply({
						content: '-# You are not checked in for this event.',
						ephemeral: true,
					});
				}

				try {
					await member.roles.remove(role);
				} catch {
					return await buttonInteraction.reply({
						content: `-# Failed to remove <@&${role.id}>. Please check the bot's role permissions and hierarchy.`,
						ephemeral: true,
					});
				}

				participants.delete(userId);
				return await buttonInteraction.update({
					embeds: [buildEmbed(false)],
					components: [row],
				});
			}
		});

		collector.on('end', async () => {
			const disabledRow = new ActionRowBuilder().addComponents(
				ButtonBuilder.from(joinButton).setDisabled(true),
				ButtonBuilder.from(leaveButton).setDisabled(true),
				ButtonBuilder.from(closeButton).setDisabled(true),
			);

			await interaction
				.editReply({
					embeds: [buildEmbed(true)],
					components: [disabledRow],
				})
				.catch(() => null);
		});
	},
};
