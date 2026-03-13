import fsExtra from 'fs-extra';
import { AppUtils } from './AppUtils.js';
import type { SfConnection } from './AppUtils.js';
import { getBulk } from './BulkTypes.js';
import type { BulkIngestBatchResult, BulkJob } from './BulkTypes.js';

export class DBUtils {
  public static bulkApiPollTimeout = 120;
  private static batchSize = 10_000;

  public static async query(conn: SfConnection, initialQuery: string): Promise<{ records: Array<Record<string, unknown>> }> {
    const query = AppUtils.replaceaNameSpace(initialQuery);
    return conn.query<Record<string, unknown>>(query);
  }

  public static async bulkAPIquery(conn: SfConnection, initialQuery: string): Promise<Array<Record<string, unknown>>> {
    const query = AppUtils.replaceaNameSpace(initialQuery);
    AppUtils.startSpinner('Fetching records');
    let count = 0;
    const records: Array<Record<string, unknown>> = [];
    const bulk = getBulk(conn);
    bulk.pollInterval = 5000;
    bulk.pollTimeout = 240_000;
    const promise = new Promise<string>((resolve) => {
      bulk
        .query(query)
        .on('record', (result: Record<string, unknown>) => {
          try {
            records.push(result);
            count++;
            AppUtils.updateSpinnerMessage('Objects Fetched so far: ' + count);
          } catch (error) {
            AppUtils.log3('Objects Fetched so far: ' + count);
            AppUtils.stopSpinnerMessage('Error Fetching Record: ' + String(error));
            resolve('error');
          }
        })
        .on('queue', () => {
          AppUtils.log3('Fetch queued');
          AppUtils.updateSpinnerMessage('Fetch queued');
        })
        .on('end', () => {
          if (records.length > 0) {
            AppUtils.stopSpinnerMessage(
              'Succesfully Fetched All Row records... Number of records: ' + records.length
            );
            resolve('Done');
          } else {
            AppUtils.stopSpinnerMessage('No Rows where found');
            resolve('No');
          }
        })
        .on('error', (err: Error) => {
          AppUtils.stopSpinnerMessage('Error Fetching: ' + String(err));
          resolve('error');
        });
    });
    try {
      await promise;
    } catch (error) {
      AppUtils.log3('Error with Promise: ' + String(error));
    }
    return records;
  }

  public static async bulkAPIUpdate(records: Array<Record<string, unknown>>, conn: SfConnection, objectName: string): Promise<void> {
    const job = getBulk(conn).createJob(objectName, 'update');
    await job.open();
    await DBUtils.runBatches(records, job, objectName);
  }

  public static async bulkAPIInsert(records: Array<Record<string, unknown>>, conn: SfConnection, objectName: string): Promise<void> {
    const job = getBulk(conn).createJob(objectName, 'insert');
    await job.open();
    await DBUtils.runBatches(records, job, objectName);
  }

  public static async bulkAPIUpsert(
    records: Array<Record<string, unknown>>,
    conn: SfConnection,
    objectName: string,
    id: string,
    save: boolean
  ): Promise<void> {
    const job = getBulk(conn).createJob(objectName, 'upsert', { extIdField: id });
    await job.open();
    await DBUtils.runBatches(records, job, objectName, save);
  }

  public static csvToJson(csv: string): Array<Record<string, string>> {
    const lines = csv.split('\n');
    const result: Array<Record<string, string>> = [];
    const headers = lines[0].split(',');
    for (let i = 1; i < lines.length; i++) {
      const obj: Record<string, string> = {};
      const currentline = lines[i].split(',');
      for (let j = 0; j < headers.length; j++) {
        obj[headers[j].replace('\r', '')] = currentline[j]?.replace('\r', '') ?? '';
      }
      result.push(obj);
    }
    return result;
  }

  public static async bulkAPIQueryAndDelete(
    conn: SfConnection,
    objectName: string,
    hardelete: boolean,
    bulkApiPollTimeout?: number
  ): Promise<void> {
    const timeout = bulkApiPollTimeout ?? this.bulkApiPollTimeout;
    const query = 'SELECT ID FROM ' + objectName;
    const records = await DBUtils.bulkAPIquery(conn, query);
    if (records.length > 0) {
      await DBUtils.bulkAPIdelete(records, conn, objectName, false, hardelete, null, timeout);
    }
  }

