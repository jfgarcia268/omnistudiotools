import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { AppUtils } from '../../../utils/AppUtils.js';
import CreateDeltaPackage from './createdeltapackage.js';
import fsExtra from 'fs-extra';
import path from 'node:path';
import { simpleGit as simpleGitInit } from 'simple-git';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('omnistudiotools', 'omnistudiotools.sfsource.createdeltapackagelocal');

export default class CreateDeltaPackageLocal extends SfCommand<void> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    sourcefolder: Flags.string({ char: 'd', summary: messages.getMessage('flags.sourcefolder.summary'), required: true }),
    hash: Flags.string({ char: 'h', summary: messages.getMessage('flags.hash.summary') }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(CreateDeltaPackageLocal);
    AppUtils.setCommand(this);
    AppUtils.logInitial('createdeltapackagelocal');

    const hash = flags.hash;
    const sourceFolder = flags.sourcefolder;
    const deltaPackageFolder = sourceFolder + '_delta';

    if (!fsExtra.existsSync(sourceFolder)) throw new Error("Folder '" + sourceFolder + "' not found");

    const repoPath = path.normalize('./');
    const simpleGit = simpleGitInit(repoPath);

    AppUtils.log2('Hash: ' + hash);
    if (fsExtra.existsSync(deltaPackageFolder)) {
      AppUtils.log2('Old delta folder was found... deleting before creating new delta: ' + deltaPackageFolder);
      fsExtra.removeSync(deltaPackageFolder);
    }
    CreateDeltaPackage.doDelta(simpleGit, sourceFolder, deltaPackageFolder, hash!, false);
  }
}
