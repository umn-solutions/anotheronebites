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

export function createProjectCard(project) {
	const card = new Card(
		[
			new Container(
				[
					new Text(project.Title, { type: "h3" }),
					new Text(project.Status || "", {
						type: "span",
						class: statusClass(project.Status),
					}),
				],
				{ class: "app-card-header" },
			),
			new Text(project.StartDate || "", {
				type: "p",
				class: "app-card-date",
			}),
			new Text(project.Context || "", {
				type: "p",
				class: "app-card-context",
			}),
		],
		{ class: "app-project-card" },
	);

	card.setEventHandler("click", () => {
		Router.navigateTo("projects/detail", { query: { uuid: project.UUID } });
	});

	return card;
}

export function createProgramCard(program) {
	const card = new Card(
		[
			new Text(program.Title, { type: "h3" }),
			new Text(program.ProgramSponsor?.displayName || "", {
				type: "p",
				class: "app-card-date",
			}),
			new Text("Program", { type: "span", class: "app-card-type-label" }),
		],
		{ class: "app-program-card" },
	);

	card.setEventHandler("click", () => {
		Router.navigateTo('programs/detail', { query: { uuid: program.UUID } })
	});

	return card;
}

export function createProposalCard(proposal) {
	const card = new Card(
		[
			new Container(
				[
					new Text(proposal.Title, { type: "h3" }),
					new Text(proposal.Status || "", {
						type: "span",
						class: statusClass(proposal.Status),
					}),
				],
				{ class: "app-card-header" },
			),
			new Text(proposal.BusinessLine || proposal.ProjectType || "", {
				type: "p",
				class: "app-card-date",
			}),
			new Text("Proposal", {
				type: "span",
				class: "app-card-type-label",
			}),
		],
		{ class: "app-proposal-card" },
	);

	card.setEventHandler("click", () => {
		Router.navigateTo("proposals/detail", { query: { uuid: proposal.UUID } });
	});

	return card;
}
