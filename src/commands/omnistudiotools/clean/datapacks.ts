import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { AppUtils } from '../../../utils/AppUtils.js';
import { DBUtils } from '../../../utils/DBUtils.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('omnistudiotools', 'omnistudiotools.clean.datapacks');

export default class CleanDataPacks extends SfCommand<void> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    'target-org': Flags.requiredOrg(),
    package: Flags.string({ char: 'p', summary: messages.getMessage('flags.package.summary') }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(CleanDataPacks);
    AppUtils.setCommand(this);
    AppUtils.logInitial('datapacks');
    this.log(' ');

    const conn = flags['target-org'].getConnection(undefined);
    const packageType = flags.package;

    const nameSpaceSet = await AppUtils.setNameSpace(conn, packageType);
    if (!nameSpaceSet) {
      throw new Error('Error: Package was not set or incorrect was provided.');
    }

    const dataPacksQueryInitial = 'SELECT Id FROM %name-space%VlocityDataPack__c WHERE IsDeleted = false ';
    const dataPacksAttachmentsQueryInitial =
      'SELECT id FROM attachment ' +
      'WHERE ParentId in ' +
      '(SELECT Id ' +
      'FROM %name-space%VlocityDataPack__c ) ';

    const dataPacksQuery = AppUtils.replaceaNameSpace(dataPacksQueryInitial);
    const dataPacksAttachmentsQuery = AppUtils.replaceaNameSpace(dataPacksAttachmentsQueryInitial);

    const resultDataPacksAttachments = await DBUtils.bulkAPIquery(conn, dataPacksAttachmentsQuery);
    if (!resultDataPacksAttachments || resultDataPacksAttachments.length === 0) {
      AppUtils.log2('No Attachments to delete');
    } else {
      await DBUtils.bulkAPIdelete(
        resultDataPacksAttachments,
        conn,
        'Attachment',
        false,
        false,
        null,
        60
      );
    }

    const resultDataPacks = await DBUtils.bulkAPIquery(conn, dataPacksQuery);
    if (!resultDataPacks || resultDataPacks.length <= 0) {
      AppUtils.log2('No DataPacks Found to delete');
    } else {
      await DBUtils.bulkAPIdelete(
        resultDataPacks,
        conn,
        AppUtils.replaceaNameSpace('%name-space%VlocityDataPack__c'),
        false,
        false,
        null,
        60
      );
    }
  }
}
