import { createWorker, Line, OEM } from "tesseract.js";

type Rectangle = {
    left: number;
    top: number;
    width: number;
    height: number;
};

type ScanResult = {
    bsoNumber?: string;
    regNumber?: string;
};
type CollectResult = {
    bsoNumber?: NumberResult
    regNumber?: NumberResult
};
type NumberResult = {
    foundNumber: string;
    textBox: Rectangle,
    searchRect: Rectangle;
    status: Statuses
}
enum Statuses {
    Accepted = "accepted",
    NotAccepted = "not_accepted",
}


export class RecognizeCertHandler {
    private readonly numbersWhitelist = "0123456789";

    private readonly rectangles = {
        regNoRect: { left: 750, top: 650, width: 400, height: 80 },
        bsoNoRect: { left: 400, top: 400, width: 500, height: 100 },
    };

    /**
     * Главный метод обработки изображения.
     * @param imageBuffer - Буфер изображения для обработки.
     * @param rules - Правила для распознавания (например, длина номера и префикс).
     * @returns Результат распознавания.
     */
    async handle(imageBuffer: Buffer, rules: {
        regNumber: { length: number, prefix: string },
        bsoNumber: { length: number, prefix: string }
    }): Promise<CollectResult | null> {
        try {
            const worker = await this.createTesseractWorker("eng", this.numbersWhitelist);
            const regNumber = await this.scanNumberByRect(worker, imageBuffer, rules.regNumber, this.rectangles.regNoRect);
            const bsoNumber = await this.scanNumberByRect(worker, imageBuffer, rules.bsoNumber, this.rectangles.bsoNoRect);
            await worker.terminate();

            if (!regNumber) {
                return null
            }
            return {
                //  bsoNumber?: regNumber,
                regNumber: regNumber || undefined,
                bsoNumber: bsoNumber || undefined
            };
        } catch (error) {
            console.error("Ошибка при распознавании текста:", error);
            throw new Error("Failed to recognize text.");
        }
    }

    /**
     * Распознает номер из указанной области изображения.
     * @param worker - Инициализированный Tesseract Worker.
     * @param imageBuffer - Буфер изображения.
     * @param rules - Правила для проверки распознанного номера.
     * @returns Найденный номер или null.
     */
    private async scanNumberByRect(
        worker: Tesseract.Worker,
        imageBuffer: Buffer,
        rules: { length: number; prefix: string },
        rectangle: Rectangle
    ): Promise<{ foundNumber: string; textBox: Rectangle, searchRect: Rectangle, status: Statuses } | null> {
        let rect = { ...rectangle }
        const candidates: Record<string, { textBox: Rectangle, searchRect: Rectangle }> = {};

        for (let iteration = 0; iteration < 5; iteration++) {

            const line = await this.recognizeCorrectLineByRect(worker, imageBuffer, rules, rect)
            if (line) {
                const foundNumber = line.text
                const textBox = this.transformToRectangle(line.bbox)
                if (candidates[foundNumber]) {
                    return { foundNumber, textBox, searchRect: rect, status: Statuses.Accepted }
                }
                candidates[foundNumber] = { textBox, searchRect: rect }
            }
            rect = this.expandRectangle(rect, iteration + 1, 30);
        }
        const [firstKey] = Object.keys(candidates);
        return firstKey ? { foundNumber: firstKey, ...candidates[firstKey], status: Statuses.NotAccepted } : null;
    }

    async recognizeCorrectLineByRect(worker: Tesseract.Worker, imageBuffer: Buffer, rules: { length: number; prefix: string },
        rect: Rectangle): Promise<Line | null> {
        const { data } = await worker.recognize(imageBuffer, {
            rectangle: rect,
        });

        const line = this.findLineWithCorrectNumber(data.lines, rules);
        if (line?.text) return line
        return null
    }

    /**
     * Создает и настраивает экземпляр Tesseract Worker.
     * @param lang - Язык для распознавания.
     * @param whitelist - Разрешенные символы (опционально).
     * @returns Инициализированный worker.
     */
    private async createTesseractWorker(lang: string, whitelist?: string) {
        const worker = await createWorker(lang, OEM.TESSERACT_LSTM_COMBINED, {
            langPath: `./lang-data/`, // Укажите путь, если требуется.
        });

        const parameters: Record<string, string> = {};
        if (whitelist) parameters["tessedit_char_whitelist"] = whitelist;

        await worker.setParameters({
            ...parameters,
            preserve_interword_spaces: "1",
        });

        return worker;
    }

    /**
     * Находит строку, соответствующую заданным правилам.
     * @param lines - Линии текста из результата Tesseract.
     * @param rules - Правила проверки строки.
     * @returns Строка, удовлетворяющая правилам, или null.
     */
    private findLineWithCorrectNumber(lines: any[], rules: { length: number; prefix: string }): any {
        return lines.find((line) => {
            const number = this.extractValidStringNumbers(line.text, rules);
            if (number) {
                line.text = number;
                return true;
            }
            return false;
        });
    }

    /**
     * Извлекает числа из строки на основе заданных правил.
     * @param text - Строка для обработки.
     * @param rules - Правила фильтрации числа: префикс и минимальная длина.
     * @returns Первое число, удовлетворяющее правилам, или пустую строку.
     */
    private extractValidStringNumbers(text: string, rules: { prefix: string; length: number }): string {
        const numbers = text.match(/\d+/g);
        if (!numbers) return "";
        return numbers.find((num) => num.length === rules.length && num.startsWith(rules.prefix)) || "";
    }

    /**
 * Преобразует объект с координатами в объект rectangle.
 * @param lineCoord - Объект с координатами x0, y0, x1, y1.
 * @returns Объект с полями left, top, width, height.
 */
    private transformToRectangle(lineCoord: { x0: number, y0: number, x1: number, y1: number }): Rectangle {
        return {
            left: lineCoord.x0,
            top: lineCoord.y0,
            width: lineCoord.x1 - lineCoord.x0,
            height: lineCoord.y1 - lineCoord.y0
        };
    }

    /**
     * Увеличивает размеры прямоугольника на заданное значение.
     * @param rect - Исходный прямоугольник.
     * @param iteration - Итерация (увеличивает масштабирование).
     * @param expandBy - Величина увеличения (по умолчанию 20).
     * @returns Новый прямоугольник.
     */
    private expandRectangle(rect: Rectangle, iteration: number, expandBy: number): Rectangle {
        return {
            left: rect.left - expandBy * iteration,
            top: rect.top - expandBy * iteration,
            width: rect.width + 2 * expandBy * iteration,
            height: rect.height + 2 * expandBy * iteration,
        };
    }

    /**
     * Удаляет пробелы или невалидные символы из строки.
     * @param text - Строка для обработки.
     * @returns Очищенная строка.
     */
    private clearRegString(text: string): string {
        return text.replace(/\s/g, "");
    }
}