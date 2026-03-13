import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { AppUtils } from '../../../../utils/AppUtils.js';
import fsExtra from 'fs-extra';
import yaml from 'js-yaml';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('omnistudiotools', 'omnistudiotools.report.epc.epcjsonreport');

let splitCharacter = ',';
const stringQuote = '';

let keyNames: string[] = [];
let currentJsonField = '';
let numberOfLevels = 0;
let cont = 0;
let cont2 = 0;

export default class EpcJsonReport extends SfCommand<void> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    'target-org': Flags.requiredOrg(),
    package: Flags.string({ char: 'p', summary: messages.getMessage('flags.package.summary') }),
    datafile: Flags.string({ char: 'd', summary: messages.getMessage('flags.datafile.summary') }),
    separator: Flags.string({ char: 's', summary: messages.getMessage('flags.separator.summary') }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(EpcJsonReport);
    AppUtils.setCommand(this);

    currentJsonField = '';

    const packageType = flags.package;
    const dataFile = flags.datafile;
    const separator = flags.separator;

    if (separator) {
      splitCharacter = separator;
    }

    if (dataFile == null) {
      throw new Error('Error: -d, --datafile has to be passed');
    }

    if (!fsExtra.existsSync(dataFile)) {
      throw new Error('Error: File: ' + dataFile + ' does not exist');
    }

    AppUtils.logInitial('epcjsonreport');
    AppUtils.log3('EPC Json Report: Starting Report');
    this.log(' ');

    const conn = flags['target-org'].getConnection(undefined);
    const nameSpaceSet = await AppUtils.setNameSpace(conn, packageType);
    if (!nameSpaceSet) {
      throw new Error('Error: Package was not set or incorrect was provided.');
    }

    try {
      const doc = yaml.load(fsExtra.readFileSync(dataFile, 'utf8')) as any;

      const resultData: any[] = [];

      for (let index = 0; index < Object.keys(doc.Objects).length; index++) {
        const element = Object.keys(doc.Objects)[index];
        const ObjectNameYaml = AppUtils.replaceaNameSpaceFromFile(element);
        const ObjectName = ObjectNameYaml.split('-')[0];
        let numberFile = '';
        if (ObjectNameYaml.split('-')[1]) {
          numberFile = ObjectNameYaml.split('-')[1] + '_';
        }
        const all = doc.Objects[element]['All'];
        const fields = doc.Objects[element]['Fields'];
        const jsonFields = doc.Objects[element]['JsonFields'];
        const onlyJson = doc.Objects[element]['OnlyJsonFields'];
        const numOfKeys = doc.Objects[element]['numOfKeys'];
        const simpleJsonArray = doc.Objects[element]['simpleJsonArray'];
        const JsonPath = doc.Objects[element]['JsonPath'];
        let fieldsString = '';

        if (numOfKeys && numOfKeys > 0) {
          numberOfLevels = numOfKeys;
          for (let i = 1; i <= numberOfLevels; i++) {
            const key = doc.Objects[element]['key' + i];
            keyNames.push(key);
          }
        }

        if (all) {
          const meta = await conn.sobject(ObjectName).describe();
          for (let i = 0; i < meta.fields.length; i++) {
            const objectField = meta.fields[i].name;
            if (objectField !== 'Id') {
              fieldsString += objectField + splitCharacter;
            }
          }
          fieldsString = fieldsString.substring(0, fieldsString.length - 1);
        } else {
          fieldsString =
            AppUtils.replaceaNameSpaceFromFile(JSON.stringify(fields))
              .replace('[', '')
              .replace(']', '')
              .replace(/"/g, '') + '';
        }

        if (JsonPath) {
          for (let j = 0; j < Object.keys(jsonFields).length; j++) {
            currentJsonField = Object.keys(jsonFields)[j];
            const jsonField = AppUtils.replaceaNameSpaceFromFile(Object.keys(jsonFields)[j]);
            const resultFile = ObjectName + '_' + jsonField + '_' + numberFile + 'Result.csv';
            if (fsExtra.existsSync(resultFile)) {
              fsExtra.unlinkSync(resultFile);
            }
            const jsonFieldsKeys = jsonFields[Object.keys(jsonFields)[j]];
            const result = await EpcJsonReport.exportObject(
              conn,
              resultFile,
              ObjectName,
              fieldsString,
              EpcJsonReport.formatWithJsonPath,
              fieldsString,
              jsonField,
              jsonFieldsKeys,
              all,
              onlyJson
            );
            resultData.push({
              ObjectName: ObjectName + ' - ' + jsonField,
              RecordsExported: result['exported'],
              RecordsCreated: result['created'],
              ReportFile: resultFile,
            });
            console.log(' ');
          }
        } else if (simpleJsonArray) {
          for (let j = 0; j < Object.keys(jsonFields).length; j++) {
            currentJsonField = Object.keys(jsonFields)[j];
            const jsonField = AppUtils.replaceaNameSpaceFromFile(Object.keys(jsonFields)[j]);
            const resultFile = ObjectName + '_' + jsonField + '_' + numberFile + 'Result.csv';
            if (fsExtra.existsSync(resultFile)) {
              fsExtra.unlinkSync(resultFile);
            }
            const jsonFieldsKeys = jsonFields[Object.keys(jsonFields)[j]];
            const result = await EpcJsonReport.exportObject(
              conn,
              resultFile,
              ObjectName,
              fieldsString,
              EpcJsonReport.formatWithSimpleJsonArray,
              fieldsString,
              jsonField,
              jsonFieldsKeys,
              all,
              onlyJson
            );
            resultData.push({
              ObjectName: ObjectName + ' - ' + jsonField,
              RecordsExported: result['exported'],
              RecordsCreated: result['created'],
              ReportFile: resultFile,
            });
            console.log(' ');
          }
        } else if (jsonFields == null) {
          const resultFile = ObjectName + '_' + numberFile + 'Result.csv';
          if (fsExtra.existsSync(resultFile)) {
            fsExtra.unlinkSync(resultFile);
          }
          const result = await EpcJsonReport.exportObject(
            conn,
            resultFile,
            ObjectName,
            fieldsString,
            EpcJsonReport.formatGeneric,
            fieldsString,
            null,
            null,
            all,
            onlyJson
          );
          resultData.push({
            ObjectName: ObjectName,
            RecordsExported: result['exported'],
            RecordsCreated: result['created'],
            ReportFile: resultFile,
          });
          console.log(' ');
        } else {
          for (let j = 0; j < Object.keys(jsonFields).length; j++) {
            currentJsonField = Object.keys(jsonFields)[j];
            const jsonField = AppUtils.replaceaNameSpaceFromFile(Object.keys(jsonFields)[j]);
            const resultFile = ObjectName + '_' + jsonField + '_' + numberFile + 'Result.csv';
            if (fsExtra.existsSync(resultFile)) {
              fsExtra.unlinkSync(resultFile);
            }
            const jsonFieldsKeys = jsonFields[Object.keys(jsonFields)[j]];
            const result = await EpcJsonReport.exportObject(
              conn,
              resultFile,
              ObjectName,
              fieldsString,
              EpcJsonReport.formatWithJson,
              fieldsString,
              jsonField,
              jsonFieldsKeys,
              all,
              onlyJson
            );
            resultData.push({
              ObjectName: ObjectName + ' - ' + jsonField,
              RecordsExported: result['exported'],
              RecordsCreated: result['created'],
              ReportFile: resultFile,
            });
            console.log(' ');
          }
        }
        keyNames = [];
        currentJsonField = '';
      }

      const tableColumnData = ['ObjectName', 'RecordsExported', 'RecordsCreated', 'ReportFile'];
      this.log('RESULTS:');
      AppUtils.table(resultData, tableColumnData);
      this.log(' ');
    } catch (e) {
      console.log(e);
    }
  }

  static formatGeneric(
    result: any,
    createFiles: fsExtra.WriteStream,
    fieldsArray: string[],
    jsonField: string | null,
    jsonValues: any
  ): void {
    const baseline = EpcJsonReport.formatNormallFields(result, fieldsArray);
    createFiles.write(baseline + '\r\n');
    cont++;
  }

  static formatAttributeRules(
    jsonData: any,
    jsonValues: any,
    baseline: string,
    createFiles: fsExtra.WriteStream,
    keyValues: string[]
  ): void {
    const keys = Object.keys(jsonData);
    for (const key of keys) {
      const term = jsonData[key];
      for (let index = 0; index < term.length; index++) {
        const term2 = term[index];
        let newLine = baseline + EpcJsonReport.getKeysNameforLine(keyValues);
        const secondLevelArray = EpcJsonReport.getSecondLevelArray(jsonValues, jsonData);
        if (secondLevelArray && secondLevelArray.length > 0) {
          newLine += EpcJsonReport.formatLine(jsonValues, term2, true);
          EpcJsonReport.formatSecondLevelArray(secondLevelArray, jsonValues, createFiles, newLine);
        } else {
          newLine += EpcJsonReport.formatLine(jsonValues, term2, false);
          createFiles.write(newLine + '\r\n');
          cont++;
        }
      }
    }
  }

  static getKeysNameforLine(keyNamesParam: string[]): string {
    let newLine = '';
    for (const element of keyNamesParam) {
      newLine += element + splitCharacter;
    }
    return newLine;
  }

  static getSecondLevelArray(jsonValues: any, jsonData: any): any {
    if (jsonValues[jsonValues.length - 1] && typeof jsonValues[jsonValues.length - 1] === 'object') {
      return AppUtils.getDataByPath(jsonData, Object.keys(jsonValues[jsonValues.length - 1])[0]);
    }
  }

  static formatRecordFinal(
    jsonData: any,
    keyNamesParam: string[],
    createFiles: fsExtra.WriteStream,
    jsonValues: any,
    baseline: string
  ): void {
    if (Array.isArray(jsonData)) {
      for (let i = 0; i < jsonData.length; i++) {
        const term = jsonData[i];
        let newLine = baseline + EpcJsonReport.getKeysNameforLine(keyNamesParam);
        const secondLevelArray = EpcJsonReport.getSecondLevelArray(jsonValues, term);
        if (secondLevelArray && secondLevelArray.length > 0) {
          newLine += EpcJsonReport.formatLine(jsonValues, term, true);
          EpcJsonReport.formatSecondLevelArray(secondLevelArray, jsonValues, createFiles, newLine);
        } else {
          newLine += EpcJsonReport.formatLine(jsonValues, term, false);
          createFiles.write(newLine + '\r\n');
          cont++;
        }
      }
    } else {
      if (currentJsonField === 'namespace__AttributeRules__c') {
        EpcJsonReport.formatAttributeRules(jsonData, jsonValues, baseline, createFiles, keyNamesParam);
      } else {
        let newLine = baseline + EpcJsonReport.getKeysNameforLine(keyNamesParam);
        newLine += EpcJsonReport.formatLine(jsonValues, jsonData, false);
        createFiles.write(newLine + '\r\n');
        cont++;
      }
    }
  }

  static formatSecondLevelArray(
    secondLevelArray: any[],
    jsonValues: any,
    createFiles: fsExtra.WriteStream,
    newLine: string
  ): void {
    for (const secondLevelObjectIndex in secondLevelArray) {
      const secondLevelObject = secondLevelArray[secondLevelObjectIndex];
      let secondLevelLine = '';
      const secodLevelKeys = jsonValues[jsonValues.length - 1][Object.keys(jsonValues[jsonValues.length - 1])[0]];
      for (let index = 0; index < secodLevelKeys.length; index++) {
        const key = secodLevelKeys[index];
        const value = secondLevelObject[key];
        const valueResult = value ? value : '';
        secondLevelLine += stringQuote + valueResult + stringQuote + splitCharacter;
      }
      createFiles.write(newLine + secondLevelLine + '\r\n');
      cont++;
    }
  }

  static recursiveFormat(
    jsonData: any,
    missingTimes: number,
    keyNamesParam: string[],
    createFiles: fsExtra.WriteStream,
    jsonValues: any,
    baseline: string
  ): void {
    if (missingTimes === 0) {
      EpcJsonReport.formatRecordFinal(jsonData, keyNamesParam, createFiles, jsonValues, baseline);
    } else {
      const keys = Object.keys(jsonData);
      for (const key of keys) {
        const attribute = jsonData[key];
        const newKeyNames = Object.assign([], keyNamesParam);
        newKeyNames.push(key);
        EpcJsonReport.recursiveFormat(attribute, missingTimes - 1, newKeyNames, createFiles, jsonValues, baseline);
      }
    }
  }

  static formatWithSimpleJsonArray(
    result: any,
    createFiles: fsExtra.WriteStream,
    fieldsArray: string[],
    JsonField: string | null,
    jsonValues: any
  ): void {
    const baseline = EpcJsonReport.formatNormallFields(result, fieldsArray);
    const jsonData = result[AppUtils.replaceaNameSpace(JsonField!)];
    if (jsonData != null && jsonData !== '[]' && jsonData !== '{}') {
      const jsonDataResult = JSON.parse(jsonData);
      EpcJsonReport.parseSimpleArray(jsonDataResult, baseline, createFiles);
    } else {
      createFiles.write(baseline + '\r\n');
      cont++;
    }
  }

  static parseSimpleArray(jsonData: any, baseline: string, createFiles: fsExtra.WriteStream): void {
    const keys = Object.keys(jsonData);
    for (let index = 0; index < keys.length; index++) {
      const key = keys[index];
      const value = jsonData[key];
      let line = stringQuote + key + stringQuote + splitCharacter;
      line += stringQuote + value + stringQuote + splitCharacter;
      createFiles.write(baseline + line + '\r\n');
      cont++;
    }
  }

  static formatWithJson(
    result: any,
    createFiles: fsExtra.WriteStream,
    fieldsArray: string[],
    JsonField: string | null,
    jsonValues: any
  ): void {
    const baseline = EpcJsonReport.formatNormallFields(result, fieldsArray);
    const jsonData = result[AppUtils.replaceaNameSpace(JsonField!)];
    if (jsonData != null && jsonData !== '[]' && jsonData !== '{}') {
      const jsonDataResult = JSON.parse(jsonData);
      const localKeyNames: string[] = [];
      EpcJsonReport.recursiveFormat(jsonDataResult, numberOfLevels, localKeyNames, createFiles, jsonValues, baseline);
    } else {
      createFiles.write(baseline + '\r\n');
      cont++;
    }
  }

  static formatWithJsonPath(
    result: any,
    createFiles: fsExtra.WriteStream,
    fieldsArray: string[],
    JsonField: string | null,
    jsonValues: any
  ): void {
    const baseline = EpcJsonReport.formatNormallFields(result, fieldsArray);
    const jsonData = result[AppUtils.replaceaNameSpace(JsonField!)];
    if (jsonData != null && jsonData !== '[]' && jsonData !== '{}') {
      const jsonDataResult = JSON.parse(jsonData);
      EpcJsonReport.recursiveFormatPath(jsonDataResult, createFiles, jsonValues, baseline);
    } else {
      createFiles.write(baseline + '\r\n');
      cont++;
    }
  }

  static recursiveFormatPath(
    jsonData: any,
    createFiles: fsExtra.WriteStream,
    jsonValues: any,
    baseline: string
  ): void {
    const nextKeyName = jsonValues['nextLevel'];
    const fields = jsonValues['fields'];
    if (!nextKeyName) {
      EpcJsonReport.formatRecordFinal(jsonData, keyNames, createFiles, fields, baseline);
    } else {
      const nextArray = jsonValues['nextLevel'];
      const nextName = nextArray['name'];
      if (Array.isArray(jsonData)) {
        for (let index = 0; index < jsonData.length; index++) {
          const element = jsonData[index];
          let newBaseLine2 = baseline;
          if (fields) {
            newBaseLine2 += EpcJsonReport.formatLine(fields, element, false);
          }
          EpcJsonReport.recursiveFormatPath(element[nextName], createFiles, nextArray, newBaseLine2);
        }
      } else {
        let newBaseLine2 = baseline;
        if (fields) {
          newBaseLine2 += EpcJsonReport.formatLine(fields, jsonData, false);
        }
        EpcJsonReport.recursiveFormatPath(jsonData[nextName], createFiles, nextArray, newBaseLine2);
      }
    }
  }

  static formatLine(jsonValues: any, term: any, skipLast: boolean): string {
    let newLine = '';
    const loopLimit = skipLast ? jsonValues.length - 1 : jsonValues.length;
    for (let index = 0; index < loopLimit; index++) {
      const jsonElement = jsonValues[index];
      const value = AppUtils.getDataByPath(term, jsonElement);
      const valueResult = value ? value : '';
      newLine += stringQuote + valueResult + stringQuote + splitCharacter;
    }
    return newLine;
  }

  static writeHeader(
    jsonField: string | null,
    jsonValues: any,
    createFiles: fsExtra.WriteStream,
    initialHeader: string | null
  ): void {
    let newHeader = initialHeader ? initialHeader : '';
    if (jsonField != null) {
      if (jsonValues['nextLevel']) {
        let nextLevel = jsonValues['nextLevel'];
        while (nextLevel) {
          const fields = nextLevel['fields'];
          const name = nextLevel['name'];
          if (fields) {
            for (let index = 0; index < fields.length; index++) {
              const element = fields[index];
              newHeader += splitCharacter + name + '.' + element;
            }
          }
          nextLevel = nextLevel['nextLevel'];
        }
      } else {
        if (keyNames.length > 1) {
          for (let index = 0; index < keyNames.length; index++) {
            const element = keyNames[index];
            newHeader += splitCharacter + element;
          }
        }
        newHeader +=
          splitCharacter + JSON.stringify(jsonValues).replace(/\[/g, '').replace(/\]/g, '').replace(/"/g, '');
        if (typeof jsonValues[jsonValues.length - 1] === 'object') {
          const keyValueName = Object.keys(jsonValues[jsonValues.length - 1])[0];
          newHeader = newHeader.replace(/\{/g, '').replace(/\}/g, '').replace(keyValueName + ':', '');
        }
      }
    }
    newHeader = newHeader
      .replace(/,/g, splitCharacter)
      .replace(splitCharacter + splitCharacter, splitCharacter);
    createFiles.write('ID' + splitCharacter + newHeader + '\r\n');
  }

  static async exportObject(
    conn: any,
    resultsFile: string,
    ObjectName: string,
    initialHeader: string,
    formatFunction: (result: any, createFiles: any, fieldsArray: string[], jsonField: string | null, jsonValues: any) => void,
    fields: string,
    jsonField: string | null,
    jsonValues: any,
    all: boolean,
    onlyJson: boolean
  ): Promise<any> {
    const objectAPIName = AppUtils.replaceaNameSpace(ObjectName);
    AppUtils.log3(objectAPIName + ' Report, File: ' + JSON.stringify(resultsFile));

    if (fsExtra.existsSync(resultsFile)) {
      fsExtra.unlinkSync(resultsFile);
    }

    const createFiles = fsExtra.createWriteStream(resultsFile, { flags: 'a' });
    const fieldsArray = AppUtils.replaceaNameSpace(fields).split(',');

    EpcJsonReport.writeHeader(jsonField, jsonValues, createFiles, initialHeader);

    let queryString = 'SELECT ID';
    if (!onlyJson) {
      for (const element of fieldsArray) {
        queryString += ',' + element;
      }
    }

    if (jsonField != null && !all) {
      queryString += ',' + AppUtils.replaceaNameSpace(jsonField);
    }
    queryString += ' FROM ' + objectAPIName;
    const queryString2 = AppUtils.replaceaNameSpace(queryString).replace(/,,/, ',');
    cont = 0;
    cont2 = 0;

    AppUtils.startSpinner('Exporting ' + objectAPIName);

    const promise = new Promise((resolve, reject) => {
      conn
        .query(queryString2)
        .on('record', (result: any) => {
          formatFunction(result, createFiles, fieldsArray, jsonField, jsonValues);
          cont2++;
          AppUtils.updateSpinnerMessage(' Records Exported: ' + cont2 + ' / Records Created: ' + cont);
        })
        .on('queue', () => {
          AppUtils.log2(objectAPIName + ' - queue');
        })
        .on('end', () => {
          const resultData = { exported: cont2, created: cont };
          resolve(resultData);
        })
        .on('error', (err: any) => {
          AppUtils.log2(objectAPIName + ' - Report Error: ' + err);
          console.log(err.stack);
        })
        .run({ autoFetch: true, maxFetch: 1000000 });
    });

    const value = await promise;
    AppUtils.stopSpinnerMessage('Done, ' + (value as any)['exported'] + ' Exported and ' + (value as any)['created'] + ' Created');
    return value;
  }

  static formatNormallFields(result: any, fieldsArray: string[]): string {
    const Id = result['Id'];
    let baseline = Id + splitCharacter;
    for (let i = 0; i < fieldsArray.length; i++) {
      const newValue = result[fieldsArray[i]];
      if (newValue != null) {
        if ((String(newValue).includes('{') || String(newValue).includes('}')) && splitCharacter !== '|') {
          baseline += stringQuote + '<JSONObject>' + stringQuote + splitCharacter;
        } else {
          baseline += stringQuote + newValue + stringQuote + splitCharacter;
        }
      } else {
        baseline += splitCharacter;
      }
    }
    return baseline;
  }
}
