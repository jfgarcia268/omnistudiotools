import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { AppUtils } from '../../../utils/AppUtils.js';
import fsExtra from 'fs-extra';
import yaml from 'js-yaml';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('omnistudiotools', 'omnistudiotools.copado.copadomanifest');

export default class CopadoManifest extends SfCommand<void> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    package: Flags.string({ char: 'p', summary: messages.getMessage('flags.package.summary'), required: true }),
    username: Flags.string({ char: 'n', summary: messages.getMessage('flags.username.summary') }),
    vlocity: Flags.boolean({ char: 's', summary: messages.getMessage('flags.vlocity.summary') }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(CopadoManifest);
    AppUtils.setCommand(this);
    AppUtils.logInitial('copadomanifest');

    const newFileName = 'CustomMDPreselect.json';
    const packagefile = flags.package;
    let copadoManifest: Record<string, unknown>[];

    AppUtils.log4('Creating Copado User Story Manifest');
    AppUtils.log3('Extracting data from: ' + packagefile);

    if (!flags.vlocity) {
      const doc = fsExtra.readFileSync(packagefile, 'utf8');
      const copadoManifestXML = await AppUtils.extractXML(doc);
      AppUtils.log1('Done');
      AppUtils.log3('Parsing data...');
      copadoManifest = this.parseXML(copadoManifestXML, flags.username);
      AppUtils.log1('Done');
    } else {
      const data = (yaml.load(fsExtra.readFileSync(packagefile, 'utf8')) as any)['manifest'];
      copadoManifest = this.parseXMLVlocity(data, flags.username);
      AppUtils.log1('Done');
      AppUtils.log3('Parsing data...');
    }

    const manifestText = JSON.stringify(copadoManifest);
    AppUtils.log3('Creating File: ' + newFileName);
    this.saveFile(newFileName, manifestText);
  }

  private saveFile(newFileName: string, manifestText: string): void {
    if (fsExtra.existsSync(newFileName)) {
      AppUtils.log1('Deleting Old file...');
      fsExtra.unlinkSync(newFileName);
    }
    fsExtra.writeFileSync(newFileName, manifestText);
    AppUtils.log2('File is created successfully.');
  }

  private getDate(): string {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yyyy = today.getFullYear();
    return yyyy + '/' + mm + '/' + dd;
  }

  private parseXML(data: any, username?: string): Record<string, unknown>[] {
    const user = username ?? 'None';
    const date = this.getDate();
    const copadoManifest: Record<string, unknown>[] = [];
    const mdTypes = data['Package']['types'];
    for (const key in mdTypes) {
      const element = mdTypes[key];
      const mdType = element.name[0];
      AppUtils.log2(mdType + ': ' + Object.keys(element['members']).length);
      for (const key2 in element['members']) {
        const mdname = element['members'][key2];
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

  private parseXMLVlocity(data: any, username?: string): Record<string, unknown>[] {
    const user = username ?? 'None';
    const date = this.getDate();
    const copadoManifest: Record<string, unknown>[] = [];
    for (const key in data) {
      const element = data[key];
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
}
