import fsExtra from 'fs-extra';
import yaml from 'js-yaml';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages, Org } from '@salesforce/core';
import { AppUtils } from '../../../utils/AppUtils.js';
import type { SfConnection } from '../../../utils/AppUtils.js';
import { DBUtils } from '../../../utils/DBUtils.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('omnistudiotools', 'omnistudiotools.clean.epcgkfix');

type YamlDefinitions = {
  PCI?: string[];
  AA?: string[];
};

let OverrideUniqueFieldsForAA = [
  '%name-space%ProductHierarchyGlobalKeyPath__c',
  '%name-space%ProductId__r.%name-space%GlobalKey__c',
  '%name-space%PromotionId__r.%name-space%GlobalKey__c',
  '%name-space%PromotionItemId__r.%name-space%ProductId__r.%name-space%GlobalKey__c',
  '%name-space%PromotionItemId__r.%name-space%ContextProductId__r.%name-space%GlobalKey__c',
  '%name-space%PromotionItemId__r.%name-space%OfferId__r.%name-space%GlobalKey__c',
  '%name-space%OverridingAttributeAssignmentId__r.%name-space%AttributeId__r.%name-space%Code__c',
];

let OverrideUniqueFieldsForPCI = [
  '%name-space%ProductHierarchyGlobalKeyPath__c',
  '%name-space%ProductId__r.%name-space%GlobalKey__c',
  '%name-space%PromotionId__r.%name-space%GlobalKey__c',
  '%name-space%PromotionItemId__r.%name-space%ProductId__r.%name-space%GlobalKey__c',
  '%name-space%PromotionItemId__r.%name-space%ContextProductId__r.%name-space%GlobalKey__c',
  '%name-space%PromotionItemId__r.%name-space%OfferId__r.%name-space%GlobalKey__c',
];

