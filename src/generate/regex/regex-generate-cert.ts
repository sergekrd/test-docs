import JSZip from 'jszip';

export class RegexGenerateCertDocHandler {
    /**
     * Главный метод обработки .docx файла, который заменяет текстовые поля согласно шаблону.
     * @param binaryDocx - Исходный файл .docx в бинарном виде.
     * @param template - Шаблон для замены текста, где ключ — это исходный текст, а значение — новое.
     * @returns Обновлённый файл .docx в бинарном виде.
     */
    async handle(binaryDocx: Buffer, template: Record<string, string>): Promise<Buffer> {
        try {
            const zip = await this.unzipDoc(binaryDocx);
            const documentXml = await this.getDocumentXml(zip);


            const allText = this.findTextFieldsByMask(documentXml);
            const { updatedXml, updatedFields } = this.replaceText(documentXml, template);

            this.checkEqualSets(allText, updatedFields);

            this.updateDocumentXml(zip, updatedXml);

            return this.packDocx(zip);
        } catch (err) {
            console.error('Error processing .docx file:', err);
            throw err;
        }
    }

    /**
     * Распаковывает .docx файл в объект JSZip.
     * @param binaryDocx - Исходный бинарный файл .docx.
     * @returns Объект JSZip с содержимым .docx файла.
     */
    private async unzipDoc(binaryDocx: Buffer): Promise<JSZip> {
        return JSZip.loadAsync(binaryDocx);
    }

    /**
     * Извлекает XML содержимое документа из архива .docx.
     * @param zip - Объект JSZip, содержащий файл .docx.
     * @returns XML строка содержимого документа.
     * @throws Ошибка, если не удаётся найти XML.
     */
    private async getDocumentXml(zip: JSZip): Promise<string> {
        const documentXml = await zip.file('word/document.xml')?.async('string');
        if (!documentXml) throw new Error('Document XML not found in .docx');
        return documentXml;
    }

    /**
     * Заменяет текстовые поля в XML содержимом документа согласно шаблону.
     * @param xml - Исходный XML документ.
     * @param template - Шаблон для замены текста.
     * @returns Обновлённый XML документ и множество заменённых полей.
     */
    private replaceText(xml: string, template: Record<string, string>): { updatedXml: string, updatedFields: Set<string> } {
        const updatedFields = new Set<string>();
        const regex = /(<w:t(?: [^>]*?)?>)(.*?)<\/w:t>/g;

        const updatedXml = xml.replace(
            regex,
            (match, tag, content) => {
                if (template[content]) {
                    updatedFields.add(content);
                    return `${tag}${template[content]}</w:t>`;
                }
                return match;
            },
        );

        return { updatedXml, updatedFields };
    }

    /**
     * Обновляет XML файл в архиве .docx.
     * @param zip - Объект JSZip с содержимым .docx.
     * @param updatedXml - Новый XML для замены.
     */
    private updateDocumentXml(zip: JSZip, updatedXml: string): void {
        zip.file('word/document.xml', updatedXml);
    }

    /**
     * Пакует обновлённый архив .docx обратно в бинарный формат.
     * @param zip - Объект JSZip с обновлённым содержимым.
     * @returns Бинарный .docx файл.
     */
    private async packDocx(zip: JSZip): Promise<Buffer> {
        return zip.generateAsync({ type: 'nodebuffer' });
    }

    /**
     * Находит все текстовые поля в XML документе, соответствующие маске.
     * @param xml - XML строка документа.
     * @returns Множество текстовых полей.
     * @throws Ошибка, если текстовые поля не найдены.
     */
    private findTextFieldsByMask(xml: string): Set<string> {
        const regex = /<w:t(?: [^>]*?)?>(.*?)<\/w:t>/g;
        const foundFields = new Set<string>();
        let match;

        // Извлекаем все текстовые поля
        while ((match = regex.exec(xml)) !== null) {
            foundFields.add(match[1]);
        }

        if (foundFields.size === 0) {
            throw new Error('No text fields found');
        }

        return foundFields;
    }

    /**
     * Проверяет, что все текстовые поля в шаблоне и в документе совпадают.
     * @param set1 - Множество найденных полей в документе.
     * @param set2 - Множество заменённых полей в шаблоне.
     * @throws Ошибка, если множества не совпадают.
     */
    private checkEqualSets(set1: Set<string>, set2: Set<string>): void {
        // Проверка на равенство множеств
        const intersection = new Set<string>([...set1, ...set2]);

        // Если множества имеют разный размер или пересечение не совпадает с размером обоих множеств, выбрасываем ошибку
        if (set1.size !== set2.size || set1.size !== intersection.size) {
            throw new Error('Fields in doc mismatch fields in template');
        }
    }
}