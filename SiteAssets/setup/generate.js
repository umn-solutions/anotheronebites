import { searchUsers } from '../app/libs/nofbiz/nofbiz.base.js'
import { log } from './log.js'

// -- Generic helpers ---------------------------------------------------------

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

function uniquePick(arr, n) {
  const copy = arr.slice();
  const result = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    result.push(copy.splice(idx, 1)[0]);
  }
  return result;
}

function weightedPick(entries) {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [value, weight] of entries) {
    r -= weight;
    if (r <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

function randomDateISO(minDays, maxDays) {
  const offset = rand(minDays, maxDays);
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function genId(prefix, index) {
  const seq = String(index).padStart(4, '0');
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  return `${prefix}_${seq}_${dd}${mm}${yyyy}`;
}

// -- People pool -------------------------------------------------------------

const FALLBACK_PEOPLE = [
  { email: 'alice.martin@contoso.com', displayName: 'Alice Martin' },
  { email: 'bob.chen@contoso.com', displayName: 'Bob Chen' },
  { email: 'carol.watts@contoso.com', displayName: 'Carol Watts' },
  { email: 'david.lopes@contoso.com', displayName: 'David Lopes' },
  { email: 'eva.silva@contoso.com', displayName: 'Eva Silva' },
  { email: 'frank.nguyen@contoso.com', displayName: 'Frank Nguyen' },
  { email: 'grace.kim@contoso.com', displayName: 'Grace Kim' },
  { email: 'henry.taylor@contoso.com', displayName: 'Henry Taylor' },
  { email: 'irene.patel@contoso.com', displayName: 'Irene Patel' },
  { email: 'james.wilson@contoso.com', displayName: 'James Wilson' },
];

async function fetchPeoplePool() {
  const letters = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'j', 'm', 's'];
  const seen = new Set();
  const pool = [];

  for (const letter of letters) {
    try {
      const results = await searchUsers(letter);
      for (const user of results) {
        const email = user.email || user.Email || '';
        if (email && !seen.has(email)) {
          seen.add(email);
          pool.push({
            email,
            displayName: user.displayName || user.DisplayName || email,
          });
        }
      }
    } catch {
      // skip failed letter searches silently
    }
  }

  if (pool.length === 0) {
    log('No AD users found, using fallback people pool', 'info');
    return FALLBACK_PEOPLE;
  }

  return pool;
}

// -- Serialization -----------------------------------------------------------

function userIdentity(person) {
  return JSON.stringify({ email: person.email, displayName: person.displayName });
}

function userIdentityArray(people) {
  return JSON.stringify(people.map(p => ({ email: p.email, displayName: p.displayName })));
}

// -- Template filler ---------------------------------------------------------

function fillTemplate(tpl) {
  return tpl
    .replace('{area}', pick(AREAS))
    .replace('{n}', rand(2, 8))
    .replace('{pct}', rand(60, 95));
}

// -- Batch runner ------------------------------------------------------------

async function runBatch(items, createFn, batchSize, label) {
  let created = 0;
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const results = await Promise.allSettled(batch.map(createFn));
    results.forEach((r, j) => {
      if (r.status === 'fulfilled') {
        created++;
      } else {
        log(`${label} item ${i + j + 1} failed: ${r.reason?.message ?? r.reason}`, 'error');
      }
    });
    log(`${label}: ${Math.min(i + batchSize, items.length)}/${items.length} processed`, 'info');
  }
  return created;
}

// -- Data pools --------------------------------------------------------------

const PROGRAM_NAMES = [
  'Digital Transformation', 'Client Experience', 'Operational Excellence',
  'Risk & Compliance', 'Innovation Hub', 'Data Strategy', 'Cloud Migration',
  'Process Automation', 'Customer Analytics', 'Talent Development',
  'Sustainability Initiative', 'Market Expansion', 'Technology Modernization',
  'Regulatory Reform', 'Revenue Optimization',
];

const PROJECT_CODENAMES = [
  'IB4F', 'ECH', 'Wave', 'Macarron', 'Proxy', 'Saba', 'Atlas', 'Nova',
  'Pulse', 'Zenith', 'Helix', 'Orbit', 'Spark', 'Nexus', 'Prism',
  'Vertex', 'Flux', 'Echo', 'Cipher', 'Delta',
];

const PROJECT_DOMAINS = [
  'Client Onboarding', 'Risk Dashboard', 'Portal ECM', 'Learning Platform',
  'Compliance Engine', 'Data Pipeline', 'Analytics Suite', 'API Gateway',
  'Process Hub', 'User Management',
];

const PROJECT_TYPES = ['Consultancy', 'Transformation', 'Lean', 'PMO', 'Tech', 'Data'];
const TECH_PROJECTS = ['SharePoint', 'PowerBI', 'Dataiku', 'LightDev', 'Automation', 'AI', 'LLM', 'Centric/NOA'];
const TECH_PHASES = ['Discovery', 'Framing', 'Business Case', 'Dev', 'Live', 'CM'];
const GDPR_CLASSIFICATIONS = [
  'Contact Information (CPD)',
  'Non-sensitive Personal Data: Other Information (OPD)',
  'Sensitive Personal Data (SPD)',
];
const SCOPE_OPTIONS = ['In Scope', 'Out of Scope'];
const BUSINESS_LINES = ['CCG', 'GCM', 'TB', 'CCCO', 'ESG', 'Finance', 'HR', 'COO', 'Transversal'];
const TARGET_TYPES = ['User Experience', 'Client Experience', 'Revenues', 'Cost Avoidance', 'RWA', 'Operational Risk', 'Employee Satisfaction'];
const TARGET_VALUE_TYPES = ['EUR', 'USD', 'GBP', 'FTE'];
const TARGET_SCOPES = ['Global', 'EMEA', 'AMER', 'APAC'];

const STATUS_WEIGHTS = [
  ['In Progress', 35],
  ['Pipeline', 20],
  ['Completed', 15],
  ['Delayed', 15],
  ['On Hold', 10],
  ['Stopped', 5],
];

const TYPE_WEIGHTS = [
  ['Tech', 30],
  ['Transformation', 20],
  ['Consultancy', 12],
  ['Lean', 12],
  ['PMO', 13],
  ['Data', 13],
];

const ROLE_WEIGHTS = [
  ['Leading', 80],
  ['Contributing', 20],
];

const ACCESS_WEIGHTS = [
  ['Internal', 60],
  ['NoRestriction', 30],
  ['Confidential', 10],
];

const AREAS = [
  'authentication', 'reporting', 'data migration', 'user profile',
  'notification', 'search', 'export', 'import', 'permissions',
  'scheduling', 'caching', 'logging', 'archival', 'integration',
  'configuration', 'analytics', 'approval', 'onboarding', 'monitoring', 'billing',
];

const CONTEXT_TEMPLATES = [
  'Modernize the {area} infrastructure to improve scalability and reduce operational overhead across {n} business units.',
  'Streamline {area} processes targeting {pct}% efficiency improvement through automation and standardization.',
  'Build a unified {area} platform integrating {n} legacy systems into a single coherent solution.',
  'Evaluate and redesign the {area} workflow to meet regulatory requirements and achieve {pct}% compliance.',
  'Develop a next-generation {area} capability to support business growth across {n} regions.',
  'Implement best-in-class {area} practices reducing manual effort by {pct}% and improving data quality.',
  'Transform the {area} landscape to enable real-time decision making for {n} key stakeholders.',
  'Establish a scalable {area} framework supporting {n} concurrent workstreams with {pct}% uptime target.',
];

const OBJECTIVES_TEMPLATES = [
  'Deliver measurable improvements in {area} operations within {n} quarters.',
  'Achieve {pct}% adoption rate for the new {area} solution across all business lines.',
  'Reduce {area} processing time by {pct}% while maintaining quality standards.',
  'Enable self-service {area} capabilities for {n} user groups by end of fiscal year.',
];

const ACHIEVEMENT_TEMPLATES = [
  'Completed {area} milestone ahead of schedule with {pct}% test coverage.',
  'Successfully migrated {n} components to the new {area} architecture.',
  'Delivered {area} phase {n} with full stakeholder sign-off.',
  'Resolved {n} critical {area} issues and improved system stability by {pct}%.',
];

const ROADBLOCK_TEMPLATES = [
  'Resource constraints in the {area} team delaying sprint {n} deliverables.',
  'Dependency on external {area} vendor causing {n}-week delay.',
  'Technical complexity in {area} integration higher than estimated.',
  'Stakeholder alignment needed for {area} scope changes affecting {n} workstreams.',
];

const NEXTSTEPS_TEMPLATES = [
  'Begin {area} phase {n} implementation and onboard additional resources.',
  'Complete {area} testing cycle and prepare for UAT with {n} business users.',
  'Finalize {area} documentation and conduct knowledge transfer sessions.',
  'Launch {area} pilot with {n} selected users and gather feedback.',
];

const PROPOSAL_TITLES = [
  'ML Pipeline Evaluation', 'CRM Integration Assessment', 'Legacy System Replacement',
  'Customer Portal Redesign', 'Supply Chain Optimization', 'Fraud Detection Enhancement',
  'Mobile App Modernization', 'Data Lake Consolidation', 'API Strategy Review',
  'Chatbot Implementation', 'Document Management Overhaul', 'Payment Gateway Upgrade',
  'Workforce Planning Tool', 'ESG Reporting Platform', 'Client Dashboard Revamp',
  'Regulatory Filing Automation', 'Knowledge Base Creation', 'DevOps Pipeline Setup',
  'Cloud Cost Optimization', 'Identity Management Refresh',
];

const PRODUCTS = [
  'Trading Platform', 'Client Portal', 'Risk Engine', 'Compliance Suite',
  'Analytics Dashboard', 'Document Hub', 'Onboarding System', 'Reporting Tool',
  'Data Warehouse', 'Integration Layer',
];

const FEEDBACK_TEMPLATES = [
  'Very satisfied with the {area} deliverables. Team was responsive and professional.',
  'Good results on {area}. Minor gaps in documentation but overall positive outcome.',
  'The {area} solution exceeded expectations. Would recommend the approach to other teams.',
  'Solid delivery on {area}. Some delays but final quality was high.',
];

const IMPROVEMENT_TEMPLATES = [
  'Consider earlier stakeholder engagement for {area} requirements gathering.',
  'Invest in automated testing for {area} to reduce regression risk.',
  'Improve {area} documentation and knowledge sharing practices.',
  'Establish clearer {area} governance to streamline decision-making.',
];

// -- Date helpers ------------------------------------------------------------

function addDays(isoDate, days) {
  const d = new Date(isoDate);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function randomDateBetween(startISO, endISO) {
  const start = new Date(startISO).getTime();
  const end = new Date(endISO).getTime();
  const ts = start + Math.random() * (end - start);
  return new Date(ts).toISOString().slice(0, 10);
}

// -- Builders ----------------------------------------------------------------

function buildProgram(index, pool, allPrograms) {
  const submitter = pick(pool);
  const sponsor = pick(pool);
  const stakeholderPeople = uniquePick(pool, rand(2, 3));

  const isChild = index > 1 && allPrograms.length > 0 && Math.random() < 0.3;
  const parentProgram = isChild ? pick(allPrograms) : null;

  return {
    Title: pick(PROGRAM_NAMES) + (index > PROGRAM_NAMES.length ? ` ${index}` : ''),
    UUID: genId('PROG', index),
    Context: fillTemplate(pick(CONTEXT_TEMPLATES)),
    ProgramSponsor: userIdentity(sponsor),
    Stakeholders: userIdentityArray(stakeholderPeople),
    UmbrellaProgram: parentProgram ? parentProgram.Title : '',
    LinkedPrograms: parentProgram ? parentProgram.UUID : '',
    SubmittedBy: userIdentity(submitter),
    SubmittedByEmail: submitter.email,
  };
}

function buildProject(index, pool, programs) {
  const codename = pick(PROJECT_CODENAMES);
  const domain = pick(PROJECT_DOMAINS);
  const program = pick(programs);
  const projectType = weightedPick(TYPE_WEIGHTS);
  const status = weightedPick(STATUS_WEIGHTS);
  const role = weightedPick(ROLE_WEIGHTS);
  const accessLevel = weightedPick(ACCESS_WEIGHTS);
  const startDate = randomDateISO(-180, 90);
  const expectedEndDate = addDays(startDate, rand(120, 365));
  const pm = pick(pool);
  const submitter = pick(pool);
  const sponsor = pick(pool);
  const stakeholderPeople = uniquePick(pool, rand(2, 3));
  const pmMemberPeople = uniquePick(pool, rand(1, 3));
  const isTech = projectType === 'Tech';
  const hasTargets = Math.random() < 0.6;
  const isCompleted = status === 'Completed';

  const item = {
    Title: `${codename} - ${domain}`,
    UUID: genId('PROJ', index),
    UmbrellaProgram: program.Title,
    LinkedPrograms: program.UUID,
    Context: fillTemplate(pick(CONTEXT_TEMPLATES)),
    Objectives: fillTemplate(pick(OBJECTIVES_TEMPLATES)),
    Scope: pick(SCOPE_OPTIONS),
    ProjectType: projectType,
    TechProject: isTech ? pick(TECH_PROJECTS) : '',
    TechPhase: isTech ? pick(TECH_PHASES) : '',
    StartDate: startDate,
    ExpectedEndDate: expectedEndDate,
    GDPRClassification: pick(GDPR_CLASSIFICATIONS),
    BusinessLine: pick(BUSINESS_LINES),
    Product: pick(PRODUCTS),
    Sponsor: userIdentity(sponsor),
    Stakeholders: userIdentityArray(stakeholderPeople),
    PMMembers: userIdentityArray(pmMemberPeople),
    PMMembersEmail: pmMemberPeople.map(p => p.email).join(';'),
    Status: status,
    ProjectManager: userIdentity(pm),
    ProjectManagerEmail: pm.email,
    Role: role,
    SubmittedBy: userIdentity(submitter),
    SubmittedByEmail: submitter.email,
    AccessLevel: accessLevel,
    // Target fields
    TargetType: hasTargets ? pick(TARGET_TYPES) : '',
    TargetValues: hasTargets
      ? Array.from({ length: rand(1, 3) }, () => ({ value: String(rand(50, 5000)), type: pick(TARGET_VALUE_TYPES) }))
      : [],
    TargetScope: hasTargets ? pick(TARGET_SCOPES) : '',
    // Impact fields (only for completed)
    AchievedValue: isCompleted ? String(rand(30, 4000)) : '',
    AchievedDate: isCompleted ? addDays(startDate, rand(90, 300)) : '',
    Validated: isCompleted ? (Math.random() < 0.5 ? 'true' : 'false') : '',
    NpsScore: isCompleted ? String(rand(1, 10)) : '',
    ClientFeedback: isCompleted ? fillTemplate(pick(FEEDBACK_TEMPLATES)) : '',
    Improvements: isCompleted ? fillTemplate(pick(IMPROVEMENT_TEMPLATES)) : '',
  };

  // Attach runtime data for later steps (not sent to SP)
  item._pmMembers = pmMemberPeople;

  return item;
}

function buildUpdates(project, pool) {
  if (project.Status === 'Pipeline') return [];

  const count = rand(0, 4);
  const updates = [];
  const endBound = project.Status === 'Completed'
    ? project.ExpectedEndDate
    : new Date().toISOString().slice(0, 10);

  for (let i = 0; i < count; i++) {
    const updateDate = randomDateBetween(project.StartDate, endBound);
    const submitter = pick(pool);
    updates.push({
      Title: `${project.Title} - ${updateDate}`,
      UUID: genId('UPDT', updates.length + 1 + Math.floor(Math.random() * 9000)),
      ProjectUUID: project.UUID,
      Achievements: fillTemplate(pick(ACHIEVEMENT_TEMPLATES)),
      Roadblocks: fillTemplate(pick(ROADBLOCK_TEMPLATES)),
      ExpectedEndDate: project.ExpectedEndDate,
      NextSteps: fillTemplate(pick(NEXTSTEPS_TEMPLATES)),
      UpdateDate: updateDate,
      SubmittedBy: userIdentity(submitter),
      SubmittedByEmail: submitter.email,
    });
  }

  return updates;
}

function buildProposal(index, pool) {
  const submitter = pick(pool);
  const sponsor = pick(pool);
  const status = weightedPick([
    ['Pipeline', 70],
    ['On Hold', 20],
    ['In Progress', 10],
  ]);

  return {
    Title: pick(PROPOSAL_TITLES) + (index > PROPOSAL_TITLES.length ? ` ${index}` : ''),
    UUID: genId('PROP', index),
    Context: fillTemplate(pick(CONTEXT_TEMPLATES)),
    ProjectType: pick(PROJECT_TYPES),
    BusinessLine: pick(BUSINESS_LINES),
    Sponsor: userIdentity(sponsor),
    Status: status,
    SubmittedBy: userIdentity(submitter),
    SubmittedByEmail: submitter.email,
  };
}

function buildAccessEntries(project, pool) {
  if (project.AccessLevel === 'NoRestriction') return [];

  const count = rand(1, 2);
  const entries = [];
  const delegates = uniquePick(pool, count);
  const granter = pick(pool);

  for (const person of delegates) {
    entries.push({
      Title: `${project.UUID}_${person.email}`,
      ProjectUUID: project.UUID,
      UserEmail: person.email,
      UserDisplayName: person.displayName,
      AccessType: weightedPick([['Contributing', 60], ['Read', 40]]),
      GrantedBy: userIdentity(granter),
      GrantedByEmail: granter.email,
    });
  }

  return entries;
}

function buildAllocations(project) {
  if (!['In Progress', 'Delayed'].includes(project.Status)) return [];
  if (!project._pmMembers || project._pmMembers.length === 0) return [];

  const updater = project._pmMembers[0];
  return project._pmMembers.map(member => ({
    Title: `${project.UUID}_${member.email}`,
    ProjectUUID: project.UUID,
    UserEmail: member.email,
    UserDisplayName: member.displayName,
    AllocationPercent: String(rand(10, 60)),
    UpdatedBy: userIdentity(updater),
    UpdatedByEmail: updater.email,
  }));
}

// -- Main export -------------------------------------------------------------

export async function generateData(siteApi, count) {
  log('--- Generate Data ---', 'info');

  const pool = await fetchPeoplePool();
  log(`People pool: ${pool.length} users`, 'info');

  const projectCount = count * 3;

  // Step 1: Programs
  const programs = [];
  for (let i = 1; i <= count; i++) {
    programs.push(buildProgram(i, pool, programs));
  }
  // Deduplicate titles (append suffix if collisions)
  const seenTitles = new Set();
  for (const prog of programs) {
    let title = prog.Title;
    let suffix = 2;
    while (seenTitles.has(title)) {
      title = `${prog.Title} ${suffix++}`;
    }
    prog.Title = title;
    seenTitles.add(title);
  }

  const programsApi = siteApi.list('Programs');
  const createdPrograms = await runBatch(
    programs, (item) => programsApi.createItem(item), 10, 'Programs'
  );
  log(`Programs: created ${createdPrograms}/${programs.length}`, 'success');

  // Step 2: Projects
  const projects = [];
  for (let i = 1; i <= projectCount; i++) {
    projects.push(buildProject(i, pool, programs));
  }

  const projectsApi = siteApi.list('Projects');
  // Strip runtime-only fields before sending
  const projectItems = projects.map(p => {
    const { _pmMembers, ...fields } = p;
    return fields;
  });
  const createdProjects = await runBatch(
    projectItems, (item) => projectsApi.createItem(item), 10, 'Projects'
  );
  log(`Projects: created ${createdProjects}/${projects.length}`, 'success');

  // Step 3: ProjectUpdates
  const allUpdates = [];
  for (const project of projects) {
    allUpdates.push(...buildUpdates(project, pool));
  }
  // Assign unique UUIDs sequentially
  allUpdates.forEach((u, i) => { u.UUID = genId('UPDT', i + 1); });

  const updatesApi = siteApi.list('ProjectUpdates');
  const createdUpdates = await runBatch(
    allUpdates, (item) => updatesApi.createItem(item), 10, 'ProjectUpdates'
  );
  log(`ProjectUpdates: created ${createdUpdates}/${allUpdates.length}`, 'success');

  // Step 4: Proposals
  const proposals = [];
  for (let i = 1; i <= count; i++) {
    proposals.push(buildProposal(i, pool));
  }

  const proposalsApi = siteApi.list('Proposals');
  const createdProposals = await runBatch(
    proposals, (item) => proposalsApi.createItem(item), 10, 'Proposals'
  );
  log(`Proposals: created ${createdProposals}/${proposals.length}`, 'success');

  // Step 5: ProjectAccess
  const allAccess = [];
  for (const project of projects) {
    allAccess.push(...buildAccessEntries(project, pool));
  }

  const accessApi = siteApi.list('ProjectAccess');
  const createdAccess = await runBatch(
    allAccess, (item) => accessApi.createItem(item), 10, 'ProjectAccess'
  );
  log(`ProjectAccess: created ${createdAccess}/${allAccess.length}`, 'success');

  // Step 6: Allocations
  const allAllocations = [];
  for (const project of projects) {
    allAllocations.push(...buildAllocations(project));
  }

  const allocationsApi = siteApi.list('Allocations');
  const createdAllocations = await runBatch(
    allAllocations, (item) => allocationsApi.createItem(item), 10, 'Allocations'
  );
  log(`Allocations: created ${createdAllocations}/${allAllocations.length}`, 'success');

  // Summary
  const totalCreated = createdPrograms + createdProjects + createdUpdates
    + createdProposals + createdAccess + createdAllocations;
  const totalAttempted = programs.length + projects.length + allUpdates.length
    + proposals.length + allAccess.length + allAllocations.length;

  log(`Done. Created ${totalCreated}/${totalAttempted} items across 6 lists.`, 'success');
}
