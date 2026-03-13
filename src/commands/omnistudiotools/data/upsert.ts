import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import fsExtra from 'fs-extra';
import { AppUtils } from '../../../utils/AppUtils.js';
import { DBUtils } from '../../../utils/DBUtils.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('omnistudiotools', 'omnistudiotools.data.upsert');

export default class Upsert extends SfCommand<void> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    'target-org': Flags.requiredOrg(),
    csv: Flags.string({ char: 'f', summary: messages.getMessage('flags.csv.summary'), required: true }),
    object: Flags.string({ char: 'b', summary: messages.getMessage('flags.object.summary'), required: true }),
    id: Flags.string({ char: 'i', summary: messages.getMessage('flags.id.summary'), required: true }),
    save: Flags.boolean({ char: 's', summary: messages.getMessage('flags.save.summary') }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(Upsert);
    AppUtils.setCommand(this);
    AppUtils.logInitial('upsert');

    const conn = flags['target-org'].getConnection(undefined);
    const object = flags.object;
    const id = flags.id;
    const save = flags.save ?? false;
    const dataFile = flags.csv;

    if (!fsExtra.existsSync(dataFile)) {
      throw new Error('Error: File: ' + dataFile + ' does not exist');
    }

    const doc = fsExtra.readFileSync(dataFile, 'utf8');

    AppUtils.log3('Reading Records...');
    const dataToUpsert = DBUtils.csvToJson(doc);
    AppUtils.log3(dataToUpsert.length + ' Records Found');

    await DBUtils.bulkAPIUpsert(dataToUpsert, conn, object, id, save);

    AppUtils.log3('Upsert Finished');
  }
}
