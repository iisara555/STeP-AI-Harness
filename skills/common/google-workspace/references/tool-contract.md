# Native Google Workspace tool contract

This is the STeP Desktop contract, inspired by the seven Workspace service families in [gogcli](https://github.com/openclaw/gogcli). It uses the app's own OAuth/Vault and Google REST APIs; no gog binary or shell bridge is required. The source catalog and synthetic examples are checked offline. A valid example is not evidence of live Google access.

## Calling the tool

First use tool_describe for google_workspace, then call it with empty input and args {"action":"list"}. Choose the account handle belonging to this task. To execute, set input to one operation below and args to {"account":"<handle>","params":{...},"body":{...}}. Omit empty params/body. Always inspect the current catalog rather than inventing an operation. Every read and write requires the host's approval, and sharing a result with AI has a separate privacy review.

| Operation | Service | Effect | Params | Body |
| --- | --- | --- | --- | --- |
| `drive.list` | drive-read | read | `query?`, `pageToken?`, `driveId?`, `includeItemsFromAllDrives? (default true)` |  |
| `docs.get` | documents | read | `documentId` |  |
| `docs.create` | documents | write |  | `title` |
| `docs.appendText` | documents | write | `documentId` | `text`, `requiredRevisionId` |
| `sheets.get` | documents | read | `spreadsheetId` |  |
| `sheets.values.get` | documents | read | `spreadsheetId`, `range` |  |
| `sheets.create` | documents | write |  | `title` |
| `sheets.values.update` | documents | write | `spreadsheetId`, `range (explicit A1:B2 rectangle)` | `values (RAW, at most 500 scalar cells matching the rectangle)` |
| `slides.get` | documents | read | `presentationId` |  |
| `slides.create` | documents | write |  | `title` |
| `slides.appendTextSlide` | documents | write | `presentationId` | `text`, `requiredRevisionId` |
| `gmail.list` | gmail-read | read | `query?`, `pageToken?` |  |
| `gmail.get` | gmail-read | read | `messageId` |  |
| `gmail.draft` | gmail-draft | write |  | `to (email array)`, `subject`, `text`, `cc?`, `bcc?`, `threadId?`, `inReplyTo?` |
| `gmail.send` | gmail-send | write |  | `to (email array)`, `subject`, `text`, `cc?`, `bcc?`, `threadId?`, `inReplyTo?` |
| `calendar.list` | calendar-read | read | `pageToken?` |  |
| `calendar.events` | calendar-read | read | `calendarId`, `timeMin (RFC3339)`, `timeMax (RFC3339)`, `pageToken?` |  |
| `calendar.createEvent` | calendar | write | `calendarId` | `summary`, `text?`, `start (RFC3339 with offset)`, `end (RFC3339 with offset)`, `attendees? (email array)` |
| `tasks.lists` | tasks | read | `pageToken?` |  |
| `tasks.list` | tasks | read | `tasklistId`, `pageToken?` |  |
| `tasks.create` | tasks | write | `tasklistId` | `title`, `text?` |
| `tasks.complete` | tasks | write | `tasklistId`, `taskId` |  |
| `chat.spaces` | chat | read | `pageToken?` |  |
| `chat.messages` | chat | read | `spaceId`, `pageToken?` |  |
| `chat.send` | chat | write | `spaceId` | `text` |
| `meet.get` | meet | read | `spaceId` |  |
| `drive.get` | drive-read | read | `fileId` |  |
| `drive.createFolder` | drive | write |  | `name`, `parentId?` |
| `drive.copy` | drive | write | `fileId` | `name`, `parentId?` |
| `drive.update` | drive | write | `fileId`, `addParent?`, `removeParent?` | `name?`, `description?`, `trashed?` |
| `drive.exportText` | drive-read | read | `fileId`, `mimeType` |  |
| `drive.getText` | drive-read | read | `fileId` |  |
| `drive.uploadText` | drive | write |  | `name`, `mimeType`, `text`, `parentId?` |
| `drive.permissions.list` | drive-read | read | `fileId`, `pageToken?` |  |
| `drive.permissions.create` | drive | write | `fileId` | `type`, `role`, `emailAddress?`, `domain?` |
| `drive.permissions.delete` | drive | write | `fileId`, `permissionId` |  |
| `docs.batchUpdate` | docs | write | `documentId` | `requests (Google API request objects; max 50; allowed: insertText, deleteContentRange, replaceAllText, updateTextStyle, updateParagraphStyle, createParagraphBullets, deleteParagraphBullets, insertTable, insertTableRow, insertTableColumn, deleteTableRow, deleteTableColumn, updateTableCellStyle, updateDocumentStyle, insertInlineImage, insertPageBreak, createHeader, createFooter, createNamedRange, deleteNamedRange)`, `requiredRevisionId` |
| `slides.batchUpdate` | slides | write | `presentationId` | `requests (Google API request objects; max 50; allowed: createSlide, deleteObject, duplicateObject, updateSlidesPosition, createShape, insertText, deleteText, replaceAllText, updateTextStyle, updateParagraphStyle, createParagraphBullets, deleteParagraphBullets, updatePageProperties, updatePageElementTransform, updateShapeProperties, createImage, replaceImage, createTable, insertTableRows, insertTableColumns, deleteTableRow, deleteTableColumn, updateTableCellProperties, updateTableBorderProperties, updateTableColumnProperties, updateTableRowProperties, mergeTableCells, unmergeTableCells, createSheetsChart, refreshSheetsChart, updateLineProperties)`, `requiredRevisionId` |
| `slides.pages.get` | slides | read | `presentationId`, `pageId` |  |
| `sheets.batchUpdate` | sheets | write | `spreadsheetId` | `requests (Google API request objects; max 50; allowed: addSheet, deleteSheet, updateSheetProperties, updateCells, repeatCell, appendCells, insertDimension, deleteDimension, updateDimensionProperties, autoResizeDimensions, copyPaste, cutPaste, mergeCells, unmergeCells, setBasicFilter, clearBasicFilter, sortRange, addConditionalFormatRule, updateConditionalFormatRule, deleteConditionalFormatRule, setDataValidation, addChart, updateChartSpec, deleteEmbeddedObject, addNamedRange, updateNamedRange, deleteNamedRange, updateSpreadsheetProperties, findReplace)` |
| `sheets.values.batchGet` | sheets | read | `spreadsheetId`, `ranges`, `valueRenderOption?` |  |
| `sheets.values.batchUpdate` | sheets | write | `spreadsheetId` | `data`, `valueInputOption?` |
| `sheets.values.append` | sheets | write | `spreadsheetId`, `range` | `values`, `valueInputOption?` |
| `sheets.values.clear` | sheets | write | `spreadsheetId`, `range` |  |
| `gmail.threads.list` | gmail-read | read | `query?`, `pageToken?` |  |
| `gmail.threads.get` | gmail-read | read | `threadId` |  |
| `gmail.labels.list` | gmail-read | read |  |  |
| `gmail.labels.create` | gmail-manage | write |  | `name` |
| `gmail.modify` | gmail-manage | write | `messageId` | `addLabelIds?`, `removeLabelIds?` |
| `gmail.trash` | gmail-manage | write | `messageId` |  |
| `gmail.untrash` | gmail-manage | write | `messageId` |  |
| `gmail.drafts.list` | gmail-draft | read | `pageToken?` |  |
| `gmail.drafts.get` | gmail-draft | read | `draftId` |  |
| `gmail.drafts.update` | gmail-draft | write | `draftId` | `to`, `subject`, `text`, `cc?`, `bcc?`, `threadId?`, `inReplyTo?` |
| `gmail.drafts.delete` | gmail-draft | write | `draftId` |  |
| `gmail.attachments.getText` | gmail-read | read | `messageId`, `attachmentId` |  |
| `forms.create` | forms | write |  | `title`, `documentTitle?` |
| `forms.get` | forms | read | `formId` |  |
| `forms.batchUpdate` | forms | write | `formId` | `requests (Google API request objects; max 50; allowed: updateFormInfo, updateSettings, createItem, moveItem, deleteItem, updateItem)`, `requiredRevisionId` |
| `forms.responses.list` | forms | read | `formId`, `pageToken?`, `filter?` |  |
| `forms.responses.get` | forms | read | `formId`, `responseId` |  |
| `forms.setPublishSettings` | forms | write | `formId` | `isPublished`, `isAcceptingResponses` |
| `appscript.projects.create` | appscript | write |  | `title`, `parentId?` |
| `appscript.projects.get` | appscript | read | `scriptId` |  |
| `appscript.projects.getContent` | appscript | read | `scriptId`, `versionNumber?` |  |
| `appscript.projects.updateContent` | appscript | write | `scriptId` | `files (changed or new files only; other files preserved; max 50)`, `deleteFiles? (explicit names to remove; cannot remove appsscript manifest)`, `expectedContentHash (contentHash from appscript.projects.getContent)` |
| `appscript.versions.list` | appscript | read | `scriptId`, `pageToken?` |  |
| `appscript.versions.get` | appscript | read | `scriptId`, `versionNumber` |  |
| `appscript.versions.create` | appscript | write | `scriptId` | `description?` |
| `appscript.deployments.list` | appscript | read | `scriptId`, `pageToken?` |  |
| `appscript.deployments.get` | appscript | read | `scriptId`, `deploymentId` |  |
| `appscript.deployments.create` | appscript | write | `scriptId` | `versionNumber`, `manifestFileName`, `description?` |
| `appscript.deployments.update` | appscript | write | `scriptId`, `deploymentId` | `versionNumber`, `manifestFileName`, `description?` |
| `appscript.deployments.delete` | appscript | write | `scriptId`, `deploymentId` |  |
| `appscript.processes.list` | appscript | read | `pageToken?`, `scriptId?` |  |
| `appscript.run` | appscript | write | `deploymentId` | `function`, `parameters?` |

## Boundaries and verification

- Services are explicit employee choices as well as OAuth grants. Gmail drafting does not authorize sending; mailbox management does not authorize sending either. Existing accounts retain their original service choices until reconnected.
- Docs, Slides and Forms batch writes require the revision from a fresh read. Requests are limited to 50 approved Google request types. Sheets values default to RAW; formula entry requires explicit USER_ENTERED. Batch value writes use explicit matching rectangles, at most 500 cells in total.
- Drive search includes My Drive and accessible Shared drives by default. Set driveId to search one known Shared drive, or includeItemsFromAllDrives=false for My Drive (cannot combine it with driveId). Both pagination and incompleteSearch must be inspected: incompleteSearch=true means a result is incomplete even without a nextPageToken. Narrow the drive/query before claiming a complete search. Existing drive.file grants still restrict visibility to app-managed files.
- Apps Script content writes accept changed/new files, optional explicit deleteFiles, and contentHash from getContent. The host queues writes per account/project and rereads/checks the hash after acquiring the project, preserves all unmodified files, and sends a complete project to Google. Stale queued changes return GOOGLE_SOURCE_CHANGED, while queued changes behind an unknown write stop with GOOGLE_OUTCOME_UNKNOWN. The appsscript manifest cannot be removed. Redacted credentials cannot be written back into a changed file. Google offers no atomic content precondition, so edits from another process/device remain possible.
- Apps Script run uses the API Executable deployment ID, devMode=false. The script and OAuth client must share a standard Cloud project, and the grant must cover the script's own Project OAuth Scopes. The app does not request arbitrary runtime scopes. A timeout or partial failure is an unknown write outcome; inspect the source before repeating.
- Drive uploads/downloads/exports and Gmail attachment reads here are UTF-8 text only, bounded to 1 MB responses (uploads 50,000 characters). Do not claim binary/PDF/DOCX download or full gogcli command parity. Open binary files in Google. No raw attachment/MIME base64 is exposed to the model.
- Gmail plain-text bodies decode using the MIME part's declared charset, including windows-874/TIS-620. Unsupported charsets or invalid bytes produce contentUnavailable; readable sibling parts may still be returned, so report the missing content instead of assuming a complete message. Attachments retain their UTF-8-only contract.
- Enable Drive, Gmail, Docs, Sheets, Slides, Forms and Apps Script APIs in the configured Google Cloud project, and permit the requested scopes in Workspace administration. Expanding policy does not grant existing accounts new permissions; use Change allowed services and reauthorize the same account.
- Report only confirmed IDs/resource links and status. Creation without a reference, interrupted writes and unknown outcomes are not success and must not be retried automatically.

Sources: [Google Workspace API references](https://developers.google.com/workspace), [Forms API](https://developers.google.com/workspace/forms/api/reference/rest), [Apps Script run](https://developers.google.com/apps-script/api/reference/rest/v1/scripts/run).
