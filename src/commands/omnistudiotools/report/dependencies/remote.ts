import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { AppUtils } from '../../../../utils/AppUtils.js';
import fs from 'node:fs';

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
    const oSValuesResults = await conn.query(oSValuesQueryFinal);

    const oSValuesMap = new Map<string, any>();
    for (const element of oSValuesResults.records) {
      oSValuesMap.set(element['Id'] as string, element);
    }

    AppUtils.log3('OmniScripts and IntegrationProcedures Found: ' + oSValuesResults.records.length);
    numberofOSandVIP = oSValuesResults.records.length;

    AppUtils.log3('Looking for Dependencies in Main DataPack');
    Remote.omniScriptPropertySet(oSValuesResults, createFilesStream);

    AppUtils.log3('Looking for Dependencies in All Elements');
    conn.bulk.pollInterval = 5000;
    conn.bulk.pollTimeout = 60000;
    Remote.queryElements(conn, oSValuesMap, createFilesStream);
  }

  static report(): void {
    console.log('');
    AppUtils.log3('Done Finding Dependencies');
    AppUtils.log3('Number of OmniScripts and IntegrationProcedures Scanned: ' + numberofOSandVIP);
    AppUtils.log3('Number of Total Dependencies Found: ' + totalDependenciesFound);
    AppUtils.log3('CSV File Generated: ' + resultsFile);
    console.log('');
  }

  static omniScriptPropertySet(omniScripRecords: any, createFilesStream: fs.WriteStream): void {
    let totalDep = 0;
    for (const element of omniScripRecords.records) {
      const propertySet = element[propertySetOSField];
      const omniScriptType = element[typeField];
      const omniScriptSubType = element[subTypeField];
      const omniScriptLanguage = element[languageField];
      const dataPack = omniScriptType + '_' + omniScriptSubType + '_' + omniScriptLanguage;
      const isReusableValue = element[isResusableField];
      let dataPackType = 'OmniScript';
      if (element[isProcedureField] === true) dataPackType = 'IntegrationProcedure';
      if (propertySet) {
        const resultDep = Remote.getPropertySetValues(
          createFilesStream,
          propertySet,
          dataPackType,
          dataPack,
          isReusableValue
        );
        totalDep += resultDep;
      }
    }
    totalDependenciesFound += totalDep;
  }

  static queryElements(conn: any, omniScripRecords: Map<string, any>, createFilesStream: fs.WriteStream): void {
    const elementsQuery =
      'SELECT Id, Name, %name-space%OmniScriptId__c, %name-space%PropertySet__c FROM %name-space%Element__c';
    const queryString2 = AppUtils.replaceaNameSpace(elementsQuery);

    conn.bulk
      .query(queryString2)
      .on('record', (result: any) => {
        const elementPropertySet = result[propertySetOSField];
        const omniScripId = result[elementOSIDField];
        const omniScripRecord = omniScripRecords.get(omniScripId);
        if (omniScripRecord) {
          let dataPackType = 'OmniScript';
          if (omniScripRecord[isProcedureField] === true) dataPackType = 'IntegrationProcedure';
          const omniScriptType = omniScripRecord[typeField];
          const omniScriptSubType = omniScripRecord[subTypeField];
          const omniScriptLanguage = omniScripRecord[languageField];
          const dataPack = omniScriptType + '_' + omniScriptSubType + '_' + omniScriptLanguage;
          const isReusableValue = omniScripRecord[isResusableField];
          AppUtils.log2('Looking for Dependencies in ' + dataPackType + ': ' + dataPack);
          const resultDep = Remote.getPropertySetValues(
            createFilesStream,
            elementPropertySet,
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
      .on('error', (err: any) => {
        console.error(err);
      });
  }

  static getPropertySetValues(
    createFilesStream: fs.WriteStream,
    propertySetObject: string,
    dataPackType: string,
    dataPack: string,
    isReusable: any
  ): number {
    let found = 0;
    const jsonStringObjects = JSON.parse(propertySetObject);

    const bundle = jsonStringObjects['bundle'];
    if (bundle) {
      createFilesStream.write(
        dataPackType + '/' + dataPack + ',' + isReusable + ',DataRaptor/' + bundle + ',DataRaptor,None,None\r\n'
      );
      found++;
    }

    const type = jsonStringObjects['Type'];
    const subType = jsonStringObjects['Sub Type'];
    const language = jsonStringObjects['Language'];
    if (type) {
      const completeName = type + '_' + subType + '_' + language;
      createFilesStream.write(
        dataPackType +
          '/' +
          dataPack +
          ',' +
          isReusable +
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
          isReusable +
          ',IntegrationProcedure/' +
          vipKey +
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
          isReusable +
          ',' +
          remoteClass +
          '.' +
          remoteMethod +
          ',REMOTE CALL,' +
          remoteClass +
          ',' +
          remoteMethod +
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
          isReusable +
          ',VlocityUITemplate/' +
          templateID +
          ',VlocityUITemplate,None,None\r\n'
      );
      found++;
    }

    return found;
  }
}
