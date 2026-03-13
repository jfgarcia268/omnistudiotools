import fs from 'node:fs';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { AppUtils } from '../../../../utils/AppUtils.js';
import type { SfConnection } from '../../../../utils/AppUtils.js';
import { getBulk } from '../../../../utils/BulkTypes.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('omnistudiotools', 'omnistudiotools.report.dependencies.remote');

let languageField: string;
let typeField: string;
let subTypeField: string;
let isActiveField: string;
let isProcedureField: string;
let isResusableField: string;
let propertySetOSField: string;
let elementOSIDField: string;
let totalDependenciesFound: number;
let numberofOSandVIP: number;
const resultsFile = './Dependencies_Report_Remote.csv';

export default class Remote extends SfCommand<void> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    'target-org': Flags.requiredOrg(),
    package: Flags.string({ char: 'p', summary: messages.getMessage('flags.package.summary') }),
  };

  public static report(): void {
    AppUtils.log2('');
    AppUtils.log3('Done Finding Dependencies');
    AppUtils.log3('Number of OmniScripts and IntegrationProcedures Scanned: ' + String(numberofOSandVIP));
    AppUtils.log3('Number of Total Dependencies Found: ' + String(totalDependenciesFound));
    AppUtils.log3('CSV File Generated: ' + resultsFile);
    AppUtils.log2('');
  }

  public static omniScriptPropertySet(omniScripRecords: { records: Array<Record<string, unknown>> }, createFilesStream: fs.WriteStream): void {
    let totalDep = 0;
    for (const element of omniScripRecords.records) {
      const propertySet = element[propertySetOSField];
      const omniScriptType = element[typeField];
      const omniScriptSubType = element[subTypeField];
      const omniScriptLanguage = element[languageField];
      const dataPack = String(omniScriptType) + '_' + String(omniScriptSubType) + '_' + String(omniScriptLanguage);
      const isReusableValue = element[isResusableField];
      let dataPackType = 'OmniScript';
      if (element[isProcedureField] === true) dataPackType = 'IntegrationProcedure';
      if (propertySet) {
        const resultDep = Remote.getPropertySetValues(
          createFilesStream,
          String(propertySet),
          dataPackType,
          dataPack,
          isReusableValue
        );
        totalDep += resultDep;
      }
    }
    totalDependenciesFound += totalDep;
  }

  public static queryElements(conn: SfConnection, omniScripRecords: Map<string, Record<string, unknown>>, createFilesStream: fs.WriteStream): void {
    const elementsQuery =
      'SELECT Id, Name, %name-space%OmniScriptId__c, %name-space%PropertySet__c FROM %name-space%Element__c';
    const queryString2 = AppUtils.replaceaNameSpace(elementsQuery);

    const bulk = getBulk(conn);
    bulk
      .query(queryString2)
      .on('data', (result: Record<string, unknown>) => {
        const elementPropertySet = result[propertySetOSField];
        const omniScripId = result[elementOSIDField];
        const omniScripRecord = omniScripRecords.get(String(omniScripId));
        if (omniScripRecord) {
          let dataPackType = 'OmniScript';
          if (omniScripRecord[isProcedureField] === true) dataPackType = 'IntegrationProcedure';
          const omniScriptType = omniScripRecord[typeField];
          const omniScriptSubType = omniScripRecord[subTypeField];
          const omniScriptLanguage = omniScripRecord[languageField];
          const dataPack = String(omniScriptType) + '_' + String(omniScriptSubType) + '_' + String(omniScriptLanguage);
          const isReusableValue = omniScripRecord[isResusableField];
          AppUtils.log2('Looking for Dependencies in ' + dataPackType + ': ' + dataPack);
          const resultDep = Remote.getPropertySetValues(
            createFilesStream,
            String(elementPropertySet),
            dataPackType,
            dataPack,
            isReusableValue
          );
          totalDependenciesFound += resultDep;
        }
      })
      .on('queue', () => {
        AppUtils.log3('Done looking for Dependencies in Elements');
      })
      .on('end', () => {
        Remote.report();
      })
      .on('error', (err: Error) => {
        AppUtils.log2('Error in bulk query: ' + String(err));
      });
  }

  public static getPropertySetValues(
    createFilesStream: fs.WriteStream,
    propertySetObject: string,
    dataPackType: string,
    dataPack: string,
    isReusable: unknown
  ): number {
    let found = 0;
    const jsonStringObjects = JSON.parse(propertySetObject) as Record<string, unknown>;

    const bundle = jsonStringObjects['bundle'];
    if (bundle) {
      createFilesStream.write(
        dataPackType + '/' + dataPack + ',' + String(isReusable) + ',DataRaptor/' + String(bundle) + ',DataRaptor,None,None\r\n'
      );
      found++;
    }

    const type = jsonStringObjects['Type'];
    const subType = jsonStringObjects['Sub Type'];
    const language = jsonStringObjects['Language'];
    if (type) {
      const completeName = String(type) + '_' + String(subType) + '_' + String(language);
      createFilesStream.write(
        dataPackType +
          '/' +
          dataPack +
          ',' +
          String(isReusable) +
          ',OmniScript/' +
          completeName +
          ',OmniScript,None,None\r\n'
      );
      found++;
    }

    const vipKey = jsonStringObjects['integrationProcedureKey'];
    if (vipKey) {
      createFilesStream.write(
        dataPackType +
          '/' +
          dataPack +
          ',' +
          String(isReusable) +
          ',IntegrationProcedure/' +
          String(vipKey) +
          ',IntegrationProcedure,None,None\r\n'
      );
      found++;
    }

    const remoteClass = jsonStringObjects['remoteClass'];
    const remoteMethod = jsonStringObjects['remoteMethod'];
    if (remoteClass) {
      createFilesStream.write(
        dataPackType +
          '/' +
          dataPack +
          ',' +
          String(isReusable) +
          ',' +
          String(remoteClass) +
          '.' +
          String(remoteMethod) +
          ',REMOTE CALL,' +
          String(remoteClass) +
          ',' +
          String(remoteMethod) +
          '\r\n'
      );
      found++;
    }

    const templateID = jsonStringObjects['HTMLTemplateId'];
    if (templateID) {
      createFilesStream.write(
        dataPackType +
          '/' +
          dataPack +
          ',' +
          String(isReusable) +
          ',VlocityUITemplate/' +
          String(templateID) +
          ',VlocityUITemplate,None,None\r\n'
      );
      found++;
    }

    return found;
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(Remote);
    AppUtils.setCommand(this);
    totalDependenciesFound = 0;

    AppUtils.log2('Results File: ' + resultsFile);
    if (fs.existsSync(resultsFile)) fs.unlinkSync(resultsFile);
    const createFilesStream = fs.createWriteStream(resultsFile, { flags: 'a' });
    createFilesStream.write('DataPack Name,Is Reusable,Dependency,Dependency Type,Remote Class,Remote Method\r\n');

    const packageType = flags.package;
    if (packageType === 'cmt') {
      AppUtils.namespace = 'vlocity_cmt__';
    } else if (packageType === 'ins') {
      AppUtils.namespace = 'vlocity_ins__';
    } else {
      throw new Error('Error: -p, --package has to be either cmt or ins');
    }

    AppUtils.logInitial('remote');
    const conn = flags['target-org'].getConnection(undefined);

    languageField = AppUtils.replaceaNameSpace('%name-space%Language__c');
    typeField = AppUtils.replaceaNameSpace('%name-space%Type__c');
    subTypeField = AppUtils.replaceaNameSpace('%name-space%SubType__c');
    isActiveField = AppUtils.replaceaNameSpace('%name-space%IsActive__c');
    isProcedureField = AppUtils.replaceaNameSpace('%name-space%IsProcedure__c');
    isResusableField = AppUtils.replaceaNameSpace('%name-space%IsReusable__c');
    propertySetOSField = AppUtils.replaceaNameSpace('%name-space%PropertySet__c');
    elementOSIDField = AppUtils.replaceaNameSpace('%name-space%OmniScriptId__c');

    let oSValuesQuery = 'SELECT ID, Name';
    oSValuesQuery += ', ' + languageField + ', ' + typeField + ', ' + subTypeField;
    oSValuesQuery += ', ' + isActiveField + ', ' + isProcedureField + ', ' + isResusableField + ', ' + propertySetOSField;
    oSValuesQuery += ' FROM %name-space%OmniScript__c WHERE ' + isActiveField + ' = true';
    const oSValuesQueryFinal = AppUtils.replaceaNameSpace(oSValuesQuery);

    AppUtils.log3('Looking for OmniScripts and IntegrationProcedures in the environment');
    const oSValuesResults = await conn.query<Record<string, unknown>>(oSValuesQueryFinal);

    const oSValuesMap = new Map<string, Record<string, unknown>>();
    for (const element of oSValuesResults.records) {
      oSValuesMap.set(String(element['Id']), element);
    }

    AppUtils.log3('OmniScripts and IntegrationProcedures Found: ' + String(oSValuesResults.records.length));
    numberofOSandVIP = oSValuesResults.records.length;

    AppUtils.log3('Looking for Dependencies in Main DataPack');
    Remote.omniScriptPropertySet(oSValuesResults, createFilesStream);

    AppUtils.log3('Looking for Dependencies in All Elements');
    Remote.queryElements(conn, oSValuesMap, createFilesStream);
  }
}
