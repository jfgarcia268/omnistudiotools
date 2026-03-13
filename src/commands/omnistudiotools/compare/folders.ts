import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { AppUtils } from '../../../utils/AppUtils.js';
import fs from 'node:fs';
import dircompare from 'dir-compare';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('omnistudiotools', 'omnistudiotools.compare.folders');

export default class CompareFolders extends SfCommand<void> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    folder1: Flags.string({ char: 's', summary: messages.getMessage('flags.folder1.summary'), required: true }),
    folder2: Flags.string({ char: 't', summary: messages.getMessage('flags.folder2.summary'), required: true }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(CompareFolders);
    AppUtils.setCommand(this);
    AppUtils.logInitial('folders');

    const foldera = flags.folder1;
    const folderb = flags.folder2;

    if (!fs.existsSync(foldera)) throw new Error("Folder '" + foldera + "' not found");
    if (!fs.existsSync(folderb)) throw new Error("Folder '" + folderb + "' not found");

    const resultsFile = './Compare_' + foldera + '_' + folderb + '.csv';
    AppUtils.log2('Results File: ' + resultsFile);

    if (fs.existsSync(resultsFile)) fs.unlinkSync(resultsFile);
    const createFiles = fs.createWriteStream(resultsFile, { flags: 'a' });
    const initialHeader = 'VLOCITY_KEY,COMP_TYPE,COMP_NAME,' + foldera + ',' + folderb + ',EQUAL';
    createFiles.write(initialHeader + '\r\n');

    this.compareFoldersImpl(createFiles, foldera, folderb, true);
    this.compareFoldersImpl(createFiles, folderb, foldera, false);
  }

  private compareFoldersImpl(
    createFiles: fs.WriteStream,
    foldera: string,
    folderb: string,
    withDiffs: boolean
  ): void {
    const folders = fs.readdirSync(foldera);
    AppUtils.log2('Finding Differences between ' + foldera + ' and ' + folderb + ' And Orphan Components in ' + foldera);
    for (const FolderLevel1 of folders) {
      const pathLevel1 = foldera + '/' + FolderLevel1;
      if (!FolderLevel1.startsWith('.') && fs.lstatSync(pathLevel1).isDirectory()) {
        AppUtils.log1('Comparing: ' + FolderLevel1);
        const components = fs.readdirSync(pathLevel1);
        for (const component of components) {
          const pathLevel2A = foldera + '/' + FolderLevel1 + '/' + component;
          if (!component.startsWith('.') && fs.lstatSync(pathLevel2A).isDirectory()) {
            const pathLevel2B = folderb + '/' + FolderLevel1 + '/' + component;
            if (!fs.existsSync(pathLevel2B)) {
              let notFoundResult = FolderLevel1 + '/' + component + ',' + FolderLevel1 + ',' + component;
              notFoundResult += withDiffs ? ',Yes,No,N/A' : ',No,Yes,N/A';
              createFiles.write(notFoundResult + '\r\n');
            } else if (withDiffs) {
              const options = { compareContent: true };
              const res = dircompare.compareSync(pathLevel2A, pathLevel2B, options);
              const diff = res.same;
              const foundResult = FolderLevel1 + '/' + component + ',' + FolderLevel1 + ',' + component + ',Yes,Yes,' + diff;
              createFiles.write(foundResult + '\r\n');
            }
          }
        }
      }
    }
  }
}
