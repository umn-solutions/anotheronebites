import {
	defineRoute,
	ViewSwitcher,
	View,
	Card,
	Container,
	Text,
	TextInput,
	TextArea,
	NumberInput,
	DateInput,
	ComboBox,
	Button,
	FormField,
	Router,
	Toast,
	PeoplePicker,
	Loader,
	CurrentUser,
} from "../../../libs/nofbiz/nofbiz.base.js";

import {
	LIST_PROJECTS,
	LIST_ALLOCATIONS,
	GDPR_CLASSIFICATIONS,
	ACCESS_LEVELS,
	PROJECT_STATUS_COMPLETED,
} from "../../../utils/constants.js";

import { getAppSiteApi } from "../../../utils/app-state.js";
import { createUmbrellaPicker } from "../../../utils/umbrella-picker.js";
import { fetchAllDelegations, deriveUserScopes } from "../../../utils/access-control.js";

import {
	createLabeledField,
	createFormSection,
	createFormRow,
	createMultiPersonPicker,
	createGroupMemberPicker,
	optionToUserIdentity,
	userIdentityToOption,
	comboValue,
	buildSubCategoryChildren,
	bindSubCategoryToCategory,
} from "../../../utils/form-helpers.js";

import { generateStructuredId } from '../../../utils/id-generator.js';
import { loadDefinitions, getSubCategoryOptions } from '../../../utils/definitions.js';
import { loadScopes, getScopeOptions, getP4PMemberOptions, isP4PMember, getDefaultUserScope } from '../../../utils/scopes.js';

