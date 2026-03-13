import fs from 'node:fs';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { AppUtils } from '../../../../utils/AppUtils.js';
import Remote from './remote.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('omnistudiotools', 'omnistudiotools.report.dependencies.local');

let dependenciesFound = 0;

export default class Local extends SfCommand<void> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    folder: Flags.string({ char: 'f', summary: messages.getMessage('flags.folder.summary') }),
  };

  private static omniScriptVIPDependencies(
    createFilesStream: fs.WriteStream,
    folder: string,
    dataPackType: string
  ): number {
    AppUtils.log2('');
    AppUtils.log3('Finding Dependencies for ' + dataPackType + ' in ' + folder);
    const dataTypePacksFolder = folder + '/' + dataPackType;
    const folders = fs.readdirSync(dataTypePacksFolder);
    let numberOfDPFound = 0;

    for (const dataPack of folders) {
      const dataPacksFolder = folder + '/' + dataPackType + '/' + dataPack;
      if (fs.statSync(dataPacksFolder).isDirectory()) {
        AppUtils.log2('Finding Dependencies for ' + dataPackType + ': ' + dataPack);
        const files = fs.readdirSync(dataPacksFolder);
        const dataPackMainFile = dataPacksFolder + '/' + dataPack + '_DataPack.json';
        const propertySetFile = dataPacksFolder + '/' + dataPack + '_PropertySet.json';

        if (fs.existsSync(dataPackMainFile)) {
          const jsonString = fs.readFileSync(dataPackMainFile, 'utf8');
          const jsonStringObjects = JSON.parse(jsonString) as Record<string, unknown>;
          const isReusable = jsonStringObjects['%vlocity_namespace%__IsReusable__c'];

          if (fs.existsSync(propertySetFile)) {
            const remoteResult = Remote.getPropertySetValues(
              createFilesStream,
              fs.readFileSync(propertySetFile, 'utf8'),
              dataPackType,
              dataPack,
              isReusable
            );
            dependenciesFound += remoteResult;
          }
          numberOfDPFound++;

          for (const file of files) {
            const filePath = dataPacksFolder + '/' + file;
            if (fs.statSync(filePath).isFile() && file.includes('_Element_')) {
              const elementJson = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
              const propertySet = JSON.stringify(elementJson['%vlocity_namespace%__PropertySet__c']);
              const remoteResult2 = Remote.getPropertySetValues(
                createFilesStream,
                propertySet,
                dataPackType,
                dataPack,
                isReusable
              );
              dependenciesFound += remoteResult2;
            }
          }
        }
      }
    }
    AppUtils.log3('Done finding Dependencies for ' + dataPackType + ' in ' + folder);
    return numberOfDPFound;
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(Local);
    AppUtils.setCommand(this);
    AppUtils.logInitial('local');
    dependenciesFound = 0;

    const folder = flags.folder;
    if (!folder || !fs.existsSync(folder)) throw new Error("Folder '" + String(folder) + "' not found");

    const resultsFile = './Dependencies_Report_Local.csv';
    AppUtils.log2('Results File: ' + resultsFile);
    if (fs.existsSync(resultsFile)) fs.unlinkSync(resultsFile);

    const createFilesStream = fs.createWriteStream(resultsFile, { flags: 'a' });
    createFilesStream.write('DataPack Name,Is Reusable,Dependency,Dependency Type,Remote Class,Remote Method\r\n');

    let numberOfOmniScriptFound = 0;
    const osFolder = folder + '/OmniScript';
    if (fs.existsSync(osFolder)) {
      const files = fs
        .readdirSync(osFolder)
        .filter((file: string) => fs.statSync(osFolder + '/' + file).isDirectory());
      if (files.length > 0) {
        numberOfOmniScriptFound = Local.omniScriptVIPDependencies(createFilesStream, folder, 'OmniScript');
      } else {
        AppUtils.log3('No OmniScripts found in Folder: ' + osFolder);
      }
    } else {
      AppUtils.log3('No OmniScript Folder found in: ' + folder);
    }

    let numberOfIPFound = 0;
    const ipFolder = folder + '/IntegrationProcedure';
    if (fs.existsSync(ipFolder)) {
      const files = fs
        .readdirSync(ipFolder)
        .filter((file: string) => fs.statSync(ipFolder + '/' + file).isDirectory());
      if (files.length > 0) {
        numberOfIPFound = Local.omniScriptVIPDependencies(createFilesStream, folder, 'IntegrationProcedure');
      } else {
        AppUtils.log3('No IntegrationProcedures found in Folder: ' + ipFolder);
      }
    } else {
      AppUtils.log3('No IntegrationProcedures Folder found in: ' + folder);
    }

    AppUtils.log2('');
    AppUtils.log3('Done Finding Dependencies');
    AppUtils.log3('Number of OmniScripts Scanned: ' + String(numberOfOmniScriptFound));
    AppUtils.log3('Number of IntegrationProcedures Scanned: ' + String(numberOfIPFound));
    AppUtils.log3('Number of Total Dependencies Found: ' + String(dependenciesFound));
    AppUtils.log3('CSV File Generated: ' + resultsFile);
    AppUtils.log2('');
  }
}
