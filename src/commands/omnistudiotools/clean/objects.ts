import fsExtra from 'fs-extra';
import yaml from 'js-yaml';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { AppUtils } from '../../../utils/AppUtils.js';
import type { SfConnection } from '../../../utils/AppUtils.js';
import { DBUtils } from '../../../utils/DBUtils.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('omnistudiotools', 'omnistudiotools.clean.objects');

type YamlDoc = {
  Objects: Record<string, string | null>;
};

export default class CleanObjects extends SfCommand<void> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    'target-org': Flags.requiredOrg(),
    package: Flags.string({ char: 'p', summary: messages.getMessage('flags.package.summary') }),
    datafile: Flags.string({ char: 'd', summary: messages.getMessage('flags.datafile.summary'), required: true }),
    onlyquery: Flags.boolean({ char: 'q', summary: messages.getMessage('flags.onlyquery.summary') }),
    retry: Flags.boolean({ char: 'r', summary: messages.getMessage('flags.retry.summary') }),
    save: Flags.boolean({ char: 's', summary: messages.getMessage('flags.save.summary') }),
    hard: Flags.boolean({ char: 'x', summary: messages.getMessage('flags.hard.summary') }),
    polltimeout: Flags.string({ char: 't', summary: messages.getMessage('flags.polltimeout.summary') }),
    big: Flags.boolean({ char: 'b', summary: messages.getMessage('flags.big.summary') }),
    bigsize: Flags.string({ char: 'z', summary: messages.getMessage('flags.bigsize.summary') }),
  };

  private static bulkApiPollTimeout = 60;
  private static error = false;

  private static async deleteRecordsFromObject(
    objectName: string,
    conn: SfConnection,
    onlyquery: boolean | undefined,
    where: string | undefined,
    save: boolean | undefined,
    hard: boolean | undefined,
    resultData: Array<Record<string, unknown>>,
    big: boolean | undefined,
    bigsize: string | undefined
  ): Promise<void> {
    let query = 'SELECT Id FROM ' + objectName;
    if (where !== undefined && where !== '') {
      query += ' WHERE ' + where;
    }

    AppUtils.log3('Query: ' + query);
    if (!big) {
      const records = await DBUtils.bulkAPIquery(conn, query);
      if (records.length > 1 && !onlyquery) {
        await DBUtils.bulkAPIdelete(
          records,
          conn,
          objectName,
          save ?? false,
          hard ?? false,
          resultData,
          CleanObjects.bulkApiPollTimeout
        );
      } else {
        resultData.push({ ObjectName: objectName, RecordsFound: records.length, DeleteSuccess: 'N/A' });
      }
    } else {
      query += bigsize ? ' LIMIT ' + bigsize : ' LIMIT 500000';
      AppUtils.log3('Big Query: ' + query);
      AppUtils.log3('Big Query - Batch Size: ' + (bigsize ?? '500000'));
      let records = await DBUtils.bulkAPIquery(conn, query);
      let numberOfLocalBatches = 1;
      let totalOfRecords = 0;
      while (records.length > 0 && !onlyquery) {
        totalOfRecords = records.length;
        AppUtils.log3('Batch # ' + String(numberOfLocalBatches));
        // Sequential deletion required: each batch depends on previous completion
        // eslint-disable-next-line no-await-in-loop
        await DBUtils.bulkAPIdelete(
          records,
          conn,
          objectName,
          save ?? false,
          hard ?? false,
          resultData,
          CleanObjects.bulkApiPollTimeout
        );
        // eslint-disable-next-line no-await-in-loop
        records = await DBUtils.bulkAPIquery(conn, query);
        numberOfLocalBatches = numberOfLocalBatches + 1;
      }
      AppUtils.log3('Total Records ' + String(totalOfRecords));
    }
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(CleanObjects);
    AppUtils.setCommand(this);

    const packageType = flags.package;
    const onlyquery = flags.onlyquery;
    const retry = flags.retry;
    const save = flags.save;
    const hard = flags.hard;
    const polltimeout = flags.polltimeout;
    const big = flags.big;
    const bigsize = flags.bigsize;

    if (polltimeout) {
      CleanObjects.bulkApiPollTimeout = parseInt(polltimeout, 10);
    }

    AppUtils.logInitial('objects');

    const conn = flags['target-org'].getConnection(undefined);
    const nameSpaceSet = await AppUtils.setNameSpace(conn, packageType);
    if (!nameSpaceSet) {
      throw new Error('Error: Package was not set or incorrect was provided.');
    }

    const dataFile = flags.datafile;

    if (!fsExtra.existsSync(dataFile)) {
      throw new Error('Error: File: ' + dataFile + ' does not exist');
    }

    const doc = yaml.load(fsExtra.readFileSync(dataFile, 'utf8')) as YamlDoc;
    const resultData: Array<Record<string, unknown>> = [];

    do {
      AppUtils.log4('Deleting....');
      AppUtils.log2('');
      for (const element of Object.keys(doc.Objects)) {
        const where = doc.Objects[element] ?? undefined;
        const objectAPIName = AppUtils.replaceaNameSpaceFromFile(element);
        AppUtils.log4('Object: ' + objectAPIName);
        try {
          // Sequential deletion required: objects must be processed in order
          // eslint-disable-next-line no-await-in-loop
          await CleanObjects.deleteRecordsFromObject(
            objectAPIName,
            conn,
            onlyquery,
            where,
            save,
            hard,
            resultData,
            big,
            bigsize
          );
        } catch (error) {
          AppUtils.log2('Error Deleting: ' + objectAPIName + '  Error: ' + String(error));
        }
      }
      AppUtils.log2('');
    } while (retry && CleanObjects.error);

    const tableColumnData = ['ObjectName', 'RecordsFound', 'DeleteSuccess', 'RecordsSuccess', 'RecordsFail'];
    this.log('RESULTS:');
    AppUtils.table(resultData, tableColumnData);
    this.log(' ');
  }
}
