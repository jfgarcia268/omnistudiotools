import fsExtra from 'fs-extra';
import yaml from 'js-yaml';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { AppUtils } from '../../../utils/AppUtils.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('omnistudiotools', 'omnistudiotools.copado.copadomanifest');

type MdType = {
  name: string[];
  members: string[];
};

type PackageXml = {
  Package: {
    types: MdType[];
  };
};

type YamlManifest = {
  manifest: string[];
};

export default class CopadoManifest extends SfCommand<void> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    package: Flags.string({ char: 'p', summary: messages.getMessage('flags.package.summary'), required: true }),
    username: Flags.string({ char: 'n', summary: messages.getMessage('flags.username.summary') }),
    vlocity: Flags.boolean({ char: 's', summary: messages.getMessage('flags.vlocity.summary') }),
  };

  private static saveFile(newFileName: string, manifestText: string): void {
    if (fsExtra.existsSync(newFileName)) {
      AppUtils.log1('Deleting Old file...');
      fsExtra.unlinkSync(newFileName);
    }
    fsExtra.writeFileSync(newFileName, manifestText);
    AppUtils.log2('File is created successfully.');
  }

  private static getDate(): string {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yyyy = today.getFullYear();
    return String(yyyy) + '/' + mm + '/' + dd;
  }

  private static parseXML(data: Record<string, unknown>, username?: string): Array<Record<string, unknown>> {
    const user = username ?? 'None';
    const date = CopadoManifest.getDate();
    const copadoManifest: Array<Record<string, unknown>> = [];
    const packageData = data as unknown as PackageXml;
    const mdTypes = packageData.Package.types;
    for (const element of mdTypes) {
      const mdType = element.name[0];
      AppUtils.log2(mdType + ': ' + String(Object.keys(element.members).length));
      for (const mdname of element.members) {
        copadoManifest.push({
          t: mdType,
          n: mdname,
          b: user,
          d: date,
          cb: user,
          cd: date,
          r: false,
        });
      }
    }
    return copadoManifest;
  }

  private static parseXMLVlocity(data: string[], username?: string): Array<Record<string, unknown>> {
    const user = username ?? 'None';
    const date = CopadoManifest.getDate();
    const copadoManifest: Array<Record<string, unknown>> = [];
    for (const element of data) {
      const words = element.split('/');
      const type = words[0];
      const name = words[1];
      copadoManifest.push({
        t: type,
        n: name,
        b: user,
        d: date,
        cb: user,
        cd: date,
        r: false,
        vk: element,
      });
    }
    return copadoManifest;
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(CopadoManifest);
    AppUtils.setCommand(this);
    AppUtils.logInitial('copadomanifest');

    const newFileName = 'CustomMDPreselect.json';
    const packagefile = flags.package;
    let copadoManifest: Array<Record<string, unknown>>;

    AppUtils.log4('Creating Copado User Story Manifest');
    AppUtils.log3('Extracting data from: ' + packagefile);

    if (!flags.vlocity) {
      const doc = fsExtra.readFileSync(packagefile, 'utf8');
      const copadoManifestXML = await AppUtils.extractXML(doc);
      AppUtils.log1('Done');
      AppUtils.log3('Parsing data...');
      copadoManifest = CopadoManifest.parseXML(copadoManifestXML, flags.username);
      AppUtils.log1('Done');
    } else {
      const yamlDoc = yaml.load(fsExtra.readFileSync(packagefile, 'utf8')) as YamlManifest;
      copadoManifest = CopadoManifest.parseXMLVlocity(yamlDoc.manifest, flags.username);
      AppUtils.log1('Done');
      AppUtils.log3('Parsing data...');
    }

    const manifestText = JSON.stringify(copadoManifest);
    AppUtils.log3('Creating File: ' + newFileName);
    CopadoManifest.saveFile(newFileName, manifestText);
  }
}
