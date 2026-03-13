import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { AppUtils } from '../../../utils/AppUtils.js';
import { DBUtils } from '../../../utils/DBUtils.js';
import fsExtra from 'fs-extra';
import yaml from 'js-yaml';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('omnistudiotools', 'omnistudiotools.jobs.executejobs');

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
    const resultId = await conn.query(userIdQuery);
    if (more) {
      AppUtils.log2('resultId:' + userIdQuery);
      console.log(resultId);
    }
    const runningUserId = resultId.records[0]['vlocity_cmt__Value__c'];

    let totalStartTime: Date, totalEndTime: Date;
    totalStartTime = new Date();
    const doc = yaml.load(fsExtra.readFileSync(jobs, 'utf8')) as any;
    const jobsList = doc.jobs;
    const resultDataJobsTime: any[] = [];
    const tableColumnDataJobsTime = ['Job', 'Time', 'Success'];
    let jobFail = false;

    for (const job in jobsList) {
      jobFail = false;
      let startTime: Date, endTime: Date, timeDiff: number;
      startTime = new Date();
      AppUtils.log4('Running Job: ' + jobsList[job]);

      if (jobsList[job].includes('jobdeletequery:')) {
        const queryPart = jobsList[job].split(':')[1];
        const objectPart = jobsList[job].split(':')[2];
        AppUtils.log3('Delete Job - Query: ' + queryPart);
        await DBUtils.bulkAPIQueryAndDeleteWithQuery(conn, objectPart, queryPart, false, 4);
        AppUtils.log2('Job Done');
      } else if (jobsList[job].includes('jobdelete:')) {
        const objectName = jobsList[job].split(':')[1];
        AppUtils.log3('Delete Job - Object: ' + objectName);
        await DBUtils.bulkAPIQueryAndDelete(conn, objectName, false, 4);
        AppUtils.log2('Job Done');
      } else if (jobsList[job].includes('clearepcjson:')) {
        const Product2query = jobsList[job].split(':')[1];
        AppUtils.log3('Clear Product2 JSON - Query: ' + Product2query);
        AppUtils.log3('Getting Records...');
        const records = await DBUtils.bulkAPIquery(conn, Product2query);
        if (records.length > 0) {
          for (const element of records) {
            element[AppUtils.replaceaNameSpace('%name-space%AttributeDefaultValues__c')] = null;
            element[AppUtils.replaceaNameSpace('%name-space%JSONAttribute__c')] = null;
            element[AppUtils.replaceaNameSpace('%name-space%AttributeMetadata__c')] = null;
          }
          AppUtils.log3('Updating Records...');
          await DBUtils.bulkAPIUpdate(records, conn, 'Product2');
        } else {
          AppUtils.log2('No Records To Update');
        }
        AppUtils.log2('Job Done');
      } else {
        const body = { job: jobsList[job] };
        await AppUtils.sleep(2);
        const jobStartTime = new Date().toISOString();

        if (!remoteapex) {
          await ExecuteJobs.callJobLocal(conn, body.job);
        } else {
          await ExecuteJobs.callJob(conn, body);
        }

        let isDone = false;
        let jobsFound = true;
        AppUtils.startSpinner('Checking Status every ' + poolTimeSec + ' seconds');
        let resultData: any[] = [];
        const tableColumnData = [
          'Id',
          'Status',
          'TotalJobItems',
          'JobItemsProcessed',
          'NumberOfErrors',
          'ExtendedStatus',
          'ApexClass',
        ];

        while (!isDone) {
          endTime = new Date();
          timeDiff = (endTime.getTime() - startTime.getTime()) / 1000;
          const tsecondsp = Math.round(timeDiff);
          const timeMsg =
            tsecondsp > 60 ? (tsecondsp / 60).toFixed(2) + ' Minutes' : tsecondsp.toFixed(0) + ' Seconds';
          AppUtils.updateSpinnerMessage('Time Elapsed: ' + timeMsg);
          await AppUtils.sleep(poolTimeSec);
          const resultJobs = remoteapex
            ? await ExecuteJobs.checkStatus(conn, jobStartTime)
            : await ExecuteJobs.checkStatusLocal(conn, jobStartTime, runningUserId);
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
              this.log('Partial Apex Jobs Results:');
              AppUtils.table(resultData, tableColumnData);
              console.log('');
            }
          } else {
            AppUtils.stopSpinnerMessage('No Jobs where triggered');
            isDone = true;
            jobsFound = false;
            break;
          }
        }
        AppUtils.stopSpinnerMessage('Job Done');
        if (jobsFound) {
          this.log('Apex Jobs Results:');
          AppUtils.table(resultData, tableColumnData);
          console.log('');
        }
      }

      endTime = new Date();
      timeDiff = (endTime.getTime() - startTime.getTime()) / 1000;
      const tsecondsp = Math.round(timeDiff);
      const timeMessage =
        tsecondsp > 60 ? (tsecondsp / 60).toFixed(2) + ' Minutes' : tsecondsp.toFixed(0) + ' Seconds';
      resultDataJobsTime.push({ Job: jobsList[job], Time: timeMessage, Success: !jobFail });
      AppUtils.log3('Job Done: ' + jobsList[job]);
      AppUtils.log3('Done in ' + timeMessage);
      console.log('');
      if (jobFail && stopOnError) break;
    }

    totalEndTime = new Date();
    const ttimeDiff = (totalEndTime.getTime() - totalStartTime.getTime()) / 1000;
    const tminutes = Math.round(ttimeDiff) / 60;
    AppUtils.log4('Done Running Jobs in ' + tminutes.toFixed(2) + ' Minutes');
    AppUtils.log3('Summary: ');
    AppUtils.table(resultDataJobsTime, tableColumnDataJobsTime);
    console.log('');

    if (jobFail && stopOnError) throw new Error('Execution was ended because of last job failure');
  }

  static async callJobLocal(conn: any, job: string): Promise<void> {
    let apexBody = '';
    if (job === 'EPCFixCompiledAttributeOverrideBatchJob') {
      apexBody = 'Database.executeBatch(new vlocity_cmt.EPCFixCompiledAttributeOverrideBatchJob (), 1);';
    } else if (job === 'FixProductAttribJSONBatchJob') {
      apexBody = 'Database.executeBatch(new vlocity_cmt.FixProductAttribJSONBatchJob());';
    } else if (job === 'EPCProductAttribJSONBatchJob') {
      apexBody =
        "List<Id> productIds = new List<Id>();for (Product2 prod : [ Select Id from Product2 where vlocity_cmt__ObjectTypeId__c != null ]){productIds.add(prod.Id);}Database.executeBatch(new vlocity_cmt.EPCProductAttribJSONBatchJob(productIds), 1);";
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

  static async callJob(conn: any, body: any): Promise<void> {
    await conn.apex.post('/CMTJobsUtil/', body);
  }

  static async checkStatus(conn: any, jobStartTime: string): Promise<any[]> {
    return conn.apex.get('/CMTJobsUtil?jobStartTime=' + jobStartTime);
  }

  static async checkStatusLocal(conn: any, jobStartTime: string, runningUserId: string): Promise<any[]> {
    let query =
      'SELECT Status,CreatedDate,TotalJobItems,JobItemsProcessed,ApexClass.Name,NumberOfErrors,ExtendedStatus ';
    query += 'FROM AsyncApexJob ';
    query += "WHERE CreatedById='" + runningUserId + "' ";
    query += "AND JobType='BatchApex' ";
    query += 'AND CreatedDate>=' + jobStartTime;
    const result = await conn.query(query);
    return result.records;
  }
}
