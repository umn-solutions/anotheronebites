export const SCHEMA = {
  Projects: [
    { title: 'UUID', indexed: true },
    { title: 'UmbrellaProgram' },
    { title: 'LinkedPrograms', multiline: true },
    { title: 'Context', multiline: true },
    { title: 'Objectives', multiline: true },
    { title: 'Scope' },
    { title: 'ProjectType', indexed: true },
    { title: 'TechProject' },
    { title: 'TechPhase' },
    { title: 'StartDate' },
    { title: 'ExpectedEndDate' },
    { title: 'GDPRClassification' },
    { title: 'BusinessLine' },
    { title: 'Product' },
    { title: 'Sponsor' },
    { title: 'Stakeholders', multiline: true },
    { title: 'PMMembers', multiline: true },
    { title: 'PMMembersEmail', multiline: true },
    { title: 'Status', indexed: true },
    { title: 'ProjectManager' },
    { title: 'ProjectManagerEmail', indexed: true },
    { title: 'Role' },
    { title: 'SubmittedBy' },
    { title: 'SubmittedByEmail', indexed: true },
    { title: 'TargetType' },
    { title: 'TargetValues', multiline: true },
    { title: 'TargetScope' },
    { title: 'AchievedValue' },
    { title: 'AchievedDate' },
    { title: 'Validated' },
    { title: 'NpsScore' },
    { title: 'ClientFeedback', multiline: true },
    { title: 'Improvements', multiline: true },
    { title: 'AccessLevel', indexed: true },
    { title: 'PMScope', indexed: true },
  ],

  Programs: [
    { title: 'UUID', indexed: true },
    { title: 'Context', multiline: true },
    { title: 'ProgramSponsor' },
    { title: 'Stakeholders', multiline: true },
    { title: 'UmbrellaProgram' },
    { title: 'LinkedPrograms', multiline: true },
    { title: 'SubmittedBy' },
    { title: 'SubmittedByEmail', indexed: true },
    { title: 'PMScope', indexed: true },
  ],

  Proposals: [
    { title: 'UUID', indexed: true },
    { title: 'Context', multiline: true },
    { title: 'ProjectType', indexed: true },
    { title: 'BusinessLine' },
    { title: 'Sponsor' },
    { title: 'Status', indexed: true },
    { title: 'SubmittedBy' },
    { title: 'SubmittedByEmail', indexed: true },
    { title: 'PMScope', indexed: true },
  ],

  ProjectUpdates: [
    { title: 'UUID', indexed: true },
    { title: 'ProjectUUID', indexed: true },
    { title: 'Achievements', multiline: true },
    { title: 'Roadblocks', multiline: true },
    { title: 'ExpectedEndDate' },
    { title: 'NextSteps', multiline: true },
    { title: 'UpdateDate' },
    { title: 'SubmittedBy' },
    { title: 'SubmittedByEmail', indexed: true },
  ],

  Definitions: [
    { title: 'Value', indexed: true },
    { title: 'IsActive', indexed: true },
  ],

  UserRoles: [
    { title: 'Roles', multiline: true },
  ],

  ProjectAccess: [
    { title: 'ProjectUUID', indexed: true },
    { title: 'UserEmail', indexed: true },
    { title: 'UserDisplayName' },
    { title: 'AccessType', indexed: true },
    { title: 'GrantedBy' },
    { title: 'GrantedByEmail', indexed: true },
  ],

  Allocations: [
    { title: 'ProjectUUID', indexed: true },
    { title: 'UserEmail', indexed: true },
    { title: 'UserDisplayName' },
    { title: 'AllocationPercent' },
    { title: 'UpdatedBy' },
    { title: 'UpdatedByEmail', indexed: true },
  ],
};

export const BUILTIN_FIELDS = new Set([
  'ContentType', 'Title', 'Attachments', 'Modified', 'Created',
  'Author', 'Editor', 'ContentTypeId', 'ComplianceAssetId',
  'OData__UIVersionString', 'AppAuthor', 'AppEditor',
]);

export const APP_URL = _spPageContextInfo.webAbsoluteUrl;
