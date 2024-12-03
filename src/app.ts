import path from "path";
import fs from "fs";
import { RegexGenerateCertDocHandler } from "./generate/regex/regex-generate-cert.ts";
import { TemplateGenerateCertDocHandler } from "./generate/docx-tempalate/docx-template-cert.ts";
import { ScanCertHandler } from "./scan/cert-recognize_work.ts";
import sharp from "sharp";
import { RecognizeCertHandler } from "./scan/cert-recognize.ts";

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
        case 'collectScan':
            return new RecognizeCertHandler();
        default:
            throw new Error(`Unknown handler type: ${handlerType}`);
    }
}

async function main() {
    const handlerType = process.argv.slice(2)[0];

    if (!handlerType) {
        console.error('Please specify a handler type (e.g., "regex", "template", "collectScan")');
        process.exit(1);
    }

    try {
        const handler = getHandler(handlerType);
        if (handlerType === 'collectScan') {
            const inputDir = path.resolve(__dirname, `../../../../../../serge/Yandex.Disk.localized/Загрузки/OCR_valid/`)
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const jsonOutputPath = path.resolve(__dirname, `../result_stat/result${timestamp}.json`);
            const results: { [key: string]: any } = {};
            const files = fs.readdirSync(inputDir);
            let i = 1;
            for (const file of files) {
                let toTest = ''
                // если нужно проверить конкретный файл
                //    toTest = "6734577_image_t0000009347_n1.jpg"
                const inputFilePath = path.resolve(inputDir, toTest ? toTest : file);
                const binaryFile = fs.readFileSync(inputFilePath);

                let cropped = await cropImage(binaryFile, file)
                console.log(`Processing ${i} of ${files.length} document: ${file} with handler: ${handlerType}...`);
                const handler = new RecognizeCertHandler()
                const startTime = Date.now();
                const collectResults = await handler.handle(cropped, {
                    regNumber: { prefix: '002', length: 12 },
                    bsoNumber: { prefix: '', length: 13 }
                });
                const endTime = Date.now();
                const executionTime = endTime - startTime;
                results[file] = {
                    ...(collectResults?.bsoNumber || collectResults?.regNumber)
                        ? { ...collectResults } : { error: "empty result" },
                    executionTime,
                };
                if (collectResults?.regNumber?.searchRect) {
                    cropped = await drawImage(cropped,  collectResults?.regNumber?.searchRect)
                }
                if (collectResults?.regNumber?.textBox) {
                    cropped = await drawImage(cropped, file, { ...collectResults?.regNumber?.textBox, color: { r: 0, g: 255, b: 0, alpha: 0.5 } })
                }
                if (collectResults?.bsoNumber?.searchRect) {
                    cropped = await drawImage(cropped,  { ...collectResults?.bsoNumber?.searchRect, color: { r: 255, g: 0, b: 0, alpha: 0.5 } })
                }
                if (collectResults?.bsoNumber?.textBox) {
                    cropped = await drawImage(cropped,  { ...collectResults?.bsoNumber?.textBox, color: { r: 0, g: 255, b: 0, alpha: 0.5 } })
                }
                await sharp(cropped).toFile(`./processed_images/${file}`)
                i += 1;
                fs.writeFileSync(jsonOutputPath, JSON.stringify(results, null, 2));
            }

            return
        }
        else if (handlerType === 'scan') {

        }
        else {
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
        }

    } catch (err) {
        console.error('Error:', err);
    }

    async function cropImage(binaryInput: Buffer, filename: string): Promise<Buffer> {
        const image = await sharp(binaryInput).metadata()
        const borderOptions = {
            top: 10,
            bottom: 10,
            left: 10,
            right: 10,
            background: { r: 255, g: 0, b: 0, alpha: 1 }
        };
        const newSharpObject = await sharp(binaryInput)
            .extract({
                left: 0,
                top: Math.round(image.height / 4),
                width: Math.round(image.width / 1.2),
                height: Math.round(image.height / 4)
            }).extend({
                top: borderOptions.top,
                bottom: borderOptions.bottom,
                left: borderOptions.left,
                right: borderOptions.right,
                background: borderOptions.background
            })
        return newSharpObject.toBuffer();
    }


    /**
     * Рисует прямоугольник на изображении и сохраняет результат.
     * @param binaryInput - Входной бинарный буфер изображения.
     * @param filename - Имя файла для сохранения результата.
     * @param rect - Объект с параметрами прямоугольника.
     * @returns Промис с буфером обработанного изображения.
     */
    async function drawImage(
        binaryInput: Buffer,
        rect: { left: number; top: number; width: number; height: number; color?: { r: number; g: number; b: number; alpha: number } }
    ): Promise<Buffer> {
        // Устанавливаем цвет по умолчанию, если он не указан
        const color = rect.color || { r: 255, g: 0, b: 0, alpha: 0.5 };

        // Получение метаданных изображения
        const metadata = await sharp(binaryInput).metadata();
        if (!metadata.width || !metadata.height) {
            throw new Error('Invalid image dimensions');
        }

        // Создание SVG с прямоугольником
        const rectangle = Buffer.from(
            `<svg width="${metadata.width}" height="${metadata.height}">
                <rect x="${rect.left}" y="${rect.top}" width="${rect.width}" height="${rect.height}" fill="rgba(${color.r},${color.g},${color.b},${color.alpha})" />
            </svg>`
        );

        // Обработка изображения
        const resultBuffer = await sharp(binaryInput)
            .composite([{ input: rectangle, blend: 'over' }])
            .toBuffer() // Добавляем прямоугольник

        return resultBuffer;
    }
}

main().catch((err) => console.error('Unexpected error:', err));

