import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { AppUtils } from '../../../utils/AppUtils.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('omnistudiotools', 'omnistudiotools.clean.savedomniscripts');

export default class CleanSavedOmniScripts extends SfCommand<void> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    'target-org': Flags.requiredOrg(),
    package: Flags.string({ char: 'p', summary: messages.getMessage('flags.package.summary') }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(CleanSavedOmniScripts);
    AppUtils.setCommand(this);

    const packageType = flags.package;

    if (packageType === 'cmt') {
      AppUtils.namespace = 'vlocity_cmt__';
    } else if (packageType === 'ins') {
      AppUtils.namespace = 'vlocity_ins__';
    } else {
      throw new Error('Error: -p, --package has to be either cmt or ins');
    }

    AppUtils.logInitial('savedomniscripts');

    const conn = flags['target-org'].getConnection(undefined);

    const savedOmniScriptsQueryInitial =
      'SELECT ID from %name-space%OmniScriptInstance__c WHERE %name-space%OmniScriptVersion__c = 0';
    const savedOmniScriptsAttachmentsQueryInitial =
      'SELECT id FROM attachment ' +
      'WHERE ParentId in ' +
      '(SELECT Id ' +
      'FROM %name-space%OmniScriptInstance__c where %name-space%OmniScriptVersion__c = 0) ';

    const savedOmniScriptsQuery = AppUtils.replaceaNameSpace(savedOmniScriptsQueryInitial);
    const savedOmniScriptsAttachmentsQuery = AppUtils.replaceaNameSpace(savedOmniScriptsAttachmentsQueryInitial);

    const resultSavedOmniAttachments = await conn.query(savedOmniScriptsAttachmentsQuery);
    if (!resultSavedOmniAttachments || resultSavedOmniAttachments.records.length <= 0) {
      AppUtils.log2('No Attachments to delete');
    } else {
      await CleanSavedOmniScripts.deleteRecords(conn, 'Attachment', resultSavedOmniAttachments.records);
    }

    const resultSavedOmniScripts = await conn.query(savedOmniScriptsQuery);
    if (!resultSavedOmniScripts || resultSavedOmniScripts.records.length <= 0) {
      AppUtils.log2('No Saved OmniScripts Found to delete');
    } else {
      await CleanSavedOmniScripts.deleteRecords(
        conn,
        AppUtils.replaceaNameSpace('%name-space%OmniScriptInstance__c'),
        resultSavedOmniScripts.records
      );
    }
  }

  private static async deleteRecords(conn: any, type: string, recordsToDelete: any[]): Promise<void> {
    await new Promise<void>((resolveBatch) => {
      const job = conn.bulk.createJob(type, 'delete');
      const batch = job.createBatch();
      batch.execute(recordsToDelete);

      batch.on('error', (err: any) => {
        console.log('Error, batchInfo:', err);
        resolveBatch();
      });
      batch.on('queue', () => {
        AppUtils.log2('Waiting for batch to finish');
        batch.poll(1000, 20000);
      });
      batch.on('response', (rets: any[]) => {
        for (let i = 0; i < rets.length; i++) {
          if (rets[i].success) {
            AppUtils.log1('#' + (i + 1) + ' Delete successfully: ' + rets[i].id);
          } else {
            AppUtils.log1('#' + (i + 1) + ' Error occurred, message = ' + rets[i].errors.join(', '));
          }
        }
        resolveBatch();
      });
    });
  }
}
