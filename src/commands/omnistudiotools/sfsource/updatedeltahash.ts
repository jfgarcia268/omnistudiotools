import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { AppUtils } from '../../../utils/AppUtils.js';
import { execSync } from 'node:child_process';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('omnistudiotools', 'omnistudiotools.sfsource.updatedeltahash');

export default class UpdateDeltaHash extends SfCommand<void> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    'target-org': Flags.requiredOrg(),
    gitcheckkeycustom: Flags.string({ char: 'v', summary: messages.getMessage('flags.gitcheckkeycustom.summary') }),
    customsettingobject: Flags.string({ char: 'c', summary: messages.getMessage('flags.customsettingobject.summary') }),
    valuecolumn: Flags.string({ char: 'a', summary: messages.getMessage('flags.valuecolumn.summary') }),
    customhash: Flags.string({ char: 'h', summary: messages.getMessage('flags.customhash.summary') }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(UpdateDeltaHash);
    AppUtils.setCommand(this);
    AppUtils.logInitial('updatedeltahash');

    const gitcheckkeycustom = flags.gitcheckkeycustom;
    const customsettingobject = flags.customsettingobject;

    let hashToUpdate: string;
    let fieldname: string;

    if (flags.customhash) {
      hashToUpdate = flags.customhash;
      AppUtils.log2('Updating Hash using argument: ' + hashToUpdate);
    } else {
      hashToUpdate = execSync('git rev-parse HEAD').toString().trim();
      AppUtils.log2('Updating Hash using Current HEAD: ' + hashToUpdate);
    }

    if (flags.valuecolumn) {
      fieldname = flags.valuecolumn;
    } else if (customsettingobject && customsettingobject.indexOf('vlocity_cmt') >= 0) {
      fieldname = 'vlocity_cmt__Value__c';
    } else {
      fieldname = 'Value__c';
    }

    const conn = flags['target-org'].getConnection(undefined);
    AppUtils.log2('FieldName Updated as: ' + fieldname);
    UpdateDeltaHash.upsertRecord(conn, gitcheckkeycustom!, customsettingobject!, hashToUpdate, fieldname);
  }

  static upsertRecord(conn: any, gitcheckkeycustom: string, customsettingobject: string, hashToUpdate: string, fieldname: string): void {
    const settings: Record<string, string> = {};
    settings['Name'] = gitcheckkeycustom;
    settings[fieldname] = hashToUpdate + '';
    conn.sobject(customsettingobject).upsert(settings, 'Name', (err: any, ret: any) => {
      if (err || !ret.success) {
        throw new Error('Error Upserting Record: ' + err);
      }
      AppUtils.log2('Hash Upserted Successfully: ' + hashToUpdate);
    });
  }
}
