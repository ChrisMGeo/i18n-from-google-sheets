#!/usr/bin/env node
import { writeFile, mkdir, PathLike } from "node:fs";
import { dirname, join } from "node:path";
import { google } from "googleapis";
import { Command } from "commander"
import { version } from "../package.json"
type i18nLocale = {
  [key: string]: i18nLocale | string;
};

function setNestedValue(obj: i18nLocale, path: string, value: string): boolean {
  const keys = path.split('.');
  let current = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current)) {
      current[key] = {};
      current = current[key];
    } else {
      if (typeof current[key] !== "string")
        current = current[key];
      else {
        return false;
      }
    }
  }
  current[keys[keys.length - 1]] = value;
  return true;
}
const program = new Command();
program.name("gs2i18n")
  .description("Node.JS program to convert Google Sheets to i18n JSON files")
  .version(version);
program.command("convert").description("Convert Google Sheets to i18n JSON files")
  .argument('<spreadsheetId>', "Spreadsheet ID from url")
  .option("--credentials <credentials>", "Path to credentials", "credentials.json")
  .option("--output <output>", "Output directory", "out")
  .option("--fillEmpty", "If true, empty cells are considered as empty strings in the generated files, otherwise they are undefined.")
  .action((spreadsheetId, options) => {
    action(spreadsheetId, options.credentials, options.output, options.fillEmpty ?? false);
  });
program.parse(process.argv);
async function action(spreadsheetId: string, credentials: string, output: string, allowEmptyCells: boolean) {
  console.log(spreadsheetId, credentials, output, allowEmptyCells);
  const auth = new google.auth.GoogleAuth({
    keyFile: "credentials.json",
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const googleSheets = google.sheets("v4");
  const { data: { sheets } } = await googleSheets.spreadsheets.get({
    auth,
    spreadsheetId,
    fields: "sheets.data.rowData.values.formattedValue",
  });
  let locales: { [key: string]: i18nLocale } = {};
  for (let sheetIndex = 0; sheetIndex < (sheets?.length ?? 0); sheetIndex++) {
    const { data: dataArr } = sheets![sheetIndex];
    if (!dataArr) continue;
    for (let dataIndex = 0; dataIndex < dataArr.length; dataIndex++) {
      const { rowData } = dataArr[dataIndex];
      if (!rowData) continue;
      for (let row = 0; row < rowData.length; row++) {
        const isHeader = row === 0;
        const { values } = rowData[row];
        if (!values) continue;
        let key: string | undefined = undefined;
        for (let col = 0; col < values.length; col++) {
          let { formattedValue } = values[col];
          formattedValue ??= allowEmptyCells ? "" : undefined;
          if (!formattedValue) continue;
          if (isHeader && col !== 0) {
            locales[formattedValue] = {};
          }
          if (isHeader) continue;
          if (col === 0) {
            key = formattedValue;
            continue;
          } else {
            if (!key) continue;
            const locale = Object.keys(locales)[col - 1];
            if (!locale) continue;
            if (key && setNestedValue(locales[locale], key, formattedValue)) {
              console.log(`Set ${key} for ${locale}`);
            } else {
              console.log(`Failed to set ${key} for ${locale}`);
            }
          }
        }
      }
    }
  }
  for (const locale in locales) {
    const outputPath = join(output, `${locale}.json`);
    writeFileRecursive(outputPath, JSON.stringify(locales[locale], null, 2), (err) => {
      if (err) {
        console.error(`Failed to write to ${outputPath}`);
        console.error(err);
      } else {
        console.log(`Wrote to ${outputPath}`);
      }
    });
  }
}

const writeFileRecursive = (path: PathLike, data: string, cb: (err: NodeJS.ErrnoException | null, path?: string) => void) => {
  mkdir(dirname(path.toString()), { recursive: true }, (err) => {
    if (err) return cb(err);
    writeFile(path, data, cb);
  });
};
