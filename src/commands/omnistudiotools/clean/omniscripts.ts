import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { AppUtils } from '../../../utils/AppUtils.js';
import { DBUtils } from '../../../utils/DBUtils.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('omnistudiotools', 'omnistudiotools.clean.omniscripts');

export default class CleanOmniScripts extends SfCommand<void> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    'target-org': Flags.requiredOrg(),
    numberversions: Flags.integer({
      char: 'n',
      summary: messages.getMessage('flags.numberversions.summary'),
      required: true,
    }),
    package: Flags.string({ char: 'p', summary: messages.getMessage('flags.package.summary') }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(CleanOmniScripts);
    AppUtils.setCommand(this);

    const versionsToKeep = flags.numberversions;
    const packageType = flags.package;

    const conn = flags['target-org'].getConnection(undefined);

    const nameSpaceSet = await AppUtils.setNameSpace(conn, packageType);
    if (!nameSpaceSet) {
      throw new Error('Error: Package was not set or incorrect was provided.');
    }

    AppUtils.logInitial('omniscripts');
    AppUtils.log2('Versions To Keep: ' + versionsToKeep);

    if (versionsToKeep <= 0) {
      throw new Error('Error: -n, --numberversions has to be greater than 0');
    }

    const initialQuery =
      'SELECT ID, Name, %name-space%Version__c, %name-space%IsActive__c, %name-space%Language__c, %name-space%Type__c, %name-space%SubType__c FROM %name-space%OmniScript__c Order By Name, %name-space%Language__c, %name-space%Type__c,%name-space%SubType__c, %name-space%Version__c DESC';
    const query = AppUtils.replaceaNameSpace(initialQuery);

    const result = await DBUtils.bulkAPIquery(conn, query);

    const nameField = 'Name';
    const languageField = AppUtils.replaceaNameSpace('%name-space%Language__c');
    const typeField = AppUtils.replaceaNameSpace('%name-space%Type__c');
    const subTypeField = AppUtils.replaceaNameSpace('%name-space%SubType__c');
    const isActiveField = AppUtils.replaceaNameSpace('%name-space%IsActive__c');
    const versionField = AppUtils.replaceaNameSpace('%name-space%Version__c');

    if (result.length === 0) {
      AppUtils.log2('No OmniScripts in the Org');
      return;
    }

    const firstresult = result[0];
    let currentComp =
      firstresult[nameField] + firstresult[languageField] + firstresult[typeField] + firstresult[subTypeField];
    let count = 0;
    const OStoDelete: any[] = [];

    AppUtils.log2('The Following OmniScripts will be deleted:');
    for (const record of result) {
      const componentid = record[nameField] + record[languageField] + record[typeField] + record[subTypeField];

      if (currentComp === componentid) {
        count++;
      } else {
        currentComp = componentid;
        count = 1;
      }

      if (count > versionsToKeep && record[isActiveField] === 'false') {
        const output =
          'Name: ' +
          record[nameField] +
          ', Language: ' +
          record[languageField] +
          ', Type: ' +
          record[typeField] +
          ', SubType: ' +
          record[subTypeField] +
          ', Version: ' +
          record[versionField];
        AppUtils.log1(output);
        delete record[nameField];
        delete record[versionField];
        delete record[isActiveField];
        delete record[languageField];
        delete record[typeField];
        delete record[subTypeField];
        OStoDelete.push(record);
      }
    }

    if (OStoDelete.length > 0) {
      AppUtils.log3('Deleting Old OmniScripts');
      const OSAPIName = AppUtils.replaceaNameSpace('%name-space%OmniScript__c');
      await DBUtils.bulkAPIdelete(OStoDelete, conn, OSAPIName, false, false, null, 120);
    } else {
      AppUtils.log2('Nothing to delete');
    }
  }
}