  public static async bulkAPIQueryAndDeleteWithQuery(
    conn: SfConnection,
    object: string,
    query: string,
    hardelete: boolean,
    bulkApiPollTimeout?: number
  ): Promise<void> {
    const timeout = bulkApiPollTimeout ?? this.bulkApiPollTimeout;
    const records = await DBUtils.bulkAPIquery(conn, query);
    if (records.length > 0) {
      await DBUtils.bulkAPIdelete(records, conn, object, false, hardelete, null, timeout);
    }
  }

  public static async easyBulkAPIdelete(records: Array<Record<string, unknown>>, conn: SfConnection, objectName: string): Promise<void> {
    await this.bulkAPIdelete(records, conn, objectName, false, false, null, this.bulkApiPollTimeout);
  }

  public static async bulkAPIdelete(
    records: Array<Record<string, unknown>>,
    conn: SfConnection,
    objectName: string,
    save: boolean,
    hardelete: boolean,
    resultData: Array<Record<string, unknown>> | null,
    bulkApiPollTimeout: number | null
  ): Promise<void> {
    const timeout = bulkApiPollTimeout ?? this.bulkApiPollTimeout;
    const deleteType = hardelete === true ? 'hardDelete' : 'delete';
    const job = getBulk(conn).createJob(objectName, deleteType);
    await job.open();
    const numOfComonents = records.length;
    const div = numOfComonents / this.batchSize;
    const numberOfBatches = Math.floor(div) === div ? div : Math.floor(div) + 1;
    let numberOfBatchesDone = 0;
    AppUtils.log2('Number Of Batches to be created to delete Rows: ' + numberOfBatches);
    try {
      const promises: Array<Promise<string>> = [];
      for (let i = 0; i < numberOfBatches; i++) {
        let arraytoDelete = records;
        if (i < numberOfBatches - 1) {
          arraytoDelete = records.splice(0, this.batchSize);
        }
        const batchNumber = i + 1;
        const newp = new Promise<string>((resolve) => {
          const batch = job.createBatch();
          AppUtils.log1('Creating Batch # ' + batchNumber + ' Number of Records: ' + arraytoDelete.length);
          batch
            .execute(arraytoDelete)
            .on('error', (err: Error) => {
              AppUtils.log2('Error, batch Info: ' + String(err));
              numberOfBatchesDone = numberOfBatchesDone + 1;
              if (resultData) {
                resultData.push({
                  ObjectName: objectName,
                  RecordsFound: records.length,
                  DeleteSuccess: 'No Error: ' + String(err),
                });
              }
              resolve('error');
            })
            .on('queue', () => {
              batch.poll(5 * 1000, 1000 * 60 * timeout);
              AppUtils.log1('Batch #' + batchNumber + ' with Id: ' + String(batch.id) + ' Has started');
            })
            .on('response', (rets: BulkIngestBatchResult) => {
              numberOfBatchesDone = numberOfBatchesDone + 1;
              const errorsNumber = DBUtils.numFail(rets);
              const recordsGood = rets.length - errorsNumber;
              const hadErrors = errorsNumber === 0;
              AppUtils.log1(
                'Batch #' +
                  batchNumber +
                  ' With Id: ' +
                  String(batch.id) +
                  ' Finished - Success: ' +
                  String(hadErrors) +
                  ' - Records Success: ' +
                  recordsGood +
                  ' Records Fail: ' +
                  errorsNumber +
                  ' - ' +
                  numberOfBatchesDone +
                  '/' +
                  numberOfBatches +
                  ' Batches have finished'
              );
              if (resultData) {
                resultData.push({
                  ObjectName: objectName,
                  RecordsFound: records.length,
                  DeleteSuccess: hadErrors,
                  RecordsSuccess: recordsGood,
                  RecordsFail: errorsNumber,
                });
              }
              if (save) {
                DBUtils.saveResults(rets, batchNumber, objectName);
              }
              resolve('response');
            });
        }).catch((error: unknown) => {
          AppUtils.log2('Error Creating  batches - Error: ' + String(error));
          if (resultData) {
            resultData.push({
              ObjectName: objectName,
              RecordsFound: records.length,
              DeleteSuccess: 'No Error: ' + String(error),
              RecordsSuccess: 'N/A',
              RecordsFail: 'N/A',
            });
          }
        });
        promises.push(newp as Promise<string>);
      }
      await Promise.all(promises);
      job.close();
    } catch (error) {
      job.close();
      AppUtils.log2('Error Creating  batches - Error: ' + String(error));
      if (resultData) {
        resultData.push({
          ObjectName: objectName,
          RecordsFound: records.length,
          DeleteSuccess: 'No Error: ' + String(error),
          RecordsSuccess: 'N/A',
          RecordsFail: 'N/A',
        });
      }
    }
  }

