import * as fs from 'fs';
import * as path from 'path';
import * as yargs from 'yargs';

function combineFiles(inDir: string, outDir: string) {
    const filenames = (fs.readdirSync(inDir)).sort();
    let data: any[] = [];
    let dataFile: string = '';
    const writeFile = () => {
        if (!(dataFile && data.length)) { return; }
        const outFile = path.resolve(outDir, `${dataFile}s.json`);
        fs.writeFileSync(outFile, JSON.stringify(data, null, 2));
        data = [];
        dataFile = '';
    };
    for (const filename of filenames) {
        const ext = path.extname(filename).toLowerCase();
        if (ext !== '.json') { continue; }
        if (!dataFile || !filename.startsWith(dataFile)) {
            writeFile();
            if (filename.startsWith('section')) {
                dataFile = 'section';
            } else if (filename.startsWith('student')) {
                dataFile = 'student';
            } else if (filename.startsWith('teacher')) {
                dataFile = 'teacher';
            }
        }
        const inFile = path.resolve(inDir, filename);
        // ts-node:disable-next-line
        const dat = require(inFile);
        for (const item of dat) {
            data.push(item);
        }
    }
    writeFile();
}

export function main() {
    const argv = yargs
        .usage('Usage: $0 <inDir> <outDir>')
        .demandCommand(2, 'input and output directories must be provided')
        .help()
        .argv;
    combineFiles(argv._[0], argv._[1]);
}

if (!module.parent) {
    main();
}
