import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { AppUtils } from '../../../utils/AppUtils.js';
import type { SfConnection } from '../../../utils/AppUtils.js';
import { DBUtils } from '../../../utils/DBUtils.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('omnistudiotools', 'omnistudiotools.clean.calcmatrix');

export default class CleanCalcMatrix extends SfCommand<void> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    'target-org': Flags.requiredOrg(),
    matrixid: Flags.string({ char: 'i', summary: messages.getMessage('flags.matrixid.summary'), required: true }),
    package: Flags.string({ char: 'p', summary: messages.getMessage('flags.package.summary') }),
    hard: Flags.boolean({ char: 'x', summary: messages.getMessage('flags.hard.summary') }),
  };

  private static async updateOldCalMatrixVersion(matrixid: string, conn: SfConnection): Promise<void> {
    AppUtils.log3('Updating Matrix Version with Dummy Data to be deleted later');
    const initialQuery =
      "SELECT Id, Name, %name-space%CalculationMatrixId__c FROM %name-space%CalculationMatrixVersion__c WHERE ID = '" +
      matrixid +
      "' LIMIT 1";
    const query = AppUtils.replaceaNameSpace(initialQuery);
    const result = await conn.query<Record<string, unknown>>(query);
    const mainMatrixID =
      result.records[0][AppUtils.replaceaNameSpace('%name-space%CalculationMatrixId__c')];

    const initialQueryForAllVersions =
      "SELECT Id, Name FROM %name-space%CalculationMatrixVersion__c WHERE %name-space%CalculationMatrixId__c = '" +
      String(mainMatrixID) +
      "'";
    const queryForAllVersions = AppUtils.replaceaNameSpace(initialQueryForAllVersions);
    const result2 = await conn.query<Record<string, unknown>>(queryForAllVersions);
    const numOfToDelete = result2.records.length;

    await conn
      .sobject(AppUtils.replaceaNameSpace('%name-space%CalculationMatrixVersion__c'))
      .update({
        Id: matrixid,
        Name: 'TO_DELETE_' + String(result.records[0]['Name']),
        [AppUtils.replaceaNameSpace('%name-space%EndDateTime__c')]: '2200-12-30T13:39:00.000+0000',
        [AppUtils.replaceaNameSpace('%name-space%StartDateTime__c')]: '2200-01-30T13:39:00.000+0000',
        [AppUtils.replaceaNameSpace('%name-space%Priority__c')]: 1000 + numOfToDelete + '',
        [AppUtils.replaceaNameSpace('%name-space%VersionNumber__c')]: 1000 + numOfToDelete + '',
      });
    AppUtils.log3('Matrix Version Updated Successfully');
    AppUtils.log3("Please wait 24 Hours to delete Matrix versions with the tag 'TO_DELETE_'");
  }

  private static async deleteMatrixAndRows(
    initialQuery: string,
    conn: SfConnection,
    matrixid: string,
    hard: boolean | undefined
  ): Promise<void> {
    AppUtils.log3('Fetching All Row records...');
    const records = await DBUtils.bulkAPIquery(conn, initialQuery);
    if (records.length > 0) {
      AppUtils.log3('Succesfully Fetched All Row records... Number of records: ' + records.length);
      await DBUtils.bulkAPIdelete(
        records,
        conn,
        AppUtils.replaceaNameSpace('%name-space%CalculationMatrixRow__c'),
        false,
        hard ?? false,
        null,
        null
      );
      await CleanCalcMatrix.updateOldCalMatrixVersion(matrixid, conn);
    } else {
      AppUtils.log3('No Rows where found for Matrix version with ID: ' + matrixid);
      await CleanCalcMatrix.updateOldCalMatrixVersion(matrixid, conn);
    }
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(CleanCalcMatrix);
    AppUtils.setCommand(this);

    const matrixid = flags.matrixid;
    const packageType = flags.package;
    const hard = flags.hard;
    const conn = flags['target-org'].getConnection(undefined);

    const nameSpaceSet = await AppUtils.setNameSpace(conn, packageType);
    if (!nameSpaceSet) {
      throw new Error('Error: Package was not set or incorrect was provided.');
    }

    AppUtils.logInitial('calcmatrix');

    const initialQuery =
      "SELECT Id FROM %name-space%CalculationMatrixRow__c WHERE %name-space%CalculationMatrixVersionId__c = '" +
      matrixid +
      "'";
    const query = AppUtils.replaceaNameSpace(initialQuery);
    AppUtils.log3(query);
    await CleanCalcMatrix.deleteMatrixAndRows(query, conn, matrixid, hard);
  }
}
