import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { AppUtils } from '../../../utils/AppUtils.js';
import { DBUtils } from '../../../utils/DBUtils.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('omnistudiotools', 'omnistudiotools.data.mock');

export default class Mock extends SfCommand<void> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    'target-org': Flags.requiredOrg(),
    object: Flags.string({ char: 'o', summary: messages.getMessage('flags.object.summary'), required: true }),
    count: Flags.integer({ char: 'c', summary: messages.getMessage('flags.count.summary'), required: true }),
    batch: Flags.integer({ char: 'b', summary: messages.getMessage('flags.batch.summary') }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(Mock);
    AppUtils.setCommand(this);
    AppUtils.logInitial('mock');

    const conn = flags['target-org'].getConnection(undefined);
    const object = flags.object;
    const count = flags.count;
    const batchSize = flags.batch ?? 100000;

    AppUtils.log4('Creating Mock Records...');

    const numofloops = Math.ceil(count / batchSize);
    let missing = count;
    AppUtils.log4('Number of Local Batches: ' + numofloops);

    for (let index = 0; index < numofloops; index++) {
      const records: any[] = [];
      const numForThisBatch = missing > batchSize ? batchSize : missing;
      missing = missing - batchSize;
      AppUtils.log3('Batch # ' + (index + 1) + ' - ' + numForThisBatch + ' Records');
      for (let index2 = 0; index2 < numForThisBatch; index2++) {
        const mockName = 'Mock' + index + '.' + index2;
        records.push({ Name: mockName });
      }
      await DBUtils.bulkAPIInsert(records, conn, object);
    }

    AppUtils.log3('Creating Mock Records Finished');
  }
}