  private static async runBatches(
    records: Array<Record<string, unknown>>,
    job: BulkJob,
    objectName: string,
    save?: boolean
  ): Promise<void> {
    const numOfComonents = records.length;
    const div = numOfComonents / this.batchSize;
    const numberOfBatches = Math.floor(div) === div ? div : Math.floor(div) + 1;
    let numberOfBatchesDone = 0;
    AppUtils.log2('Number Of Batches to be created: ' + numberOfBatches);
    try {
      const promises: Array<Promise<string>> = [];
      for (let i = 0; i < numberOfBatches; i++) {
        let arraytoupdate = records;
        if (i < numberOfBatches - 1) {
          arraytoupdate = records.splice(0, this.batchSize);
        }
        const batchNumber = i + 1;
        const newp = new Promise<string>((resolve) => {
          const batch = job.createBatch();
          AppUtils.log1('Creating Batch # ' + batchNumber + ' Number of Records: ' + arraytoupdate.length);
          batch
            .execute(arraytoupdate)
            .on('error', (err: Error) => {
              AppUtils.log2('Error, batch Info: ' + String(err));
              numberOfBatchesDone = numberOfBatchesDone + 1;
              resolve('error');
            })
            .on('queue', () => {
              batch.poll(5 * 1000, 1000 * 60 * this.bulkApiPollTimeout);
              AppUtils.log1('Batch #' + batchNumber + ' with Id: ' + String(batch.id) + ' Has started');
            })
            .on('response', (rets: BulkIngestBatchResult) => {
              numberOfBatchesDone = numberOfBatchesDone + 1;
              const hadErrors = DBUtils.noErrors(rets);
              AppUtils.log1(
                'Batch #' +
                  batchNumber +
                  ' With Id: ' +
                  String(batch.id) +
                  ' Finished - Success: ' +
                  String(hadErrors) +
                  '  ' +
                  numberOfBatchesDone +
                  '/' +
                  numberOfBatches +
                  ' Batches have finished'
              );
              if (save) {
                DBUtils.saveResults(rets, batchNumber, objectName);
              }
              resolve('response');
            });
        }).catch((error: unknown) => {
          AppUtils.log2('Error Creating  batches - Error: ' + String(error));
        });
        promises.push(newp as Promise<string>);
      }
      await Promise.all(promises);
      job.close();
    } catch (error) {
      job.close();
      AppUtils.log2('Error Creating  batches - Error: ' + String(error));
    }
  }

  private static saveResults(rets: BulkIngestBatchResult, batchNumber: number, objectName: string): void {
    const fileName = 'Results_' + objectName + '_' + batchNumber + '.json';
    if (fsExtra.existsSync(fileName)) {
      fsExtra.unlinkSync(fileName);
    }
    const createFiles = fsExtra.createWriteStream(fileName, { flags: 'a' });
    createFiles.write(JSON.stringify(rets));
    AppUtils.log1('File Created: ' + fileName);
  }

  private static noErrors(rets: BulkIngestBatchResult): boolean {
    for (const element of rets) {
      if (!element.success) {
        return false;
      }
    }
    return true;
  }

  private static numFail(rets: BulkIngestBatchResult): number {
    let recordsFail = 0;
    for (const element of rets) {
      if (!element.success) {
        recordsFail = recordsFail + 1;
      }
    }
    return recordsFail;
  }
}
