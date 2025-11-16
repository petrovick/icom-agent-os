const BOUNDARY = 'PIX-STREAM';

export class XmlBatchBuilder {
  build(messages: string[]) {
    if (!messages.length) {
      return { contentType: 'application/xml', body: '' };
    }
    const parts = messages.map((msg, idx) => {
      return `--${BOUNDARY}\nContent-Type: application/xml; charset=utf-8\nX-Pix-Sequence: ${idx + 1}\n\n${msg}`;
    });
    const body = `${parts.join('\n')}\n--${BOUNDARY}--`;
    return {
      contentType: `multipart/mixed; boundary=${BOUNDARY}`,
      body,
    };
  }
}
