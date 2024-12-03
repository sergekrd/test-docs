import { createWorker, OEM, PSM } from "tesseract.js";

type Rectangle = {
    left: number;
    top: number;
    width: number;
    height: number;
};

type ScanResult = {
    bsoNumber: string;
    regNumberRu?: string;
    regNumberEng: string;
};

export class ScanCertHandler {
    private readonly engWhitelist = "0123456789";
    private readonly rectangle: Rectangle = {
        left: 100,
        top: 1000,
        width: 1100,
        height: 1000,
    };

    private readonly regNoRectWithSign: Rectangle = {
        "left": 100,
        "top": 1195,
        "width": 2500,
        "height": 320
    };

    private readonly regNoRect: Rectangle = {
        "left": 1400,
        "top": 1195,
        "width": 1000,
        "height": 320
    };
    private readonly bsoNoRect: Rectangle = {
        "left": 250,
        "top": 400,
        "width": 700,
        "height": 150
    };
    /**
     * Главный метод обработки изображения.
     * @param imageBuffer - Буфер изображения для обработки.
     * @returns Результат распознавания: номера БСО и регистрационный номер.
     */
    async handle(imageBuffer: Buffer, rules: { regNumber: { length: number, prefix: string } }): Promise<ScanResult> {
        try {
            const [strNumbers/* , regNumber */] = await Promise.all([
                this.scanNumbers(imageBuffer),
                //  this.scanRegNumber(imageBuffer),
            ]);
            await this.scanRegNumber(imageBuffer)
            /*   if (strNumbers[1] !== regNumber) {
                  console.log(`RegNumber mismatch. firstWay=${regNumber}, secondWay=${strNumbers[1]}`)
              } */
            return {
                bsoNumber: strNumbers[0],
                //  regNumberRu: regNumber,
                regNumberEng: strNumbers[1],
            };
        } catch (error) {
            console.error("Ошибка при распознавании текста:", error);
            throw new Error("Failed to recognize text.");
        }
    }

    async collectBoxCollection(imageBuffer: Buffer): Promise<any> {
        try {
            //     return  await this.scanRegNumber(imageBuffer)
            //  const reg = await this.scanRegNumberByRect(imageBuffer)
            const bso = await this.scanBsoNumberByRect(imageBuffer)
            /*   if (strNumbers[1] !== regNumber) {
                  console.log(`RegNumber mismatch. firstWay=${regNumber}, secondWay=${strNumbers[1]}`)
              } */
            return bso
            return {
                bsoNumber: strNumbers[0],
                //  regNumberRu: regNumber,
                regNumberEng: strNumbers[1],
            };
        } catch (error) {
            console.error("Ошибка при распознавании текста:", error);
            throw new Error("Failed to recognize text.");
        }
    }

    /**
     * Распознает номера БСО и Регистрационный.
     * @param imageBuffer - Буфер изображения для обработки.
     * @returns Массив чисел, извлеченных из указанных областей.
     */
    private async scanNumbers(imageBuffer: Buffer): Promise<string[]> {
        const worker = await this.createTesseractWorker("eng", this.engWhitelist);


        const { data } = await worker.recognize(imageBuffer, { rotateAuto: true, rectangle: this.rectangle });
        console.log(`lines: ${data.lines.length}`)
        const extractedNumbers = this.parseLines(data.text);
        const t = extractedNumbers.reduce((acc: string[], item) => {
            const value = this.extractValidStringNumbers(item);
            if (value) acc.push(value);
            return acc;
        }, []);
        await worker.terminate();
        return t;
    }

    /**
     * Распознает регистрационный номер, используя область поиска и русский язык.
     * @param imageBuffer - Буфер изображения для обработки.
     * @returns Регистрационный номер, если найден, иначе null.
     */
    private async scanRegNumber(imageBuffer: Buffer): Promise<any> {

        const worker = await this.createTesseractWorker("rus");
        const { data } = await worker.recognize(imageBuffer, { rotateAuto: true, rectangle: this.regNoRect });

        await worker.terminate();

        if (data.lines.length) {
            const line = this.findRegNumberLine(data.lines)
            if (!line?.text) return "";
            return { regNo: this.clearRegString(line.text), rect: this.transformToRectangle(line.bbox) }
            // console.log(this.transformToRectangle(line?.bbox))
            //     const regNumberLines = this.parseLines(data.text).filter((line) =>
            //         line.toLowerCase().includes("регистрационный")
            //     );
            //     return regNumberLines.length ? this.clearRegString(regNumberLines[0]) : "";
        }
        return "";
    }