export default class EpcGkFix extends SfCommand<void> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly examples = messages.getMessages('examples');

  public static keySeparator = '|';

  public static readonly flags = {
    package: Flags.string({ char: 'p', summary: messages.getMessage('flags.package.summary') }),
    source: Flags.string({ char: 's', summary: messages.getMessage('flags.source.summary'), required: true }),
    target: Flags.string({ char: 't', summary: messages.getMessage('flags.target.summary'), required: true }),
    pci: Flags.boolean({ char: 'c', summary: messages.getMessage('flags.pci.summary') }),
    aa: Flags.boolean({ char: 'a', summary: messages.getMessage('flags.aa.summary') }),
    check: Flags.boolean({ char: 'v', summary: messages.getMessage('flags.check.summary') }),
    definitions: Flags.string({ char: 'd', summary: messages.getMessage('flags.definitions.summary') }),
  };

  private static async fixOverrideAAorPCI(
    connSource: SfConnection,
    connTarget: SfConnection,
    checkMode: boolean | undefined,
    ObjectAPINname: string,
    queryString: string
  ): Promise<void> {
    AppUtils.log2('Creating ' + ObjectAPINname + ' Maps');
    AppUtils.log2('Source: ');
    const sourceAAMap = await EpcGkFix.createPCIorAAOverrideMap(connSource, ObjectAPINname);
    AppUtils.log2('Target: ');
    const targetAAMap = await EpcGkFix.createPCIorAAOverrideMap(connTarget, ObjectAPINname);

    AppUtils.log2('Fetching Override Definitions records from Source');
    const sourceOO = await DBUtils.bulkAPIquery(connSource, queryString);
    const sourceOOMap = EpcGkFix.createMapforObjectforOverrideDefinitions(sourceOO, OverrideUniqueFieldsForAA);
    AppUtils.log2('Fetching Override Definitions records from Target');
    const targetOO = await DBUtils.bulkAPIquery(connTarget, queryString);
    const targetOOMap = EpcGkFix.createMapforObjectforOverrideDefinitions(targetOO, OverrideUniqueFieldsForAA);

    const objectName = ObjectAPINname.split('__')[1];
    const recordsToUpdate: Array<Record<string, unknown>> = [];
    const recordsToUpdateSource: Array<Record<string, unknown>> = [];
    AppUtils.log2('Matching ' + ObjectAPINname + ' by using OverrideDefintions');

    for (const [key, objectArray] of sourceOOMap) {
      const object = objectArray[0];
      if (objectArray.length > 1) {
        AppUtils.log2('Source duplicated Found - Records Will be Updated with Same GlobalKey if necessary - Related IDs:');
        AppUtils.log1(String(object['Id']));
        const sourceOverridingRecordID = object[AppUtils.replaceaNameSpace('%name-space%Overriding' + objectName + 'Id__c')];
        const sourceOverridingRecord = sourceAAMap.get(String(sourceOverridingRecordID));
        const sourceOverridingRercordGK = sourceOverridingRecord?.[AppUtils.replaceaNameSpace('%name-space%GlobalKey__c')];
        for (let index = 1; index < objectArray.length; index++) {
          const duplicateObjectToUpdate = objectArray[index];
          AppUtils.log1(String(duplicateObjectToUpdate['Id']));
          const targetOverridingRecordID =
            duplicateObjectToUpdate[AppUtils.replaceaNameSpace('%name-space%Overriding' + objectName + 'Id__c')];
          const targetOverridingRecord = sourceAAMap.get(String(targetOverridingRecordID));
          if (targetOverridingRecord) {
            const targetOverridingRecordGK =
              targetOverridingRecord[AppUtils.replaceaNameSpace('%name-space%GlobalKey__c')];
            if (sourceOverridingRercordGK !== targetOverridingRecordGK) {
              targetOverridingRecord[AppUtils.replaceaNameSpace('%name-space%GlobalKey__c')] =
                sourceOverridingRercordGK;
              recordsToUpdateSource.push(targetOverridingRecord);
            }
          }
        }
      }

      const targetObjects = targetOOMap.get(key);
      if (targetObjects) {
        if (targetObjects.length > 1) {
          AppUtils.log2(
            'Target duplicated Found - Records Will be Updated with Same GlobalKey if necessary - Related IDs:'
          );
          for (const targetObject of targetObjects) {
            AppUtils.log1(String(targetObject['Id']));
          }
        }
        for (const targetObject of targetObjects) {
          const sourceOverridingRecordID =
            object[AppUtils.replaceaNameSpace('%name-space%Overriding' + objectName + 'Id__c')];
          const targetOverridingRecordID =
            targetObject[AppUtils.replaceaNameSpace('%name-space%Overriding' + objectName + 'Id__c')];
          const sourceOverridingRecord = sourceAAMap.get(String(sourceOverridingRecordID));
          const targetOverridingRecord = targetAAMap.get(String(targetOverridingRecordID));
          if (sourceOverridingRecord && targetOverridingRecord) {
            const sourceOverridingRecordGK =
              sourceOverridingRecord[AppUtils.replaceaNameSpace('%name-space%GlobalKey__c')];
            const targetOverridingRecordGK =
              targetOverridingRecord[AppUtils.replaceaNameSpace('%name-space%GlobalKey__c')];
            if (sourceOverridingRecordGK !== targetOverridingRecordGK) {
              AppUtils.log2(
                'Mismatch - Related IDs Source: ' +
                  String(sourceOverridingRecord['Id']) +
                  ' Target: ' +
                  String(targetOverridingRecord['Id'])
              );
              targetOverridingRecord[AppUtils.replaceaNameSpace('%name-space%GlobalKey__c')] =
                sourceOverridingRecordGK;
              recordsToUpdate.push(targetOverridingRecord);
            }
          }
        }
      }
    }
    if (recordsToUpdate.length > 0 && !checkMode) {
      AppUtils.log2('Updating Target:');
      await DBUtils.bulkAPIUpdate(recordsToUpdate, connTarget, ObjectAPINname);
    }
    if (recordsToUpdateSource.length > 0 && !checkMode) {
      AppUtils.log2('Updating Source:');
      await DBUtils.bulkAPIUpdate(recordsToUpdateSource, connSource, ObjectAPINname);
    } else {
      AppUtils.log2('No Records to update');
    }
  }

  private static async fixNonOverridePCI(
    connSource: SfConnection,
    connTarget: SfConnection,
    _sourceProduct2Map: Map<string, string>,
    _targetProduct2Map: Map<string, string>,
    checkMode: boolean | undefined
  ): Promise<void> {
    const queryString =
      'SELECT id, %name-space%GlobalKey__c, %name-space%ParentProductId__r.%name-space%GlobalKey__c, %name-space%ChildProductId__r.%name-space%GlobalKey__c FROM %name-space%ProductChildItem__c WHERE %name-space%IsOverride__c = false';
    AppUtils.log2('Fetching PCI records from Source');
    const sourceAA = await DBUtils.bulkAPIquery(connSource, queryString);
    const sourceAAMap = EpcGkFix.createMapforNonPCI(sourceAA);
    AppUtils.log2('Fetching PCI records from Target');
    const targetAA = await DBUtils.bulkAPIquery(connTarget, queryString);
    const targetAAMap = EpcGkFix.createMapforNonPCI(targetAA);

    AppUtils.log2('Matching by ParentProductGK and ChildProductGK...');
    const recordsToUpdateSource: Array<Record<string, unknown>> = [];
    const recordsToUpdate: Array<Record<string, unknown>> = [];

    for (const [key, objectArray] of sourceAAMap) {
      const object = objectArray[0];
      if (objectArray.length > 1) {
        const sourcegk = object[AppUtils.replaceaNameSpace('%name-space%GlobalKey__c')];
        AppUtils.log2(
          'Source duplicated Found - Records Will be Updated with Same GlobalKey if necessary - Related IDs: '
        );
        AppUtils.log1(String(object['Id']));
        for (let index = 1; index < objectArray.length; index++) {
          const duplicateObjectToUpdate = objectArray[index];
          AppUtils.log1(String(duplicateObjectToUpdate['Id']));
          const targetgk = duplicateObjectToUpdate[AppUtils.replaceaNameSpace('%name-space%GlobalKey__c')];
          if (sourcegk !== targetgk) {
            duplicateObjectToUpdate[AppUtils.replaceaNameSpace('%name-space%GlobalKey__c')] = sourcegk;
            delete duplicateObjectToUpdate[
              AppUtils.replaceaNameSpace('%name-space%ParentProductId__r.%name-space%GlobalKey__c')
            ];
            delete duplicateObjectToUpdate[
              AppUtils.replaceaNameSpace('%name-space%ChildProductId__r.%name-space%GlobalKey__c')
            ];
            recordsToUpdateSource.push(duplicateObjectToUpdate);
          }
        }
      }

      const targetObjects = targetAAMap.get(key);
      if (targetObjects) {
        if (targetObjects.length > 1) {
          AppUtils.log2(
            'Target duplicated Found - Records Will be Updated with Same GlobalKey if necessary - Related IDs:'
          );
          for (const targetObject of targetObjects) {
            AppUtils.log1(String(targetObject['Id']));
          }
        }
        for (const targetObject of targetObjects) {
          const sourcegk = object[AppUtils.replaceaNameSpace('%name-space%GlobalKey__c')];
          const targetgk = targetObject[AppUtils.replaceaNameSpace('%name-space%GlobalKey__c')];
          if (sourcegk !== targetgk) {
            AppUtils.log2('Mismatch - Related IDs Source: ' + String(object['Id']) + ' Target: ' + String(targetObject['Id']));
            targetObject[AppUtils.replaceaNameSpace('%name-space%GlobalKey__c')] = sourcegk;
            delete targetObject[
              AppUtils.replaceaNameSpace('%name-space%ParentProductId__r.%name-space%GlobalKey__c')
            ];
            delete targetObject[
              AppUtils.replaceaNameSpace('%name-space%ChildProductId__r.%name-space%GlobalKey__c')
            ];
            recordsToUpdate.push(targetObject);
          }
        }
      }
    }
    if ((checkMode ?? false) || (recordsToUpdate.length === 0 && recordsToUpdateSource.length === 0)) {
      AppUtils.log2('No Records to Update');
    }
    if (recordsToUpdate.length > 0 && !checkMode) {
      AppUtils.log2('Updating Target:');
      await DBUtils.bulkAPIUpdate(
        recordsToUpdate,
        connTarget,
        AppUtils.replaceaNameSpace('%name-space%ProductChildItem__c')
      );
    }
    if (recordsToUpdateSource.length > 0 && !checkMode) {
      AppUtils.log2('Updating Source:');
      await DBUtils.bulkAPIUpdate(
        recordsToUpdateSource,
        connSource,
        AppUtils.replaceaNameSpace('%name-space%ProductChildItem__c')
      );
    }
  }

  private static async fixNonOverrideAA(
    connSource: SfConnection,
    connTarget: SfConnection,
    sourceProduct2Map: Map<string, string>,
    targetProduct2Map: Map<string, string>,
    checkMode: boolean | undefined
  ): Promise<void> {
    const queryString =
      "SELECT ID, %name-space%AttributeId__r.%name-space%GlobalKey__c, %name-space%ObjectId__c, %name-space%GlobalKey__c FROM %name-space%AttributeAssignment__c WHERE %name-space%ObjectType__c= 'Product2' AND %name-space%IsOverride__c = false";
    AppUtils.log2('Fetching AA records from Source');
    const sourceAA = await DBUtils.bulkAPIquery(connSource, queryString);
    const sourceAAMap = EpcGkFix.createMapforNonAA(sourceAA, sourceProduct2Map);
    AppUtils.log2('Fetching AA records from Target');
    const targetAA = await DBUtils.bulkAPIquery(connTarget, queryString);
    const targetAAMap = EpcGkFix.createMapforNonAA(targetAA, targetProduct2Map);

    AppUtils.log2('Matching by AttributeGK and ObjectGK...');
    const recordsToUpdateSource: Array<Record<string, unknown>> = [];
    const recordsToUpdate: Array<Record<string, unknown>> = [];

    for (const [key, objectArray] of sourceAAMap) {
      const object = objectArray[0];
      if (objectArray.length > 1) {
        const sourcegk = object[AppUtils.replaceaNameSpace('%name-space%GlobalKey__c')];
        AppUtils.log2(
          'Source duplicated Found - Records Will be Updated with Same GlobalKey if necessary - Related IDs: '
        );
        AppUtils.log1(String(object['Id']));
        for (let index = 1; index < objectArray.length; index++) {
          const duplicateObjectToUpdate = objectArray[index];
          const targetgk = duplicateObjectToUpdate[AppUtils.replaceaNameSpace('%name-space%GlobalKey__c')];
          AppUtils.log1(String(duplicateObjectToUpdate['Id']));
          if (sourcegk !== targetgk) {
            duplicateObjectToUpdate[AppUtils.replaceaNameSpace('%name-space%GlobalKey__c')] = sourcegk;
            delete duplicateObjectToUpdate[
              AppUtils.replaceaNameSpace('%name-space%AttributeId__r.%name-space%GlobalKey__c')
            ];
            recordsToUpdateSource.push(duplicateObjectToUpdate);
          }
        }
      }

      const targetObjects = targetAAMap.get(key);
      if (targetObjects) {
        if (targetObjects.length > 1) {
          AppUtils.log2(
            'Target duplicated Found - Records Will be Updated with Same GlobalKey if necessary - Related IDs:'
          );
          for (const targetObject of targetObjects) {
            AppUtils.log1(String(targetObject['Id']));
          }
        }
        for (const targetObject of targetObjects) {
          const sourcegk = object[AppUtils.replaceaNameSpace('%name-space%GlobalKey__c')];
          const targetgk = targetObject[AppUtils.replaceaNameSpace('%name-space%GlobalKey__c')];
          if (sourcegk !== targetgk) {
            AppUtils.log2('Mismatch - Related IDs Source: ' + String(object['Id']) + ' Target: ' + String(targetObject['Id']));
            targetObject[AppUtils.replaceaNameSpace('%name-space%GlobalKey__c')] = sourcegk;
            delete targetObject[
              AppUtils.replaceaNameSpace('%name-space%AttributeId__r.%name-space%GlobalKey__c')
            ];
            recordsToUpdate.push(targetObject);
          }
        }
      }
    }

    if ((checkMode ?? false) || (recordsToUpdate.length === 0 && recordsToUpdateSource.length === 0)) {
      AppUtils.log2('No Records to Update');
    }
    if (recordsToUpdate.length > 0 && !checkMode) {
      AppUtils.log2('Updating Target:');
      await DBUtils.bulkAPIUpdate(
        recordsToUpdate,
        connTarget,
        AppUtils.replaceaNameSpace('%name-space%AttributeAssignment__c')
      );
    }
    if (recordsToUpdateSource.length > 0 && !checkMode) {
      AppUtils.log2('Updating Source:');
      await DBUtils.bulkAPIUpdate(
        recordsToUpdateSource,
        connSource,
        AppUtils.replaceaNameSpace('%name-space%AttributeAssignment__c')
      );
    }
  }

  private static createOverrideDefQueryForPCI(): string {
    let queryString = 'SELECT ID, ';
    for (const element of OverrideUniqueFieldsForPCI) {
      queryString += element + ', ';
    }
    queryString +=
      '%name-space%OverriddenProductChildItemId__c, %name-space%OverridingProductChildItemId__c  ';
    queryString += 'FROM %name-space%OverrideDefinition__c ';
    queryString +=
      "WHERE %name-space%OverrideType__c = 'Product Definition' AND %name-space%OverridingProductChildItemId__c != null AND %name-space%OverriddenProductChildItemId__c != null ";
    return queryString;
  }

  private static createOverrideDefQueryForAA(): string {
    let queryString = 'SELECT ID, ';
    for (const element of OverrideUniqueFieldsForAA) {
      queryString += element + ', ';
    }
    queryString +=
      '%name-space%OverridingAttributeAssignmentId__c, %name-space%OverriddenAttributeAssignmentId__c';
    queryString += ' FROM %name-space%OverrideDefinition__c ';
    queryString +=
      " WHERE %name-space%OverrideType__c = 'Attribute' AND %name-space%OverridingAttributeAssignmentId__c != null AND %name-space%OverriddenAttributeAssignmentId__c != null ";
    return queryString;
  }

  private static createMapforNonPCI(records: Array<Record<string, unknown>>): Map<string, Array<Record<string, unknown>>> {
    const map = new Map<string, Array<Record<string, unknown>>>();
    for (const element of records) {
      const parentProductGK =
        element[AppUtils.replaceaNameSpace('%name-space%ParentProductId__r.%name-space%GlobalKey__c')];
      const childProductGK =
        element[AppUtils.replaceaNameSpace('%name-space%ChildProductId__r.%name-space%GlobalKey__c')];
      const key = String(parentProductGK) + String(childProductGK);
      const array = map.get(key) ?? [];
      array.push(element);
      map.set(key, array);
    }
    return map;
  }

  private static createMapforNonAA(records: Array<Record<string, unknown>>, product2Map: Map<string, string>): Map<string, Array<Record<string, unknown>>> {
    const map = new Map<string, Array<Record<string, unknown>>>();
    for (const element of records) {
      const objectid = element[AppUtils.replaceaNameSpace('%name-space%ObjectId__c')];
      const product2GK = product2Map.get(String(objectid));
      if (product2GK) {
        const attributeGK =
          element[AppUtils.replaceaNameSpace('%name-space%AttributeId__r.%name-space%GlobalKey__c')];
        const key = product2GK + String(attributeGK);
        const array = map.get(key) ?? [];
        array.push(element);
        map.set(key, array);
      } else {
        AppUtils.log1('Invalid AA - ObjectId does not exist - AA ID: ' + String(element['Id']));
      }
    }
    return map;
  }

  private static async createProduct2Map(conn: SfConnection): Promise<Map<string, string>> {
    const queryString = 'SELECT Id, %name-space%GlobalKey__c FROM Product2';
    const products = await DBUtils.bulkAPIquery(conn, queryString);
    const map = new Map<string, string>();
    for (const element of products) {
      const productid = String(element['Id']);
      const gk = String(element[AppUtils.replaceaNameSpace('%name-space%GlobalKey__c')]);
      map.set(productid, gk);
    }
    return map;
  }

  private static async createPCIorAAOverrideMap(conn: SfConnection, object: string): Promise<Map<string, Record<string, unknown>>> {
    const queryString =
      'SELECT ID, %name-space%GlobalKey__c FROM ' + object + ' WHERE %name-space%IsOverride__c = true';
    const objects = await DBUtils.bulkAPIquery(conn, queryString);
    const map = new Map<string, Record<string, unknown>>();
    for (const element of objects) {
      const obid = String(element['Id']);
      map.set(obid, element);
    }
    return map;
  }

  private static createMapforObjectforOverrideDefinitions(
    records: Array<Record<string, unknown>>,
    fields: string[]
  ): Map<string, Array<Record<string, unknown>>> {
    const map = new Map<string, Array<Record<string, unknown>>>();
    for (const element of records) {
      let key = '';
      for (const field of fields) {
        key += String(element[AppUtils.replaceaNameSpace(field)]) + EpcGkFix.keySeparator;
      }
      const array = map.get(key) ?? [];
      array.push(element);
      map.set(key, array);
    }
    return map;
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(EpcGkFix);
    AppUtils.setCommand(this);
    AppUtils.logInitial('epcgkfix');
    this.log(' ');

    const packageType = flags.package;
    const source = flags.source;
    const target = flags.target;
    const checkMode = flags.check;
    const definitions = flags.definitions;
    const pci = flags.pci;
    const aa = flags.aa;

    const org1: Org = await Org.create({ aliasOrUsername: source });
    const org2: Org = await Org.create({ aliasOrUsername: target });

    const connSource = org1.getConnection(undefined);
    const connTarget = org2.getConnection(undefined);

    const nameSpaceSet = await AppUtils.setNameSpace(connSource, packageType);
    if (!nameSpaceSet) {
      throw new Error('Error: Package was not set or incorrect was provided.');
    }

    if (definitions) {
      if (!fsExtra.existsSync(definitions)) {
        throw new Error('Error: File: ' + definitions + ' does not exist');
      } else {
        const doc = yaml.load(fsExtra.readFileSync(definitions, 'utf8')) as YamlDefinitions;
        const pciDef = doc.PCI;
        const aaDef = doc.AA;
        if (pciDef && pciDef.length > 0) {
          OverrideUniqueFieldsForPCI = AppUtils.replaceaNameSpaceFromFileArray(pciDef);
        }
        if (aaDef && aaDef.length > 0) {
          OverrideUniqueFieldsForAA = AppUtils.replaceaNameSpaceFromFileArray(aaDef);
        }
      }
    }

    let sourceProduct2Map: Map<string, string> = new Map();
    let targetProduct2Map: Map<string, string> = new Map();

    try {
      if (aa) {
        AppUtils.log4('Attribute Assignments Global Key Sync');
        this.log(' ');
        AppUtils.log2('Creating Products Maps needed for ObjectId');
        AppUtils.log2('Source:');
        sourceProduct2Map = await EpcGkFix.createProduct2Map(connSource);
        AppUtils.log2('Target:');
        targetProduct2Map = await EpcGkFix.createProduct2Map(connTarget);
        this.log(' ');
        AppUtils.log3('Fixing Non Override AA - records will be matched by AttributeId and ObjectId');
        await EpcGkFix.fixNonOverrideAA(connSource, connTarget, sourceProduct2Map, targetProduct2Map, checkMode);
        this.log(' ');
        AppUtils.log3('Fixing Override AA - records will be matched by Matching OverrideDefintions');
        const query = EpcGkFix.createOverrideDefQueryForAA();
        await EpcGkFix.fixOverrideAAorPCI(
          connSource,
          connTarget,
          checkMode,
          AppUtils.replaceaNameSpace('%name-space%AttributeAssignment__c'),
          query
        );
        this.log(' ');
      }
      if (pci) {
        AppUtils.log4('Product Child Items Global Key Sync');
        this.log(' ');
        AppUtils.log3('Fixing Non Override PCI - records will be matched by Matching ParentProductId and ChildProductId');
        await EpcGkFix.fixNonOverridePCI(connSource, connTarget, sourceProduct2Map, targetProduct2Map, checkMode);
        this.log(' ');
        AppUtils.log3('Fixing Override PCI - records will be matched by Matching OverrideDefintions');
        const query = EpcGkFix.createOverrideDefQueryForPCI();
        await EpcGkFix.fixOverrideAAorPCI(
          connSource,
          connTarget,
          checkMode,
          AppUtils.replaceaNameSpace('%name-space%ProductChildItem__c'),
          query
        );
        this.log(' ');
      }
    } catch (error: unknown) {
      AppUtils.log2(String(error instanceof Error ? error.stack : error));
    }
  }
}
