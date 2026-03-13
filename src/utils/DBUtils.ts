import { AppUtils } from './AppUtils.js';
import fsExtra from 'fs-extra';

export class DBUtils {
  private static batchSize = 10000;
  public static bulkApiPollTimeout = 120;

  static async query(conn: any, initialQuery: string): Promise<any> {
    const query = AppUtils.replaceaNameSpace(initialQuery);
    const result = await conn.query(query);
    return result;
  }

  static async bulkAPIquery(conn: any, initialQuery: string): Promise<any[]> {
    const query = AppUtils.replaceaNameSpace(initialQuery);
    AppUtils.startSpinner('Fetching records');
    let count = 0;
    const records: any[] = [];
    conn.bulk.pollInterval = 5000;
    conn.bulk.pollTimeout = 240000;
    const promise = new Promise<string>((resolve) => {
      conn.bulk
        .query(query)
        .on('record', (result: any) => {
          try {
            records.push(result);
            count++;
            AppUtils.updateSpinnerMessage('Objects Fetched so far: ' + count);
          } catch (error) {
            AppUtils.log3('Objects Fetched so far: ' + count);
            AppUtils.stopSpinnerMessage('Error Fetching Record: ' + error);
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
        .on('error', (err: any) => {
          AppUtils.stopSpinnerMessage('Error Fetching: ' + err);
          resolve('error');
        });
    });
    try {
      await promise;
    } catch (error) {
      AppUtils.log3('Error with Promise: ' + error);
    }
    return records;
  }

  static async bulkAPIUpdate(records: any[], conn: any, objectName: string): Promise<void> {
    const job = await conn.bulk.createJob(objectName, 'update');
    await job.open();
    const numOfComonents = records.length;
    const div = numOfComonents / this.batchSize;
    const numberOfBatches = Math.floor(div) === div ? div : Math.floor(div) + 1;
    let numberOfBatchesDone = 0;
    AppUtils.log2('Number Of Batches to be created to Upsert Rows: ' + numberOfBatches);
    try {
      const promises: Promise<string>[] = [];
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
            .on('error', (err: any) => {
              console.log('Error, batch Info:', err);
              numberOfBatchesDone = numberOfBatchesDone + 1;
              resolve('error');
            })
            .on('queue', () => {
              batch.poll(5 * 1000, 1000 * 60 * this.bulkApiPollTimeout);
              AppUtils.log1('Batch #' + batchNumber + ' with Id: ' + batch.id + ' Has started');
            })
            .on('response', (rets: any[]) => {
              numberOfBatchesDone = numberOfBatchesDone + 1;
              const hadErrors = DBUtils.noErrors(rets);
              AppUtils.log1(
                'Batch #' +
                  batchNumber +
                  ' With Id: ' +
                  batch.id +
                  ' Finished - Success: ' +
                  hadErrors +
                  '  ' +
                  numberOfBatchesDone +
                  '/' +
                  numberOfBatches +
                  ' Batches have finished'
              );
              resolve('response');
            });
        }).catch((error) => {
          AppUtils.log2('Error Creating  batches - Error: ' + error);
        });
        promises.push(newp as Promise<string>);
      }
      await Promise.all(promises);
      job.close();
    } catch (error) {
      job.close();
      AppUtils.log2('Error Creating  batches - Error: ' + error);
    }
  }

