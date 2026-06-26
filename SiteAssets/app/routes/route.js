import {
	defineRoute,
	Text,
	Container,
	TextInput,
	ComboBox,
	Button,
	Image,
	FormField,
	SiteApi,
	Router,
	Toast,
	CurrentUser,
} from "../libs/nofbiz/nofbiz.base.js";
import {
	LIST_PROJECTS,
	LIST_PROGRAMS,
	LIST_PROPOSALS,
	ITEM_TYPES,
	APP_PERMISSIONS,
} from "../utils/constants.js";
import { loadDefinitions } from "../utils/definitions.js";
import {
	createProjectCard,
	createProgramCard,
	createProposalCard,
} from "../utils/project-card.js";
import { buildSearchQuery, applyFilters } from "../utils/search.js";
import { getAppRoles, getAppSiteApi } from "../utils/app-state.js";
import { filterProjectsByAccess, filterProposalsByAccess, fetchAllDelegations } from "../utils/access-control.js";

export default defineRoute(async (config) => {
	config.setRouteTitle("Management Platform");

	const user = new CurrentUser();
	const roles = getAppRoles();
	const siteApi = getAppSiteApi();
	const canAccessAdmin = roles.canAccess("adminArea", APP_PERMISSIONS);

	const defs = await loadDefinitions(siteApi);
	const projectStatuses = defs.get('ProjectStatuses');
	const projectTypes = defs.get('ProjectTypes');
	const pmScopeOptions = defs.get('PMScope') || [];

	// Card factory -- dispatch on _type tag
	function buildCards(items) {
		return items.map((item) => {
			if (item._type === "program") return createProgramCard(item);
			if (item._type === "proposal") return createProposalCard(item);
			return createProjectCard(item);
		});
	}

	// Results grid container (starts empty -- data loads on search)
	const resultsGrid = new Container([], {
		class: "app-card-grid",
	});

	// Empty state
	const emptyState = new Text("No projects found", {
		type: "p",
		class: "app-empty-state",
	});

	// Inline debounce utility (simple closure)
	let debounceTimer = null;
	function debounce(fn, ms) {
		return function () {
			clearTimeout(debounceTimer);
			debounceTimer = setTimeout(fn, ms);
		};
	}

	// Hero-to-active transition state
	let isActive = false;

	function activate() {
		if (isActive) return;
		isActive = true;
		if (!wrapper?.isAlive) return;
		wrapper.instance?.removeClass("app-landing--hero");
		heroSection.instance?.fadeOut(300);
		extrasContainer.instance?.addClass("app-toolbar-extras--visible");
		resultsSection.instance?.addClass("app-landing-results--visible");
	}

	// Server-side search state
	let currentResults = [];

	async function performSearch(searchText) {
		activate();
		const loading = Toast.loading("Searching...");
		try {
			const [projects, programs, proposals, delegations] = await Promise.all([
				siteApi.list(LIST_PROJECTS).getItems(buildSearchQuery(searchText, "project")),
				siteApi.list(LIST_PROGRAMS).getItems(buildSearchQuery(searchText, "program")),
				siteApi.list(LIST_PROPOSALS).getItems(buildSearchQuery(searchText, "proposal")),
				fetchAllDelegations(siteApi),
			]);

			const userEmail = user.get("email");
			const accessLevel = user.accessLevel;
			const filteredProjects = filterProjectsByAccess(projects, userEmail, accessLevel, delegations);
			const filteredProposals = filterProposalsByAccess(proposals, userEmail, accessLevel);

			currentResults = [
				...filteredProjects.map((p) => ({ ...p, _type: "project" })),
				...programs.map((p) => ({ ...p, _type: "program" })),
				...filteredProposals.map((p) => ({ ...p, _type: "proposal" })),
			];
			loading.dismiss();
			updateFiltersState();
			renderResults();
		} catch {
			loading.error("Search failed");
			currentResults = [];
			updateFiltersState();
			resultsGrid.children = [emptyState];
		}
	}

	function renderResults() {
		const filtered = applyFilters(currentResults, {
			itemType: itemTypeFilter.value?.value || "",
			status: statusFilter.value?.value || "",
			projectType: typeFilter.value?.value || "",
			pmScope: pmScopeFilter.value?.value || "",
		});
		resultsGrid.children =
			filtered.length > 0 ? buildCards(filtered) : [emptyState];
	}

	function updateFiltersState() {
		const hasData = currentResults.length > 0;
		itemTypeCombo.isDisabled = !hasData;
		statusCombo.isDisabled = !hasData;
		typeCombo.isDisabled = !hasData;
		pmScopeCombo.isDisabled = !hasData;
	}

	const debouncedSearch = debounce(() => performSearch(searchField.value), 500);

	// Search input (debounced at 500ms -- server calls need more breathing room)
	const searchField = new FormField({ value: "" });
	const searchInput = new TextInput(searchField, {
		placeholder: "Search projects...",
	});
	searchInput.setEventHandler("input", (e) => {
		searchField.value = e.target.value;
	});

	// Filter ComboBoxes -- subscribers registered after wrapper exists (see bottom)
	const itemTypeFilter = new FormField({ value: "" });
	const statusFilter = new FormField({ value: "" });
	const typeFilter = new FormField({ value: "" });

	const itemTypeCombo = new ComboBox(itemTypeFilter, ITEM_TYPES, {
		placeholder: "Type",
		allowFiltering: false,
	});
	const statusCombo = new ComboBox(statusFilter, projectStatuses, {
		placeholder: "Status",
		allowFiltering: false,
	});
	const typeCombo = new ComboBox(typeFilter, projectTypes, {
		placeholder: "Project Type",
		allowFiltering: false,
	});

	const pmScopeFilter = new FormField({ value: "" });
	const pmScopeCombo = new ComboBox(pmScopeFilter, pmScopeOptions, {
		placeholder: "PM Scope",
		allowFiltering: false,
	});

	// Create dropdown button
	const dropdownMenu = new Container(
		[
			new Button("Project", {
				variant: "ghost",
				onClickHandler: () => Router.navigateTo("projects/new"),
			}),
			new Button("Program", {
				variant: "ghost",
				onClickHandler: () => Router.navigateTo("programs/new"),
			}),
			new Button("Proposal", {
				variant: "ghost",
				onClickHandler: () => Router.navigateTo("proposals/new"),
			}),
		],
		{ class: "app-create-dropdown" },
	);

	const createBtn = new Button("Create...", {
		variant: "primary",
		onClickHandler: () => {
			dropdownMenu.instance?.toggleClass("app-create-dropdown--open");
		},
	});

	// Hero section -- logo, hidden when active
	const heroImage = new Image("../SiteAssets/media/logo.png", {
		alt: "Platform banner",
		class: "app-hero-logo",
	});
	const heroSection = new Container([heroImage], {
		class: "app-hero-section",
	});

	// Toolbar extras -- filters, hidden in hero mode
	const extrasContainer = new Container(
		[
			itemTypeCombo,
			statusCombo,
			typeCombo,
			pmScopeCombo,
			new Button("Question Based Filters", { isDisabled: true }),
		],
		{ class: "app-toolbar-extras" },
	);

	// Create button + dropdown wrapper (dropdown width matches button)
	const createBtnWrapper = new Container(
		[createBtn, dropdownMenu],
		{ class: "app-create-wrapper" },
	);

	// Create button -- pushed to the right of the toolbar
	const toolbarActions = [];
	if (canAccessAdmin) {
		toolbarActions.push(
			new Button("Admin Area", {
				onClickHandler: () => Router.navigateTo("admin"),
			}),
		);
	}
	toolbarActions.push(createBtnWrapper);

	const createBtnsContainer = new Container(toolbarActions, {
		class: "app-toolbar-actions",
	});

	// Close dropdown on outside click (self-cleaning via AbortController)
	const dropdownAbort = new AbortController();
	document.addEventListener(
		"click",
		(e) => {
			if (!createBtnsContainer.isAlive) {
				dropdownAbort.abort();
				return;
			}
			const el = createBtnsContainer.instance?.[0];
			if (el && !el.contains(e.target)) {
				dropdownMenu.instance?.removeClass("app-create-dropdown--open");
			}
		},
		{ signal: dropdownAbort.signal },
	);

	// Search toolbar -- full-width navbar in active mode, centered in hero
	const searchToolbar = new Container(
		[searchInput, extrasContainer, createBtnsContainer],
		{ class: "app-search-toolbar" },
	);

	// Results section -- hidden in hero mode
	const resultsSection = new Container([resultsGrid], {
		class: "app-landing-results",
	});

	// Root wrapper -- starts in hero mode
	const wrapper = new Container(
		[heroSection, searchToolbar, resultsSection],
		{ class: "app-landing app-landing--hero" },
	);

	// Filters start disabled (no data yet)
	updateFiltersState();

	// Subscribe -- search triggers server query, filters apply client-side
	searchField.subscribe(debouncedSearch);
	itemTypeFilter.subscribe(renderResults);
	statusFilter.subscribe(renderResults);
	typeFilter.subscribe(renderResults);
	pmScopeFilter.subscribe(renderResults);

	return [wrapper];
});