export default defineRoute(async (config) => {
	config.setRouteTitle("Create Project");

	// Step definitions — 4 real steps, unchanged
	const STEP_NAMES = ["Role", "Details", "Governance", "Capacity"];
	const TOTAL_STEPS = STEP_NAMES.length; // 4

	// -- Data fetch --

	const siteApi = getAppSiteApi();
	const user = new CurrentUser();
	const [defs, scopeItems, delegations] = await Promise.all([
		loadDefinitions(siteApi),
		loadScopes(siteApi),
		fetchAllDelegations(siteApi),
	]);
	const umbrellaCtx = {
		siteApi,
		userEmail: user.get('email'),
		siteAccessLevel: user.accessLevel,
		delegations,
		userScopes: deriveUserScopes(scopeItems, user.get('email')),
		excludeUuid: undefined,
	};
	// PM Members picker options come from the P4P scope Members (allocation pool).
	const pmMemberOptions = getP4PMemberOptions(scopeItems);
	const projectTypes = defs.get('ProjectTypes');
	const techProjects = defs.get('TechProjects');
	const techPhases = defs.get('TechPhases');
	const projectStatuses = defs.get('ProjectStatuses').filter(s => s !== PROJECT_STATUS_COMPLETED);
	const businessLines = defs.get('BusinessLines');
	const pmScopeOptions = getScopeOptions(scopeItems);

	// -- State --

	const userType = new FormField({ value: "" }); // "Leading" | "Contributing"

	// Step 2 -- Charter fields (shared between Leading and Contributing)
	const projectNameField = new FormField({ value: "" });
	const contextField = new FormField({ value: "" });
	const objectivesField = new FormField({ value: "" });
	const startDateField = new FormField({ value: "" });
	const expectedEndDateField = new FormField({ value: "" });

	// Step 2 -- Leading-only fields
	const pmOwnerField = new FormField({ value: "" });
	const umbrellaField = new FormField({ value: "" });
	const gdprField = new FormField({ value: { label: 'Contact Information (CPD)', value: 'Contact Information (CPD)' } });
	const accessLevelField = new FormField({ value: { label: 'Internal', value: 'Internal' } });
	accessLevelField.subscribe((val) => {
		const selected = typeof val === 'object' && val?.value ? val.value : val;
		if (selected === 'Confidential') {
			Toast.warning('Confidential access is permanent and cannot be changed after creation', { duration: 6000, autoClose: true });
		}
	});

	// Tech fields (conditional on projectType === 'Tech')
	const techProjectField = new FormField({ value: "" });
	const techPhaseField = new FormField({ value: "" });

	const techFieldsContainer = new Container([], { class: "app-tech-fields" });

	// Sub Category field (conditional on selected category having sub categories)
	const subCategoryField = new FormField({ value: "" });
	const subCategoryContainer = new Container([], { class: "app-subcategory-field" });

	const projectTypeField = new FormField({ value: "" });
	projectTypeField.subscribe((val) => {
		if (val?.value === "Tech") {
			techFieldsContainer.children = buildTechFields();
		} else {
			techFieldsContainer.children = [];
		}
	});

	// Sub category kept in sync with category. initialParent='' because the wizard
	// starts empty; the guard prevents render-time re-fires from clearing anything.
	bindSubCategoryToCategory({
		categoryField: projectTypeField,
		subCategoryField,
		container: subCategoryContainer,
		subCategoryMap: defs.subCategoryMap,
		initialParent: '',
	});

	// Step 3 -- Governance fields
	const businessLineField = new FormField({ value: "" });
	const productField = new FormField({ value: "" });
	const sponsorField = new FormField({ value: "" });
	const stakeholdersField = new FormField({ value: [] });
	const pmMembersField = new FormField({ value: [] });
	// Default to "In Progress" at construction so the step-3 Status ComboBox shows
	// it selected on first render (a value set later, post-render, won't re-sync).
	const statusField = new FormField({ value: { label: 'In Progress', value: 'In Progress' } });
	// Auto-fill pmScope with the user's earliest scope (by list Id).
	// A value set after render does not re-sync the ComboBox, so it must be set here.
	const pmScopeField = new FormField({ value: getDefaultUserScope(scopeItems, user.get('email')) || "" });
	const allocationField = new FormField({ value: 0 });

	// -- Components --

	const projectTypeCombo = new ComboBox(projectTypeField, projectTypes, {
		allowFiltering: false,
		allowCreate: true,
		placeholder: "Select category",
	});

	const techProjectCombo = new ComboBox(techProjectField, techProjects, {
		allowFiltering: false,
		placeholder: "Select tech project",
	});

	const techPhaseCombo = new ComboBox(techPhaseField, techPhases, {
		allowFiltering: false,
		placeholder: "Select tech phase",
	});

	function buildTechFields() {
		return [
			createFormRow([
				createLabeledField("Tech Project", techProjectCombo),
				createLabeledField("Tech Phase", techPhaseCombo),
			]),
		];
	}

	// -------------------------------------------------------------------------
	// Filled-field counter (for step 2 footer "N of 10 fields filled")
	// -------------------------------------------------------------------------

	const LEADING_FIELD_COUNT = 10;
	const CONTRIBUTING_FIELD_COUNT = 6;

	function countFilledFields() {
		const isLeading = userType.value === "Leading";
		const fields = isLeading
			? [
				projectNameField, pmOwnerField, contextField, objectivesField,
				projectTypeField, accessLevelField, gdprField, umbrellaField,
				startDateField, expectedEndDateField,
			]
			: [
				projectNameField, contextField, objectivesField,
				projectTypeField, startDateField, expectedEndDateField,
			];
		return fields.filter(f => {
			const v = f.value;
			if (!v) return false;
			if (typeof v === 'string') return v.trim().length > 0;
			if (typeof v === 'object' && 'value' in v) return !!v.value;
			return true;
		}).length;
	}

	function totalFieldCount() {
		return userType.value === "Leading" ? LEADING_FIELD_COUNT : CONTRIBUTING_FIELD_COUNT;
	}

	// -------------------------------------------------------------------------
	// Step 2 header band (title + role recap)
	// -------------------------------------------------------------------------

	function buildStep2Header() {
		const roleText = userType.value || 'Leading';
		const roleDisplay = new Container([
			new Text('Role: ', { type: 'span', class: 'app-step2-role-label' }),
			new Text(roleText, { type: 'span', class: 'app-step2-role-value' }),
			new Text('·', { type: 'span', class: 'app-step2-role-sep' }),
			new Button('change', {
				class: 'app-step2-role-change',
				onClickHandler: () => {
					wizard.setViewByIndex(0);
				},
			}),
		], { class: 'app-step2-role-recap' });

		return new Container([
			new Text('New project', { type: 'h1', class: 'app-step2-title' }),
			roleDisplay,
		], { class: 'app-step2-header' });
	}

	// -------------------------------------------------------------------------
	// Step 2 sticky footer
	// -------------------------------------------------------------------------

	const filledCountText = new Text('', { type: 'span', class: 'app-step2-filled-count' });

	function updateFilledCount() {
		const filled = countFilledFields();
		const total = totalFieldCount();
		filledCountText.children = [`${filled} of ${total} fields filled`];
	}

	// Subscribe all charter fields to update count
	[
		projectNameField, pmOwnerField, contextField, objectivesField,
		projectTypeField, accessLevelField, gdprField, umbrellaField,
		startDateField, expectedEndDateField,
	].forEach(f => f.subscribe(updateFilledCount));

	// -------------------------------------------------------------------------
	// Charter field builders (step 2)
	// -------------------------------------------------------------------------

	function buildPmSections() {
		// PeoplePicker shows a selection only when the option exists in its dataset
		// (empty by default -- it populates from AD search on type). When the field
		// is already set (e.g. the current user auto-filled for Leading), seed the
		// dataset so the selection is visible without an AD round-trip.
		const pmOwnerPicker = new PeoplePicker(pmOwnerField, { placeholder: "Select project manager" });
		if (pmOwnerField.value && typeof pmOwnerField.value === 'object' && pmOwnerField.value.label) {
			pmOwnerPicker.dataset = [pmOwnerField.value];
		}

		return [
			// Card 1: Project info
			new Container([
				new Container([
					new Text('Project info', { type: 'h2', class: 'app-step2-card__heading' }),
				], { class: 'app-step2-card__heading-row' }),
				createLabeledField(
					"Project name",
					new TextInput(projectNameField, { placeholder: "Project name" }),
					true,
				),
				createLabeledField(
					"Project manager",
					pmOwnerPicker,
				),
				createLabeledField(
					"Context",
					new TextArea(contextField, { placeholder: "What problem does this project address?" }),
				),
				createLabeledField(
					"Objectives",
					new TextArea(objectivesField, { placeholder: "What does success look like, measurably?" }),
				),
			], { class: 'app-step2-card app-form-section' }),

			// Card 2: Classification
			new Container([
				new Container([
					new Text('Classification', { type: 'h2', class: 'app-step2-card__heading' }),
				], { class: 'app-step2-card__heading-row' }),
				createLabeledField("Category", projectTypeCombo),
				subCategoryContainer,
				createLabeledField(
					"Access level",
					new ComboBox(accessLevelField, ACCESS_LEVELS, {
						allowFiltering: false,
						placeholder: "Select access level",
					}),
				),
				createLabeledField(
					"GDPR classification",
					new ComboBox(gdprField, GDPR_CLASSIFICATIONS, {
						allowFiltering: false,
						placeholder: "Select classification",
					}),
				),
				techFieldsContainer,
				createLabeledField(
					"Umbrella Project",
					createUmbrellaPicker(umbrellaField, umbrellaCtx),
				),
			], { class: 'app-step2-card app-form-section' }),

			// Card 3: Timeline + before-you-continue panel
			new Container([
				new Container([
					new Text('Timeline', { type: 'h2', class: 'app-step2-card__heading' }),
				], { class: 'app-step2-card__heading-row' }),
				createLabeledField(
					"Start date",
					new DateInput(startDateField, {
						placeholder: "Start date",
						format: "yyyy-mm-dd",
					}),
				),
				createLabeledField(
					"Expected end date",
					new DateInput(expectedEndDateField, {
						placeholder: "End date",
						format: "yyyy-mm-dd",
					}),
				),
				new Text(
					"Leave the end date empty to inherit it from the umbrella project.",
					{ type: 'p', class: 'app-step2-timeline-note' }
				),
			], { class: 'app-step2-card app-form-section' }),
		];
	}

	function buildContributorSections() {
		return [
			// Card 1: Project info
			new Container([
				new Container([
					new Text('Project info', { type: 'h2', class: 'app-step2-card__heading' }),
				], { class: 'app-step2-card__heading-row' }),
				createLabeledField(
					"Project name",
					new TextInput(projectNameField, { placeholder: "Project name" }),
					true,
				),
				createLabeledField(
					"Context",
					new TextArea(contextField, { placeholder: "What problem does this project address?" }),
				),
				createLabeledField(
					"Objectives",
					new TextArea(objectivesField, { placeholder: "What does success look like, measurably?" }),
				),
			], { class: 'app-step2-card app-form-section' }),

			// Card 2: Classification
			new Container([
				new Container([
					new Text('Classification', { type: 'h2', class: 'app-step2-card__heading' }),
				], { class: 'app-step2-card__heading-row' }),
				createLabeledField("Category", projectTypeCombo),
				subCategoryContainer,
				techFieldsContainer,
			], { class: 'app-step2-card app-form-section' }),

			// Card 3: Timeline
			new Container([
				new Container([
					new Text('Timeline', { type: 'h2', class: 'app-step2-card__heading' }),
				], { class: 'app-step2-card__heading-row' }),
				createLabeledField(
					"Start date",
					new DateInput(startDateField, {
						placeholder: "Start date",
						format: "yyyy-mm-dd",
					}),
				),
				createLabeledField(
					"Expected end date",
					new DateInput(expectedEndDateField, {
						placeholder: "End date",
						format: "yyyy-mm-dd",
					}),
				),
				new Text(
					"Leave the end date empty to inherit it from the umbrella project.",
					{ type: 'p', class: 'app-step2-timeline-note' }
				),
			], { class: 'app-step2-card app-form-section' }),
		];
	}

	// Mutable charter container (swapped on role change)
	const charterBodyContainer = new Container([], { class: 'app-step2-body' });
	// Persistent "New project" header band: lives at page level (not inside a
	// single step view) so it shows on every step after step 1. Hidden on step 1.
	const step2HeaderContainer = new Container([], { class: 'app-step2-header-wrapper app-hidden' });

	function updateStep2View() {
		const sections = userType.value === "Leading"
			? buildPmSections()
			: buildContributorSections();
		charterBodyContainer.children = sections;
		updateFilledCount();
	}

	function updateCharterFields() {
		if (userType.value === "Leading") {
			pmOwnerField.value = {
				label: user.get('displayName'),
				value: { email: user.get('email'), displayName: user.get('displayName') },
			};
			statusField.value = { label: 'In Progress', value: 'In Progress' };
		} else {
			statusField.value = { label: 'In Progress', value: 'In Progress' };
		}
		updateStep2View();
	}

	// -------------------------------------------------------------------------
	// Step 1: Role selection (choice cards)
	// -------------------------------------------------------------------------

	function buildRoleCard(roleValue, title, body, isSelected) {
		const indicatorClass = isSelected
			? 'app-role-card__indicator app-role-card__indicator--selected'
			: 'app-role-card__indicator';
		const indicatorContent = isSelected ? '✓' : '';
		const indicator = new Container(
			[new Text(indicatorContent, { type: 'span' })],
			{ class: indicatorClass }
		);

		return new Container([
			new Container([
				new Text(title, { type: 'span', class: 'app-role-card__title' }),
				indicator,
			], { class: 'app-role-card__top' }),
			new Text(body, { type: 'p', class: 'app-role-card__body' }),
		], {
			class: isSelected
				? 'app-role-card app-role-card--selected'
				: 'app-role-card',
			onClickHandler: () => {
				userType.value = roleValue;
				updateCharterFields();
				// Refresh both cards' appearance
				roleCardsContainer.children = buildRoleCards();
			},
		});
	}

	function buildRoleCards() {
		const current = userType.value;
		return [
			buildRoleCard(
				'Leading',
				'Leading',
				'My team owns delivery. I set the charter, dates and access level.',
				current === 'Leading'
			),
			buildRoleCard(
				'Contributing',
				'Contributing',
				'Another team leads. I record my contribution and link to their project.',
				current === 'Contributing'
			),
		];
	}

	const roleCardsContainer = new Container(buildRoleCards(), { class: 'app-role-cards' });

	const step1 = new View([
		new Container([
			new Text(
				'Are you leading this project or contributing to it?',
				{ type: 'h1', class: 'app-step1-question' }
			),
			new Text(
				'Your answer decides which fields you own. Contributing projects inherit dates and access from the leading team.',
				{ type: 'p', class: 'app-step1-subtext' }
			),
		], { class: 'app-step1-intro' }),
		roleCardsContainer,
	], { class: 'app-step1-view' });

	// -------------------------------------------------------------------------
	// Step 2: Project details (3-column grid)
	// -------------------------------------------------------------------------

	const step2 = new View([
		charterBodyContainer,
	], { class: 'app-step2-view' });

	// -------------------------------------------------------------------------
	// Step 3: Governance (existing logic, consistent styling)
	// -------------------------------------------------------------------------

	const step3 = new View([
		new Container([
			new Container([
				createFormSection("Organization", [
					createFormRow([
						createLabeledField(
							"Business Line",
							new ComboBox(businessLineField, businessLines, {
								allowFiltering: true,
								allowCreate: true,
								placeholder: "Select or create business line",
							}),
						),
						createLabeledField(
							"Product",
							new TextInput(productField, { placeholder: "Product name" }),
						),
					]),
					createLabeledField(
						"Status",
						new ComboBox(statusField, projectStatuses, {
							allowFiltering: false,
							placeholder: "Select status",
						}),
					),
					createLabeledField(
						"PM Scope",
						new ComboBox(pmScopeField, pmScopeOptions, {
							allowFiltering: false,
							placeholder: "Select PM Scope",
						}),
					),
				]),
				createFormSection("People", [
					createLabeledField(
						"Sponsor",
						new PeoplePicker(sponsorField, { placeholder: "Search for sponsor" }),
					),
					createMultiPersonPicker("Stakeholders", stakeholdersField),
					createGroupMemberPicker("PM Members", pmMembersField, pmMemberOptions),
				]),
			], { class: "app-sections-row" }),
		], { class: "app-wizard-step-body" }),
	]);

	// -------------------------------------------------------------------------
	// Step 4: Capacity (existing logic)
	// -------------------------------------------------------------------------

	// Capacity allocation step is available for P4P scope members (allocation pool).
	const isPmGroupMember = isP4PMember(scopeItems, user.get('email'));

	const pmMembersList = new Container([], { class: "app-staffing-members" });
	const renderPmMembers = (members) => {
		const list = members || [];
		pmMembersList.children = list.length
			? [
				new Text("PM Members", { type: "p", class: "app-field-label" }),
				...list.map(ui => new Text(ui.displayName || ui.email, { type: "p", class: "app-staffing-member" })),
			]
			: [new Text("No PM Members selected", { type: "p", class: "app-field-hint" })];
	};
	renderPmMembers(pmMembersField.value);
	pmMembersField.subscribe(renderPmMembers);

	const step4 = new View([
		new Container([
			isPmGroupMember
				? new Container([
					createFormSection("Staffing Allocation", [
						createLabeledField(
							"Staffing Allocation",
							new NumberInput(allocationField, {
								step: 0.05, min: 0, max: 1,
							}),
						),
						new Text("Staffing allocation for this project (0 to 1)", {
							type: "p",
							class: "app-field-hint",
						}),
						pmMembersList,
					]),
				], { class: "app-sections-row" })
				: new Text("Capacity allocation is available for P4P scope members", { type: "p", class: "app-empty-state" }),
		], { class: "app-wizard-step-body" }),
	]);

	// -------------------------------------------------------------------------
	// Navigation buttons
	// -------------------------------------------------------------------------

	// Two separate Cancel instances — one per footer (only one footer visible at a time)
	const cancelBtnStep1 = new Button("Cancel", {
		class: 'app-btn-secondary',
		onClickHandler: () => Router.navigateTo("/"),
	});

	const cancelBtnStep2 = new Button("Cancel", {
		class: 'app-btn-danger-outline',
		onClickHandler: () => Router.navigateTo("/"),
	});

	const prevBtn = new Button("Previous", {
		class: 'app-btn-secondary',
		onClickHandler: () => {
			const idx = wizard.currentViewIndex;
			if (idx > 0) wizard.setViewByIndex(idx - 1);
		},
	});

	const nextBtn = new Button("Next", {
		class: 'app-btn-primary',
		onClickHandler: () => {
			const idx = wizard.currentViewIndex;

			// Step 1: require a role selection before advancing
			if (idx === 0) {
				if (!userType.value) {
					Toast.error("Please select a role to continue.", { duration: 4000, autoClose: true });
					return;
				}
			}

			// Step 2: require project name
			if (idx === 1 && !projectNameField.value) {
				projectNameField.focusOnInput();
				Toast.error("Project name is required", { duration: 4000, autoClose: true });
				return;
			}

			if (idx === TOTAL_STEPS - 1) {
				handleSubmit();
			} else {
				wizard.setViewByIndex(idx + 1);
			}
		},
	});

	// Footer layout differs per step:
	// - Step 1: centred Cancel + Continue (no Previous, no filled-count)
	// - Step 2+: sticky footer with Cancel (danger-outline), filled-count, Previous, Next

	const step1Footer = new Container([
		new Container([cancelBtnStep1], { class: 'app-step1-cancel-wrap' }),
		new Button("Continue", {
			class: 'app-btn-primary app-step1-continue-btn',
			onClickHandler: () => {
				if (!userType.value) {
					Toast.error("Please select a role to continue.", { duration: 4000, autoClose: true });
					return;
				}
				updateCharterFields();
				wizard.setViewByIndex(1);
			},
		}),
	], { class: 'app-step1-footer' });

	// Initially hidden — revealed when wizard moves past step 1
	const step2Footer = new Container([
		new Container([cancelBtnStep2, filledCountText], { class: 'app-step2-footer__left' }),
		new Container([prevBtn, nextBtn], { class: 'app-step2-footer__right' }),
	], { class: 'app-step2-footer app-hidden' });

	// -------------------------------------------------------------------------
	// ViewSwitcher setup
	// -------------------------------------------------------------------------

	const wizardTarget = new Container([], { id: "wizard-target" });

	const wizard = new ViewSwitcher(
		[
			["step-1", step1],
			["step-2", step2],
			["step-3", step3],
			["step-4", step4],
		],
		{
			containerSelector: "#wizard-target",
			onRefreshHandler: () => {
				const idx = wizard.currentViewIndex;
				const stepName = STEP_NAMES[idx] || '';
				const isLastStep = idx === TOTAL_STEPS - 1;

				// Update Next/Submit label
				nextBtn.children = [isLastStep ? 'Submit' : 'Next'];

				// Update footer visibility via class toggling
				const isStep1 = idx === 0;
				if (isStep1) {
					step1Footer.instance?.removeClass('app-hidden');
					step2Footer.instance?.addClass('app-hidden');
				} else {
					step1Footer.instance?.addClass('app-hidden');
					step2Footer.instance?.removeClass('app-hidden');
				}

				// "New project" header band: hidden on step 1, shown on every later
				// step (rebuilt each time so the role recap reflects the current role).
				if (isStep1) {
					step2HeaderContainer.instance?.addClass('app-hidden');
				} else {
					// Set children FIRST: the .children setter triggers _refresh(),
					// which re-serializes from the component's internal class list
					// (still carrying app-hidden). removeClass must run AFTER so it is
					// the last DOM op and the band actually becomes visible.
					step2HeaderContainer.children = [buildStep2Header()];
					step2HeaderContainer.instance?.removeClass('app-hidden');
				}

				// Rebuild the step-2 charter body + filled-count only on the details step
				if (idx === 1) {
					updateStep2View();
					updateFilledCount();
				}

				// Previous is hidden on step 1 (handled via separate footer)
				prevBtn.isDisabled = idx <= 0;
			},
		},
	);

	// -------------------------------------------------------------------------
	// Submit logic
	// -------------------------------------------------------------------------

	const loader = new Loader(new Text('Saving...'), { class: 'app-fullpage-loader' });

	async function handleSubmit() {
		const uuid = generateStructuredId('PROJ', startDateField.value);

		const data = {
			Title: projectNameField.value,
			UUID: uuid,
			Role: userType.value,
			Status:
				comboValue(statusField.value) || "In Progress",
			PMScope: comboValue(pmScopeField.value),
			Context: contextField.value,
			Objectives: objectivesField.value,
			ProjectType: comboValue(projectTypeField.value),
			SubCategory: comboValue(subCategoryField.value),
			StartDate: startDateField.value,
			ExpectedEndDate: expectedEndDateField.value,
			BusinessLine: comboValue(businessLineField.value),
			Product: productField.value,
			Sponsor: optionToUserIdentity(sponsorField.value) || '',
			Stakeholders: stakeholdersField.value,
			PMMembers: pmMembersField.value,
			PMMembersEmail: (pmMembersField.value || []).map(ui => ui.email).join(';'),
			SubmittedBy: { email: user.get('email'), displayName: user.get('displayName') },
			SubmittedByEmail: user.get('email'),
			AccessLevel: userType.value === "Leading" ? (comboValue(accessLevelField.value) || 'Internal') : 'Internal',
		};

		// Leading-only fields
		if (userType.value === "Leading") {
			data.ProjectManager = optionToUserIdentity(pmOwnerField.value) || '';
			data.ProjectManagerEmail = optionToUserIdentity(pmOwnerField.value)?.email || '';
			const umbrellaLabel = umbrellaField.value?.label || '';
			data.UmbrellaProgram = umbrellaLabel.replace(/^\[(?:Program|Project)\]\s*/, '');
			data.GDPRClassification = comboValue(gdprField.value);
		}

		// LinkedPrograms for any parent type (program or project)
		if (umbrellaField.value?.value) {
			data.LinkedPrograms = umbrellaField.value.value;
		}

		// Tech fields (only if projectType is Tech)
		if (comboValue(projectTypeField.value) === "Tech") {
			data.TechProject = comboValue(techProjectField.value);
			data.TechPhase = comboValue(techPhaseField.value);
		}

		nextBtn.isLoading = true;
		loader.toggleLoader();
		try {
			await siteApi.list(LIST_PROJECTS).createItem(data);
			if (isPmGroupMember && allocationField.value) {
				await siteApi.list(LIST_ALLOCATIONS).createItem({
					Title: uuid + '_' + user.get('email'),
					ProjectUUID: uuid,
					UserEmail: user.get('email'),
					UserDisplayName: user.get('displayName'),
					AllocationPercent: allocationField.value,
					UpdatedBy: JSON.stringify({ email: user.get('email'), displayName: user.get('displayName') }),
					UpdatedByEmail: user.get('email'),
				});
			}
			loader.toggleLoader();
			Toast.success('Project created');
			Router.navigateTo('/');
		} catch (err) {
			console.error('[projects/new] submit error:', err);
			loader.toggleLoader();
			Toast.error(err?.message || 'Failed to create project');
		} finally {
			if (nextBtn.isAlive) nextBtn.isLoading = false;
		}
	}

	// -------------------------------------------------------------------------
	// Render — page wrapper
	// -------------------------------------------------------------------------

	const wizardPage = new Container([
		step2HeaderContainer,
		wizardTarget,
		wizard,
		step1Footer,
		step2Footer,
	], { class: 'app-wizard-page' });

	return [loader, wizardPage];
});
