export const draftExportAction = Object.freeze({
  id: 'desktop-export-draft', name: 'Export reviewed local draft', capability: 'local-file-export',
  risk: 'low', sideEffect: 'reversible', confirmation: 'none', preferredTools: ['desktop-export'],
  outputReferenceRequired: false,
});
