import { createReport } from 'docx-templates';

export class TemplateGenerateCertDocHandler {

    async handle(binaryDocx: Buffer, template: Record<string, string>): Promise<Buffer> {
    try {
      const processedBuffer = await createReport({
        template: binaryDocx,
        data: template,
        cmdDelimiter: ['{{', '}}'], // Используем стандартный формат шаблонов {{variable}}
      });

      return Buffer.from(processedBuffer);

    } catch (err) {
      throw err;
    }
  }
}