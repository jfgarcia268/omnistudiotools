import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { AppUtils } from '../../../utils/AppUtils.js';
import fsExtra from 'fs-extra';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('omnistudiotools', 'omnistudiotools.copado.copadolist');

export default class CopadoList extends SfCommand<void> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    manifest: Flags.string({ char: 'm', summary: messages.getMessage('flags.manifest.summary'), required: true }),
    username: Flags.string({ char: 'n', summary: messages.getMessage('flags.username.summary') }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(CopadoList);
    AppUtils.setCommand(this);
    AppUtils.logInitial('copadolist');

    const newFileName = 'CustomMDPreselect.json';
    const packagefile = flags.manifest;

    AppUtils.log4('Creating Copado User Story Manifest');
    AppUtils.log3('Extracting data from: ' + packagefile);
    const doc = fsExtra.readFileSync(packagefile, 'utf8');
    const lines = doc.split(/\r?\n/);
    AppUtils.log1('Done');
    AppUtils.log3('Parsing data...');
    const copadoManifest = this.parseLines(lines, flags.username);
    AppUtils.log2('Done');
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

  private parseLines(data: string[], username?: string): Record<string, unknown>[] {
    const user = username ?? 'None';
    const date = this.getDate();
    const copadoManifest: Record<string, unknown>[] = [];
    for (const line of data) {
      if (!line.trim()) continue;
      const [mdType, ...rest] = line.split('.');
      const mdname = rest.join('.');
      AppUtils.log1(mdType + ' - ' + mdname);
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
    return copadoManifest;
  }
}
