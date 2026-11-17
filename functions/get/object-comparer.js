/**
 * @file Object Comparer
 * @author Naman Vrati
 * @since 3.1.0
 * @version 3.1.0
 */

/**
 * Changelog Sub (Specific) Object.
 * @typedef {Object} ChangelogSpecificObject
 * @property {string | number} newValue
 * @property {string | number} oldValue
 */

function internalCompare(oldObj = {}, newObj = {}, id, type, internalChanges = []) {
	for (const property in newObj) {
		if (typeof newObj[property] === 'object' && newObj[property] !== null) {
			internalCompare(oldObj?.[property] || {}, newObj[property], id, type, internalChanges);
		} else {
			if (oldObj?.[property] !== newObj[property]) {
				if (type === 'user') {
					internalChanges.push({
						property: property,
						type: type,
						userId: id,
						name: property,
						newValue: newObj[property],
						oldValue: oldObj?.[property],
					});
				} else {
					internalChanges.push({
						property: property,
						type: type,
						name: id,
						newValue: newObj[property],
						oldValue: oldObj?.[property],
					});
				}
			}
		}
	}

	if (internalChanges.length === 0) {
		return null;
	}

	return internalChanges;
}

function objectComparer(oldObj, newObj, type) {
	const changes = [];

	for (let key = 0; key < newObj.length; key++) {
		if (typeof newObj[key] === 'object' && newObj[key] !== null) {
			const internalType =
				type === 'user' ? newObj[key].user_id : newObj[key].name;

			const internalChanges = internalCompare(
				oldObj[key] || {},
				newObj[key],
				internalType,
				type,
			);

			if (internalChanges === null) {
				continue;
			}

			changes.push(...internalChanges);
		}
	}

	return changes;
}

/**
 * @description Compares two objects and return changes.
 */
module.exports = objectComparer;
