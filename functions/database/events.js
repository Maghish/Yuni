/**
 * @file Events & Pity JSON Database Manager
 * @author Maghish
 * @since 3.2.0
 * @version 3.2.0
 */

const fs = require('fs');
const path = require('path');

const eventsPath = path.join(process.cwd(), 'database', 'events.json');

/**
 * Returns a fresh empty events database structure.
 * @returns {import('../../typings').EventsDatabase}
 */
function createDefaultEventsDB() {
	return {
		events: [],
		users: {},
	};
}

/**
 * Ensures the events database file exists on disk.
 */
function ensureEventsDBFile() {
	if (!fs.existsSync(eventsPath)) {
		fs.mkdirSync(path.dirname(eventsPath), { recursive: true });
		fs.writeFileSync(
			eventsPath,
			JSON.stringify(createDefaultEventsDB(), null, 2),
			{ encoding: 'utf-8' },
		);
	}
}

/**
 * Fetches the live events database.
 * @returns {import('../../typings').EventsDatabase}
 */
function getEventsDB() {
	ensureEventsDBFile();

	const jsonString = fs.readFileSync(eventsPath, { encoding: 'utf-8' });
	const parsed = JSON.parse(jsonString);

	return {
		events: Array.isArray(parsed.events) ? parsed.events : [],
		users:
			parsed.users && typeof parsed.users === 'object'
				? parsed.users
				: {},
	};
}

/**
 * Writes the events database to disk.
 * @param {import('../../typings').EventsDatabase} db
 * @returns {import('../../typings').EventsDatabase}
 */
function saveEventsDB(db) {
	ensureEventsDBFile();
	fs.writeFileSync(eventsPath, JSON.stringify(db, null, 2), {
		encoding: 'utf-8',
	});
	return db;
}

/**
 * Gets an existing user's event stats or initializes a default entry in memory.
 * @param {import('../../typings').EventsDatabase} db
 * @param {string} userId
 * @returns {import('../../typings').EventUserStats}
 */
function getOrCreateEventUser(db, userId) {
	if (!db.users[userId]) {
		db.users[userId] = {
			user_id: userId,
			participated: 0,
			won: 0,
			lost: 0,
			pity_points: 0,
			loss_streak: 0,
			best_loss_streak: 0,
			last_event_id: null,
			last_event_at: null,
		};
	}

	return db.users[userId];
}

/**
 * Generates the next sequential Event ID (e.g. EVT-0001).
 * @param {import('../../typings').EventsDatabase} db
 * @returns {string}
 */
function getNextEventId(db) {
	let maxNum = 0;

	for (const evt of db.events) {
		const match = /^EVT-(\d+)$/i.exec(evt.id || '');
		if (match) {
			const num = parseInt(match[1], 10);
			if (num > maxNum) maxNum = num;
		}
	}

	return `EVT-${String(maxNum + 1).padStart(4, '0')}`;
}

/**
 * Records a completed event and updates participation & pity stats for all participants.
 * @param {Object} params
 * @param {string} params.name Event name/title.
 * @param {string} params.hostId Discord ID of the host logging the event.
 * @param {string | null} [params.roleId] Participant role ID used for the event.
 * @param {string[]} params.participantIds Array of participant Discord IDs.
 * @param {string[]} [params.winnerIds] Array of winner Discord IDs.
 * @param {number} [params.pityPerLoss] Pity points awarded per non-winning participant.
 * @param {boolean} [params.resetPityOnWin] Whether winning resets a winner's pity points to 0.
 * @param {string | null} [params.notes] Optional notes about the event.
 * @returns {{ event: import('../../typings').EventLogEntry, db: import('../../typings').EventsDatabase }}
 */
