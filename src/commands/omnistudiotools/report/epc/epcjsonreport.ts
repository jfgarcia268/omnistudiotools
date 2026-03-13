import fsExtra from 'fs-extra';
import yaml from 'js-yaml';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { AppUtils } from '../../../../utils/AppUtils.js';
import type { SfConnection } from '../../../../utils/AppUtils.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('omnistudiotools', 'omnistudiotools.report.epc.epcjsonreport');

let splitCharacter = ',';
const stringQuote = '';

let keyNames: string[] = [];
let currentJsonField = '';
let numberOfLevels = 0;
let cont = 0;
let cont2 = 0;

type JsonValues = unknown[] | Record<string, unknown>;
type JsonData = Record<string, unknown> | unknown[];
type FormatFunction = (
  result: Record<string, unknown>,
  createFiles: fsExtra.WriteStream,
  fieldsArray: string[],
  jsonField: string | null,
  jsonValues: JsonValues
) => void;

type YamlObjectConfig = {
  [key: string]: unknown;
  All?: boolean;
  Fields?: string[];
  JsonFields?: Record<string, JsonValues>;
  OnlyJsonFields?: boolean;
  numOfKeys?: number;
  simpleJsonArray?: boolean;
  JsonPath?: boolean;
};

type YamlDoc = {
  Objects: Record<string, YamlObjectConfig>;
};

