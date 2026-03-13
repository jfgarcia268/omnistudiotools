import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { AppUtils } from '../../../utils/AppUtils.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('omnistudiotools', 'omnistudiotools.report.activeomniscript');

export default class ActiveOmniScript extends SfCommand<void> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    'target-org': Flags.requiredOrg(),
    package: Flags.string({ char: 'p', summary: messages.getMessage('flags.package.summary') }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(ActiveOmniScript);
    AppUtils.setCommand(this);

    const packageType = flags.package;
    if (packageType === 'cmt') {
      AppUtils.namespace = 'vlocity_cmt__';
    } else if (packageType === 'ins') {
      AppUtils.namespace = 'vlocity_ins__';
    } else {
      throw new Error('Error: -p, --package has to be either cmt or ins');
    }

    AppUtils.logInitial('activeOmniScripts');

    try {
      const conn = flags['target-org'].getConnection(undefined);
      const query =
        'SELECT ID, Name, %name-space%Version__c, %name-space%IsActive__c, %name-space%Language__c, %name-space%Type__c, %name-space%SubType__c FROM %name-space%OmniScript__c Order By Name, %name-space%Language__c, %name-space%Type__c,%name-space%SubType__c, %name-space%Version__c DESC';
      const initialQuery = AppUtils.replaceaNameSpace(query);
      const result = await conn.query(initialQuery);

      if (!result.records || result.records.length <= 0) {
        throw new Error('No results found for the org.');
      }

      const nameField = 'Name';
      const languageField = AppUtils.replaceaNameSpace('%name-space%Language__c');
      const typeField = AppUtils.replaceaNameSpace('%name-space%Type__c');
      const subTypeField = AppUtils.replaceaNameSpace('%name-space%SubType__c');
      const isActiveField = AppUtils.replaceaNameSpace('%name-space%IsActive__c');

      let lastresult = result.records[0];
      let currentComp =
        lastresult[nameField] + lastresult[languageField] + lastresult[typeField] + lastresult[subTypeField];
      this.log('  >> The Following OmniScripts does not have an active version:');
      let currentIsActive = false;
      let count = 0;

      for (const record of result.records) {
        const componentid = record[nameField] + record[languageField] + record[typeField] + record[subTypeField];
        if (currentComp !== componentid) {
          if (currentIsActive === false) {
            this.log(
              '    > Name: ' +
                lastresult[nameField] +
                ' Language: ' +
                lastresult[languageField] +
                ' Type: ' +
                lastresult[typeField] +
                ' SubType: ' +
                lastresult[subTypeField]
            );
            count = count + 1;
          }
          currentIsActive = record[isActiveField];
        } else {
          if (record[isActiveField] === true) {
            currentIsActive = true;
          }
        }
        currentComp = componentid;
        lastresult = record;
      }
      this.log('  >> Number of OmniScripts with no active version: ' + count);
    } catch (e) {
      console.log(e);
    }
  }
}
