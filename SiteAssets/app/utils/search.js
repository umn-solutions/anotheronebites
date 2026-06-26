/**
 * Server-side CAML search query builders and client-side filter logic.
 * Pure logic module -- no SPARC imports.
 */

/**
 * Build a CAML query object for a given list using Contains on searchable fields.
 * Returns undefined if searchText is empty (caller should fetch all).
 */
export function buildSearchQuery(searchText, listType) {
	const text = searchText?.trim();
	if (!text) return undefined;

	const SEARCH_FIELDS = {
		project: ["Title", "Context", "Objectives", "ProjectManagerEmail"],
		program: ["Title"],
		proposal: ["Title", "Context"],
	};

	const fields = SEARCH_FIELDS[listType];
	if (!fields || fields.length === 0) return undefined;

	if (fields.length === 1) {
		return { [fields[0]]: { value: text, operator: "Contains" } };
	}

	return {
		$or: fields.map((f) => ({ [f]: { value: text, operator: "Contains" } })),
	};
}

/**
 * Apply client-side AND filters to results already returned by CAML queries.
 */
export function applyFilters(items, filters) {
	let results = items;

	if (filters.itemType) {
		results = results.filter((p) => p._type === filters.itemType.toLowerCase());
	}
	if (filters.status) {
		results = results.filter((p) => p.Status === filters.status);
	}
	if (filters.projectType) {
		results = results.filter((p) => p.ProjectType === filters.projectType);
	}
	if (filters.pmScope) {
		results = results.filter((p) => p.PMScope === filters.pmScope);
	}

	return results;
}
