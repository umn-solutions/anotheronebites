import {
	Card,
	Text,
	Container,
	Router,
} from "../libs/nofbiz/nofbiz.base.js";

export function statusClass(status) {
	const key = (status || "").toLowerCase().replace(/\s+/g, "-");
	return `app-status-badge app-status--${key}`;
}

/**
 * Two-letter initials from a display name. "Alice Wong" -> "AW", "John" -> "J".
 */
function initials(name) {
	if (!name) return "?";
	return name
		.split(" ")
		.filter(Boolean)
		.slice(0, 2)
		.map((w) => w[0].toUpperCase())
		.join("");
}

/**
 * Shared card shell used by all three factories.
 *
 * Layout:
 *   Row 1  — title (left) + status badge (right)
 *   Row 2  — PM display name
 *   divider
 *   context — CSS-clamped, 2-line ellipsis
 *   divider
 *   Row 3  — two colored pills: entry-type pill (always) + project-type pill (when non-empty)
 *
 * @param {object} opts
 * @param {string}   opts.title
 * @param {string}   [opts.status]
 * @param {string}   [opts.pm]          PM or sponsor display name
 * @param {string}   [opts.description] Context text
 * @param {string}   [opts.type]        ProjectType / BusinessLine / etc. — shown as second pill when non-empty
 * @param {string}   opts.entryType     Entry category label shown in first pill ("Project" / "Program" / "Proposal")
 * @param {string}   opts.entryClass    CSS modifier for the entry pill (e.g. "app-result-card__pill--project")
 * @param {string}   extraClass         Additional CSS class on the card root
 * @param {Function} onClick
 */
function createResultCard({ title, status, pm, description, type, entryType, entryClass }, extraClass, onClick) {
	const pmName = pm || "";

	const headerRow = new Container(
		[
			new Text(title, { type: "h3", class: "app-result-card__title" }),
			status
				? new Text(status, { type: "span", class: statusClass(status) })
				: null,
		].filter(Boolean),
		{ class: "app-result-card__header" },
	);

	const pmRow = new Container(
		pmName
			? [
				new Text(initials(pmName), { type: "span", class: "app-result-card__avatar" }),
				new Text(pmName, { type: "span", class: "app-result-card__pm-name" }),
			]
			: [],
		{ class: "app-result-card__pm" },
	);

	const divider1 = new Container([], { class: "app-result-card__divider" });

	const descRow = new Text(description || "", {
		type: "p",
		class: "app-result-card__desc",
	});

	const divider2 = new Container([], { class: "app-result-card__divider" });

	// Footer: two colored pills — entry-type pill (always) + project-type pill (when non-empty).
	const footerChildren = [
		new Text(entryType, { type: "span", class: "app-result-card__pill " + entryClass }),
	];
	if (type) {
		footerChildren.push(
			new Text(type, { type: "span", class: "app-result-card__pill app-result-card__pill--type" }),
		);
	}
	const footerRow = new Container(footerChildren, {
		class: "app-result-card__footer",
	});

	const card = new Card(
		[headerRow, pmRow, divider1, descRow, divider2, footerRow],
		{ class: `app-result-card${extraClass ? " " + extraClass : ""}` },
	);

	card.setEventHandler("click", onClick);

	return card;
}

/**
 * Extract display name from a UserIdentity field value (already auto-parsed
 * by ListApi or still a raw JSON string).
 */
function extractDisplayName(field) {
	if (!field) return "";
	try {
		if (typeof field === "object") return field.displayName || field.name || "";
		if (typeof field === "string" && field.startsWith("{")) {
			const parsed = JSON.parse(field);
			return parsed.displayName || parsed.name || "";
		}
		return String(field);
	} catch (err) {
		console.warn("[project-card] failed to parse UserIdentity field, returning empty name", { field, err });
		return "";
	}
}

export function createProjectCard(project) {
	return createResultCard(
		{
			title: project.Title,
			status: project.Status,
			pm: extractDisplayName(project.ProjectManager),
			description: project.Context,
			type: project.ProjectType || "",
			entryType: "Project",
			entryClass: "app-result-card__pill--project",
		},
		"app-result-card--project",
		() => Router.navigateTo("projects/detail", { query: { uuid: project.UUID } }),
	);
}

export function createProgramCard(program) {
	return createResultCard(
		{
			title: program.Title,
			status: "In Progress",
			pm: extractDisplayName(program.ProgramSponsor),
			description: program.Context,
			type: "",
			entryType: "Program",
			entryClass: "app-result-card__pill--program",
		},
		"app-result-card--program",
		() => Router.navigateTo("programs/detail", { query: { uuid: program.UUID } }),
	);
}

export function createProposalCard(proposal) {
	return createResultCard(
		{
			title: proposal.Title,
			status: proposal.Status,
			pm: extractDisplayName(proposal.Sponsor),
			description: proposal.Context,
			type: proposal.ProjectType || proposal.BusinessLine || "",
			entryType: "Proposal",
			entryClass: "app-result-card__pill--proposal",
		},
		"app-result-card--proposal",
		() => Router.navigateTo("proposals/detail", { query: { uuid: proposal.UUID } }),
	);
}
