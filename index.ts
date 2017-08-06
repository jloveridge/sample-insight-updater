import * as fs from 'fs';
import * as path from 'path';
import * as request from 'superagent';
import * as yargs from 'yargs';

const DEFAULT_BATCH_SIZE = 200;
const VALID_TYPES = ['school', 'section', 'student', 'teacher', 'term'];

/**
 * Output progress indicator.
 */
function displayProgress() {
    process.stdout.write('.');
}

/**
 * Output error message and terminate process.
 * @param msg message to print before terminating process
 */
function fatal(msg: string) {
    console.error(msg);
    process.exit(1);
}

/**
 * Loads a file and returns the contents.
 * @param filename file to load
 */
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

/**
 * Loads credentials and data file then returns the requsite data from
 * each.
 * @param opts sync options
 */
function loadFiles(opts: SyncOpts) {
    const creds: Creds = loadFile(opts.creds);
    const data: any[] = loadFile(opts.data);
    const url = `${creds.url}/api/subscriptions/${creds.subId}/${opts.type}s`;
    return {
        data: data,
        subId: creds.subId,
        token: creds.token,
        url,
    };
}

/**
 * Submit some data to GradeCam for processing.
 * @param data data to submit
 * @param token API token
 * @param url API endpoint
 */
async function submit(data: any, token: string, url: string) {
    const response = await (
        request
            .post(url)
            .send(data)
            .auth('insight', token)
            .set('Accept', 'application/json')
    );
    if (!response.ok) {
        throw new Error(response.body);
    }
    return response.body;
}

/**
 * Submit the data in batches
 * @param opts sync options
 */
async function submitBatches(opts: SyncOpts) {
    const {data, token, url} = loadFiles(opts);
    let index = 0;
    let numBatches = 0;
    let batch: any;
    let results: any = {};
    let processed = 0;
    const total = data.length;
    console.log('Total objects:', total, 'sending in batches of:', opts.batchSize);
    try {
        if (opts.batchSize == 1) {
            for (const obj of data) {
                batch = obj;
                await submit(obj, token, `${url}/${encodeURIComponent(obj.id)}`);
                displayProgress();
                index++;
                numBatches++;
                processed++;
            }
            return '';
        } else {
            while ((batch = data.slice(index, index + opts.batchSize)).length) {
                const batchResult = await submit(batch, token, url);
                let batchTotal = 0;
                Object.keys(batchResult).forEach(key => {
                    results[key] = (results[key] || 0) + batchResult[key];
                    batchTotal += batchResult[key];
                });
                displayProgress();
                index += opts.batchSize;
                numBatches++;
                processed += batchTotal;
            }
            return results;
        }
    } catch (e) {
        console.error('\n\nERROR:', e.message);
        if (opts.batchSize != 1) {
            console.log(results);
        }
        throw new Error(`failed at index ${index}, data: ${JSON.stringify(batch, null, '  ')}`);
    } finally {
        console.log(`\nProcessed ${processed}/${total} in ${numBatches} batches.`);
    }
}

/**
 * Submit data in a single POST
 * @param opts sync options
 */
async function submitData(opts: SyncOpts) {
    const {data, token, url} = loadFiles(opts);
    const total = data.length;
    console.log('Submitting', total, 'objects all at once.')
    return await submit(data, token, url);
}

/**
 * Sync data to remote system.
 * @param opts sync opts
 */
async function syncData(opts: SyncOpts) {
    if (!opts.batchSize) {
        return await submitData(opts);
    } else {
        return await submitBatches(opts);
    }
}


export async function main() {
    const parsed = yargs
        .option('batch-size', {
            alias: 'b',
            default: DEFAULT_BATCH_SIZE,
            describe: 'batch size (0: entire file)',
            type: 'number',
        })
        .option('creds', {
            alias: 'c',
            demandOption: true,
            description: 'credentials file',
            type: 'string',
        })
        .option('file', {
            alias: 'f',
            demandOption: true,
            description: 'data file',
            type: 'string',
        })
        .option('type', {
            alias: 't',
            choices: VALID_TYPES,
            demandOption: true,
            description: 'object type',
            type: 'string',
        })
        .usage(`Usage: $0 [-b number] -c credFile -f dataFile -t type`)
        .help()
        .argv;
    const opts: SyncOpts = {
        batchSize: parsed.batchSize,
        creds: parsed.creds,
        data: parsed.file,
        type: parsed.type.toLowerCase(),
    };
    const start = Date.now();
    try {
        const results = await syncData(opts);
        if (results) {
            console.log(results);
        }
        console.log(`elapsed: ${(Date.now() - start)/1000}s`);
    } catch (e) {
        console.log(`elapsed: ${(Date.now() - start)/1000}s`);
        fatal(e.message);
    }
}

interface Creds {
    subId: string;
    token: string;
    url: string;
}

interface SyncOpts {
    creds: string;
    data: string;
    type: string;
    batchSize: number;
}

if (!module.parent) {
    main();
}
