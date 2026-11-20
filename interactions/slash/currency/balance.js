/**
 * @file Balance check command.
 * @author Naman Vrati
 * @since 1.0.0
 * @version 3.0.0
 */

// Initialize LeeksLazyLogger

const { Logger } = require('leekslazylogger');
// @ts-ignore
const log = new Logger({ keepSilent: true });

// Deconstructed the constants we need in this file.

const {
	EmbedBuilder,
	SlashCommandBuilder,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ComponentType,
} = require('discord.js');

const manager = require('../../../functions/database');
const { DatabaseUser } = require('../../../functions/database/create');
const {
	getEventsDB,
	convertPityToCoins,
	PITY_TO_COINS_RATE,
} = require('../../../functions/database/events');

/**
 * @type {import('../../../typings').SlashInteractionCommand}
 */
module.exports = {
	// The data needed to register slash commands to Discord.
	data: new SlashCommandBuilder()
		.setName('balance')
		.setDescription('Shows current user balance.')
		.addUserOption((option) =>
			option
				.setName('user')
				.setDescription('To check a balance of a specific user.'),
		),
	cooldown: 5,

	async execute(interaction) {
		/**
		 * @description The "user" argument
		 */
		let user = interaction.options.getUser('user');

		if (!user) {
			user = interaction.user;
		}

		const userDB = manager.getUserDB();

		// Find the user (index) in the database.

		let dbUser = userDB.find((m) => m.user_id == user.id);

		// If the user is not in database.

		if (!dbUser) dbUser = new DatabaseUser(user.id);

		// Get currency name & emoji.

		const config_currency = manager.getConfigFile().settings.currency;
		const { name, emoji } = config_currency;

		// Fetch user's pity points from the events database.

		const eventsDB = getEventsDB();
		const eventUser = eventsDB.users[user.id];
		const pityPoints = eventUser ? eventUser.pity_points : 0;

		const isOwnBalance = user.id === interaction.user.id;

		// Make a stylish embed result!

		const buildEmbed = (balance, pity) =>
			new EmbedBuilder()
				.setTitle(`${user.username}'s balance`)
				.setDescription(
					`**__Bank:__ ${balance} ${emoji} ${name}**\n**__Pity Points:__ ${pity}** *(1 pity = ${PITY_TO_COINS_RATE} ${emoji})*`,
				)
				.setColor('Random')
				.setTimestamp();

		if (!isOwnBalance) {
			await interaction.reply({
				embeds: [buildEmbed(dbUser.balance, pityPoints)],
			});
			return;
		}

		const buildButtonRow = (pity, disabled = false) => {
			const coinsPreview = pity * PITY_TO_COINS_RATE;
			const label =
				pity > 0
					? `Convert Pity (${pity} → ${coinsPreview} ${name})`.slice(
							0,
							80,
						)
					: `Convert Pity to ${name}`.slice(0, 80);

			const convertButton = new ButtonBuilder()
				.setCustomId('economy_convert_pity')
				.setLabel(label)
				.setEmoji('🔄')
				.setStyle(
					pity > 0 && !disabled
						? ButtonStyle.Success
						: ButtonStyle.Secondary,
				)
				.setDisabled(disabled || pity <= 0);

			return new ActionRowBuilder().addComponents(convertButton);
		};

		const response = await interaction.reply({
			embeds: [buildEmbed(dbUser.balance, pityPoints)],
			components: [buildButtonRow(pityPoints)],
			fetchReply: true,
		});

		if (pityPoints <= 0) {
			return;
		}

		const collector = response.createMessageComponentCollector({
			componentType: ComponentType.Button,
			time: 60_000,
		});

		let converted = false;
		let currentBalance = dbUser.balance;
		let currentPity = pityPoints;

		collector.on('collect', async (buttonInteraction) => {
			if (buttonInteraction.customId !== 'economy_convert_pity') return;

			if (buttonInteraction.user.id !== interaction.user.id) {
				return await buttonInteraction.reply({
					content:
						'-# You can only convert your own pity points! Run `/balance` to check yours.',
					ephemeral: true,
				});
			}

			if (converted) {
				return await buttonInteraction.reply({
					content: '-# Your pity points were already converted!',
					ephemeral: true,
				});
			}

			converted = true;
			const result = await convertPityToCoins(
				interaction.user.id,
				null,
				interaction.user,
			);

			if (!result.ok) {
				const latestEvents = getEventsDB();
				const latestUsers = manager.getUserDB();
				const latestDbUser = latestUsers.find(
					(m) => m.user_id == interaction.user.id,
				);
				currentBalance = latestDbUser ? latestDbUser.balance : 0;
				currentPity = latestEvents.users[interaction.user.id]
					? latestEvents.users[interaction.user.id].pity_points
					: 0;

				collector.stop('empty');
				await buttonInteraction.update({
					embeds: [buildEmbed(currentBalance, currentPity)],
					components: [buildButtonRow(currentPity, true)],
				});
				await buttonInteraction.followUp({
					content: `-# ${result.error}`,
					ephemeral: true,
				});
				return;
			}

			currentBalance = result.newBalance;
			currentPity = result.remainingPity;

			collector.stop('converted');

			await buttonInteraction.update({
				embeds: [buildEmbed(currentBalance, currentPity)],
				components: [buildButtonRow(currentPity, true)],
			});

			await buttonInteraction.followUp({
				content: `Converted **${result.pointsConverted}** pity point(s) into **${result.coinsEarned} ${emoji} ${name}**!`,
				ephemeral: true,
			});
		});

		collector.on('end', async (_, reason) => {
			if (reason === 'converted' || reason === 'empty') return;
			await interaction
				.editReply({
					embeds: [buildEmbed(currentBalance, currentPity)],
					components: [buildButtonRow(currentPity, true)],
				})
				.catch(() => null);
		});

		return;
	},
};
