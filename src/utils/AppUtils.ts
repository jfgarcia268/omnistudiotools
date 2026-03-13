import xml2js from 'xml2js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const packageJson = require('../../package.json') as { version: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CommandRef = any;

export class AppUtils {
  public static appVersion: string = packageJson.version;
  public static namespace: string;
  private static cmd: CommandRef | undefined;

  public static setCommand(cmd: CommandRef): void {
    this.cmd = cmd;
  }

  public static replaceaNameSpace(text: string): string {
    return text.replace(new RegExp('%name-space%', 'g'), this.namespace);
  }

  public static replaceaNameSpaceFromFile(text: string): string {
    return text.replace(new RegExp('namespace__', 'g'), this.namespace);
  }

  public static replaceaNameSpaceFromFileArray(array: string[]): string[] {
    const newArray: string[] = [];
    for (const element of array) {
      newArray.push(this.replaceaNameSpaceFromFile(element));
    }
    return newArray;
  }

  public static async setNameSpace(conn: any, packageType: string | undefined): Promise<string> {
    if (packageType === 'cmt') {
      AppUtils.namespace = 'vlocity_cmt__';
    } else if (packageType === 'ins') {
      AppUtils.namespace = 'vlocity_ins__';
    } else if (packageType === 'omnistudio') {
      AppUtils.namespace = 'omnistudio__';
    } else if (!packageType) {
      const query = "Select Name, NamespacePrefix from ApexClass where Name = 'DRDataPackService'";
      const result = await conn.query(query);
      const nameSpaceResult = result.records[0].NamespacePrefix;
      if (nameSpaceResult) {
        this.namespace = nameSpaceResult + '__';
      }
    }
    return this.namespace;
  }

  public static async runApex(conn: any, apexBody: string): Promise<any> {
    const res = await conn.tooling.executeAnonymous(apexBody);
    return res;
  }

  public static logInitial(command: string): void {
    this.logStyledHeader(' >>>> OmniStudio Tools v' + AppUtils.appVersion + ' <<<<');
    this.log3('Command: ' + command);
  }

  public static logInitialExtra(conn: any): void {
    this.log3('Username: ' + conn.getUsername());
    this.log3('LoginUrl: ' + conn.getAuthInfoFields().loginUrl);
  }

  public static log4(message: string): void {
    this.logStyledHeader(' >>>> ' + message);
  }

  public static log3(message: string): void {
    this.log('  >>> ' + message);
  }

  public static log2(message: string): void {
    this.log('   >> ' + message);
  }

  public static log1(message: string): void {
    this.log('    > ' + message);
  }

  public static startSpinner(message: string): void {
    if (this.cmd) {
      this.cmd.spinner.start('   >> ' + message);
    }
  }

  public static stopSpinnerMessage(message: string): void {
    if (this.cmd) {
      this.cmd.spinner.stop(message);
    }
  }

  public static stopSpinner(): void {
    if (this.cmd) {
      this.cmd.spinner.stop();
    }
  }

  public static updateSpinnerMessage(message: string): void {
    if (this.cmd) {
      this.cmd.spinner.status = message;
    }
  }

  private static log(message: string): void {
    if (this.cmd) {
      this.cmd.log(message);
    } else {
      console.log(message);
    }
  }

  private static logStyledHeader(message: string): void {
    console.log(message);
  }

  public static getDataByPath(data: any, pathStr: string): any {
    try {
      const pathArray = pathStr.split('.');
      let current = data;
      for (const key of pathArray) {
        current = current[key];
      }
      return current;
    } catch {
      return undefined;
    }
  }

  public static sleep(seconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  }

  public static extractXML(xml: string): Promise<any> {
    return new Promise((resolve, reject) => {
      xml2js.parseString(xml, (err: any, result: any) => {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      });
    });
  }

  public static table(data: any[], columns: string[]): void {
    if (data.length === 0) return;
    const header = columns.join(' | ');
    console.log(header);
    console.log(columns.map((c) => '-'.repeat(c.length)).join(' | '));
    for (const row of data) {
      const line = columns.map((c) => String(row[c] ?? '')).join(' | ');
      console.log(line);
    }
  }
}
