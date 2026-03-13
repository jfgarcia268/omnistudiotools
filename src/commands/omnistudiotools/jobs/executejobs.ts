import fsExtra from 'fs-extra';
import yaml from 'js-yaml';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { AppUtils } from '../../../utils/AppUtils.js';
import type { SfConnection } from '../../../utils/AppUtils.js';
import { DBUtils } from '../../../utils/DBUtils.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('omnistudiotools', 'omnistudiotools.jobs.executejobs');

type YamlJobs = {
  jobs: string[];
};

type ApexJobRecord = {
  Id: string;
  Status: string;
  TotalJobItems: number;
  JobItemsProcessed: number;
  NumberOfErrors: number;
  ExtendedStatus: string;
  ApexClass: { Name: string };
};

export default class ExecuteJobs extends SfCommand<void> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    'target-org': Flags.requiredOrg(),
    jobs: Flags.string({ char: 'j', summary: messages.getMessage('flags.jobs.summary'), required: true }),
    pooltime: Flags.integer({ char: 'p', summary: messages.getMessage('flags.pooltime.summary') }),
    stoponerror: Flags.boolean({ char: 's', summary: messages.getMessage('flags.stoponerror.summary') }),
    more: Flags.boolean({ char: 'm', summary: messages.getMessage('flags.more.summary') }),
    remoteapex: Flags.boolean({ char: 'r', summary: messages.getMessage('flags.remoteapex.summary') }),
    package: Flags.string({ char: 'k', summary: messages.getMessage('flags.package.summary') }),
  };

  public static async callJobLocal(conn: SfConnection, job: string): Promise<void> {
    let apexBody = '';
    if (job === 'EPCFixCompiledAttributeOverrideBatchJob') {
      apexBody = 'Database.executeBatch(new vlocity_cmt.EPCFixCompiledAttributeOverrideBatchJob (), 1);';
    } else if (job === 'FixProductAttribJSONBatchJob') {
      apexBody = 'Database.executeBatch(new vlocity_cmt.FixProductAttribJSONBatchJob());';
    } else if (job === 'EPCProductAttribJSONBatchJob') {
      apexBody =
        'List<Id> productIds = new List<Id>();for (Product2 prod : [ Select Id from Product2 where vlocity_cmt__ObjectTypeId__c != null ]){productIds.add(prod.Id);}Database.executeBatch(new vlocity_cmt.EPCProductAttribJSONBatchJob(productIds), 1);';
    } else if (job === 'EPCAttributeOverrideBatchJob') {
      apexBody = 'Database.executeBatch(new vlocity_cmt.EPCAttributeOverrideBatchJob (), 2000);';
    } else {
      apexBody =
        "vlocity_cmt.TelcoAdminConsoleController telcoAdminConsoleController = new vlocity_cmt.TelcoAdminConsoleController();telcoAdminConsoleController.setParameters('" +
        job +
        "');telcoAdminConsoleController.invokeMethod();";
    }
    await AppUtils.runApex(conn, apexBody);
  }

  public static async callJob(conn: SfConnection, body: Record<string, string>): Promise<void> {
    await (conn as unknown as { apex: { post(path: string, body: unknown): Promise<unknown> } }).apex.post('/CMTJobsUtil/', body);
  }

  public static checkStatus(conn: SfConnection, jobStartTime: string): Promise<ApexJobRecord[]> {
    return (conn as unknown as { apex: { get(path: string): Promise<ApexJobRecord[]> } }).apex.get('/CMTJobsUtil?jobStartTime=' + jobStartTime);
  }

  public static async checkStatusLocal(conn: SfConnection, jobStartTime: string, runningUserId: string): Promise<ApexJobRecord[]> {
    let query =
      'SELECT Id,Status,CreatedDate,TotalJobItems,JobItemsProcessed,ApexClass.Name,NumberOfErrors,ExtendedStatus ';
    query += 'FROM AsyncApexJob ';
    query += "WHERE CreatedById='" + runningUserId + "' ";
    query += "AND JobType='BatchApex' ";
    query += 'AND CreatedDate>=' + jobStartTime;
    const result = await conn.query<ApexJobRecord>(query);
    return result.records;
  }

  private static async handleSpecialJob(conn: SfConnection, jobName: string): Promise<boolean> {
    if (jobName.includes('jobdeletequery:')) {
      const queryPart = jobName.split(':')[1];
      const objectPart = jobName.split(':')[2];
      AppUtils.log3('Delete Job - Query: ' + queryPart);
      // Sequential deletion required: each job must complete before the next starts
      // eslint-disable-next-line no-await-in-loop
      await DBUtils.bulkAPIQueryAndDeleteWithQuery(conn, objectPart, queryPart, false, 4);
      AppUtils.log2('Job Done');
      return true;
    } else if (jobName.includes('jobdelete:')) {
      const objectName = jobName.split(':')[1];
      AppUtils.log3('Delete Job - Object: ' + objectName);
      // eslint-disable-next-line no-await-in-loop
      await DBUtils.bulkAPIQueryAndDelete(conn, objectName, false, 4);
      AppUtils.log2('Job Done');
      return true;
    } else if (jobName.includes('clearepcjson:')) {
      const Product2query = jobName.split(':')[1];
      AppUtils.log3('Clear Product2 JSON - Query: ' + Product2query);
      AppUtils.log3('Getting Records...');
      // eslint-disable-next-line no-await-in-loop
      const records = await DBUtils.bulkAPIquery(conn, Product2query);
      if (records.length > 0) {
        for (const element of records) {
          element[AppUtils.replaceaNameSpace('%name-space%AttributeDefaultValues__c')] = null;
          element[AppUtils.replaceaNameSpace('%name-space%JSONAttribute__c')] = null;
          element[AppUtils.replaceaNameSpace('%name-space%AttributeMetadata__c')] = null;
        }
        AppUtils.log3('Updating Records...');
        // eslint-disable-next-line no-await-in-loop
        await DBUtils.bulkAPIUpdate(records, conn, 'Product2');
      } else {
        AppUtils.log2('No Records To Update');
      }
      AppUtils.log2('Job Done');
      return true;
    }
    return false;
  }

  private static async waitForJobCompletion(
    conn: SfConnection,
    jobStartTime: string,
    runningUserId: unknown,
    poolTimeSec: number,
    startTime: Date,
    remoteapex: boolean | undefined,
    more: boolean | undefined,
    tableColumnData: string[]
  ): Promise<{ resultData: Array<Record<string, unknown>>; jobFail: boolean; jobsFound: boolean }> {
    let isDone = false;
    let jobsFound = true;
    let jobFail = false;
    AppUtils.startSpinner('Checking Status every ' + String(poolTimeSec) + ' seconds');
    let resultData: Array<Record<string, unknown>> = [];

    while (!isDone) {
      const endTime = new Date();
      const timeDiff = (endTime.getTime() - startTime.getTime()) / 1000;
      const tsecondsp = Math.round(timeDiff);
      const timeMsg =
        tsecondsp > 60 ? (tsecondsp / 60).toFixed(2) + ' Minutes' : tsecondsp.toFixed(0) + ' Seconds';
      AppUtils.updateSpinnerMessage('Time Elapsed: ' + timeMsg);
      // Sequential polling required: each poll must complete before the next
      // eslint-disable-next-line no-await-in-loop
      await AppUtils.sleep(poolTimeSec);
      const resultJobs = remoteapex
        // eslint-disable-next-line no-await-in-loop
        ? await ExecuteJobs.checkStatus(conn, jobStartTime)
        // eslint-disable-next-line no-await-in-loop
        : await ExecuteJobs.checkStatusLocal(conn, jobStartTime, String(runningUserId));
      resultData = [];
      if (resultJobs.length > 0) {
        isDone = true;
        for (const jobObject of resultJobs) {
          const status = jobObject.Status;
          const numberOfErrors = jobObject.NumberOfErrors;
          if (numberOfErrors > 0 || status === 'Failed' || status === 'Aborted') jobFail = true;
          if (status !== 'Completed' && status !== 'Failed' && status !== 'Aborted') isDone = false;
          resultData.push({
            Id: jobObject.Id,
            Status: status,
            TotalJobItems: jobObject.TotalJobItems,
            JobItemsProcessed: jobObject.JobItemsProcessed,
            NumberOfErrors: numberOfErrors,
            ExtendedStatus: jobObject.ExtendedStatus,
            ApexClass: jobObject.ApexClass.Name,
          });
        }
        if (more) {
          AppUtils.log1('Partial Apex Jobs Results:');
          AppUtils.table(resultData, tableColumnData);
          AppUtils.log2('');
        }
      } else {
        AppUtils.stopSpinnerMessage('No Jobs where triggered');
        isDone = true;
        jobsFound = false;
        break;
      }
    }
    AppUtils.stopSpinnerMessage('Job Done');
    return { resultData, jobFail, jobsFound };
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(ExecuteJobs);
    AppUtils.setCommand(this);

    const conn = flags['target-org'].getConnection(undefined);
    const jobs = flags.jobs;
    const pooltime = flags.pooltime;
    const stopOnError = flags.stoponerror;
    const more = flags.more;
    const remoteapex = flags.remoteapex;
    const poolTimeSec = pooltime ?? 10;
    const packageType = flags.package;

    const nameSpaceSet = await AppUtils.setNameSpace(conn, packageType);
    if (!nameSpaceSet) throw new Error('Error: Package was not set or incorrect was provided.');

    AppUtils.logInitial('executejobs');
    AppUtils.logInitialExtra(conn);

    if (!fsExtra.existsSync(jobs)) throw new Error('Error: File: ' + jobs + ' does not exist');

    const apexBodyTest =
      "Id UserId = UserInfo.getUserId(); vlocity_cmt__GeneralSettings__c setting = New vlocity_cmt__GeneralSettings__c( Name = 'UserId' , vlocity_cmt__Value__c = UserId); upsert setting Name;";
    await AppUtils.runApex(conn, apexBodyTest);

    const userIdQuery = "SELECT vlocity_cmt__Value__c FROM vlocity_cmt__GeneralSettings__c WHERE Name = 'UserId'";
    const resultId = await conn.query<Record<string, unknown>>(userIdQuery);
    if (more) {
      AppUtils.log2('resultId:' + userIdQuery);
    }
    const runningUserId = resultId.records[0]['vlocity_cmt__Value__c'];

    const totalStartTime = new Date();
    const doc = yaml.load(fsExtra.readFileSync(jobs, 'utf8')) as YamlJobs;
    const jobsList = doc.jobs;
    const resultDataJobsTime: Array<Record<string, unknown>> = [];
    const tableColumnDataJobsTime = ['Job', 'Time', 'Success'];
    let jobFail = false;

    const tableColumnData = [
      'Id',
      'Status',
      'TotalJobItems',
      'JobItemsProcessed',
      'NumberOfErrors',
      'ExtendedStatus',
      'ApexClass',
    ];

    for (const jobName of jobsList) {
      jobFail = false;
      const startTime = new Date();
      AppUtils.log4('Running Job: ' + jobName);

      // eslint-disable-next-line no-await-in-loop
      const wasSpecial = await ExecuteJobs.handleSpecialJob(conn, jobName);

      if (!wasSpecial) {
        const body = { job: jobName };
        // eslint-disable-next-line no-await-in-loop
        await AppUtils.sleep(2);
        const jobStartTime = new Date().toISOString();

        if (!remoteapex) {
          // eslint-disable-next-line no-await-in-loop
          await ExecuteJobs.callJobLocal(conn, body.job);
        } else {
          // eslint-disable-next-line no-await-in-loop
          await ExecuteJobs.callJob(conn, body);
        }

        // eslint-disable-next-line no-await-in-loop
        const { resultData, jobFail: jf, jobsFound } = await ExecuteJobs.waitForJobCompletion(
          conn,
          jobStartTime,
          runningUserId,
          poolTimeSec,
          startTime,
          remoteapex,
          more,
          tableColumnData
        );
        jobFail = jf;

        if (jobsFound) {
          this.log('Apex Jobs Results:');
          AppUtils.table(resultData, tableColumnData);
          AppUtils.log2('');
        }
      }

      const endTime = new Date();
      const timeDiff = (endTime.getTime() - startTime.getTime()) / 1000;
      const tsecondsp = Math.round(timeDiff);
      const timeMessage =
        tsecondsp > 60 ? (tsecondsp / 60).toFixed(2) + ' Minutes' : tsecondsp.toFixed(0) + ' Seconds';
      resultDataJobsTime.push({ Job: jobName, Time: timeMessage, Success: !jobFail });
      AppUtils.log3('Job Done: ' + jobName);
      AppUtils.log3('Done in ' + timeMessage);
      AppUtils.log2('');
      if (jobFail && stopOnError) break;
    }

    const totalEndTime = new Date();
    const ttimeDiff = (totalEndTime.getTime() - totalStartTime.getTime()) / 1000;
    const tminutes = Math.round(ttimeDiff) / 60;
    AppUtils.log4('Done Running Jobs in ' + tminutes.toFixed(2) + ' Minutes');
    AppUtils.log3('Summary: ');
    AppUtils.table(resultDataJobsTime, tableColumnDataJobsTime);
    AppUtils.log2('');

    if (jobFail && stopOnError) throw new Error('Execution was ended because of last job failure');
  }
}
