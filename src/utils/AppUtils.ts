import { createRequire } from 'node:module';
import xml2js from 'xml2js';
import type { Connection } from '@salesforce/core';

const require = createRequire(import.meta.url);
const packageJson = require('../../package.json') as { version: string };

export type SfConnection = Connection;

type SpinnerCmd = {
  spinner: {
    status: string | undefined;
    start(msg: string): void;
    stop(msg?: string): void;
  };
  log(msg: string): void;
}

export class AppUtils {
  public static appVersion: string = packageJson.version;
  public static namespace: string;
  private static cmd: SpinnerCmd | undefined;

  public static setCommand(cmd: SpinnerCmd): void {
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

  public static async setNameSpace(conn: SfConnection, packageType: string | undefined): Promise<string> {
    if (packageType === 'cmt') {
      AppUtils.namespace = 'vlocity_cmt__';
    } else if (packageType === 'ins') {
      AppUtils.namespace = 'vlocity_ins__';
    } else if (packageType === 'omnistudio') {
      AppUtils.namespace = 'omnistudio__';
    } else if (!packageType) {
      const query = "Select Name, NamespacePrefix from ApexClass where Name = 'DRDataPackService'";
      const result = await conn.query<{ NamespacePrefix: string }>(query);
      const nameSpaceResult = result.records[0].NamespacePrefix;
      if (nameSpaceResult) {
        this.namespace = nameSpaceResult + '__';
      }
    }
    return this.namespace;
  }

  public static async runApex(conn: SfConnection, apexBody: string): Promise<{ success: boolean; compiled: boolean }> {
    return conn.tooling.executeAnonymous(apexBody);
  }

  public static logInitial(command: string): void {
    this.logStyledHeader(' >>>> OmniStudio Tools v' + AppUtils.appVersion + ' <<<<');
    this.log3('Command: ' + command);
  }

  public static logInitialExtra(conn: SfConnection): void {
    this.log3('Username: ' + conn.getUsername());
    this.log3('LoginUrl: ' + String(conn.loginUrl));
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

  public static getDataByPath(data: Record<string, unknown>, pathStr: string): unknown {
    try {
      const pathArray = pathStr.split('.');
      let current: unknown = data;
      for (const key of pathArray) {
        current = (current as Record<string, unknown>)[key];
      }
      return current;
    } catch {
      return undefined;
    }
  }

  public static sleep(seconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  }

  public static extractXML(xml: string): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      xml2js.parseString(xml, (err: Error | null, result: Record<string, unknown>) => {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      });
    });
  }

  public static table(data: Array<Record<string, unknown>>, columns: string[]): void {
    if (data.length === 0) return;
    const header = columns.join(' | ');
    AppUtils.logStyledHeader(header);
    AppUtils.logStyledHeader(columns.map((c) => '-'.repeat(c.length)).join(' | '));
    for (const row of data) {
      const line = columns.map((c) => String(row[c] ?? '')).join(' | ');
      AppUtils.logStyledHeader(line);
    }
  }

  private static log(message: string): void {
    if (this.cmd) {
      this.cmd.log(message);
    } else {
      AppUtils.logStyledHeader(message);
    }
  }

  private static logStyledHeader(message: string): void {
    // eslint-disable-next-line no-console
    console.log(message);
  }
}
