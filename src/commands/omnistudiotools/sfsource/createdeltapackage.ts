import path from 'node:path';
import fsExtra from 'fs-extra';
import { simpleGit as simpleGitInit } from 'simple-git';
import type { DiffResult, SimpleGit } from 'simple-git';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { AppUtils } from '../../../utils/AppUtils.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('omnistudiotools', 'omnistudiotools.sfsource.createdeltapackage');

export default class CreateDeltaPackage extends SfCommand<void> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    'target-org': Flags.requiredOrg(),
    package: Flags.string({ char: 'p', summary: messages.getMessage('flags.package.summary') }),
    sourcefolder: Flags.string({ char: 'd', summary: messages.getMessage('flags.sourcefolder.summary'), required: true }),
    gitcheckkey: Flags.string({ char: 'k', summary: messages.getMessage('flags.gitcheckkey.summary') }),
    gitcheckkeycustom: Flags.string({ char: 'v', summary: messages.getMessage('flags.gitcheckkeycustom.summary') }),
    customsettingobject: Flags.string({ char: 'c', summary: messages.getMessage('flags.customsettingobject.summary') }),
    valuecolumn: Flags.string({ char: 'x', summary: messages.getMessage('flags.valuecolumn.summary') }),
    more: Flags.boolean({ char: 'm', summary: messages.getMessage('flags.more.summary') }),
  };

  public static copyCompleteFolder(sourceFolder: string, deltaPackageFolder: string): void {
    if (fsExtra.existsSync(deltaPackageFolder)) {
      fsExtra.removeSync(deltaPackageFolder);
    }
    fsExtra.mkdirSync(deltaPackageFolder);
    fsExtra.copySync(sourceFolder, deltaPackageFolder);
  }

  public static doDelta(simpleGit: SimpleGit, sourceFolder: string, deltaPackageFolder: string, previousHash: string, verbose?: boolean): void {
    void simpleGit.diffSummary([previousHash, '--no-renames'], (err: Error | null, status: DiffResult) => {
      if (err) {
        throw new Error('Error with GitDiff, Nothing was copied - Error: ' + String(err));
      } else {
        const numOfDiffs = status.files.length;
        if (numOfDiffs > 0) {
          AppUtils.log3('Creating delta Folder: ' + deltaPackageFolder);
          AppUtils.log3('Checking GitDiff.. Deltas: ');
          AppUtils.log2('path.sep: ' + path.sep);
          if (verbose) AppUtils.log1(JSON.stringify(status));

          for (const fileEntry of status.files) {
            if (verbose) AppUtils.log1('File: ' + fileEntry.file);
            const filePath = fileEntry.file;
            if (fsExtra.existsSync(filePath) && filePath.includes(sourceFolder)) {
              AppUtils.log2('Delta File: ' + filePath);
              CreateDeltaPackage.processDeltaFile(filePath, sourceFolder, deltaPackageFolder);
            }
          }
          if (!fsExtra.existsSync(deltaPackageFolder)) {
            AppUtils.log2('No modified files found to copy to the delta folder.. Delta folder was not created');
          }
        } else {
          AppUtils.log2('No Diffs Found');
        }
      }
    });
  }

  private static processDeltaFile(filePath: string, sourceFolder: string, deltaPackageFolder: string): void {
    const newfilePath = filePath.replace(sourceFolder, deltaPackageFolder);
    const splitResult = filePath.split(path.sep);

    if (filePath.includes(path.sep + 'objectTranslations' + path.sep)) {
      const objectTranslationsFolder = filePath.match(/.*\/objectTranslations\/.*?\/.*?/)?.[0];
      if (objectTranslationsFolder) {
        const newCompPath = objectTranslationsFolder.replace(sourceFolder, deltaPackageFolder);
        if (!fsExtra.existsSync(newCompPath)) {
          AppUtils.log1('Moving Complete folder for objectTranslation - ' + newCompPath);
          fsExtra.copySync(objectTranslationsFolder, newCompPath);
        } else {
          AppUtils.log1('Skipped - MetaData already moved: ' + newCompPath);
        }
      }
    } else if (filePath.includes(path.sep + 'staticresources' + path.sep) || filePath.includes(path.sep + 'documents' + path.sep)) {
      CreateDeltaPackage.processStaticOrDocumentFile(filePath, sourceFolder, deltaPackageFolder);
    } else if (filePath.includes(path.sep + 'aura' + path.sep) || filePath.includes(path.sep + 'lwc' + path.sep) || filePath.includes(path.sep + 'experiences' + path.sep)) {
      CreateDeltaPackage.processComponentFile(filePath, sourceFolder, deltaPackageFolder, splitResult);
    } else {
      AppUtils.log1('Moving changed file. New path: ' + newfilePath);
      fsExtra.copySync(filePath, newfilePath);
      if (filePath.includes('-meta.xml') && !filePath.includes('experiences')) {
        const nonMetaFilePath = filePath.substring(0, filePath.length - 9);
        const nonMetaFileNewfilePath = newfilePath.substring(0, newfilePath.length - 9);
        if (fsExtra.existsSync(nonMetaFilePath)) {
          AppUtils.log1('Moving File for Changed Meta. New path: ' + nonMetaFileNewfilePath);
          fsExtra.copySync(nonMetaFilePath, nonMetaFileNewfilePath);
        }
      }
      const metaXMLFile = filePath + '-meta.xml';
      if (fsExtra.existsSync(metaXMLFile)) {
        const newMetaXMLFile = newfilePath + '-meta.xml';
        AppUtils.log1('Moving meta File for changed file. New path: ' + newMetaXMLFile);
        fsExtra.copySync(metaXMLFile, newMetaXMLFile);
      }
    }
  }

  private static processStaticOrDocumentFile(filePath: string, sourceFolder: string, deltaPackageFolder: string): void {
    const folderMatch = filePath.includes(path.sep + 'staticresources' + path.sep) ? /.*\/staticresources\/.*?/ : /.*\/documents\/.*?/;
    const metaEnding = filePath.includes(path.sep + 'staticresources' + path.sep) ? '.resource-meta.xml' : '.documentFolder-meta.xml';
    const newCompPath = filePath.replace(sourceFolder, deltaPackageFolder);
    if (!fsExtra.existsSync(newCompPath)) {
      AppUtils.log1('Looking for Files to move for Change');
      const staticResourceFolder = filePath.match(folderMatch)?.[0] ?? '';
      const mainFileOrfolder = filePath.replace(staticResourceFolder, '').split(path.sep)[0];
      const mainFileOrfolderPath = staticResourceFolder + mainFileOrfolder;
      const stats = fsExtra.statSync(mainFileOrfolderPath);
      if (stats.isDirectory()) {
        const newFoldePath = mainFileOrfolderPath.replace(sourceFolder, deltaPackageFolder);
        if (fsExtra.existsSync(mainFileOrfolderPath)) {
          AppUtils.log1('Moving complete folder: ' + newFoldePath);
          fsExtra.copySync(mainFileOrfolderPath, newFoldePath);
        }
        const metaFileForFolder = mainFileOrfolderPath + metaEnding;
        if (fsExtra.existsSync(metaFileForFolder)) {
          const newMetaFileForFolder = metaFileForFolder.replace(sourceFolder, deltaPackageFolder);
          AppUtils.log1('Moving Meta File: ' + newMetaFileForFolder);
          fsExtra.copySync(metaFileForFolder, newMetaFileForFolder);
        }
      } else {
        const fileNameNoExt = mainFileOrfolder.split('.')[0];
        const filesInDir = fsExtra.readdirSync(staticResourceFolder);
        for (const fileInSR of filesInDir) {
          if (fileInSR.includes(fileNameNoExt)) {
            const pathforFounded = staticResourceFolder + fileInSR;
            const newPathforFounded = pathforFounded.replace(sourceFolder, deltaPackageFolder);
            const statsFounded = fsExtra.statSync(pathforFounded);
            if (statsFounded.isDirectory()) {
              AppUtils.log1('Moving complete folder: ' + newPathforFounded);
            } else {
              AppUtils.log1('Moving File for Change. New path: ' + newPathforFounded);
            }
            fsExtra.copySync(pathforFounded, newPathforFounded);
          }
        }
      }
    } else {
      AppUtils.log1('Skipped - MetaData already moved: ' + newCompPath);
    }
  }

  private static processComponentFile(filePath: string, sourceFolder: string, deltaPackageFolder: string, splitResult: string[]): void {
    if (filePath.includes(path.sep + 'lwc' + path.sep) && filePath.includes('__tests__')) {
      AppUtils.log1("LWC Delta Change ignored... '__tests__' is in the path.");
      return;
    }
    let CompPath: string;
    if (filePath.includes('.site-meta.xml')) {
      CompPath = filePath.substring(0, filePath.length - 14);
      const newMetaFileForSite = filePath.replace(sourceFolder, deltaPackageFolder);
      AppUtils.log1('Moving Meta File for Experience Bundle: ' + newMetaFileForSite);
      fsExtra.copySync(filePath, newMetaFileForSite);
    } else if (filePath.includes(path.sep + 'experiences' + path.sep)) {
      const compFileName = splitResult[splitResult.length - 1];
      const compFileName2 = splitResult[splitResult.length - 2];
      CompPath = filePath.substring(0, filePath.length - compFileName.length - compFileName2.length - 2);
    } else {
      const compFileName = splitResult[splitResult.length - 1];
      CompPath = filePath.substring(0, filePath.length - compFileName.length - 1);
    }

    const newCompPath = CompPath.replace(sourceFolder, deltaPackageFolder);
    if (!fsExtra.existsSync(newCompPath)) {
      AppUtils.log1('Moving Complete folder for changed file... New path: ' + newCompPath);
      fsExtra.copySync(CompPath, newCompPath);
      if (filePath.includes(path.sep + 'experiences' + path.sep)) {
        const CompPathXML = CompPath + '.site-meta.xml';
        const newCompPathXML = newCompPath + '.site-meta.xml';
        if (fsExtra.existsSync(CompPathXML)) {
          AppUtils.log1('Moving Meta File for folder. New path: ' + newCompPathXML);
          fsExtra.copySync(CompPathXML, newCompPathXML);
        }
      }
    } else {
      AppUtils.log1('Skipped - MetaData already moved: ' + newCompPath);
    }
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(CreateDeltaPackage);
    AppUtils.setCommand(this);
    AppUtils.logInitial('deltapackage');

    const packageType = flags.package;
    const sourceFolder = flags.sourcefolder;
    let deployKey = 'VBTDeployKey';
    const gitcheckkeycustom = flags.gitcheckkeycustom;
    const customsettingobject = flags.customsettingobject;
    const valueColumn = flags.valuecolumn;
    const verbose = flags.more;

    if (customsettingobject && !gitcheckkeycustom) {
      throw new Error('Error: -v, --gitcheckkeycustom needs to be passed when using customsettingobject');
    }
    if (gitcheckkeycustom && !customsettingobject) {
      throw new Error('Error: -c, --customsettingobject needs to be passed when using gitcheckkeycustom');
    }
    if (!fsExtra.existsSync(sourceFolder)) {
      throw new Error("Folder '" + sourceFolder + "' not found");
    }

    if (flags.gitcheckkey) {
      deployKey = deployKey + flags.gitcheckkey;
    }

    const deltaPackageFolder = sourceFolder + '_delta';
    const conn = flags['target-org'].getConnection(undefined);

    const nameSpaceSet = await AppUtils.setNameSpace(conn, packageType);
    if (!nameSpaceSet) throw new Error('Error: Package was not set or incorrect was provided.');

    let query: string;
    if (customsettingobject) {
      const valueColumName = valueColumn ?? 'Value__c';
      query = 'SELECT Name, ' + valueColumName + ' FROM ' + customsettingobject + " WHERE Name = '" + gitcheckkeycustom + "'";
    } else if (packageType === 'omnistudio') {
      query = "Select Value from OmniInteractionConfig where DeveloperName = '" + deployKey + "'";
    } else {
      const initialQuery = "SELECT Name, %name-space%Value__c FROM %name-space%GeneralSettings__c WHERE Name = '" + deployKey + "'";
      query = AppUtils.replaceaNameSpace(initialQuery);
    }

    const result = await conn.query<Record<string, unknown>>(query);
    const repoPath = path.normalize('./');
    const simpleGit = simpleGitInit(repoPath);

    if (result.records.length < 1) {
      if (fsExtra.existsSync(deltaPackageFolder)) {
        AppUtils.log2('Old delta folder was found... deleting before creating new delta: ' + deltaPackageFolder);
        fsExtra.removeSync(deltaPackageFolder);
      }
      AppUtils.log3('Hash not found in the environment, Copying full Package...');
      CreateDeltaPackage.copyCompleteFolder(sourceFolder, deltaPackageFolder);
    } else {
      let previousHash: unknown;
      if (customsettingobject) {
        previousHash = result.records[0][AppUtils.replaceaNameSpace(valueColumn ?? 'Value__c')];
      } else if (packageType === 'omnistudio') {
        previousHash = result.records[0]['Value'];
      } else {
        previousHash = result.records[0][AppUtils.replaceaNameSpace('%name-space%Value__c')];
      }

      if (!previousHash) {
        throw new Error('Custom Setting record found but Hash is empty.. Nothing was copied');
      }

      AppUtils.log2('Hash found in the environment: ' + String(previousHash));
      if (fsExtra.existsSync(deltaPackageFolder)) {
        AppUtils.log2('Old delta folder was found... deleting before creating new delta: ' + deltaPackageFolder);
        fsExtra.removeSync(deltaPackageFolder);
      }
      CreateDeltaPackage.doDelta(simpleGit, sourceFolder, deltaPackageFolder, String(previousHash), verbose);
    }
  }
}
