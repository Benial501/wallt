const PDFParser = require('./PDFParser');

module.exports = class RevolutParser {
  constructor() {
    this.parser = new PDFParser({ bankId: 'revolut' });
  }

  async parse(buffer, opts) {
    return this.parser.parse(buffer, opts);
  }
};

