import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { AppUtils } from '../../../utils/AppUtils.js';
import { DBUtils } from '../../../utils/DBUtils.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('omnistudiotools', 'omnistudiotools.data.updatefield');

export default class UpdateField extends SfCommand<void> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    'target-org': Flags.requiredOrg(),
    object: Flags.string({ char: 'o', summary: messages.getMessage('flags.object.summary'), required: true }),
    field: Flags.string({ char: 'f', summary: messages.getMessage('flags.field.summary'), required: true }),
    value: Flags.string({ char: 'v', summary: messages.getMessage('flags.value.summary'), required: true }),
    where: Flags.string({ char: 'w', summary: messages.getMessage('flags.where.summary') }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(UpdateField);
    AppUtils.setCommand(this);
    AppUtils.logInitial('updatefield');

    const conn = flags['target-org'].getConnection(undefined);
    const object = flags.object;
    const field = flags.field;
    const value = flags.value;
    const where = flags.where;

    let query = 'SELECT Id, ' + field + ' FROM ' + object;
    if (where) {
      query += ' WHERE ' + where;
    }

    AppUtils.log4('Exporting Data...');
    AppUtils.log3('Query: ' + query);
    const records = await DBUtils.bulkAPIquery(conn, query);

    if (records.length === 0) {
      AppUtils.log3('No Records to Update');
    } else {
      AppUtils.log4('Updating Data Locally...');
      AppUtils.log3('Number Of records to Update: ' + records.length);
      for (let i = 0; i < records.length; i++) {
        records[i][field] = value;
      }
      AppUtils.log4('Updating Data...');
      await DBUtils.bulkAPIUpdate(records, conn, object);
    }
  }
}
