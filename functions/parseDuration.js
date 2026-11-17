/**
 * Parses a duration string like "2h 1m 30s" into milliseconds.
 * @param {string} durationStr
 * @returns {number}
 */
module.exports = (durationStr) => {
	const regex = /(\d+)\s*(d|h|m|s)/gi;
	let totalMs = 0;
	let match;

	while ((match = regex.exec(durationStr)) !== null) {
		const value = parseInt(match[1], 10);
		const unit = match[2].toLowerCase();

		if (unit === 'd') totalMs += value * 24 * 60 * 60 * 1000;
		else if (unit === 'h') totalMs += value * 60 * 60 * 1000;
		else if (unit === 'm') totalMs += value * 60 * 1000;
		else if (unit === 's') totalMs += value * 1000;
	}

	return totalMs;
};
