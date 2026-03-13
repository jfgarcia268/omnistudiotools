import fs from 'node:fs';
import path from 'node:path';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import dircompare from 'dir-compare';
import { AppUtils } from '../../../utils/AppUtils.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('omnistudiotools', 'omnistudiotools.compare.packages');

export default class ComparePackages extends SfCommand<void> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    folder1: Flags.string({ char: 's', summary: messages.getMessage('flags.folder1.summary'), required: true }),
    folder2: Flags.string({ char: 't', summary: messages.getMessage('flags.folder2.summary'), required: true }),
  };

  private static compareFoldersImpl(foldera: string, folderb: string, resultData: Array<Record<string, unknown>>): void {
    AppUtils.log3('Finding Overlap between ' + foldera + ' and ' + folderb);
    const firstLevelFolder = fs.readdirSync(foldera);
    for (const folder1 of firstLevelFolder) {
      const secondLevelFolderPath = foldera + path.sep + folder1;
      const stats1 = fs.lstatSync(secondLevelFolderPath);
      if (stats1.isDirectory()) {
        const secondLevelFolder = fs.readdirSync(secondLevelFolderPath);
        AppUtils.log2('Finding Overlap For: ' + folder1);
        for (const folders2 of secondLevelFolder) {
          const pathLevel2A = foldera + path.sep + folder1 + path.sep + folders2;
          const pathLevel2B = folderb + path.sep + folder1 + path.sep + folders2;
          if (fs.lstatSync(pathLevel2A).isDirectory() && fs.existsSync(pathLevel2B)) {
            const DPKey = folder1 + '/' + folders2;
            AppUtils.log1('Overlap - Key: ' + DPKey);
            const options = { compareContent: true };
            const res = dircompare.compareSync(pathLevel2A, pathLevel2B, options);
            const diff = res.same ? 'No' : 'Yes';
            resultData.push({ DatapackType: folder1, DatapackKey: DPKey, Diff: diff });
          }
        }
      }
    }
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(ComparePackages);
    AppUtils.setCommand(this);
    AppUtils.logInitial('packages');

    const foldera = flags.folder1;
    const folderb = flags.folder2;

    if (!fs.existsSync(foldera)) throw new Error("Folder '" + foldera + "' not found");
    if (!fs.existsSync(folderb)) throw new Error("Folder '" + folderb + "' not found");

    const resultData: Array<Record<string, unknown>> = [];

    try {
      ComparePackages.compareFoldersImpl(foldera, folderb, resultData);
    } catch (error: unknown) {
      AppUtils.log2(String(error));
    }

    if (resultData.length > 0) {
      this.log(' ');
      this.log('OVERLAP RESULTS:');
      this.log(' ');
      AppUtils.table(resultData, ['DatapackType', 'DatapackKey', 'Diff']);
      this.log(' ');
      throw new Error('Overlap was Found - Number of common components: ' + resultData.length);
    } else {
      AppUtils.log3('Success - No Overlap between ' + foldera + ' and ' + folderb);
    }
  }
}
