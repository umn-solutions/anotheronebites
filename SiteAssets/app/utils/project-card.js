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
 * Reduce a GDPR classification to its parenthetical acronym.
 * "Non-sensitive Personal Data: Other Information (OPD)" -> "OPD".
 * Falls back to the original string when no acronym is present.
 */
function gdprAcronym(gdpr) {
	if (!gdpr) return "";
	const m = String(gdpr).match(/\(([^)]+)\)/);
	return m ? m[1] : String(gdpr);
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
 *   Row 3  — project type (left) + GDPR classification (right)
 *
 * @param {object} opts
 * @param {string}   opts.title
 * @param {string}   [opts.status]
 * @param {string}   [opts.pm]          PM or sponsor display name
 * @param {string}   [opts.description] Context text
 * @param {string}   [opts.type]        ProjectType / BusinessLine / etc.
 * @param {string}   [opts.gdpr]        GDPRClassification (projects only)
 * @param {string}   extraClass         Additional CSS class on the card root
 * @param {Function} onClick
 */
function createResultCard({ title, status, pm, description, type, gdpr }, extraClass, onClick) {
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

	// Footer: single left-aligned overline "type · GDPR-acronym". Only render
	// non-empty values, with a middot separator when both are present.
	const gdprShort = gdprAcronym(gdpr);
	const footerChildren = [];
	if (type) {
		footerChildren.push(
			new Text(type, { type: "span", class: "app-result-card__footer-item" }),
		);
	}
	if (type && gdprShort) {
		footerChildren.push(
			new Text("·", { type: "span", class: "app-result-card__footer-sep" }),
		);
	}
	if (gdprShort) {
		footerChildren.push(
			new Text(gdprShort, { type: "span", class: "app-result-card__footer-item" }),
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
			gdpr: project.GDPRClassification || "",
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
			gdpr: "",
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
			gdpr: "",
		},
		"app-result-card--proposal",
		() => Router.navigateTo("proposals/detail", { query: { uuid: proposal.UUID } }),
	);
}
