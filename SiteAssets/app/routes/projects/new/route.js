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
	SiteApi,
	Router,
	Toast,
	PeoplePicker,
	StyleResource,
	Loader,
	CurrentUser,
} from "../../../libs/nofbiz/nofbiz.base.js";

import {
	LIST_PROJECTS,
	LIST_PROGRAMS,
	LIST_ALLOCATIONS,
	GDPR_CLASSIFICATIONS,
	ACCESS_LEVELS,
} from "../../../utils/constants.js";

import { getAppSiteApi } from "../../../utils/app-state.js";
import { filterProjectsByAccess, fetchAllDelegations } from "../../../utils/access-control.js";

import {
	createLabeledField,
	createFormSection,
	createFormRow,
	createMultiPersonPicker,
	createGroupMemberPicker,
	optionToUserIdentity,
	userIdentityToOption,
	comboValue,
} from "../../../utils/form-helpers.js";

import { generateStructuredId } from '../../../utils/id-generator.js';
import { consumeRouteContext } from '../../../utils/route-context.js';
import { loadDefinitions } from '../../../utils/definitions.js';

export default defineRoute(async (config) => {
	config.setRouteTitle("Create Project");
	const routeStyles = new StyleResource("./route.css");

	const pmSteps = {
		names: ["User Type", "Project Charter", "Governance", "Capacity"],
		indices: [0, 1, 2, 3],
	};
	const contributorSteps = {
		names: ["User Type", "Project Charter", "Governance", "Capacity"],
		indices: [0, 1, 2, 3],
	};

	function activeFlow() {
		return userType.value === "Leading" ? pmSteps : contributorSteps;
	}

	// -- Data fetch --

	const siteApi = new SiteApi();
	const user = new CurrentUser();
	const [allPrograms, allProjects, defs, delegations, pmGroupMembers] = await Promise.all([
		siteApi.list(LIST_PROGRAMS).getItems(),
		siteApi.list(LIST_PROJECTS).getItems(),
		loadDefinitions(siteApi),
		fetchAllDelegations(siteApi),
		siteApi.getGroupUsers('ProjectManagers'),
	]);
	const pmMemberOptions = pmGroupMembers.map(m => ({
		label: m.Title,
		value: { email: m.Email, displayName: m.Title },
	}));
	const projectTypes = defs.get('ProjectTypes');
	const techProjects = defs.get('TechProjects');
	const techPhases = defs.get('TechPhases');
	const projectStatuses = defs.get('ProjectStatuses');
	const businessLines = defs.get('BusinessLines');
	const pmScopeOptions = defs.get('PMScope') || [];
	const accessibleProjects = filterProjectsByAccess(allProjects, user.get('email'), user.accessLevel, delegations);
	const umbrellaOptions = [
		...allPrograms.map(p => ({ label: '[Program] ' + p.Title, value: p.UUID })),
		...accessibleProjects.map(p => ({ label: '[Project] ' + p.Title, value: p.UUID }))
	];

	// -- Prefill from proposal --

	const prefillData = consumeRouteContext()

	// -- State --

	const userType = new FormField({ value: "" });

	// Step 2 -- Charter fields (shared between Leading and Contributing)
	const projectNameField = new FormField({ value: "" });
	const contextField = new FormField({ value: "" });
	const objectivesField = new FormField({ value: "" });
	const startDateField = new FormField({ value: "" });
	const expectedEndDateField = new FormField({ value: "" });

	// Step 2 -- Leading-only fields
	const pmOwnerField = new FormField({ value: "" });
	const scopeField = new FormField({ value: "" });
	const umbrellaField = new FormField({ value: "" });
	const gdprField = new FormField({ value: "" });
	const accessLevelField = new FormField({ value: "" });
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

	const projectTypeField = new FormField({
		value: prefillData?.projectType
			? { label: prefillData.projectType, value: prefillData.projectType }
			: "",
	});
	projectTypeField.subscribe((val) => {
		if (val?.value === "Tech") {
			techFieldsContainer.children = buildTechFields();
		} else {
			techFieldsContainer.children = [];
		}
	});

	// Step 3 -- Governance fields
	const businessLineField = new FormField({ value: "" });
	const productField = new FormField({ value: "" });
	const sponsorField = new FormField({ value: "" });
	const stakeholdersField = new FormField({ value: [] });
	const pmMembersField = new FormField({ value: [] });
	const statusField = new FormField({ value: "" });
	const pmScopeField = new FormField({ value: "" });
	const allocationField = new FormField({ value: 0 });

	if (prefillData) {
		projectNameField.value = prefillData.title || ''
		contextField.value = prefillData.context || ''
		if (prefillData.businessLine) {
			businessLineField.value = { label: prefillData.businessLine, value: prefillData.businessLine }
		}
		if (prefillData.sponsor) sponsorField.value = userIdentityToOption(prefillData.sponsor)
		if (prefillData.status) {
			statusField.value = { label: prefillData.status, value: prefillData.status }
		}
	}

	// -- Components --

	const projectTypeCombo = new ComboBox(projectTypeField, projectTypes, {
		allowFiltering: false,
		allowCreate: true,
		placeholder: "Select project type",
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

	if (prefillData?.projectType === 'Tech') {
		techFieldsContainer.children = buildTechFields()
	}

	// -- Charter field builders --

	function buildPmFields() {
		return [
			createFormSection("Project Info", [
				createFormRow([
					createLabeledField(
						"Project Name",
						new TextInput(projectNameField, {
							placeholder: "Project name",
						}),
						true,
					),
					createLabeledField(
						"Project Manager",
						new PeoplePicker(pmOwnerField, {
							placeholder: "Select Project Manager",
						}),
					),
				]),
				createLabeledField(
					"Context",
					new TextArea(contextField, { placeholder: "Project context" }),
				),
				createLabeledField(
					"Objectives",
					new TextArea(objectivesField, {
						placeholder: "Project objectives",
					}),
				),
			]),
			createFormSection("Classification", [
				createFormRow([
					createLabeledField("Project Type", projectTypeCombo),
					createLabeledField(
						"Scope/Out of Scope",
						new TextArea(scopeField, {
							placeholder: "Describe what is in scope and out of scope",
						}),
					),
				]),
				createFormRow([
					createLabeledField(
						"Access Level",
						new ComboBox(accessLevelField, ACCESS_LEVELS, {
							allowFiltering: false,
							placeholder: "Select access level",
						}),
					),
					createLabeledField(
						"GDPR Classification",
						new ComboBox(gdprField, GDPR_CLASSIFICATIONS, {
							allowFiltering: false,
							placeholder: "Select classification",
						}),
					),
				]),
				techFieldsContainer,
				createLabeledField(
					"Umbrella Program",
					new ComboBox(umbrellaField, umbrellaOptions, {
						allowFiltering: true,
						placeholder: "Select umbrella program",
					}),
				),
			]),
			createFormSection("Timeline", [
				createFormRow([
					createLabeledField(
						"Start Date",
						new DateInput(startDateField, {
							placeholder: "Start date",
							format: "yyyy-mm-dd",
						}),
					),
					createLabeledField(
						"Expected End Date",
						new DateInput(expectedEndDateField, {
							placeholder: "End date",
							format: "yyyy-mm-dd",
						}),
					),
				]),
			]),
		];
	}

	function buildContributorFields() {
		return [
			createFormSection("Project Info", [
				createLabeledField(
					"Project Name",
					new TextInput(projectNameField, {
						placeholder: "Project name",
					}),
					true,
				),
				createFormRow([
					createLabeledField(
						"Context",
						new TextArea(contextField, { placeholder: "Project context" }),
					),
					createLabeledField(
						"Objectives",
						new TextInput(objectivesField, {
							placeholder: "Project objectives",
						}),
					),
				]),
			]),
			createFormSection("Classification", [
				createLabeledField("Project Type", projectTypeCombo),
				techFieldsContainer,
			]),
			createFormSection("Timeline", [
				createFormRow([
					createLabeledField(
						"Start Date",
						new DateInput(startDateField, {
							placeholder: "Start date",
							format: "yyyy-mm-dd",
						}),
					),
					createLabeledField(
						"Expected End Date",
						new DateInput(expectedEndDateField, {
							placeholder: "End date",
							format: "yyyy-mm-dd",
						}),
					),
				]),
			]),
		];
	}

	// -- Charter container (swapped based on userType) --

	const charterContainer = new Container([], { class: "app-charter-fields app-sections-row" });

	function updateCharterFields() {
		if (userType.value === "Leading") {
			pmOwnerField.value = {
				label: user.get('displayName'),
				value: { email: user.get('email'), displayName: user.get('displayName') }
			};
			statusField.value = "In Progress";
			charterContainer.children = buildPmFields();
		} else {
			statusField.value = "Pipeline";
			charterContainer.children = buildContributorFields();
		}
	}

	// -- Step 1: User Type Selection --

	const step1 = new View([
		new Text("Are you leading this project or contributing to it?", {
			type: "h2",
		}),
		new Container(
			[
				new Button("Leading", {
					onClickHandler: () => {
						userType.value = "Leading";
						updateCharterFields();
						wizard.setViewByIndex(1);
					},
				}),
				new Button("Contributing", {
					onClickHandler: () => {
						userType.value = "Contributing";
						updateCharterFields();
						wizard.setViewByIndex(1);
					},
				}),
			],
			{ class: "app-user-type-buttons" },
		),
	]);

	// -- Step 2: Project Charter --

	const step2 = new View([charterContainer]);

	// -- Step 3: Governance --

	const step3 = new View([
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
					new PeoplePicker(sponsorField, {
						placeholder: "Search for sponsor",
					}),
				),
				createMultiPersonPicker("Stakeholders", stakeholdersField),
				createGroupMemberPicker("PM Members", pmMembersField, pmMemberOptions),
			]),
		], { class: "app-sections-row" }),
	]);

	// -- Step 4: Capacity --

	const isPmGroupMember = pmGroupMembers.some(
		m => m.Email.toLowerCase() === user.get('email').toLowerCase()
	);

	const step4 = new View([
		isPmGroupMember
			? new Container([
				createFormSection("Your FTE Allocation", [
					createLabeledField(
						"FTE",
						new NumberInput(allocationField, {
							step: 0.05, min: 0, max: 2,
						}),
					),
					new Text("FTE allocation for this project (0 to 1)", {
						type: "p",
						class: "app-field-hint",
					}),
				]),
			], { class: "app-sections-row" })
			: new Text("Capacity allocation is available for Project Managers", { type: "p", class: "app-empty-state" }),
	]);

	// -- Navigation Buttons --

	const cancelBtn = new Button("Cancel", {
		variant: "danger",
		onClickHandler: () => Router.navigateTo("/"),
	});

	const prevBtn = new Button("Previous", {
		variant: "secondary",
		onClickHandler: () => {
			const flow = activeFlow();
			const pos = flow.indices.indexOf(wizard.currentViewIndex);
			if (pos > 0) wizard.setViewByIndex(flow.indices[pos - 1]);
		},
	});

	const nextBtn = new Button("Next", {
		variant: "primary",
		onClickHandler: () => {
			if (wizard.currentViewIndex === 1 && !projectNameField.value) {
				projectNameField.focusOnInput();
				Toast.error("Project name is required", { duration: 4000, autoClose: true });
				return;
			}
			const flow = activeFlow();
			const pos = flow.indices.indexOf(wizard.currentViewIndex);
			if (pos === flow.names.length - 1) {
				handleSubmit();
			} else {
				wizard.setViewByIndex(flow.indices[pos + 1]);
			}
		},
	});

	// -- Wizard Target --

	const wizardTarget = new Container([], {
		id: "wizard-target",
	});

	// -- Navigation Buttons --

	const navButtons = new Container([cancelBtn, prevBtn, nextBtn], {
		class: "app-wizard-nav",
	});

	// -- ViewSwitcher --

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
				const flow = activeFlow();
				const pos = flow.indices.indexOf(idx);
				const total = flow.names.length;
				navButtons.instance?.css("display", idx > 0 ? "flex" : "none");
				prevBtn.instance?.prop("disabled", idx === 0);
				nextBtn.children = [pos === total - 1 ? "Submit" : "Next"];
			},
		},
	);

	if (prefillData) {
		Toast.info('Fields pre-filled from validated proposal', { duration: 5000, autoClose: true })
	}

	// -- Submit Logic --

	const loader = new Loader(new Text('Saving...'), { class: 'app-fullpage-loader' });

	async function handleSubmit() {
		const uuid = generateStructuredId('PROJ', startDateField.value);

		const data = {
			Title: projectNameField.value,
			UUID: uuid,
			Role: userType.value,
			Status:
				comboValue(statusField.value) ||
				(userType.value === "Leading" ? "In Progress" : "Pipeline"),
			PMScope: comboValue(pmScopeField.value),
			Context: contextField.value,
			Objectives: objectivesField.value,
			ProjectType: comboValue(projectTypeField.value),
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
			data.Scope = scopeField.value;
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
			nextBtn.isLoading = false;
		}
	}

	// -- Render --

	const cardContent = new Container([wizardTarget, wizard, navButtons]);

	return [new Card([cardContent], {
		variant: "secondary",
		class: "app-form-card app-wizard",
	})];
});