    /**
 * Распознает регистрационный номер, используя область поиска и русский язык.
 * @param imageBuffer - Буфер изображения для обработки.
 * @returns Регистрационный номер, если найден, иначе null.
 */
    private async scanRegNumberByRect(imageBuffer: Buffer): Promise<any> {

        const worker = await this.createTesseractWorker("eng", this.engWhitelist);
        const { data } = await worker.recognize(imageBuffer, { rotateAuto: true, rectangle: this.regNoRect });

        await worker.terminate();

        if (data.lines.length) {
            const line = this.findLineWithCorrectNumber(data.lines)

            if (!line?.text) return "";
            return { regNo: this.clearRegString(line.text), rect: this.transformToRectangle(line.bbox) }
        }
        return "";
    }

    /**
* Распознает регистрационный номер, используя область поиска и русский язык.
* @param imageBuffer - Буфер изображения для обработки.
* @returns Регистрационный номер, если найден, иначе null.
*/
    private async scanBsoNumberByRect(imageBuffer: Buffer): Promise<any> {

        const worker = await this.createTesseractWorker("eng",  /* this.engWhitelist */);
        const { data } = await worker.recognize(imageBuffer, { rotateAuto: true, rectangle: this.bsoNoRect });

        await worker.terminate();

        if (data.lines.length) {
            const line = this.findLineWithCorrectNumber(data.lines)
            if (!line?.text) {
                return ""
            };
            return { bsoNo: this.clearRegString(line.text), rect: this.transformToRectangle(line.bbox) }
        }
        return "";
    }


    /**
     * Создает и настраивает экземпляр Tesseract Worker.
     * @param lang - Язык для распознавания.
     * @param whitelist - Разрешенные символы (опционально).
     * @returns Инициализированный worker.
     */
    private async createTesseractWorker(lang: string, whitelist?: string) {
        const worker = await createWorker(lang, OEM.TESSERACT_LSTM_COMBINED);

        const parameters: Record<string, string> = {};
        if (whitelist) {
            parameters["tessedit_char_whitelist"] = whitelist;
        }

        await worker.setParameters({
            ...parameters,
            preserve_interword_spaces: "1",
        });
        return worker;
    }

    /**
     * Парсит текст на строки.
     * @param text - Текст для парсинга.
     * @returns Массив строк.
     */
    private parseLines(text: string): string[] {
        return text.split("\n").map((line) => line.trim()
        );
    }

    /**
     * Извлекает все числа из строки.
     * @param text - Строка для обработки.
     * @returns Первое число длиной > 10 символов или пустую строку.
     */
    private extractValidStringNumbers(text: string): string {
        const numbers = text.match(/\d+/g);
        if (!numbers) return "";
        return numbers.filter((num) => num.length > 10)[0];
    }

    /**
 * Извлекает все числа из строки.
 * @param text - Строка для обработки.
 * @returns Первое число длиной > 10 символов или пустую строку.
 */
    private clearRegString(text: string): string {
        const numbers = text.match(/\d+/g);
        if (!numbers) return "";
        return numbers.join('');
    }

    /**
     * Преобразует объект с координатами в объект rectangle.
     * @param prevLineCoord - Объект с координатами x0, y0, x1, y1.
     * @returns Объект с полями left, top, width, height.
     */
    private transformToRectangle(prevLineCoord: { x0: number, y0: number, x1: number, y1: number }) {
        return {
            rectangle: {
                left: prevLineCoord.x0,
                top: prevLineCoord.y0,
                width: prevLineCoord.x1 - prevLineCoord.x0,
                height: prevLineCoord.y1 - prevLineCoord.y0
            }
        };
    }

    async findSomeLines(data, imageBuffer) {
        let bsoN
        for (let i = 0; i < data.lines.length; i++) {
            const line = data.lines[i];
            if (line.text.toLowerCase().includes("выдачи") || line.text.toLowerCase().includes("действия")) {
                console.log(`Итерация ${i}:`, line.text);
                const prevLine = data.lines[i - 1]
                const prevLineCoord = prevLine.bbox;
                const worker2 = await this.createTesseractWorker("eng", this.engWhitelist);
                bsoN = await worker2.recognize(imageBuffer, {
                    rotateAuto: true, rectangle: {
                        left: prevLineCoord.x0,
                        top: prevLineCoord.y0,

                        width: prevLineCoord.x1 - prevLineCoord.x0,
                        height: prevLineCoord.y1 - prevLineCoord.y0

                    }
                });
                await worker2.terminate();
            }
        }
    }

    findRegNumberLine(lines) {
        for (let line of lines) {
            if (line.text.toLowerCase().includes("регистрационный"))
                return line
        }
    }

    findLineWithCorrectNumber(lines) {
        for (let line of lines) {
            const val = this.extractValidStringNumbers(line.text)
            if (val) {
                line.text = val
                return line
            }

        }
    }

}