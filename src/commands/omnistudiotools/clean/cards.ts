import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { AppUtils } from '../../../utils/AppUtils.js';
import type { SfConnection } from '../../../utils/AppUtils.js';
import { getBulk } from '../../../utils/BulkTypes.js';
import type { BulkIngestBatchResult } from '../../../utils/BulkTypes.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('omnistudiotools', 'omnistudiotools.clean.cards');

export default class CleanCards extends SfCommand<void> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    'target-org': Flags.requiredOrg(),
    numberversions: Flags.integer({ char: 'n', summary: messages.getMessage('flags.numberversions.summary') }),
    package: Flags.string({ char: 'p', summary: messages.getMessage('flags.package.summary') }),
  };

  private static async deleteBatch(conn: SfConnection, objectName: string, records: Array<Record<string, unknown>>): Promise<void> {
    const bulk = getBulk(conn);
    await new Promise<void>((resolveBatch) => {
      const job = bulk.createJob(objectName, 'delete');
      const batch = job.createBatch();
      batch.execute(records);

      batch.on('error', (err: Error) => {
        AppUtils.log2('Error, batchInfo: ' + String(err));
        resolveBatch();
      });
      batch.on('queue', () => {
        AppUtils.log2('Waiting for batch to finish');
        batch.poll(1000, 20_000);
      });
      batch.on('response', (rets: BulkIngestBatchResult) => {
        for (let i = 0; i < rets.length; i++) {
          if (rets[i].success) {
            AppUtils.log1('#' + (i + 1) + ' Delete successfully: ' + String(rets[i].id));
          } else {
            AppUtils.log1('#' + (i + 1) + ' Error occurred, message = ' + rets[i].errors.join(', '));
          }
        }
        resolveBatch();
      });
    });
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(CleanCards);
    AppUtils.setCommand(this);

    const versionsToKeep = flags.numberversions;
    const packageType = flags.package;

    if (packageType === 'cmt') {
      AppUtils.namespace = 'vlocity_cmt__';
    } else if (packageType === 'ins') {
      AppUtils.namespace = 'vlocity_ins__';
    } else {
      throw new Error('Error: -p, --package has to be either cmt or ins');
    }

    AppUtils.logInitial('cards');
    AppUtils.log2('Versions To Keep: ' + versionsToKeep);

    if (!versionsToKeep || versionsToKeep < 2) {
      throw new Error('Error: -n, --numberversions has to be greater or equal to 2');
    }

    const conn = flags['target-org'].getConnection(undefined);
    const initialQuery =
      'SELECT Id, Name, %name-space%Active__c,%name-space%Version__c,%name-space%Type__c ' +
      'FROM %name-space%VlocityCard__c ' +
      'ORDER BY Name, %name-space%Version__c DESC';

    const query = AppUtils.replaceaNameSpace(initialQuery);
    const result = await conn.query<Record<string, unknown>>(query);

    if (!result.records || result.records.length <= 0) {
      throw new Error('No results found for the org.');
    }

    const nameField = 'Name';
    const isActiveField = AppUtils.replaceaNameSpace('%name-space%Active__c');
    const versionField = AppUtils.replaceaNameSpace('%name-space%Version__c');

    let currentComp = result.records[0][nameField];
    let count = 0;
    const cardsToDelete: Array<Record<string, unknown>> = [];

    AppUtils.log2('The Following Cards will be deleted:');

    for (const record of result.records) {
      const componentid = record[nameField];
      if (currentComp === componentid) {
        count = count + 1;
      } else {
        currentComp = componentid;
        count = 1;
      }

      if (count > versionsToKeep && !record[isActiveField]) {
        cardsToDelete.push(record);
        AppUtils.log1('Name: ' + String(record[nameField]) + ', Version: ' + String(record[versionField]));
      }
    }

    if (cardsToDelete.length > 0) {
      await CleanCards.deleteBatch(conn, AppUtils.replaceaNameSpace('%name-space%VlocityCard__c'), cardsToDelete);
    } else {
      AppUtils.log2('Nothing to delete');
    }
  }
}
