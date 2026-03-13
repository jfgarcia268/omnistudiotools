import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { AppUtils } from '../../../utils/AppUtils.js';
import fsExtra from 'fs-extra';
import path from 'node:path';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('omnistudiotools', 'omnistudiotools.sfsource.createmocklwcos');

export default class CreateMockLwcOs extends SfCommand<void> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    'target-org': Flags.requiredOrg(),
    package: Flags.string({ char: 'p', summary: messages.getMessage('flags.package.summary') }),
    datapacksfolder: Flags.string({ char: 'd', summary: messages.getMessage('flags.datapacksfolder.summary') }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(CreateMockLwcOs);
    AppUtils.setCommand(this);
    AppUtils.logInitial('createmocklwcos');
    this.log(' ');

    const packageType = flags.package;
    const datapacksfolder = flags.datapacksfolder;
    if (!datapacksfolder || !fsExtra.existsSync(datapacksfolder)) {
      throw new Error("Folder '" + datapacksfolder + "' not found");
    }

    const conn = flags['target-org'].getConnection(undefined);
    const nameSpaceSet = await AppUtils.setNameSpace(conn, packageType);
    if (!nameSpaceSet) throw new Error('Error: Package was not set or incorrect was provided.');

    await this.getMockLWCForOS(conn, datapacksfolder);
  }

  private async getMockLWCForOS(conn: any, datapacksfolder: string): Promise<void> {
    AppUtils.log3('Getting OmniScript Map from Org');
    const orgOSMap = await this.getOrgLWCOSMap(conn);
    AppUtils.log3('Getting OmniScript Map from Local');
    const localOSMap = await this.localLWCOSMap(datapacksfolder);
    const localOSkeys = Object.keys(localOSMap);

    const missingLWC: Record<string, string> = {};
    AppUtils.log3('Missing LWC OmniScript: ');
    for (const element of localOSkeys) {
      if (!orgOSMap[element]) {
        missingLWC[element] = localOSMap[element];
        AppUtils.log1(element);
      }
    }

    if (Object.keys(missingLWC).length > 0) {
      await this.createOrgLwc(conn, missingLWC);
    }
  }

  private async createOrgLwc(conn: any, missingLWC: Record<string, string>): Promise<void> {
    const keys = Object.keys(missingLWC);
    for (const element of keys) {
      AppUtils.log3('Creating LWC for: ' + element);
      const metadata = [{ fullName: element, masterLabel: missingLWC[element] }];
      try {
        const results = await conn.metadata.create('LightningComponentBundle', metadata);
        if (results.success) {
          AppUtils.log2('Mock LWC Created: ' + element);
        } else {
          AppUtils.log2('Error: ' + results.errors?.message);
        }
      } catch (err: any) {
        console.log('Error: ' + err);
      }
    }
  }

  private async localLWCOSMap(datapacksfolder: string): Promise<Record<string, string>> {
    const osFolder = datapacksfolder + path.sep + 'OmniScript';
    const omniScriptMap: Record<string, string> = {};
    const folders = fsExtra.readdirSync(osFolder);
    for (const oSFolderName of folders) {
      const folderPath = osFolder + path.sep + oSFolderName;
      if (fsExtra.lstatSync(folderPath).isDirectory()) {
        const dataPackFile = folderPath + path.sep + oSFolderName + '_DataPack.json';
        const fileData = fsExtra.readFileSync(dataPackFile, 'utf8');
        const OSDataPack = JSON.parse(fileData);
        const isLWC = OSDataPack['%vlocity_namespace%__IsLwcEnabled__c'];
        if (isLWC) {
          let key = oSFolderName.replace(/_|-/g, '');
          key = key[0].toLowerCase() + key.slice(1);
          omniScriptMap[key] = oSFolderName.replace(/_/g, '/');
        }
      }
    }
    return omniScriptMap;
  }

  private async getOrgLWCOSMap(conn: any): Promise<Record<string, string>> {
    let query = 'SELECT %name-space%Type__c, %name-space%SubType__c, %name-space%Language__c FROM %name-space%OmniScript__c WHERE %name-space%IsLwcEnabled__c = true';
    query = AppUtils.replaceaNameSpace(query);
    const omniScriptMap: Record<string, string> = {};
    const result = await conn.query(query);
    if (result.records && result.records.length > 0) {
      for (const resultOmniScript of result.records) {
        const type = resultOmniScript[AppUtils.replaceaNameSpace('%name-space%Type__c')];
        const subType = resultOmniScript[AppUtils.replaceaNameSpace('%name-space%SubType__c')];
        const Language = resultOmniScript[AppUtils.replaceaNameSpace('%name-space%Language__c')];
        const key = type + subType + Language;
        const label = type + '/' + subType + '/' + Language;
        omniScriptMap[key] = label;
      }
    }
    return omniScriptMap;
  }
}
