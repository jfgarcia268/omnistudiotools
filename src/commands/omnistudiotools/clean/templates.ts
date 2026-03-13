import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { AppUtils } from '../../../utils/AppUtils.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('omnistudiotools', 'omnistudiotools.clean.templates');

export default class CleanTemplates extends SfCommand<void> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    'target-org': Flags.requiredOrg(),
    numberversions: Flags.integer({ char: 'n', summary: messages.getMessage('flags.numberversions.summary') }),
    package: Flags.string({ char: 'p', summary: messages.getMessage('flags.package.summary') }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(CleanTemplates);
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

    AppUtils.logInitial('templates');
    AppUtils.log2('Versions To Keep: ' + versionsToKeep);

    if (!versionsToKeep || versionsToKeep < 2) {
      throw new Error('Error: -n, --numberversions has to be greater or equal to 2');
    }

    const conn = flags['target-org'].getConnection(undefined);
    const initialQuery =
      'SELECT Id, Name, %name-space%Active__c,%name-space%Version__c,%name-space%Type__c ' +
      'FROM %name-space%VlocityUITemplate__c ' +
      'ORDER BY Name, %name-space%Version__c DESC';

    const query = AppUtils.replaceaNameSpace(initialQuery);
    const result = await conn.query(query);

    if (!result.records || result.records.length <= 0) {
      throw new Error('No results found for the org.');
    }

    const nameField = 'Name';
    const isActiveField = AppUtils.replaceaNameSpace('%name-space%Active__c');
    const versionField = AppUtils.replaceaNameSpace('%name-space%Version__c');

    let currentComp = result.records[0][nameField];
    let count = 0;
    const templatesToDelete: any[] = [];

    AppUtils.log2('The Following Templates will be deleted:');

    for (const record of result.records) {
      const componentid = record[nameField];
      if (currentComp === componentid) {
        count = count + 1;
      } else {
        currentComp = componentid;
        count = 1;
      }

      if (count > versionsToKeep && !record[isActiveField]) {
        templatesToDelete.push(record);
        AppUtils.log1('Name: ' + record[nameField] + ', Version: ' + record[versionField]);
      }
    }

    if (templatesToDelete.length > 0) {
      await new Promise<void>((resolveBatch) => {
        const job = conn.bulk.createJob(
          AppUtils.replaceaNameSpace('%name-space%VlocityUITemplate__c'),
          'delete'
        );
        const batch = job.createBatch();
        batch.execute(templatesToDelete);

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
    } else {
      AppUtils.log2('Nothing to delete');
    }
  }
}
