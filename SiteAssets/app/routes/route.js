import {
	defineRoute,
	Text,
	Container,
	Button,
	FormField,
	TextInput,
	ComboBox,
	Toast,
	CurrentUser,
	__lodash,
} from "../libs/nofbiz/nofbiz.base.js";
import {
	LIST_PROJECTS,
	LIST_PROGRAMS,
	LIST_PROPOSALS,
	ITEM_TYPES,
	PROJECT_STATUSES,
	PROJECT_TYPES,
	APP_NAME,
} from "../utils/constants.js";
import { loadScopes, getScopeOptions } from "../utils/scopes.js";
import { loadDefinitions } from "../utils/definitions.js";
import {
	createProjectCard,
	createProgramCard,
	createProposalCard,
} from "../utils/project-card.js";
import { buildSearchQuery, applyFilters } from "../utils/search.js";
import { comboValue } from "../utils/form-helpers.js";
import { getAppSiteApi } from "../utils/app-state.js";
import {
	filterProjectsByAccess,
	filterProposalsByAccess,
	filterProgramsByAccess,
	fetchAllDelegations,
	fetchUserScopes,
} from "../utils/access-control.js";

export default defineRoute(async (config) => {
	config.setRouteTitle(APP_NAME);

	const user = new CurrentUser();
	const siteApi = getAppSiteApi();
	const canAccessAdmin = user.accessLevel === 'ADMIN';

	// Fetch scope options (PM scope filter) and definition options (Status,
	// ProjectType filters) in parallel. Each load handles its own error so a
	// failure in one never blanks the other or leaves a ComboBox with undefined.
	const [pmScopeOptions, projectTypeOptions, projectStatusOptions] =
		await Promise.all([
			loadScopes(siteApi)
				.then(getScopeOptions)
				.catch((err) => {
					console.error("[Home] Failed to load scopes:", err);
					return [];
				}),
			loadDefinitions(siteApi)
				.then((defs) => ({
					types: defs.get("ProjectTypes"),
					statuses: defs.get("ProjectStatuses"),
				}))
				.catch((err) => {
					console.error("[Home] Failed to load definitions:", err);
					return { types: PROJECT_TYPES, statuses: PROJECT_STATUSES };
				}),
		]).then(([scopes, defs]) => [scopes, defs.types, defs.statuses]);

	// ------------------------------------------------------------------
	// State
	// ------------------------------------------------------------------

	// Search query FormField — drives the idle/active toggle and the server fetch
	const queryField = new FormField({ value: "" });

	// Filter FormFields — value changes trigger client-side re-filter
	const itemTypeFilter = new FormField({ value: "" });
	const statusFilter = new FormField({ value: "" });
	const typeFilter = new FormField({ value: "" });
	const pmScopeFilter = new FormField({ value: "" });

	// Backing data (set after each server search)
	let currentResults = [];
	let hasSearched = false;
	let searchToken = 0; // guards against stale in-flight responses overwriting newer ones

	// ------------------------------------------------------------------
	// Lodash debounce for the server fetch (300ms). The FormField itself is
	// updated on every keystroke (debounceMs: 0 on TextInput) so the
	// idle/active class toggle fires immediately, while the API call is
	// throttled to avoid hammering the server.
	// ------------------------------------------------------------------

	const debouncedSearch = __lodash.debounce((text) => performSearch(text), 300);

	// ------------------------------------------------------------------
	// Stage ref (set once the tree is built; toggled by subscribe)
	// ------------------------------------------------------------------

	/** @type {Container|null} */
	let stage = null;

	// ------------------------------------------------------------------
	// Active / idle class toggle (single source of truth for the animation)
	// ------------------------------------------------------------------

	function setActiveState(active) {
		if (!stage?.isAlive) return;
		if (active) {
			stage.instance?.addClass("is-active");
		} else {
			stage.instance?.removeClass("is-active");
		}
	}

	// ------------------------------------------------------------------
	// Result count text node (updated via .children setter)
	// ------------------------------------------------------------------

	const resultCountText = new Text("", {
		type: "span",
		class: "app-home-bar__count-text",
	});

	const resultCountNode = new Container([resultCountText], {
		class: "app-home-bar__count",
	});

	function updateResultCount(filtered) {
		const q = queryField.value;
		const n = filtered.length;
		if (q.trim().length > 0) {
			resultCountText.children = [
				`${n} ${n === 1 ? "result" : "results"} for "${q}"`,
			];
		} else if (hasSearched) {
			resultCountText.children = [`${n} ${n === 1 ? "result" : "results"}`];
		} else {
			resultCountText.children = [""];
		}
	}

	// ------------------------------------------------------------------
	// Helpers
	// ------------------------------------------------------------------

	function buildCards(items) {
		return items.map((item) => {
			if (item._type === "program") return createProgramCard(item);
			if (item._type === "proposal") return createProposalCard(item);
			return createProjectCard(item);
		});
	}

	// ------------------------------------------------------------------
	// Render results + empty state
	// ------------------------------------------------------------------

	function renderResults() {
		if (!stage?.isAlive) return;

		const filtered = applyFilters(currentResults, {
			itemType: comboValue(itemTypeFilter.value),
			status: comboValue(statusFilter.value),
			projectType: comboValue(typeFilter.value),
			pmScope: comboValue(pmScopeFilter.value),
		});

		const showingResults = queryField.value.trim().length > 0 || hasSearched;
		const isEmpty = showingResults && filtered.length === 0;

		if (resultsGridContainer?.isAlive) {
			resultsGridContainer.children = isEmpty ? [] : buildCards(filtered);
		}

		if (emptyStateContainer?.isAlive) {
			if (isEmpty) {
				emptyStateContainer.instance?.addClass("is-shown");
			} else {
				emptyStateContainer.instance?.removeClass("is-shown");
			}
		}

		updateResultCount(filtered);
	}

	// ------------------------------------------------------------------
	// Search (server-side query + access filtering)
	// ------------------------------------------------------------------

	async function performSearch(text) {
		const myToken = ++searchToken;
		const isShowAll = !text.trim();

		const loading = Toast.loading(isShowAll ? "Loading…" : "Searching…");
		try {
			const [projects, programs, proposals, delegations, userScopes] =
				await Promise.all([
					siteApi
						.list(LIST_PROJECTS)
						.getItems(buildSearchQuery(text, "project")),
					siteApi
						.list(LIST_PROGRAMS)
						.getItems(buildSearchQuery(text, "program")),
					siteApi
						.list(LIST_PROPOSALS)
						.getItems(buildSearchQuery(text, "proposal")),
					fetchAllDelegations(siteApi),
					fetchUserScopes(siteApi, user.get("email")),
				]);

			if (myToken !== searchToken) {
				loading.dismiss();
				return;
			}

			const userEmail = user.get("email");
			const accessLevel = user.accessLevel;

			const filteredProjects = filterProjectsByAccess(
				projects,
				userEmail,
				accessLevel,
				delegations,
				userScopes,
			);
			const filteredProposals = filterProposalsByAccess(
				proposals,
				userEmail,
				accessLevel,
				userScopes,
			);
			const filteredPrograms = filterProgramsByAccess(
				programs,
				userEmail,
				accessLevel,
				userScopes,
			);

			currentResults = [
				...filteredProjects.map((p) => ({ ...p, _type: "project" })),
				...filteredPrograms.map((p) => ({ ...p, _type: "program" })),
				...filteredProposals.map((p) => ({ ...p, _type: "proposal" })),
			];

			loading.dismiss();
			renderResults();
		} catch (err) {
			console.error("[Home] Search failed:", err);
			loading.error(isShowAll ? "Failed to load. Please try again." : "Search failed. Please try again.");
			currentResults = [];
			renderResults();
		}
	}

	// ------------------------------------------------------------------
	// Clear search — resets the FormField which triggers the subscriber
	// which fires setActiveState(false) and renderResults()
	// ------------------------------------------------------------------

	function clearSearch() {
		queryField.value = "";
	}

	// ------------------------------------------------------------------
	// QueryField subscriber:
	// - Fires setActiveState on every keystroke (debounceMs:0 on TextInput)
	// - Fires debouncedSearch for the actual API call
	// This is the ONLY place where the is-active class is managed.
	// ------------------------------------------------------------------

	queryField.subscribe((text) => {
		const active = text.trim().length > 0;

		if (active) {
			hasSearched = true;
			setActiveState(true);
			debouncedSearch(text);
			return;
		}

		// Empty box.
		debouncedSearch.cancel();

		if (hasSearched) {
			// User cleared a search — show the full portfolio.
			setActiveState(true);
			performSearch("");
		} else {
			// Cold load: keep the idle hero.
			setActiveState(false);
			currentResults = [];
			renderResults();
		}
	});

	// ------------------------------------------------------------------
	// "/" key shortcut (focus field; only when not inside an editable)
	// Self-cleaning via AbortController.
	// ------------------------------------------------------------------

	const keyAbort = new AbortController();

	document.addEventListener(
		"keydown",
		(e) => {
			if (!stage?.isAlive) {
				keyAbort.abort();
				return;
			}
			if (
				e.key === "/" &&
				document.activeElement?.tagName !== "INPUT" &&
				document.activeElement?.tagName !== "TEXTAREA" &&
				document.activeElement?.tagName !== "SELECT"
			) {
				e.preventDefault();
				queryTextInput.focusOnInput();
			}
		},
		{ signal: keyAbort.signal },
	);

	// ------------------------------------------------------------------
	// Component tree
	// ------------------------------------------------------------------

	// --- Hero block ---

	const hero = new Container(
		[
			new Text("Find a project, program or proposal.", {
				type: "h1",
				class: "app-home-hero__title",
			}),
			new Text(
				"Start typing and the portfolio appears — filters come with it.",
				{ type: "p", class: "app-home-hero__sub" },
			),
		],
		{ class: "app-home-hero" },
	);

	// --- Background layer (idle-only; fades out on is-active) ---
	// The background image is applied purely via CSS background-image on
	// .app-home-bg-img-wrap — no <img> element, no DOM injection.

	const bgLayer = new Container(
		[
			new Container([], { class: "app-home-bg-img-wrap" }),
			new Container([], { class: "app-home-veil" }),
		],
		{ class: "app-home-bg" },
	);

	// --- Persistent search field ---
	// TextInput bound to queryField with debounceMs:0 so the FormField is
	// updated on every keystroke, firing the subscriber immediately.
	// The actual server call is debounced separately inside the subscriber.

	const queryTextInput = new TextInput(queryField, {
		placeholder: "Search projects…",
		debounceMs: 0,
		autocomplete: false,
		spellcheck: false,
	});

	// "x" clear affordance (active only — hidden by CSS when not is-active)
	const clearBtn = new Button("x", {
		class: "app-home-clear",
		onClickHandler: clearSearch,
	});

	const searchFieldComp = new Container(
		[
			new Container([], { class: "app-home-icon" }),
			queryTextInput,
			clearBtn,
		],
		{ class: "app-home-field" },
	);

	// --- Filter bar (drops in from top on is-active) ---
	// Four ComboBox filters bound to their respective FormFields.
	// allowFiltering: false keeps them as plain selects without the search bar.

	const itemTypeCombo = new ComboBox(itemTypeFilter, ITEM_TYPES, {
		allowFiltering: false,
		placeholder: "Type",
	});

	const statusCombo = new ComboBox(statusFilter, projectStatusOptions, {
		allowFiltering: false,
		placeholder: "Status",
	});

	const projTypeCombo = new ComboBox(typeFilter, projectTypeOptions, {
		allowFiltering: false,
		placeholder: "Project type",
	});

	const pmScopeCombo = canAccessAdmin
		? new ComboBox(pmScopeFilter, pmScopeOptions, {
				allowFiltering: false,
				placeholder: "PM scope",
			})
		: null;

	const filterBar = new Container(
		[
			itemTypeCombo,
			statusCombo,
			projTypeCombo,
			...(canAccessAdmin ? [pmScopeCombo] : []),
			resultCountNode,
		],
		{ class: "app-home-bar" },
	);

	// --- Results grid ---

	const resultsGrid = new Container([], { class: "app-home-grid" });

	// --- Empty state ---

	const emptyState = new Container(
		[
			new Container(
				[
					new Container([], {
						class: "app-home-empty__sq app-home-empty__sq--sm",
					}),
					new Container([], {
						class: "app-home-empty__sq app-home-empty__sq--md",
					}),
					new Container([], {
						class: "app-home-empty__sq app-home-empty__sq--lg",
					}),
				],
				{ class: "app-home-empty__squares" },
			),
			new Text("Nothing matches your search", {
				type: "h2",
				class: "app-home-empty__heading",
			}),
			new Text(
				"Try a shorter search term, or clear the filters.",
				{ type: "p", class: "app-home-empty__desc" },
			),
			new Button("Clear search", {
				class: "app-btn-wash",
				onClickHandler: clearSearch,
			}),
		],
		{ class: "app-home-empty" },
	);

	// --- Results area ---

	const resultsArea = new Container([resultsGrid, emptyState], {
		class: "app-home-results",
	});

	// Assign module-level refs now that the component instances exist
	// (no setTimeout needed — these are direct variable assignments)
	const resultsGridContainer = resultsGrid;
	const emptyStateContainer = emptyState;

	// --- Stage (outermost; is-active drives both geometries) ---

	const stageComp = new Container(
		[bgLayer, hero, filterBar, searchFieldComp, resultsArea],
		{ class: "app-home-stage" },
	);

	// Assign stage ref so setActiveState can toggle the class
	stage = stageComp;

	// ------------------------------------------------------------------
	// FormField subscriptions (client-side re-filter on ComboBox change)
	// The ComboBox automatically updates its bound FormField when the user
	// selects an option; subscribing here re-runs the filter on each change.
	// ------------------------------------------------------------------

	itemTypeFilter.subscribe(renderResults);
	statusFilter.subscribe(renderResults);
	typeFilter.subscribe(renderResults);
	if (canAccessAdmin) pmScopeFilter.subscribe(renderResults);

	// ------------------------------------------------------------------
	// Cleanup:
	// FormFields are disposed by the Router when it tears down the route
	// closure. The keydown listener self-cancels via keyAbort when
	// stage.isAlive turns false. No explicit dispose needed here because
	// there are no cross-route references holding these FormFields alive.
	// ------------------------------------------------------------------

	return [stageComp];
});
