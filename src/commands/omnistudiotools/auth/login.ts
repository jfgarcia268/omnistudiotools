import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { AuthInfo, Messages } from '@salesforce/core';
import { AppUtils } from '../../../utils/AppUtils.js';
import jsforce from 'jsforce';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('omnistudiotools', 'omnistudiotools.auth.login');

export default class Login extends SfCommand<void> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    username: Flags.string({ char: 'u', summary: messages.getMessage('flags.username.summary'), required: true }),
    password: Flags.string({ char: 'p', summary: messages.getMessage('flags.password.summary'), required: true }),
    token: Flags.string({ char: 't', summary: messages.getMessage('flags.token.summary') }),
    url: Flags.string({ char: 'l', summary: messages.getMessage('flags.url.summary') }),
    alias: Flags.string({ char: 'a', summary: messages.getMessage('flags.alias.summary'), required: true }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(Login);
    AppUtils.setCommand(this);
    AppUtils.logInitial('login');

    const username = flags.username;
    const password = flags.password;
    const token = flags.token;
    const url = flags.url;
    const alias = flags.alias;

    const loginURL = url ?? 'https://login.salesforce.com';
    const pass = token ? password + token : password;

    AppUtils.log3('Creating Alias:');
    AppUtils.log1('Username: ' + username);
    AppUtils.log1('Alias: ' + alias);
    AppUtils.log1('Url: ' + loginURL);

    AppUtils.startSpinner('Connecting To: ' + username);
    const conn = new jsforce.Connection({ loginUrl: loginURL });
    await conn.login(username, pass);
    AppUtils.stopSpinnerMessage('Successfully connected...');

    AppUtils.log2('Creating Alias: ' + alias);
    const accessTokenOptions: AuthInfo.Options['accessTokenOptions'] = {
      accessToken: conn.accessToken!,
      instanceUrl: conn.instanceUrl!,
      loginUrl: loginURL,
    };

    const auth = await AuthInfo.create({ username, accessTokenOptions });
    await auth.save();

    const aliases = await AuthInfo.listAllAuthorizations();
    this.log('Auth entries: ' + aliases.length);

    AppUtils.log2("Successfully created Alias '" + alias + "' for Username: " + username);
    AppUtils.log2('Note: Use "sf alias set ' + alias + '=' + username + '" to set the alias.');
  }
}
