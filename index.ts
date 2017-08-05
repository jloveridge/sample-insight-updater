import * as fs from 'fs';
import * as path from 'path';
import * as request from 'superagent';
import * as yargs from 'yargs';

const VALID_TYPES = ['school', 'section', 'student', 'teacher', 'term'];

function loadFile(filename: string) {
    try {
        if (!filename.endsWith('.json')) {
            throw new Error("Invalid filename: '${filename}'. Must end in '.js'/'.json'.");
        }
        if (!(filename.startsWith(path.sep))) {
            filename = ['.', filename].join(path.sep);
        }
        return require(filename);
    } catch (e) {
        fatal(e.message);
    }
}

function fatal(msg: string) {
    console.error(msg);
    process.exit(1);
}

function updateFailed(idx: number, obj: any): never {
    throw new Error(`\n\nERROR: object (${idx}): ${JSON.stringify(obj, null, '  ')}`)
}

async function processData(creds: Creds, type: string, data: any[], isSingleMode: boolean) {
    const endpoint = isSingleMode ? type : `${type}s`;
    const url = `${creds.url}/api/subscriptions/${creds.subId}/${endpoint}`;
    type = type.toLowerCase();
    if (!VALID_TYPES.includes(type)) {
        throw new Error(`Invalid record type specified: '${type}'`);
    }
    if (isSingleMode) {
        let idx = 0;
        for (const entry of data) {
            Object.keys(entry).forEach(k => {
                // added to correct for term start/end dates having rogue spaces in the value
                if (k.endsWith('_date')) {
                    entry[k] = entry[k].replace(/\s/g, '');
                }
            });
            const response = await (
                request
                    .post(`${url}s/${entry.id}`)
                    .send(entry)
                    .auth('insight', creds.token)
                    .set('Accept', 'application/json')
            ).catch((): never => updateFailed(idx, entry));
            if (!response.ok) {
                updateFailed(idx, entry);
            } else {
                process.stdout.write('.');
            }
            idx++;
        }
        console.log('total processed:', idx);
    } else {
        const response = await (
            request
                .post(url)
                .send(data)
                .auth('insight', creds.token)
                .set('Accept', 'application/json')
        ).catch(() => updateFailed(0, ''));
        if (!response.ok) {
            throw new Error(response.body);
        }
        console.log(response.body);
    }
}

function main() {
    const parsed = yargs.option('s', {
        alias: 'single',
        boolean: true,
        default: false,
        demandOption: true,
        describe: 'single object processing mode',
    }).argv;
    const [credFile, recordType, dataFile] = parsed._;
    if (!(credFile && recordType && dataFile)) {
        fatal(`Usage: ${parsed['$0']} <credentialFile> <recordType> <filename>`);
    }
    const creds: Creds = loadFile(credFile);
    const data: any[] = loadFile(dataFile);
    Promise.resolve(processData(creds, recordType, data, parsed.single).then(() => {
        console.log(`finished processing: ${dataFile}`);
    }).catch(e => {
        fatal(e.message);
    }));
}

interface Creds {
    subId: string;
    token: string;
    url: string;
}

if (!module.parent) {
    main();
}
