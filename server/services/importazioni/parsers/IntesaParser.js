const PDFParser = require('./PDFParser');

module.exports = class IntesaParser {
  constructor() {
    this.parser = new PDFParser({ bankId: 'intesa' });
  }

  async parse(buffer, opts) {
    return this.parser.parse(buffer, opts);
  }
};

