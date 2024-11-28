import { createWorker } from "tesseract.js";

type Rectangle = {
    left: number;
    top: number;
    width: number;
    height: number;
};

type ScanResult = {
    bsoNumber: string;
    regNumberRu: string;
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
    /**
     * Главный метод обработки изображения.
     * @param imageBuffer - Буфер изображения для обработки.
     * @returns Результат распознавания: номера БСО и регистрационный номер.
     */
    async handle(imageBuffer: Buffer): Promise<ScanResult> {
        try {
            const [strNumbers, regNumber] = await Promise.all([
                this.scanNumbers(imageBuffer),
                this.scanRegNumber(imageBuffer),
            ]);
            if (strNumbers[1] !== regNumber) {
                console.log(`RegNumber mismatch. firstWay=${regNumber}, secondWay=${strNumbers[1]}`)
            }
            return {
                bsoNumber: strNumbers[0],
                regNumberRu: regNumber,
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
        const extractedNumbers = this.parseLines(data.text);


        await worker.terminate();
        return extractedNumbers;
    }

    /**
     * Распознает регистрационный номер, используя область поиска и русский язык.
     * @param imageBuffer - Буфер изображения для обработки.
     * @returns Регистрационный номер, если найден, иначе null.
     */
    private async scanRegNumber(imageBuffer: Buffer): Promise<string> {


        const worker = await this.createTesseractWorker("rus");
        const { data: { text } } = await worker.recognize(imageBuffer, { rotateAuto: true, rectangle: this.rectangle });

        await worker.terminate();

        if (text) {
            const lines = this.parseLines(text).filter((line) =>
                line.includes("Регистрационный")
            );
            return lines.length ? this.clearRegString(lines[0]) : "";
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
        const worker = await createWorker(lang, 2);

        const parameters: Record<string, string> = {};
        if (whitelist) {
            parameters["tessedit_char_whitelist"] = whitelist;
        }

        await worker.setParameters({ ...parameters, preserve_interword_spaces: "1", tessjs_create_osd: "5" });
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
    private extractValidStringNumbers(text: string): string[] {
        const numbers = text.match(/\d+/g);
        if (!numbers) return [""];
        return numbers.filter((num) => num.length > 10);
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

}