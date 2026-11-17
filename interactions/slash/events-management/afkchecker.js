/**
 * @file Afk Checker Command
 * @author Maghish
 * @since 3.1.0
 * @version 3.1.0
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

/**
 * @type {import('../../../typings').SlashInteractionCommand}
 */
module.exports = {
	data: new SlashCommandBuilder()
		.setName('afk_check')
		.setDescription('AFK Checker for all type of events')
		.addRoleOption((option) =>
			option
				.setName('role')
				.setDescription('The role to check')
				.setRequired(true),
		)
		.addStringOption((option) =>
			option
				.setName('duration')
				.setDescription(
					'Duration to react within (e.g. "2h 1m", "15m", "30s")',
				)
				.setRequired(true),
		),
	cooldown: 0,

	async execute(interaction) {
		if (config.internal.owner_id !== interaction.user.id) {
			return await interaction.reply({
				content: '-# Access Denied',
				ephemeral: true,
			});
		}

		/** @type {import('discord.js').Role} */
		const role = interaction.options.getRole('role', true);
		const durationInput = interaction.options.getString('duration', true);

		const durationMs = parseDuration(durationInput);
		if (!durationMs || durationMs <= 0) {
			return await interaction.reply({
				content:
					'-# Invalid duration! Use formats like `2h 1m`, `15m`, or `30s`.',
				ephemeral: true,
			});
		}

		const endTimestamp = Math.floor((Date.now() + durationMs) / 1000);

		/** @type {Map<string, import('discord.js').GuildMember>} */
		const inactiveMembers = new Map(
			role.members.map((member) => [member.id, member]),
		);
		/** @type {Map<string, import('discord.js').GuildMember>} */
		const activeMembers = new Map();

		const buildEmbed = () => {
			const activeList =
				activeMembers.size > 0
					? Array.from(activeMembers.keys())
							.map((id) => `<@${id}>`)
							.join('\n')
					: 'None';

			const inactiveList =
				inactiveMembers.size > 0
					? Array.from(inactiveMembers.keys())
							.map((id) => `<@${id}>`)
							.join('\n')
					: 'None';

			return new EmbedBuilder()
				.setTitle('AFK Checker')
				.setDescription(
					`Click the ✅ button below to confirm you are active.\n<@&${role.id}> will be removed from the ones who didn't react.\n\n**Ends:** <t:${endTimestamp}:R> (<t:${endTimestamp}:T>)`,
				)
				.setColor('Blurple')
				.addFields(
					{
						name: `Active Members (${activeMembers.size})`,
						value: activeList,
						inline: true,
					},
					{
						name: `Inactive Members (${inactiveMembers.size})`,
						value: inactiveList,
						inline: true,
					},
				)
				.setTimestamp();
		};

		const checkButton = new ButtonBuilder()
			.setCustomId('event_afk_check')
			.setEmoji('✅')
			.setStyle(ButtonStyle.Secondary);

		const row = new ActionRowBuilder().addComponents(checkButton);

		const response = await interaction.reply({
			embeds: [buildEmbed()],
			components: [row],
			fetchReply: true,
		});

		const collector = response.createMessageComponentCollector({
			componentType: ComponentType.Button,
			time: durationMs,
		});

		collector.on('collect', async (buttonInteraction) => {
			const userId = buttonInteraction.user.id;

			if (activeMembers.has(userId)) {
				return await buttonInteraction.reply({
					content: '-# You are already marked as active!',
					ephemeral: true,
				});
			}

			if (!inactiveMembers.has(userId)) {
				return await buttonInteraction.reply({
					content: `-# You do not have the <@&${role.id}> role!`,
					ephemeral: true,
				});
			}

			const member = inactiveMembers.get(userId);
			inactiveMembers.delete(userId);
			activeMembers.set(userId, member);

			await buttonInteraction.update({
				embeds: [buildEmbed()],
				components: [row],
			});
		});

		collector.on('end', async () => {
			for (const member of inactiveMembers.values()) {
				await member.roles.remove(role).catch(() => null);
			}

			const disabledButton =
				ButtonBuilder.from(checkButton).setDisabled(true);
			const disabledRow = new ActionRowBuilder().addComponents(
				disabledButton,
			);

			await interaction
				.editReply({
					embeds: [buildEmbed()],
					components: [disabledRow],
				})
				.catch(() => null);
		});
	},
};
