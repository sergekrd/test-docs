import path from "path";
import fs from "fs";
import { RegexGenerateCertDocHandler } from "./generate/regex/regex-generate-cert.ts";
import { TemplateGenerateCertDocHandler } from "./generate/docx-tempalate/docx-template-cert.ts";
import { ScanCertHandler } from "./scan/cert-recognize.ts";

const template = {
    Boss: 'А. Б. Петров',
    Company: 'ММММ ДДД ЦЦЦЦ',
    RegNomer: '007777777777',
    FullName: 'ФАРИДА АЛИЯ ОТКУРМАТОВНА АЛИЕВА',
    DataSertNow: '02 ноября 2024 года',
    Level: 'РАЗРЕШЕНИЯ НА РАБОТУ ИЛИ ОТДЫХ',
    DataSerTo: '02 ноября 2027 года',
    FullNameLat: 'FARIDA ALIYA OTKURMATOVNA ALIEVA',
    PlaceCity: 'город Москва',
    Jobs: 'ВЕДУЩИЙ СПЕЦИАЛИСТ'
}

function getHandler(handlerType: string) {
    switch (handlerType) {
        case 'regex':
            return new RegexGenerateCertDocHandler();
        case 'template':
            return new TemplateGenerateCertDocHandler();
        case 'scan':
            return new ScanCertHandler();
        default:
            throw new Error(`Unknown handler type: ${handlerType}`);
    }
}

async function main() {
    const handlerType = process.argv.slice(2)[0];

    if (!handlerType) {
        console.error('Please specify a handler type (e.g., "regex", "another", "third")');
        process.exit(1);
    }

    try {
        const handler = getHandler(handlerType);
        if (handlerType === 'scan') {
            const inputDir = path.resolve(__dirname, `../../../../../../serge/Yandex.Disk.localized/Загрузки/OCR_valid/`)
            const jsonOutputPath = path.resolve(__dirname, 'result.json');
            const results: { [key: string]: { error?: string; bsoNumber: string; regNumberRu: string; regNumberEng: string } } = {};
            const files = fs.readdirSync(inputDir);
            let i = 1;
            for (const file of files) {
                let toTest = ''
                toTest = "6734577_image_t0000009347_n1.jpg"
                const inputFilePath = path.resolve(inputDir, toTest ? toTest : file);
                const binaryFile = fs.readFileSync(inputFilePath);

                console.log(`Processing ${i} of ${files.length} document: ${file} with handler: ${handlerType}...`);
                const handler = new ScanCertHandler()
                const scanResults = await handler.handle(binaryFile);
                results[file] = {
                    ...(scanResults.regNumberRu !== scanResults.regNumberEng
                        || !scanResults.bsoNumber
                        || !scanResults.regNumberRu
                        || !scanResults.regNumberEng) ? { error: "+" } : {},
                    bsoNumber: scanResults.bsoNumber,
                    regNumberRu: scanResults.regNumberRu,
                    regNumberEng: scanResults.regNumberEng,
                }
                i += 1;
                fs.writeFileSync(jsonOutputPath, JSON.stringify(results, null, 2));
                console.log(`Results saved to: ${jsonOutputPath}`);
            }

            return
        }
        const inputFile = handlerType === 'regex' ? 'Маска (2)' : 'mask_template'
        // Чтение входного файла
        const inputDocPath = path.resolve(__dirname, `./generate/input/${inputFile}.docx`);
        const outputPath = path.resolve(__dirname, `./generate/output/${handlerType}/output.docx`);
        const inputPath = handlerType === "scan" ? path.resolve(__dirname, `../../../../../../serge/Yandex.Disk.localized/Загрузки/OCR_valid/6701429_image_t0000002375_n1.jpg`) : inputDocPath;
        const binaryFile = fs.readFileSync(inputPath);

        console.log(`Processing the document with handler: ${handlerType}...`);

        const updatedDocx = await handler.handle(binaryFile, template) as Buffer;

        // Сохранение обновленного файла
        fs.writeFileSync(outputPath, updatedDocx);
        console.log('Document processed successfully! Saved to:', outputPath);
    } catch (err) {
        console.error('Error:', err);
    }
}

main().catch((err) => console.error('Unexpected error:', err));