function recordEvent({
	name,
	hostId,
	roleId = null,
	participantIds = [],
	winnerIds = [],
	pityPerLoss = 1,
	resetPityOnWin = true,
	notes = null,
}) {
	const db = getEventsDB();
	const now = Date.now();
	const eventId = getNextEventId(db);

	// Deduplicate winners and ensure all winners are also counted as participants.
	const uniqueWinners = Array.from(new Set(winnerIds.filter(Boolean)));
	const winnerSet = new Set(uniqueWinners);
	const uniqueParticipants = Array.from(
		new Set([...participantIds.filter(Boolean), ...uniqueWinners]),
	);
	const losers = uniqueParticipants.filter((id) => !winnerSet.has(id));

	const safePity = Math.max(0, Number.isFinite(pityPerLoss) ? pityPerLoss : 1);

	for (const winnerId of uniqueWinners) {
		const userStats = getOrCreateEventUser(db, winnerId);
		userStats.participated += 1;
		userStats.won += 1;
		userStats.loss_streak = 0;
		if (resetPityOnWin) {
			userStats.pity_points = 0;
		}
		userStats.last_event_id = eventId;
		userStats.last_event_at = now;
	}

	for (const loserId of losers) {
		const userStats = getOrCreateEventUser(db, loserId);
		userStats.participated += 1;
		userStats.lost += 1;
		userStats.loss_streak += 1;
		if (userStats.loss_streak > userStats.best_loss_streak) {
			userStats.best_loss_streak = userStats.loss_streak;
		}
		userStats.pity_points += safePity;
		userStats.last_event_id = eventId;
		userStats.last_event_at = now;
	}

	/** @type {import('../../typings').EventLogEntry} */
	const eventEntry = {
		id: eventId,
		name: name.trim(),
		host_id: hostId,
		role_id: roleId,
		participants: uniqueParticipants,
		winners: uniqueWinners,
		losers,
		pity_awarded: safePity,
		pity_reset_on_win: Boolean(resetPityOnWin),
		notes: notes ? notes.trim() : null,
		timestamp: now,
	};

	db.events.push(eventEntry);
	saveEventsDB(db);

	return { event: eventEntry, db };
}

/**
 * Manually adjusts a user's pity points.
 * @param {string} userId Target Discord user ID.
 * @param {'add' | 'remove' | 'set' | 'reset'} action Operation to perform.
 * @param {number} [amount] Amount for add/remove/set operations.
 * @returns {{ previous: number, current: number, user: import('../../typings').EventUserStats }}
 */
function adjustUserPity(userId, action, amount = 0) {
	const db = getEventsDB();
	const userStats = getOrCreateEventUser(db, userId);
	const previous = userStats.pity_points;
	const safeAmount = Math.max(0, Math.floor(Number(amount) || 0));

	if (action === 'add') {
		userStats.pity_points = previous + safeAmount;
	} else if (action === 'remove') {
		userStats.pity_points = Math.max(0, previous - safeAmount);
	} else if (action === 'set') {
		userStats.pity_points = safeAmount;
	} else if (action === 'reset') {
		userStats.pity_points = 0;
	}

	saveEventsDB(db);

	return {
		previous,
		current: userStats.pity_points,
		user: userStats,
	};
}

/**
 * Formats an array of Discord user IDs into a truncated mention list safe for embed fields.
 * @param {string[]} userIds
 * @param {Object} [options]
 * @param {string} [options.separator]
 * @param {number} [options.maxChars]
 * @returns {string}
 */
function formatUserList(
	userIds,
	{ separator = ', ', maxChars = 950 } = {},
) {
	if (!userIds || userIds.length === 0) return 'None';

	const lines = [];
	let currentLength = 0;

	for (let i = 0; i < userIds.length; i++) {
		const mention = `<@${userIds[i]}>`;
		const addedLength =
			lines.length === 0 ? mention.length : separator.length + mention.length;

		if (currentLength + addedLength > maxChars) {
			const remaining = userIds.length - i;
			lines.push(`...and **${remaining}** more`);
			break;
		}

		lines.push(mention);
		currentLength += addedLength;
	}

	return lines.join(separator);
}

module.exports = {
	getEventsDB,
	saveEventsDB,
	getOrCreateEventUser,
	getNextEventId,
	recordEvent,
	adjustUserPity,
	formatUserList,
};