  static async bulkAPIInsert(records: any[], conn: any, objectName: string): Promise<void> {
    const job = await conn.bulk.createJob(objectName, 'insert');
    await job.open();
    const numOfComonents = records.length;
    const div = numOfComonents / this.batchSize;
    const numberOfBatches = Math.floor(div) === div ? div : Math.floor(div) + 1;
    let numberOfBatchesDone = 0;
    AppUtils.log2('Number Of Batches to be created to Insert Rows: ' + numberOfBatches);
    try {
      const promises: Promise<string>[] = [];
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
            .on('error', (err: any) => {
              console.log('Error, batch Info:', err);
              numberOfBatchesDone = numberOfBatchesDone + 1;
              resolve('error');
            })
            .on('queue', () => {
              batch.poll(5 * 1000, 1000 * 60 * this.bulkApiPollTimeout);
              AppUtils.log1('Batch #' + batchNumber + ' with Id: ' + batch.id + ' Has started');
            })
            .on('response', (rets: any[]) => {
              numberOfBatchesDone = numberOfBatchesDone + 1;
              const hadErrors = DBUtils.noErrors(rets);
              AppUtils.log1(
                'Batch #' +
                  batchNumber +
                  ' With Id: ' +
                  batch.id +
                  ' Finished - Success: ' +
                  hadErrors +
                  '  ' +
                  numberOfBatchesDone +
                  '/' +
                  numberOfBatches +
                  ' Batches have finished'
              );
              resolve('response');
            });
        }).catch((error) => {
          AppUtils.log2('Error Creating  batches - Error: ' + error);
        });
        promises.push(newp as Promise<string>);
      }
      await Promise.all(promises);
      job.close();
    } catch (error) {
      job.close();
      AppUtils.log2('Error Creating  batches - Error: ' + error);
    }
  }

  static async bulkAPIUpsert(
    records: any[],
    conn: any,
    objectName: string,
    id: string,
    save: boolean
  ): Promise<void> {
    const job = await conn.bulk.createJob(objectName, 'upsert', { extIdField: id });
    await job.open();
    const numOfComonents = records.length;
    const div = numOfComonents / this.batchSize;
    const numberOfBatches = Math.floor(div) === div ? div : Math.floor(div) + 1;
    let numberOfBatchesDone = 0;
    AppUtils.log2('Number Of Batches to be created to Update Rows: ' + numberOfBatches);
    try {
      const promises: Promise<string>[] = [];
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
            .on('error', (err: any) => {
              console.log('Error, batch Info:', err);
              numberOfBatchesDone = numberOfBatchesDone + 1;
              resolve('error');
            })
            .on('queue', () => {
              batch.poll(5 * 1000, 1000 * 60 * this.bulkApiPollTimeout);
              AppUtils.log1('Batch #' + batchNumber + ' with Id: ' + batch.id + ' Has started');
            })
            .on('response', (rets: any[]) => {
              numberOfBatchesDone = numberOfBatchesDone + 1;
              const hadErrors = DBUtils.noErrors(rets);
              AppUtils.log1(
                'Batch #' +
                  batchNumber +
                  ' With Id: ' +
                  batch.id +
                  ' Finished - Success: ' +
                  hadErrors +
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
        }).catch((error) => {
          AppUtils.log2('Error Creating  batches - Error: ' + error);
        });
        promises.push(newp as Promise<string>);
      }
      await Promise.all(promises);
      job.close();
    } catch (error) {
      job.close();
      AppUtils.log2('Error Creating  batches - Error: ' + error);
    }
  }

  static async csvToJson(csv: string): Promise<any[]> {
    const lines = csv.split('\n');
    const result: any[] = [];
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

  static async bulkAPIQueryAndDelete(
    conn: any,
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

  static async bulkAPIQueryAndDeleteWithQuery(
    conn: any,
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

  static async easyBulkAPIdelete(records: any[], conn: any, objectName: string): Promise<void> {
    await this.bulkAPIdelete(records, conn, objectName, false, false, null, this.bulkApiPollTimeout);
  }

  static async bulkAPIdelete(
    records: any[],
    conn: any,
    objectName: string,
    save: boolean,
    hardelete: boolean,
    resultData: any[] | null,
    bulkApiPollTimeout: number | null
  ): Promise<void> {
    const timeout = bulkApiPollTimeout ?? this.bulkApiPollTimeout;
    const deleteType = hardelete === true ? 'hardDelete' : 'delete';
    const job = await conn.bulk.createJob(objectName, deleteType);
    await job.open();
    const numOfComonents = records.length;
    const div = numOfComonents / this.batchSize;
    const numberOfBatches = Math.floor(div) === div ? div : Math.floor(div) + 1;
    let numberOfBatchesDone = 0;
    AppUtils.log2('Number Of Batches to be created to delete Rows: ' + numberOfBatches);
    try {
      const promises: Promise<string>[] = [];
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
            .on('error', (err: any) => {
              console.log('Error, batch Info:', err);
              numberOfBatchesDone = numberOfBatchesDone + 1;
              if (resultData) {
                resultData.push({
                  ObjectName: objectName,
                  RecordsFound: records.length,
                  DeleteSuccess: 'No Error: ' + err,
                });
              }
              resolve('error');
            })
            .on('queue', () => {
              batch.poll(5 * 1000, 1000 * 60 * timeout);
              AppUtils.log1('Batch #' + batchNumber + ' with Id: ' + batch.id + ' Has started');
            })
            .on('response', (rets: any[]) => {
              numberOfBatchesDone = numberOfBatchesDone + 1;
              const errorsNumber = DBUtils.numFail(rets);
              const recordsGood = rets.length - errorsNumber;
              const hadErrors = errorsNumber === 0;
              AppUtils.log1(
                'Batch #' +
                  batchNumber +
                  ' With Id: ' +
                  batch.id +
                  ' Finished - Success: ' +
                  hadErrors +
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
        }).catch((error) => {
          AppUtils.log2('Error Creating  batches - Error: ' + error);
          if (resultData) {
            resultData.push({
              ObjectName: objectName,
              RecordsFound: records.length,
              DeleteSuccess: 'No Error: ' + error,
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
      AppUtils.log2('Error Creating  batches - Error: ' + error);
      if (resultData) {
        resultData.push({
          ObjectName: objectName,
          RecordsFound: records.length,
          DeleteSuccess: 'No Error: ' + error,
          RecordsSuccess: 'N/A',
          RecordsFail: 'N/A',
        });
      }
    }
  }

  private static saveResults(rets: any[], batchNumber: number, objectName: string): void {
    const fileName = 'Results_' + objectName + '_' + batchNumber + '.json';
    if (fsExtra.existsSync(fileName)) {
      fsExtra.unlinkSync(fileName);
    }
    const createFiles = fsExtra.createWriteStream(fileName, { flags: 'a' });
    createFiles.write(JSON.stringify(rets));
    AppUtils.log1('File Created: ' + fileName);
  }

  private static noErrors(rets: any[]): boolean {
    for (const element of rets) {
      if (element.success === false) {
        return false;
      }
    }
    return true;
  }

  private static numFail(rets: any[]): number {
    let recordsFail = 0;
    for (const element of rets) {
      if (!element.success) {
        recordsFail = recordsFail + 1;
      }
    }
    return recordsFail;
  }
}