export default class EpcJsonReport extends SfCommand<void> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    'target-org': Flags.requiredOrg(),
    package: Flags.string({ char: 'p', summary: messages.getMessage('flags.package.summary') }),
    datafile: Flags.string({ char: 'd', summary: messages.getMessage('flags.datafile.summary') }),
    separator: Flags.string({ char: 's', summary: messages.getMessage('flags.separator.summary') }),
  };

  public static formatGeneric(
    result: Record<string, unknown>,
    createFiles: fsExtra.WriteStream,
    fieldsArray: string[],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _jsonField: string | null,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _jsonValues: JsonValues
  ): void {
    const baseline = EpcJsonReport.formatNormallFields(result, fieldsArray);
    createFiles.write(baseline + '\r\n');
    cont++;
  }

  public static formatAttributeRules(
    jsonData: Record<string, unknown[]>,
    jsonValues: JsonValues,
    baseline: string,
    createFiles: fsExtra.WriteStream,
    keyValues: string[]
  ): void {
    const keys = Object.keys(jsonData);
    for (const key of keys) {
      const term = jsonData[key];
      for (const term2 of term as Array<Record<string, unknown>>) {
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

  public static getKeysNameforLine(keyNamesParam: string[]): string {
    let newLine = '';
    for (const element of keyNamesParam) {
      newLine += element + splitCharacter;
    }
    return newLine;
  }

  public static getSecondLevelArray(jsonValues: JsonValues, jsonData: JsonData): unknown[] | undefined {
    if (Array.isArray(jsonValues) && jsonValues.length > 0) {
      const lastElement = jsonValues[jsonValues.length - 1];
      if (lastElement && typeof lastElement === 'object' && !Array.isArray(lastElement)) {
        const lastObj = lastElement as Record<string, unknown>;
        const firstKey = Object.keys(lastObj)[0];
        if (firstKey) {
          const result = AppUtils.getDataByPath(jsonData as Record<string, unknown>, firstKey);
          if (Array.isArray(result)) return result as unknown[];
        }
      }
    }
    return undefined;
  }

  public static formatRecordFinal(
    jsonData: JsonData,
    keyNamesParam: string[],
    createFiles: fsExtra.WriteStream,
    jsonValues: JsonValues,
    baseline: string
  ): void {
    if (Array.isArray(jsonData)) {
      for (const jsonItem of jsonData) {
        const term = jsonItem as Record<string, unknown>;
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
    } else if (currentJsonField === 'namespace__AttributeRules__c') {
      EpcJsonReport.formatAttributeRules(jsonData as Record<string, unknown[]>, jsonValues, baseline, createFiles, keyNamesParam);
    } else {
      let newLine = baseline + EpcJsonReport.getKeysNameforLine(keyNamesParam);
      newLine += EpcJsonReport.formatLine(jsonValues, jsonData, false);
      createFiles.write(newLine + '\r\n');
      cont++;
    }
  }

  public static formatSecondLevelArray(
    secondLevelArray: unknown[],
    jsonValues: JsonValues,
    createFiles: fsExtra.WriteStream,
    newLine: string
  ): void {
    for (const secondLevelObject of secondLevelArray) {
      let secondLevelLine = '';
      if (Array.isArray(jsonValues) && jsonValues.length > 0) {
        const lastElement = jsonValues[jsonValues.length - 1];
        if (lastElement && typeof lastElement === 'object' && !Array.isArray(lastElement)) {
          const lastObj = lastElement as Record<string, unknown[]>;
          const firstKey = Object.keys(lastObj)[0];
          if (firstKey) {
            const secodLevelKeys = lastObj[firstKey] ?? [];
            const secondObj = secondLevelObject as Record<string, unknown>;
            for (const key of secodLevelKeys) {
              const value = secondObj[String(key)];
              const valueResult = value ?? '';
              secondLevelLine += stringQuote + String(valueResult) + stringQuote + splitCharacter;
            }
          }
        }
      }
      createFiles.write(newLine + secondLevelLine + '\r\n');
      cont++;
    }
  }

  public static recursiveFormat(
    jsonData: JsonData,
    missingTimes: number,
    keyNamesParam: string[],
    createFiles: fsExtra.WriteStream,
    jsonValues: JsonValues,
    baseline: string
  ): void {
    if (missingTimes === 0) {
      EpcJsonReport.formatRecordFinal(jsonData, keyNamesParam, createFiles, jsonValues, baseline);
    } else {
      const dataObj = jsonData as Record<string, JsonData>;
      const keys = Object.keys(dataObj);
      for (const key of keys) {
        const attribute = dataObj[key];
        const newKeyNames = Object.assign([], keyNamesParam) as string[];
        newKeyNames.push(key);
        EpcJsonReport.recursiveFormat(attribute, missingTimes - 1, newKeyNames, createFiles, jsonValues, baseline);
      }
    }
  }

  public static formatWithSimpleJsonArray(
    result: Record<string, unknown>,
    createFiles: fsExtra.WriteStream,
    fieldsArray: string[],
    JsonField: string | null,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _jsonValues: JsonValues
  ): void {
    const baseline = EpcJsonReport.formatNormallFields(result, fieldsArray);
    const jsonData = result[AppUtils.replaceaNameSpace(JsonField ?? '')];
    if (jsonData != null && jsonData !== '[]' && jsonData !== '{}') {
      const jsonDataResult = JSON.parse(String(jsonData)) as Record<string, unknown>;
      EpcJsonReport.parseSimpleArray(jsonDataResult, baseline, createFiles);
    } else {
      createFiles.write(baseline + '\r\n');
      cont++;
    }
  }

  public static parseSimpleArray(jsonData: Record<string, unknown>, baseline: string, createFiles: fsExtra.WriteStream): void {
    const keys = Object.keys(jsonData);
    for (const key of keys) {
      const value = jsonData[key];
      let line = stringQuote + key + stringQuote + splitCharacter;
      line += stringQuote + String(value) + stringQuote + splitCharacter;
      createFiles.write(baseline + line + '\r\n');
      cont++;
    }
  }

  public static formatWithJson(
    result: Record<string, unknown>,
    createFiles: fsExtra.WriteStream,
    fieldsArray: string[],
    JsonField: string | null,
    jsonValues: JsonValues
  ): void {
    const baseline = EpcJsonReport.formatNormallFields(result, fieldsArray);
    const jsonData = result[AppUtils.replaceaNameSpace(JsonField ?? '')];
    if (jsonData != null && jsonData !== '[]' && jsonData !== '{}') {
      const jsonDataResult = JSON.parse(String(jsonData)) as JsonData;
      const localKeyNames: string[] = [];
      EpcJsonReport.recursiveFormat(jsonDataResult, numberOfLevels, localKeyNames, createFiles, jsonValues, baseline);
    } else {
      createFiles.write(baseline + '\r\n');
      cont++;
    }
  }

  public static formatWithJsonPath(
    result: Record<string, unknown>,
    createFiles: fsExtra.WriteStream,
    fieldsArray: string[],
    JsonField: string | null,
    jsonValues: JsonValues
  ): void {
    const baseline = EpcJsonReport.formatNormallFields(result, fieldsArray);
    const jsonData = result[AppUtils.replaceaNameSpace(JsonField ?? '')];
    if (jsonData != null && jsonData !== '[]' && jsonData !== '{}') {
      const jsonDataResult = JSON.parse(String(jsonData)) as JsonData;
      EpcJsonReport.recursiveFormatPath(jsonDataResult, createFiles, jsonValues, baseline);
    } else {
      createFiles.write(baseline + '\r\n');
      cont++;
    }
  }

  public static recursiveFormatPath(
    jsonData: JsonData,
    createFiles: fsExtra.WriteStream,
    jsonValues: JsonValues,
    baseline: string
  ): void {
    const jsonValuesObj = jsonValues as Record<string, unknown>;
    const nextKeyName = jsonValuesObj['nextLevel'];
    const fields = jsonValuesObj['fields'] as JsonValues | undefined;
    if (!nextKeyName) {
      EpcJsonReport.formatRecordFinal(jsonData, keyNames, createFiles, fields ?? [], baseline);
    } else {
      const nextArray = jsonValuesObj['nextLevel'] as Record<string, unknown>;
      const nextName = String(nextArray['name']);
      if (Array.isArray(jsonData)) {
        for (const jsonItem of jsonData) {
          const element = jsonItem as Record<string, unknown>;
          let newBaseLine2 = baseline;
          if (fields) {
            newBaseLine2 += EpcJsonReport.formatLine(fields, element, false);
          }
          EpcJsonReport.recursiveFormatPath(element[nextName] as JsonData, createFiles, nextArray as JsonValues, newBaseLine2);
        }
      } else {
        const dataObj = jsonData;
        let newBaseLine2 = baseline;
        if (fields) {
          newBaseLine2 += EpcJsonReport.formatLine(fields, dataObj, false);
        }
        EpcJsonReport.recursiveFormatPath(dataObj[nextName] as JsonData, createFiles, nextArray as JsonValues, newBaseLine2);
      }
    }
  }

  public static formatLine(jsonValues: JsonValues, term: Record<string, unknown>, skipLast: boolean): string {
    let newLine = '';
    const valuesArray = Array.isArray(jsonValues) ? jsonValues : [];
    const loopLimit = skipLast ? valuesArray.length - 1 : valuesArray.length;
    for (let index = 0; index < loopLimit; index++) {
      const jsonElement = valuesArray[index];
      const value = AppUtils.getDataByPath(term, String(jsonElement));
      const valueResult = value ?? '';
      newLine += stringQuote + String(valueResult) + stringQuote + splitCharacter;
    }
    return newLine;
  }

  public static writeHeader(
    jsonField: string | null,
    jsonValues: JsonValues,
    createFiles: fsExtra.WriteStream,
    initialHeader: string | null
  ): void {
    let newHeader = initialHeader ?? '';
    const jsonValuesObj = jsonValues as Record<string, unknown>;
    if (jsonField != null) {
      if (jsonValuesObj['nextLevel']) {
        let nextLevel = jsonValuesObj['nextLevel'] as Record<string, unknown>;
        while (nextLevel) {
          const fields = nextLevel['fields'] as unknown[] | undefined;
          const name = String(nextLevel['name']);
          if (fields) {
            for (const element of fields) {
              newHeader += splitCharacter + name + '.' + String(element);
            }
          }
          nextLevel = nextLevel['nextLevel'] as Record<string, unknown>;
        }
      } else {
        const valuesArray = Array.isArray(jsonValues) ? jsonValues : [];
        if (keyNames.length > 1) {
          for (const element of keyNames) {
            newHeader += splitCharacter + element;
          }
        }
        newHeader +=
          splitCharacter + JSON.stringify(valuesArray).replace(/\[/g, '').replace(/\]/g, '').replace(/"/g, '');
        if (valuesArray.length > 0 && typeof valuesArray[valuesArray.length - 1] === 'object') {
          const lastObj = valuesArray[valuesArray.length - 1] as Record<string, unknown>;
          const keyValueName = Object.keys(lastObj)[0];
          newHeader = newHeader.replace(/\{/g, '').replace(/\}/g, '').replace(keyValueName + ':', '');
        }
      }
    }
    newHeader = newHeader
      .replace(/,/g, splitCharacter)
      .replace(splitCharacter + splitCharacter, splitCharacter);
    createFiles.write('ID' + splitCharacter + newHeader + '\r\n');
  }

  public static async exportObject(
    conn: SfConnection,
    resultsFile: string,
    ObjectName: string,
    initialHeader: string,
    formatFunction: FormatFunction,
    fields: string,
    jsonField: string | null,
    jsonValues: JsonValues | null,
    all: boolean,
    onlyJson: boolean
  ): Promise<{ exported: number; created: number }> {
    const objectAPIName = AppUtils.replaceaNameSpace(ObjectName);
    AppUtils.log3(objectAPIName + ' Report, File: ' + JSON.stringify(resultsFile));

    if (fsExtra.existsSync(resultsFile)) {
      fsExtra.unlinkSync(resultsFile);
    }

    const createFiles = fsExtra.createWriteStream(resultsFile, { flags: 'a' });
    const fieldsArray = AppUtils.replaceaNameSpace(fields).split(',');

    EpcJsonReport.writeHeader(jsonField, jsonValues ?? [], createFiles, initialHeader);

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

    const promise = new Promise<{ exported: number; created: number }>((resolve) => {
      void conn
        .query<Record<string, unknown>>(queryString2)
        .on('record', (result: Record<string, unknown>) => {
          formatFunction(result, createFiles, fieldsArray, jsonField, jsonValues ?? []);
          cont2++;
          AppUtils.updateSpinnerMessage(' Records Exported: ' + String(cont2) + ' / Records Created: ' + String(cont));
        })
        .on('queue', () => {
          AppUtils.log2(objectAPIName + ' - queue');
        })
        .on('end', () => {
          const resultData = { exported: cont2, created: cont };
          resolve(resultData);
        })
        .on('error', (err: Error) => {
          AppUtils.log2(objectAPIName + ' - Report Error: ' + String(err));
        })
        .run({ autoFetch: true, maxFetch: 1_000_000 });
    });

    const value = await promise;
    AppUtils.stopSpinnerMessage('Done, ' + String(value.exported) + ' Exported and ' + String(value.created) + ' Created');
    return value;
  }

  public static formatNormallFields(result: Record<string, unknown>, fieldsArray: string[]): string {
    const Id = result['Id'];
    let baseline = String(Id) + splitCharacter;
    for (const fieldName of fieldsArray) {
      const newValue = result[fieldName];
      if (newValue != null) {
        if ((String(newValue).includes('{') || String(newValue).includes('}')) && splitCharacter !== '|') {
          baseline += stringQuote + '<JSONObject>' + stringQuote + splitCharacter;
        } else {
          baseline += stringQuote + String(newValue) + stringQuote + splitCharacter;
        }
      } else {
        baseline += splitCharacter;
      }
    }
    return baseline;
  }

  private static async processJsonFieldsGroup(
    conn: SfConnection,
    formatFn: FormatFunction,
    jsonFields: Record<string, JsonValues>,
    ObjectName: string,
    fieldsString: string,
    numberFile: string,
    all: boolean,
    onlyJson: boolean,
    resultData: Array<Record<string, unknown>>
  ): Promise<void> {
    for (const jsonFieldKey of Object.keys(jsonFields)) {
      currentJsonField = jsonFieldKey;
      const jsonField = AppUtils.replaceaNameSpaceFromFile(jsonFieldKey);
      const resultFile = ObjectName + '_' + jsonField + '_' + numberFile + 'Result.csv';
      if (fsExtra.existsSync(resultFile)) {
        fsExtra.unlinkSync(resultFile);
      }
      const jsonFieldsKeys = jsonFields[jsonFieldKey];
      // eslint-disable-next-line no-await-in-loop
      const result = await EpcJsonReport.exportObject(
        conn,
        resultFile,
        ObjectName,
        fieldsString,
        formatFn,
        fieldsString,
        jsonField,
        jsonFieldsKeys,
        all,
        onlyJson
      );
      resultData.push({
        ObjectName: ObjectName + ' - ' + jsonField,
        RecordsExported: result.exported,
        RecordsCreated: result.created,
        ReportFile: resultFile,
      });
      AppUtils.log2(' ');
    }
  }

  private static async processObject(
    conn: SfConnection,
    element: string,
    objConfig: YamlObjectConfig,
    resultData: Array<Record<string, unknown>>
  ): Promise<void> {
    const ObjectNameYaml = AppUtils.replaceaNameSpaceFromFile(element);
    const ObjectName = ObjectNameYaml.split('-')[0];
    let numberFile = '';
    if (ObjectNameYaml.split('-')[1]) {
      numberFile = ObjectNameYaml.split('-')[1] + '_';
    }
    const all = objConfig.All ?? false;
    const fields = objConfig.Fields;
    const jsonFields = objConfig.JsonFields;
    const onlyJson = objConfig.OnlyJsonFields ?? false;
    const numOfKeys = objConfig.numOfKeys;
    const simpleJsonArray = objConfig.simpleJsonArray ?? false;
    const JsonPath = objConfig.JsonPath ?? false;
    let fieldsString = '';

    if (numOfKeys && numOfKeys > 0) {
      numberOfLevels = numOfKeys;
      for (let i = 1; i <= numberOfLevels; i++) {
        const key = objConfig['key' + String(i)];
        keyNames.push(String(key));
      }
    }

    if (all) {
      const meta = await conn.sobject(ObjectName).describe();
      for (const objectField of meta.fields.map(f => f.name)) {
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

    if (JsonPath && jsonFields) {
      await EpcJsonReport.processJsonFieldsGroup(
        conn,
        (r, c, f, j, v) => EpcJsonReport.formatWithJsonPath(r, c, f, j, v),
        jsonFields, ObjectName, fieldsString, numberFile, all, onlyJson, resultData
      );
    } else if (simpleJsonArray && jsonFields) {
      await EpcJsonReport.processJsonFieldsGroup(
        conn,
        (r, c, f, j, v) => EpcJsonReport.formatWithSimpleJsonArray(r, c, f, j, v),
        jsonFields, ObjectName, fieldsString, numberFile, all, onlyJson, resultData
      );
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
        (r, c, f, j, v) => EpcJsonReport.formatGeneric(r, c, f, j, v),
        fieldsString,
        null,
        null,
        all,
        onlyJson
      );
      resultData.push({
        ObjectName,
        RecordsExported: result.exported,
        RecordsCreated: result.created,
        ReportFile: resultFile,
      });
      AppUtils.log2(' ');
    } else {
      await EpcJsonReport.processJsonFieldsGroup(
        conn,
        (r, c, f, j, v) => EpcJsonReport.formatWithJson(r, c, f, j, v),
        jsonFields, ObjectName, fieldsString, numberFile, all, onlyJson, resultData
      );
    }
    keyNames = [];
    currentJsonField = '';
  }

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
      const doc = yaml.load(fsExtra.readFileSync(dataFile, 'utf8')) as YamlDoc;

      const resultData: Array<Record<string, unknown>> = [];

      for (const element of Object.keys(doc.Objects)) {
        const objConfig = doc.Objects[element];
        // eslint-disable-next-line no-await-in-loop
        await EpcJsonReport.processObject(conn, element, objConfig, resultData);
      }

      const tableColumnData = ['ObjectName', 'RecordsExported', 'RecordsCreated', 'ReportFile'];
      this.log('RESULTS:');
      AppUtils.table(resultData, tableColumnData);
      this.log(' ');
    } catch (e: unknown) {
      AppUtils.log2(String(e));
    }
  }
}
